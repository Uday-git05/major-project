"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { DashboardSnapshot, Device, EventEnvelope, LiveConnectionState, LiveEnvelope } from "@/types/api";

export interface TelemetryPoint { tick: number; time: string; values: Record<string, number> }

export function useLiveDashboard() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [runtimeEpoch, setRuntimeEpoch] = useState<number | null>(null);
  const [telemetry, setTelemetry] = useState<Record<string, TelemetryPoint[]>>({});
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<LiveConnectionState>("connecting");
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true); const epoch = useRef(0); const sequence = useRef(0); const reconcileTimer = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const streamBuffer = useRef<LiveEnvelope[]>([]);
  const telemetryEpoch = useRef(0);
  const currentData = useRef<DashboardSnapshot | null>(null);
  const focusedCorrelation = useRef<string | null>(null);
  const focusedEvents = useRef<EventEnvelope[]>([]);

  const setFocusedCorrelation = useCallback((correlationId: string | null) => {
    if (focusedCorrelation.current === correlationId) return;
    focusedCorrelation.current = correlationId;
    focusedEvents.current = correlationId && currentData.current?.epoch === epoch.current
      ? currentData.current.events.filter((event) => event.correlation_id === correlationId).slice(-500)
      : [];
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const requestedEpoch = epoch.current;
    const requestedSequence = sequence.current;
    streamBuffer.current = [];
    const request = (async () => {
      setRefreshing(true);
      try {
        let snapshot = await api.snapshot();
        if (!mounted.current) return;
        // A reset can overtake an in-flight response. Never resurrect its old epoch.
        if (epoch.current !== requestedEpoch && snapshot.epoch < epoch.current) return;
        if (snapshot.epoch === requestedEpoch && snapshot.sequence < requestedSequence) return;
        // Preserve stream updates received while the authoritative snapshot was in flight.
        for (const envelope of streamBuffer.current) {
          if (envelope.epoch === snapshot.epoch && envelope.sequence > snapshot.sequence && envelope.payload.event) {
            snapshot = applyLiveEvent(snapshot, envelope.payload.event, envelope.sequence);
          }
        }
        const sameEpoch = currentData.current?.epoch === snapshot.epoch;
        snapshot = {
          ...snapshot,
          events: mergeRetainedEvents(
            sameEpoch ? currentData.current?.events ?? [] : [],
            snapshot.events,
            2000,
            sameEpoch ? focusedEvents.current : [],
          ),
        };
        if (!sameEpoch) focusedEvents.current = [];
        const clearTelemetry = telemetryEpoch.current !== snapshot.epoch;
        telemetryEpoch.current = snapshot.epoch;
        epoch.current = snapshot.epoch; sequence.current = snapshot.sequence;
        setRuntimeEpoch(snapshot.epoch);
        currentData.current = snapshot;
        setData(snapshot);
        setError(null);
        setTelemetry((current) => appendTelemetry(clearTelemetry ? {} : current, snapshot.devices, snapshot.simulation.tick_number, snapshot.simulation.simulation_time));
      } catch (cause) {
        if (mounted.current) setError(cause instanceof ApiError ? cause.message : "Unable to load SOC data");
        throw cause;
      } finally { if (mounted.current) { setLoading(false); setRefreshing(false); } }
    })();
    refreshInFlight.current = request;
    try { await request; } finally { refreshInFlight.current = null; }
  }, []);

  useEffect(() => {
    mounted.current = true; let socket: WebSocket | null = null; let reconnectTimer = 0; let attempts = 0;
    const reconcile = () => {
      // Coalesce bursts without indefinitely postponing reconciliation under live load.
      if (reconcileTimer.current) return;
      reconcileTimer.current = window.setTimeout(() => {
        reconcileTimer.current = 0;
        void (async () => {
          if (refreshInFlight.current) await refreshInFlight.current.catch(() => undefined);
          if (mounted.current) await refresh();
        })().catch(() => undefined);
      }, 300);
    };
    const connect = () => {
      if (!mounted.current) return;
      setConnection(attempts ? "degraded" : "connecting"); socket = new WebSocket(websocketUrl());
      socket.onopen = () => { attempts = 0; setConnection("live"); };
      socket.onmessage = (message) => {
        let envelope: LiveEnvelope;
        try { envelope = JSON.parse(String(message.data)) as LiveEnvelope; } catch { return; }
        if (envelope.type === "connection_ready") {
          if (envelope.epoch > epoch.current) {
            epoch.current = envelope.epoch; sequence.current = 0; streamBuffer.current = [];
            currentData.current = null; focusedEvents.current = []; focusedCorrelation.current = null;
            setRuntimeEpoch(envelope.epoch); setTelemetry({}); reconcile();
          }
          // Close the narrow snapshot-to-stream gap with one fresh reconciliation.
          if (envelope.epoch !== epoch.current || envelope.sequence > sequence.current) reconcile();
          return;
        }
        if (!shouldAcceptEnvelope(epoch.current, sequence.current, envelope)) return;
        if (envelope.epoch > epoch.current) {
          epoch.current = envelope.epoch; sequence.current = 0; streamBuffer.current = [];
          currentData.current = null; focusedEvents.current = []; focusedCorrelation.current = null;
          telemetryEpoch.current = envelope.epoch;
          setRuntimeEpoch(envelope.epoch); setTelemetry({}); reconcile();
        } else if (envelope.sequence > sequence.current + 1) reconcile();
        streamBuffer.current = [...streamBuffer.current, envelope].slice(-2000);
        sequence.current = envelope.sequence; const event = envelope.payload.event; if (!event) return;
        if (event.correlation_id === focusedCorrelation.current) {
          focusedEvents.current = mergeRetainedEvents(focusedEvents.current, [event], 500);
        }
        setData((current) => {
          if (current?.epoch !== envelope.epoch) return current;
          const next = applyLiveEvent(current, event, envelope.sequence);
          currentData.current = next;
          return next;
        });
        if (event.event_type === "telemetry") {
          const payload = event.payload as { device_id: string; readings: Record<string, number | string | boolean> };
          const values = Object.fromEntries(Object.entries(payload.readings).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
          setTelemetry((current) => ({ ...current, [payload.device_id]: [...(current[payload.device_id] ?? []), { tick: envelope.sequence, time: event.timestamp, values }].slice(-40) }));
        }
        if (["attack_scheduled", "attack_started", "attack_completed", "attack_cancelled", "defense_action_requested", "defense_action_completed", "defense_rollback", "recovery_started", "recovery_progress", "recovery_verified", "agent_status"].includes(event.event_type)) reconcile();
      };
      socket.onclose = () => {
        if (!mounted.current) return;
        attempts += 1; setConnection(attempts >= 5 ? "offline" : "degraded");
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts - 1, 4));
        reconnectTimer = window.setTimeout(async () => { try { await refresh(); } catch { /* snapshot fallback remains degraded */ } connect(); }, delay);
      };
      socket.onerror = () => socket?.close();
    };
    const initial = window.setTimeout(async () => { try { await refresh(); connect(); } catch { setConnection("offline"); connect(); } }, 0);
    const snapshotInterval = window.setInterval(
      () => void refresh().catch(() => undefined), snapshotRefreshMs());
    return () => { mounted.current = false; window.clearTimeout(initial); window.clearTimeout(reconnectTimer); window.clearTimeout(reconcileTimer.current); reconcileTimer.current = 0; window.clearInterval(snapshotInterval); socket?.close(); };
  }, [refresh]);

  const visibleConnection: LiveConnectionState = connection === "live" && data?.simulation.state === "paused" ? "paused" : connection;
  return { data, telemetry, loading, error, connection: visibleConnection, refreshing, refresh, runtimeEpoch, setFocusedCorrelation };
}

export function applyLiveEvent(snapshot: DashboardSnapshot, event: EventEnvelope, nextSequence: number): DashboardSnapshot {
  const exists = snapshot.events.some((item) => item.event_id === event.event_id);
  const events = exists ? snapshot.events : [...snapshot.events, event].slice(-2000);
  let simulation = snapshot.simulation; let devices = snapshot.devices; let agents = snapshot.agents;
  if (event.event_type === "simulation_tick") {
    const payload = event.payload as { tick_number: number; state: DashboardSnapshot["simulation"]["state"] };
    if (payload.tick_number >= simulation.tick_number) simulation = { ...simulation, tick_number: payload.tick_number, simulation_time: event.timestamp, state: payload.state, event_count: simulation.event_count + 1 };
  } else if (event.event_type === "telemetry") {
    const payload = event.payload as { device_id: string; readings: Device["telemetry_state"] };
    devices = devices.map((device) => device.device_id === payload.device_id ? { ...device, telemetry_state: payload.readings, last_seen: event.timestamp } : device);
  } else if (event.event_type === "device_state") {
    const payload = event.payload as { device_id: string; status: string; health: string };
    devices = devices.map((device) => device.device_id === payload.device_id ? { ...device, status: payload.status, health: payload.health } : device);
  } else if (event.event_type === "agent_status") {
    const payload = event.payload as { agent_id: string; status: string; health: string; processed_event_count: number; error_count: number };
    agents = agents.map((agent) => agent.agent_id === payload.agent_id ? { ...agent, ...payload, last_activity_at: event.timestamp } : agent);
  }
  return { ...snapshot, events, simulation, devices, agents, sequence: nextSequence, runtimeStatus: { ...snapshot.runtimeStatus, sequence: nextSequence, simulation } };
}

export function mergeRetainedEvents(previous: EventEnvelope[], incoming: EventEnvelope[], limit = 2000, protectedEvents: EventEnvelope[] = []) {
  const byId = new Map<string, EventEnvelope>();
  for (const event of [...previous, ...incoming]) byId.set(event.event_id, event);
  const ordered = [...byId.values()]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
  const protectedById = new Map(protectedEvents.map((event) => [event.event_id, event]));
  for (const event of protectedById.values()) byId.set(event.event_id, event);
  const protectedIds = new Set(protectedById.keys());
  const retained = ordered.filter((event) => !protectedIds.has(event.event_id)).slice(-Math.max(0, limit - protectedIds.size));
  return [...retained, ...protectedById.values()]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function appendTelemetry(current: Record<string, TelemetryPoint[]>, devices: Device[], tick: number, time: string) {
  const next = { ...current };
  for (const device of devices) {
    const values = Object.fromEntries(Object.entries(device.telemetry_state).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
    if (!Object.keys(values).length) continue;
    const history = next[device.device_id] ?? [];
    if (history.at(-1)?.tick === tick) continue;
    next[device.device_id] = [...history, { tick, time, values }].slice(-40);
  }
  return next;
}

function websocketUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8000/ws/live`;
}

function snapshotRefreshMs() {
  const configured = Number(process.env.NEXT_PUBLIC_SNAPSHOT_REFRESH_MS ?? 15000);
  return Number.isFinite(configured) && configured >= 5000 ? configured : 15000;
}

export function shouldAcceptEnvelope(currentEpoch: number, currentSequence: number,
                                     envelope: Pick<LiveEnvelope, "epoch" | "sequence">) {
  return envelope.epoch > currentEpoch ||
    (envelope.epoch === currentEpoch && envelope.sequence > currentSequence);
}

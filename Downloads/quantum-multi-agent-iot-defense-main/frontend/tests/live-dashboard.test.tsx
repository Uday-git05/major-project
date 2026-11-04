import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLiveEvent, mergeRetainedEvents, shouldAcceptEnvelope, useLiveDashboard } from "@/hooks/use-live-dashboard";
import { api } from "@/lib/api-client";
import type { DashboardSnapshot, EventEnvelope } from "@/types/api";
import { LiveRuntimeProvider, useLiveRuntime } from "@/components/live-runtime-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const snapshot = (): DashboardSnapshot => ({
  health: { status: "ok", service: "test", version: "1" },
  models: { feature_count: 27, feature_names: [], qml_device: "default.qubit", models: {}, thresholds: {} },
  simulation: { state: "running", seed: 1, tick_number: 1, simulation_time: "2026-01-01T00:00:01Z", tick_duration_seconds: 1, simulation_speed: 1, device_count: 0, online_devices: 0, event_count: 0 },
  devices: [], topology: { gateway_id: "g", nodes: [], links: [] }, events: [],
  featureStatus: { running: true, extractor_version: "1", active_flow_count: 0, flows_created: 0, vectors_emitted: 0, invalid_events: 0, duplicate_events: 0, out_of_order_events: 0, minimum_packets: 2 },
  flows: [], recentFeatures: [], agents: [], agentHealth: { total_agents: 0, healthy_agents: 0, degraded_agents: 0, unhealthy_agents: 0, agents: [] }, audit: [], attackTypes: [], attacks: [], activeAttacks: [], defenses: [], policy: { isolated_devices: [], quarantined_sources: [], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 0 }, recoveries: [], epoch: 2, sequence: 5,
  runtimeStatus: { active: true, initialized: true, overall: "live", epoch: 2, sequence: 5, simulation: {} as never, runner: { running: true, tick_errors: 0, tick_interval_seconds: 1 }, components: {}, websocket: {}, startup_order: [], checked_at: "2026-01-01T00:00:00Z" },
});

class MockSocket {
  static instances: MockSocket[] = [];
  onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) { MockSocket.instances.push(this); }
  close() { this.onclose?.(); }
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); MockSocket.instances = []; });

describe("snapshot and WebSocket state", () => {
  it("shares one socket across consumers and keeps their rendered runtime state updating", async () => {
    vi.useFakeTimers(); vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    function Consumer({ name }: { name: string }) { const { data } = useLiveRuntime(); return <output aria-label={name}>{data.simulation.tick_number}</output>; }
    const { unmount } = render(<LiveRuntimeProvider><Consumer name="one" /><Consumer name="two" /></LiveRuntimeProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(MockSocket.instances).toHaveLength(1);
    const event = { event_id: "tick-shared", timestamp: "2026-01-01T00:00:02Z", event_type: "simulation_tick", source: "clock", correlation_id: "c", payload: { tick_number: 2, state: "running" } };
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "simulation_tick", epoch: 2, sequence: 6, payload: { event } }) }));
    expect(screen.getByLabelText("one")).toHaveTextContent("2");
    expect(screen.getByLabelText("two")).toHaveTextContent("2");
    expect(MockSocket.instances).toHaveLength(1);
    unmount();
  });
  it("deduplicates event IDs and rejects stale epoch/sequence envelopes", () => {
    const event = { event_id: "e", timestamp: "2026-01-01T00:00:02Z", event_type: "simulation_tick", source: "clock", correlation_id: "c", payload: { tick_number: 2, state: "running" } } as EventEnvelope;
    const once = applyLiveEvent(snapshot(), event, 6); const twice = applyLiveEvent(once, event, 7);
    expect(twice.events).toHaveLength(1); expect(twice.simulation.tick_number).toBe(2);
    expect(shouldAcceptEnvelope(2, 7, { epoch: 2, sequence: 7 })).toBe(false);
    expect(shouldAcceptEnvelope(2, 7, { epoch: 1, sequence: 99 })).toBe(false);
    expect(shouldAcceptEnvelope(2, 7, { epoch: 3, sequence: 0 })).toBe(true);
  });

  it("preserves same-epoch focused evidence when a bounded snapshot omits older events", async () => {
    vi.useFakeTimers();
    const oldPrediction = { event_id: "focused-qml", timestamp: "2026-01-01T00:00:02Z", event_type: "quantum_prediction", source: "quantum-ml-agent", correlation_id: "focused-correlation", payload: {} } as EventEnvelope;
    const fetch = vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket);
    const { result, unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => result.current.setFocusedCorrelation("focused-correlation"));
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "quantum_prediction", epoch: 2, sequence: 6, payload: { event: oldPrediction } }) }));
    act(() => {
      for (let index = 0; index < 2001; index += 1) {
        const event = { event_id: `background-${index}`, timestamp: `2026-01-01T00:00:${String(index + 3).padStart(2, "0")}Z`, event_type: "background_noise", source: "monitoring-agent", correlation_id: `background-${index}`, payload: {} };
        MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "background_noise", epoch: 2, sequence: index + 7, payload: { event } }) });
      }
    });
    const refreshed = { ...snapshot(), sequence: 2008, runtimeStatus: { ...snapshot().runtimeStatus, sequence: 2008 }, events: [] };
    fetch.mockResolvedValue(refreshed);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.data?.events.map((event) => event.event_id)).toContain("focused-qml");
    unmount();
  });

  it("keeps event history unique, time ordered, and bounded", () => {
    const old = { event_id: "old", timestamp: "2026-01-01T00:00:00Z" } as EventEnvelope;
    const newer = { event_id: "newer", timestamp: "2026-01-01T00:00:02Z" } as EventEnvelope;
    const middle = { event_id: "middle", timestamp: "2026-01-01T00:00:01Z" } as EventEnvelope;
    expect(mergeRetainedEvents([old, newer], [middle, newer], 2).map((event) => event.event_id)).toEqual(["middle", "newer"]);
  });

  it("degrades, refreshes the snapshot, and reconnects with bounded backoff", async () => {
    vi.useFakeTimers(); vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    const { result, unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(MockSocket.instances).toHaveLength(1);
    act(() => MockSocket.instances[0].onopen?.());
    expect(result.current.connection).toBe("live");
    act(() => MockSocket.instances[0].onclose?.());
    expect(result.current.connection).toBe("degraded");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(MockSocket.instances).toHaveLength(2);
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("resynchronizes when events land between the snapshot and stream", async () => {
    vi.useFakeTimers(); vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    const { unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({
      type: "connection_ready", epoch: 2, sequence: 8, timestamp: "2026-01-01T00:00:03Z", payload: {},
    }) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("resynchronizes a sequence gap without waiting for the periodic snapshot", async () => {
    vi.useFakeTimers(); vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket);
    const { unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "telemetry", epoch: 2, sequence: 9, payload: {} }) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("replays newer stream data over an in-flight snapshot without duplicate records", async () => {
    vi.useFakeTimers(); const fetch = vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket);
    const { result, unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    let resolve!: (data: DashboardSnapshot) => void;
    fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    const event = { event_id: "new-tick", timestamp: "2026-01-01T00:00:02Z", event_type: "simulation_tick", source: "clock", correlation_id: "c", payload: { tick_number: 2, state: "running" } };
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "simulation_tick", epoch: 2, sequence: 6, payload: { event } }) }));
    await act(async () => { resolve(snapshot()); await refreshing; });
    expect(result.current.data?.sequence).toBe(6);
    expect(result.current.data?.simulation.tick_number).toBe(2);
    expect(result.current.data?.events).toHaveLength(1);
    unmount();
  });

  it.each(["runtime_reset", "connection_ready"])("rejects a response overtaken by %s and reconciles again after the pending request", async (type) => {
    vi.useFakeTimers(); const fetch = vi.spyOn(api, "snapshot").mockResolvedValue(snapshot());
    vi.stubGlobal("WebSocket", MockSocket);
    const { result, unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    let resolve!: (data: DashboardSnapshot) => void;
    fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    act(() => { void result.current.refresh(); });
    act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type, epoch: 3, sequence: 0, payload: {} }) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fetch.mockResolvedValue({ ...snapshot(), epoch: 3, sequence: 0 });
    await act(async () => { resolve(snapshot()); });
    expect(result.current.runtimeEpoch).toBe(3);
    expect(result.current.data?.epoch).toBe(3);
    expect(result.current.data?.sequence).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("clears old telemetry on a snapshot-only epoch change", async () => {
    vi.useFakeTimers(); const data = snapshot();
    data.devices = [{ device_id: "sensor", telemetry_state: { reading: 44 } } as never];
    const fetch = vi.spyOn(api, "snapshot").mockResolvedValue(data);
    vi.stubGlobal("WebSocket", MockSocket);
    const { result, unmount } = renderHook(() => useLiveDashboard());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.telemetry.sensor).toHaveLength(1);
    fetch.mockResolvedValue({ ...snapshot(), epoch: 3, sequence: 0 });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.telemetry).toEqual({});
    unmount();
  });
});

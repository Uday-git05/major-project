"use client";

import { Activity, ArrowRight, Clock3, Cpu, ShieldAlert, Sprout, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Device = { device_id: string; device_type: string; name: string; address: string };
type AttackType = { attack_type: string; name: string; description: string; behavior_summary: string; default_target_types: string[] };
type Attack = { attack_id: string; attack_type: string; name: string; status: string; target_device_id: string; correlation_id: string; intensity: string; duration_ticks: number; network_events_generated: number; start_tick: number; end_tick: number };
type Event = { event_id: string; event_type: string; timestamp: string; correlation_id: string; payload: Record<string, unknown> };
type Snapshot = { devices: Device[]; attacks: Attack[]; attack_types: AttackType[]; simulation: { device_count: number; state: string; tick_number: number }; events: Event[]; epoch: number; sequence: number };
type Connection = "connecting" | "live" | "degraded" | "offline";

const blank: Snapshot = { devices: [], attacks: [], attack_types: [], simulation: { device_count: 0, state: "stopped", tick_number: 0 }, events: [], epoch: 0, sequence: 0 };

export default function AttackLab() {
  const [snapshot, setSnapshot] = useState<Snapshot>(blank);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [kind, setKind] = useState("");
  const [target, setTarget] = useState("");
  const [intensity, setIntensity] = useState("medium");
  const [duration, setDuration] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [defenderUrl, setDefenderUrl] = useState("http://localhost:3000/");
  const snapshotRef = useRef(snapshot);
  const sequenceRef = useRef({ epoch: 0, sequence: 0 });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/backend/v1/system/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend snapshot failed (${response.status})`);
    const next = await response.json() as Snapshot;
    const previous = snapshotRef.current;
    if (next.epoch < sequenceRef.current.epoch || (next.epoch === sequenceRef.current.epoch && next.sequence < sequenceRef.current.sequence)) return;
    const byId = new Map<string, Event>();
    for (const event of [...(previous.epoch === next.epoch ? previous.events : []), ...next.events]) byId.set(event.event_id, event);
    const merged = { ...next, events: [...byId.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-2000) };
    snapshotRef.current = merged;
    sequenceRef.current = { epoch: next.epoch, sequence: next.sequence };
    setSnapshot(merged);
    setKind((current) => current || next.attack_types[0]?.attack_type || "");
    setTarget((current) => current || next.devices[0]?.device_id || "");
    setError("");
  }, []);

  useEffect(() => {
    setDefenderUrl(`${window.location.protocol}//${window.location.hostname}:3000/`);
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let attempts = 0;
    const reconcile = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        void refresh().catch(() => undefined);
      }, 250);
    };
    const connect = () => {
      if (stopped) return;
      setConnection(attempts ? "degraded" : "connecting");
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.hostname}:8000/ws/live`);
      socket.onopen = () => { attempts = 0; setConnection("live"); void refresh().catch(() => undefined); };
      socket.onmessage = (message) => {
        let envelope: { type: string; epoch: number; sequence: number; payload?: { event?: Event } };
        try { envelope = JSON.parse(String(message.data)) as typeof envelope; } catch { return; }
        if (envelope.type === "connection_ready") { reconcile(); return; }
        const cursor = sequenceRef.current;
        if (envelope.epoch < cursor.epoch || (envelope.epoch === cursor.epoch && envelope.sequence <= cursor.sequence)) return;
        if (envelope.epoch > cursor.epoch || envelope.sequence > cursor.sequence + 1) reconcile();
        sequenceRef.current = { epoch: envelope.epoch, sequence: envelope.sequence };
        const event = envelope.payload?.event;
        if (event) {
          const current = snapshotRef.current;
          const ids = new Set(current.events.map((item) => item.event_id));
          const events = ids.has(event.event_id) ? current.events : [...current.events, event].slice(-2000);
          const next = { ...current, events };
          snapshotRef.current = next;
          setSnapshot(next);
          if (["attack_scheduled", "attack_started", "attack_activity", "attack_completed", "attack_cancelled", "threat_assessment", "classical_prediction", "quantum_prediction"].includes(event.event_type)) reconcile();
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        attempts += 1;
        setConnection(attempts > 5 ? "offline" : "degraded");
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts - 1, 4));
        reconnectTimer = setTimeout(() => { void refresh().catch(() => undefined).finally(connect); }, delay);
      };
      socket.onerror = () => socket?.close();
    };
    void refresh().catch((cause) => { setConnection("offline"); setError(cause instanceof Error ? cause.message : "Backend unavailable"); }).finally(connect);
    pollTimer = setInterval(() => { void refresh().catch(() => setConnection("degraded")); }, 15000);
    return () => {
      stopped = true;
      if (socket) { socket.onclose = null; socket.close(); }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  const preset = snapshot.attack_types.find((item) => item.attack_type === kind);
  const targets = snapshot.devices.filter((item) => !preset || preset.default_target_types.includes(item.device_type));
  const targetId = targets.some((item) => item.device_id === target) ? target : targets[0]?.device_id ?? "";
  const attacks = [...snapshot.attacks].reverse();
  const active = attacks.filter((item) => ["active", "scheduled"].includes(item.status));
  const selected = snapshot.attacks.find((item) => item.attack_id === selectedId) ?? active[0] ?? attacks[0];
  const selectedEvents = useMemo(() => selected ? snapshot.events.filter((item) => item.correlation_id === selected.correlation_id) : [], [snapshot.events, selected?.correlation_id]);
  const totalGenerated = Math.max(snapshot.attacks.reduce((sum, item) => sum + item.network_events_generated, 0), countEvents(snapshot.events));
  const launch = async () => {
    if (!kind || !targetId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/backend/v1/attacks/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attack_type: kind, target_device_id: targetId, intensity, duration_ticks: duration, seed: Math.floor(Math.random() * 2_000_000_000) }) });
      const result = await response.json() as Attack | { detail?: string };
      if (!response.ok) throw new Error("detail" in result ? result.detail ?? `Launch failed (${response.status})` : `Launch failed (${response.status})`);
      setSelectedId((result as Attack).attack_id);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to launch simulation"); }
    finally { setBusy(false); }
  };
  const relevant = snapshot.events.filter((item) => ["attack_started", "attack_activity", "threat_assessment"].includes(item.event_type)).slice(-8).reverse();

  return <main className="attack-lab">
    <header className="lab-header"><a href="/" className="lab-brand"><span className="lab-brand-icon"><Sprout /></span><span><b>FARMFLOW <em>// ATTACK LAB</em></b><small>SIMULATE&nbsp; | &nbsp;TEST&nbsp; | &nbsp;OBSERVE&nbsp; | &nbsp;LEARN</small></span></a><div className="lab-testbed"><ShieldAlert /><span><b>AUTHORIZED VIRTUAL TESTBED</b><small>Controlled environment for research & education</small></span></div><div className={`lab-live ${connection}`}><i /><span><b>{connection === "live" ? "BACKEND LIVE" : connection.toUpperCase()}</b><small>{connection === "live" ? "Connected to shared simulation" : "Reconnecting to simulation server"}</small></span></div></header>
    {error && <p className="lab-error" role="alert">{error}</p>}
    <section className="lab-stats"><LabStat icon={<Cpu />} label="Virtual devices" value={String(snapshot.simulation.device_count)} /><LabStat icon={<Zap />} label="Active scenarios" value={String(active.length)} hot /><LabStat icon={<Activity />} label="Completed runs" value={String(snapshot.attacks.filter((item) => item.status === "completed").length)} /><LabStat icon={<Activity />} label="Synthetic events" value={String(totalGenerated)} /></section>
    <section className="lab-content"><article className="lab-visual"><div className="lab-visual-mark"><Sprout /></div><span>SAME FARM<br />DIFFERENT<br /><b>THREATS</b></span><small>CYBER ATTACKS<br />IN A CONTROLLED WORLD<br />FOR A <b>SAFER TOMORROW</b></small></article>
      <section className="lab-config"><h1><span>◎</span> Configure attack scenario</h1><label>Scenario<select value={kind} onChange={(event) => { setKind(event.target.value); setTarget(""); }}>{snapshot.attack_types.map((item) => <option key={item.attack_type} value={item.attack_type}>{friendly(item.attack_type)}</option>)}</select></label><p className="lab-hint">{preset?.behavior_summary ?? preset?.description ?? "Select a synthetic scenario."}</p><label>Virtual target<select value={targetId} onChange={(event) => setTarget(event.target.value)}>{targets.map((device) => <option key={device.device_id} value={device.device_id}>{device.name} ({device.device_id})</option>)}</select></label>{targets[0] && <p className="lab-hint">Device ID: {targetId} · {targets.find((item) => item.device_id === targetId)?.address ?? targets[0].address}</p>}<div className="lab-fields"><label>Intensity<select value={intensity} onChange={(event) => setIntensity(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Duration<input type="number" min={1} max={100} value={duration} onChange={(event) => setDuration(Math.max(1, Math.min(100, Number(event.target.value))))} /></label></div><button className="lab-launch" disabled={busy || !targets.length || connection === "offline"} onClick={() => void launch()}><Zap />{busy ? "Launching simulation…" : "Launch simulation"}<ArrowRight /></button><p className="lab-safety">ⓘ Isolated virtual testbed. No real devices or traffic are affected.</p><a className="defender-link" href={defenderUrl} target="_blank" rel="noreferrer">Open Defender Dashboard <ArrowRight /></a></section>
      <div className="lab-right"><section className="lab-panel"><header><h2><Activity /> Simulation activity</h2><span className="lab-tag"><i /> LIVE</span></header><p className="lab-counter"><b>{active.length}</b> running or queued <i /> <b>{totalGenerated}</b> synthetic events</p>{relevant.length ? <div className="lab-event-list">{relevant.map((event) => <button key={event.event_id} onClick={() => { const attack = snapshot.attacks.find((item) => item.correlation_id === event.correlation_id); if (attack) setSelectedId(attack.attack_id); }}><b>{friendly(event.event_type)}</b><span>{new Date(event.timestamp).toLocaleTimeString()} · {snapshot.attacks.find((item) => item.correlation_id === event.correlation_id)?.target_device_id ?? "virtual testbed"}</span></button>)}</div> : <div className="lab-empty"><Activity /><b>No simulation runs yet</b><span>Launch a scenario to see live backend events here.</span></div>}</section>
      <section className="lab-panel lab-recent"><header><h2><Clock3 /> Recent simulations</h2><span className="lab-count">{snapshot.attacks.length} runs</span></header>{attacks.length ? <div className="lab-run-list">{attacks.slice(0, 6).map((attack) => <button key={attack.attack_id} className={attack.attack_id === selected?.attack_id ? "selected" : ""} onClick={() => setSelectedId(attack.attack_id)}><span><b>{friendly(attack.attack_type)}</b><small>{attack.target_device_id} · ticks {attack.start_tick}–{attack.end_tick}</small></span><strong className={`status-${attack.status}`}>{friendly(attack.status)}</strong></button>)}</div> : <div className="lab-empty"><Activity /><b>No simulations executed yet</b><span>Simulation history from the shared backend appears here.</span></div>}</section></div>
    </section>
    {selected && <section className="lab-detail"><header><div><span>SIMULATION ID</span><h2>{selected.attack_id}</h2></div><strong className={`status-${selected.status}`}>{friendly(selected.status)}</strong></header><div className="lab-detail-grid"><span>Scenario <b>{friendly(selected.attack_type)}</b></span><span>Affected virtual device <b>{selected.target_device_id}</b></span><span>Generated events <b>{Math.max(selected.network_events_generated, countEvents(selectedEvents))}</b></span><span>Timeline events <b>{selectedEvents.length}</b></span></div><div className="lab-evidence">{["classical_prediction", "quantum_prediction", "threat_assessment"].map((type) => { const event = selectedEvents.find((item) => item.event_type === type); const payload = event?.payload; const result = payload?.binary as Record<string, unknown> | undefined; return <div key={type}><b>{type === "classical_prediction" ? "Classical ML" : type === "quantum_prediction" ? "QML" : "Threat assessment"}</b><span>{event ? (result ? `${String(result.predicted_class_name)} · ${typeof result.confidence === "number" ? `${(result.confidence * 100).toFixed(1)}% confidence` : "confidence unavailable"}` : String(payload?.severity ?? "Assessment recorded")) : "Awaiting pipeline evidence"}</span></div>; })}</div></section>}
  </main>;
}

function countEvents(events: Event[]) { return events.reduce((sum, event) => event.event_type === "attack_activity" && typeof event.payload.generated_event_count === "number" ? sum + event.payload.generated_event_count : sum, 0); }
function friendly(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function LabStat({ icon, label, value, hot = false }: { icon: React.ReactNode; label: string; value: string; hot?: boolean }) { return <article className={hot ? "hot" : ""}>{icon}<span><small>{label}</small><b>{value}</b></span></article>; }

"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { Attack, AttackType, Device } from "@/types/api";
import { Badge, Panel } from "./ui";
import { attackName, titleCase } from "@/lib/format";

export function AttackControl({ types, devices, attacks, onComplete, beginScenarioFocus, initialTarget, compact = false }: { types: AttackType[]; devices: Device[]; attacks: Attack[]; onComplete: () => Promise<void> | void; beginScenarioFocus?: () => (attack: Attack) => void; initialTarget?: string; compact?: boolean }) {
  const supportedScenarios = ["Arp_Spoofing", "HTTP_Flood", "ICMP_Flood", "MQTT_Flood", "Port_Scanning", "TCP_Flood", "UDP_Flood"];
  const visibleTypes = types.filter(item => supportedScenarios.includes(item.attack_type));
  const [type, setType] = useState(types.find(item => supportedScenarios.includes(item.attack_type))?.attack_type ?? ""); const [target, setTarget] = useState(initialTarget ?? "");
  const [intensity, setIntensity] = useState("medium"); const [duration, setDuration] = useState(4); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset = types.find((item) => item.attack_type === type);
  const targets = useMemo(() => devices.filter((d) => (!preset || preset.default_target_types.includes(d.device_type)) && (!initialTarget || d.device_id === initialTarget)), [devices, preset, initialTarget]);
  const selectedDevice = initialTarget ? devices.find((device) => device.device_id === initialTarget) : undefined;
  const scenarioCompatible = !selectedDevice || Boolean(preset?.default_target_types.includes(selectedDevice.device_type));
  const selectedTarget = targets.some((device) => device.device_id === target) ? target : targets[0]?.device_id || "";
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(null); try { await work(); await onComplete(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario operation failed"); } finally { setBusy(false); } };
  const launch = (work: () => Promise<Attack>) => { const focus = beginScenarioFocus?.(); return run(async () => { const attack = await work(); focus?.(attack); }); };
  return <Panel title={compact ? "Simulate Attack" : "Attack Simulation"} kicker="Configure a safe synthetic scenario inside the virtual testbed." className={`attack-panel ${compact ? "attack-panel-compact" : ""}`}>
    {error && <p role="status">{error}</p>}
    <h3 className="attack-step-title">1. Select scenario</h3>
    <div className="attack-scenario-grid" role="group" aria-label="Supported synthetic scenarios">{visibleTypes.map(item => { const selectedDevice = devices.find((device) => device.device_id === initialTarget); const compatible = !selectedDevice || item.default_target_types.includes(selectedDevice.device_type); return <button type="button" key={item.attack_type} disabled={!compatible} aria-pressed={type === item.attack_type} title={!compatible ? `This attack is not supported for ${selectedDevice?.name}` : undefined} onClick={() => { setType(item.attack_type); setTarget(selectedDevice && compatible ? selectedDevice.device_id : ""); }}><b>{attackName(item.attack_type)}</b><small>{item.name} · {item.protocol}{!compatible ? " · target unsupported" : ""}</small></button>; })}</div>
    {preset && <div className="attack-preset-context">{preset.attack_type === "Port_Scanning" && <span className="recommended-scenario">Suggested walkthrough · outcome is not guaranteed</span>}<b>{preset.name}</b><span>{preset.description || preset.behavior_summary}</span></div>}
    {selectedDevice && !scenarioCompatible && <p role="status">{preset?.name ?? "This scenario"} is not supported for {selectedDevice.name}. Choose a compatible scenario to target this device.</p>}
    <h3 className="attack-step-title">2. Attack parameters</h3>
    <div className="control-form"><label>Virtual target<select aria-label="Virtual target" value={selectedTarget} onChange={(e) => setTarget(e.target.value)}>{targets.map((device) => <option key={device.device_id} value={device.device_id}>{device.name}</option>)}</select></label><label>Intensity<select aria-label="Intensity" value={intensity} onChange={(e) => setIntensity(e.target.value)}><option>low</option><option>medium</option><option>high</option></select></label><label>Duration<input aria-label="Duration ticks" type="number" min="1" max="100" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label><button className="button danger" disabled={busy || !type || !selectedTarget || !scenarioCompatible} onClick={() => launch(() => api.scheduleAttack({ attack_type: type, target_device_id: selectedTarget, intensity, duration_ticks: duration, seed: 42 }))}>{compact ? "Launch Scenario" : "Schedule scenario"}</button></div>
    <div className="attack-list">{attacks.filter((a) => ["scheduled", "active"].includes(a.status)).map((attack) => <article key={attack.attack_id}><div><Badge value={attack.status} /><b>{titleCase(attack.attack_type)}</b><small>{attack.target_device_id} · {attack.intensity} · ticks {attack.start_tick}–{attack.end_tick}</small></div><span>{attack.ticks_active}/{attack.duration_ticks} ticks</span><div>{attack.status === "scheduled" && <button disabled={busy} onClick={() => launch(() => api.startAttack(attack.attack_id))}>Start now</button>}<button onClick={() => run(() => api.cancelAttack(attack.attack_id))}>Cancel</button></div></article>)}</div>
    <p className="safety-note">Synthetic metadata only. No external traffic or real ARP poisoning, scanning, or flooding occurs.</p>
  </Panel>;
}

"use client";

import { useMemo, useState } from "react";
import { deviceReadings } from "@/features/digital-twin";
import type { Attack, Device, PolicyState, Topology } from "@/types/api";
import { Badge } from "./ui";
import { AttackControl } from "./attack-control";
import type { AttackType } from "@/types/api";
import { attackName, titleCase } from "@/lib/format";

type Point = { x: number; y: number; labelX?: number; labelY?: number; labelWidth?: number };
const DEVICE_POINTS: Record<string, Point[]> = {
  gateway: [{ x: 52, y: 35 }],
  soil_moisture_sensor: [{ x: 27, y: 56 }, { x: 41, y: 63 }],
  temperature_sensor: [{ x: 67, y: 36 }],
  humidity_sensor: [{ x: 75, y: 53 }],
  water_flow_sensor: [{ x: 59, y: 72 }],
  pump_controller: [{ x: 47, y: 76 }],
  weather_node: [{ x: 84, y: 34 }],
};
const ICONS: Record<string, string> = {
  gateway: "GW", soil_moisture_sensor: "SM", temperature_sensor: "T", humidity_sensor: "RH",
  water_flow_sensor: "WF", pump_controller: "P", weather_node: "WX",
};

export function SmartFarmView({ devices, topology, attacks, attackTypes, policy, active, selectedDeviceId, focusedCorrelation, onSelectDevice, onComplete, beginScenarioFocus }: {
  devices: Device[]; topology: Topology; attacks: Attack[]; attackTypes?: AttackType[]; policy: PolicyState; active: boolean;
  selectedDeviceId: string | null; focusedCorrelation?: string; onSelectDevice: (id: string | null) => void;
  onComplete?: () => Promise<void> | void; beginScenarioFocus?: () => (attack: Attack) => void;
}) {
  const [attackDialogOpen, setAttackDialogOpen] = useState(false);
  const positions = useMemo(() => {
    const counts = new Map<string, number>();
    return new Map(devices.map((device, index) => {
      const n = counts.get(device.device_type) ?? 0; counts.set(device.device_type, n + 1);
      const point = DEVICE_POINTS[device.device_type]?.[n] ?? { x: 15 + (index % 4) * 22, y: 42 + Math.floor(index / 4) * 25 };
      const labelPlacement = device.device_type === "soil_moisture_sensor" && n === 1 ? { labelX: -155, labelY: -62, labelWidth: 160 }
        : device.device_type === "pump_controller" ? { labelX: -50, labelY: 20, labelWidth: 150 }
        : device.device_type === "water_flow_sensor" ? { labelX: 16, labelY: 25, labelWidth: 160 } : {};
      return [device.device_id, { ...point, ...labelPlacement }];
    }));
  }, [devices]);
  const selected = devices.find((device) => device.device_id === selectedDeviceId);
  const focusedAttack = attacks.find((attack) => attack.correlation_id === focusedCorrelation);
  const activeFocusedAttack = focusedAttack?.status === "active" ? focusedAttack : undefined;
  const scheduledFocusedAttack = focusedAttack?.status === "scheduled" ? focusedAttack : undefined;
  const isolated = new Set(policy.isolated_devices);
  const blockedSource = new Set(policy.quarantined_sources);
  const normalLinks = topology.links.flatMap((link, index) => {
    const from = positions.get(link.source_device_id); const to = positions.get(link.destination_device_id);
    return from && to ? [{ id: `normal-${index}`, from, to, blocked: isolated.has(link.source_device_id) || isolated.has(link.destination_device_id) }] : [];
  });
  const target = focusedAttack ? positions.get(focusedAttack.target_device_id) : undefined;
  const attackBlocked = Boolean(focusedAttack && (blockedSource.has(focusedAttack.source_device_id) || isolated.has(focusedAttack.target_device_id)));

  return <section className="smart-farm" aria-label="Smart farm live view">
    <header className="smart-farm-heading"><div><span className="kicker">SMART FARM LIVE VIEW</span><h2>Virtual devices &amp; communication</h2><p>Illustrated view of the configured testbed. Markers, readings and paths come from runtime state.</p></div><div className="farm-legend"><span><i className="normal" />Normal link</span><span><i className="attack" />Focused scenario</span><span><i className="blocked" />Blocked by virtual defense</span></div></header>
    <div className="farm-illustration-wrap">
      <svg className="farm-illustration" viewBox="0 0 1000 560" role="img" aria-label={`Illustrated virtual smart farm with ${devices.length} runtime devices`}>
        <defs>
          <linearGradient id="farm-sky" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#dff4f6" /><stop offset="1" stopColor="#f5f8ed" /></linearGradient>
          <pattern id="crop-lines" width="34" height="34" patternTransform="rotate(-15)" patternUnits="userSpaceOnUse"><path d="M0 0V34" stroke="#82a96d" strokeWidth="5" opacity=".55" /></pattern>
        </defs>
        <rect width="1000" height="560" rx="22" fill="url(#farm-sky)" />
        <circle cx="880" cy="78" r="34" fill="#f8d77b" opacity=".85" />
        <path d="M0 220 Q170 155 330 220 T650 205 T1000 210 V560 H0Z" fill="#b7d6a4" />
        <path d="M0 290 Q210 220 430 300 T1000 275 V560 H0Z" fill="#8fbf83" />
        <path d="M45 385 Q260 320 490 405 T950 365 V545 H45Z" fill="#739f64" />
        <path d="M42 392 Q250 326 485 412 T950 371 V545 H42Z" fill="url(#crop-lines)" />
        <path d="M0 513 Q220 464 440 508 T1000 490" fill="none" stroke="#c9a878" strokeWidth="30" opacity=".8" />
        <path d="M175 460 C300 428 405 452 520 468 S730 465 870 410" fill="none" stroke="#6ca9bd" strokeWidth="22" strokeLinecap="round" opacity=".88" />
        <path d="M175 460 C300 428 405 452 520 468 S730 465 870 410" fill="none" stroke="#d7f0f1" strokeWidth="5" strokeDasharray="4 13" />
        <g aria-hidden="true"><rect x="70" y="102" width="185" height="120" rx="12" fill="#f7f7ed" stroke="#9bac94" strokeWidth="4" /><path d="M52 112 163 52 273 112Z" fill="#526e63" /><rect x="132" y="150" width="54" height="72" fill="#a7c7bd" /><rect x="88" y="139" width="32" height="30" fill="#9cc7d4" /><rect x="205" y="139" width="32" height="30" fill="#9cc7d4" /><text x="162" y="245" textAnchor="middle" className="farm-scene-label">CONTROL SHED</text></g>
        <g aria-hidden="true"><rect x="710" y="305" width="172" height="75" rx="12" fill="#e6f3f4" stroke="#7ca4a6" strokeWidth="4" /><path d="M728 305v-55h138v55" fill="none" stroke="#7ca4a6" strokeWidth="7" /><path d="M742 293v-30m28 30v-30m28 30v-30m28 30v-30" stroke="#75aa81" strokeWidth="9" /><text x="796" y="402" textAnchor="middle" className="farm-scene-label">IRRIGATION AREA</text></g>
        <g aria-hidden="true"><path d="M340 382c0-32 42-54 82-54s82 22 82 54-38 49-82 49-82-17-82-49Z" fill="#75bdc9" stroke="#4c98a7" strokeWidth="4" /><path d="M355 383q67-22 135 0" fill="none" stroke="#d9f4f1" strokeWidth="5" /><text x="422" y="452" textAnchor="middle" className="farm-scene-label">WATER RESERVOIR</text></g>
        <g aria-hidden="true"><path d="M820 118v70m-28-53h56m-48 6-20 19m40-19 20 19" stroke="#566f72" strokeWidth="6" /><path d="M820 118 792 135l28-6 28 6Z" fill="#edf5f2" stroke="#566f72" strokeWidth="4" /><text x="820" y="213" textAnchor="middle" className="farm-scene-label">WEATHER POINT</text></g>
        {normalLinks.map((link) => <line key={link.id} className={`farm-link ${link.blocked ? "blocked" : active ? "flowing" : ""}`} x1={`${link.from.x}%`} y1={`${link.from.y}%`} x2={`${link.to.x}%`} y2={`${link.to.y}%`} />)}
        {focusedAttack && target && (activeFocusedAttack || scheduledFocusedAttack || attackBlocked) && <g className={`focused-farm-path ${focusedAttack.status}`}><line className={`farm-link ${attackBlocked ? "blocked" : activeFocusedAttack ? "attack flowing" : "scheduled"}`} x1="8%" y1="20%" x2={`${target.x}%`} y2={`${target.y}%`} /><text x="9%" y="17%">{attackBlocked ? "Blocked by virtual defense" : activeFocusedAttack ? "Active synthetic scenario" : "Scenario scheduled"}</text>{(activeFocusedAttack || scheduledFocusedAttack) && <circle className={`farm-target-ring ${attackBlocked ? "defended" : ""}`} cx={`${target.x}%`} cy={`${target.y}%`} r="43" />}</g>}
        {devices.map((device) => {
          const point = positions.get(device.device_id); if (!point) return null;
          const readings = deviceReadings(device); const reading = readings.find((item) => item.key !== "connected_devices");
          const isGateway = device.device_id === topology.gateway_id;
          const focused = focusedAttack?.target_device_id === device.device_id && (activeFocusedAttack || scheduledFocusedAttack);
          const security = isolated.has(device.device_id) ? "Isolated" : activeFocusedAttack?.target_device_id === device.device_id ? "Scenario target" : scheduledFocusedAttack?.target_device_id === device.device_id ? "Scheduled target" : device.status;
          return <g key={device.device_id} className={`farm-device ${selectedDeviceId === device.device_id ? "selected" : ""} ${focused ? "targeted" : ""}`} transform={`translate(${point.x * 10} ${point.y * 5.6})`} role="button" tabIndex={0} aria-label={`Inspect ${device.name}, ${security}`} aria-pressed={selectedDeviceId === device.device_id} onClick={() => onSelectDevice(device.device_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectDevice(device.device_id); } }}>
            <circle className="farm-device-halo" r="27" /><circle className="farm-device-core" r="21" /><text className="farm-device-icon" y="7" textAnchor="middle">{ICONS[device.device_type] ?? "●"}</text>
            <foreignObject x={point.labelX ?? -88} y={point.labelY ?? 28} width={point.labelWidth ?? 176} height="62"><div className="farm-device-label"><b>{device.name}</b><span>{isGateway ? "Gateway" : reading?.value ?? "Runtime device"} · {security}</span></div></foreignObject>
          </g>;
        })}
      </svg>
      <p className="farm-view-caption">{active ? "Communication paths are shown from the current virtual topology." : "Stopped state · paths are shown as configured topology, without animated activity."} Synthetic paths appear only for a retained focused scenario.</p>
    </div>
    <div className="farm-device-inspector" aria-live="polite">
      {selected ? <><div><span className="kicker">SELECTED RUNTIME DEVICE</span><h3>{selected.name}</h3></div><Badge value={isolated.has(selected.device_id) ? "isolated" : selected.status} /><dl><div><dt>Type</dt><dd>{selected.device_type.replaceAll("_", " ")}</dd></div><div><dt>Device health</dt><dd>{selected.health}</dd></div><div><dt>Address</dt><dd>{selected.address}</dd></div><div><dt>Network</dt><dd>{selected.device_id === topology.gateway_id ? "Gateway" : `Configured ${selected.protocol} / ${selected.service}`}</dd></div><div><dt>Scenario</dt><dd>{focusedAttack?.target_device_id === selected.device_id ? `${focusedAttack.attack_type.replaceAll("_", " ")} · ${titleCase(focusedAttack.status)}` : "Not targeted by focused scenario"}</dd></div>{deviceReadings(selected).map((reading) => <div key={reading.key}><dt>{reading.label}</dt><dd>{reading.value}</dd></div>)}</dl>{attackTypes && onComplete && beginScenarioFocus && <button type="button" onClick={() => setAttackDialogOpen(true)}>Simulate Attack</button>}<button type="button" onClick={() => onSelectDevice(null)}>Clear selection</button></> : <div><b>Select a farm marker to inspect a real runtime device.</b><span>The configured testbed has {devices.length} devices. Telemetry appears only when supplied by the simulator.</span></div>}
    </div>
    {focusedAttack?.status === "completed" && <p className="farm-last-scenario">Last focused scenario · {attackName(focusedAttack.attack_type)} — Completed</p>}
    {attackDialogOpen && selected && attackTypes && onComplete && beginScenarioFocus && <div className="farm-attack-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAttackDialogOpen(false); }}><section className="farm-attack-dialog" role="dialog" aria-modal="true" aria-labelledby="farm-attack-title"><header><h2 id="farm-attack-title">Simulate Attack</h2><button type="button" aria-label="Close attack panel" onClick={() => setAttackDialogOpen(false)}>×</button></header><p>Selected device: <b>{selected.name}</b></p><AttackControl types={attackTypes} devices={devices} attacks={[]} onComplete={async () => { await onComplete(); setAttackDialogOpen(false); }} beginScenarioFocus={beginScenarioFocus} initialTarget={selected.device_id} compact /></section></div>}
  </section>;
}

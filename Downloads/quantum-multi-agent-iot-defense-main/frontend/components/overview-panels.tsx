import Link from "next/link";
import { Activity, Bot, Cpu, Database, Network, RadioTower, RotateCcw, ShieldCheck, Sprout } from "lucide-react";
import { deriveSystemSummary } from "@/features/system-status";
import { groupIncidents } from "@/features/incidents";
import { appliedControlCount, recoveryLabel } from "@/features/runtime-semantics";
import { deriveDetectionEvidence } from "@/features/detection";
import type { DashboardSnapshot, LiveConnectionState, PredictionPayload } from "@/types/api";
import { titleCase } from "@/lib/format";
import { Badge, Empty, Panel } from "./ui";

export function OverviewHero({ data, connection }: { data: DashboardSnapshot; connection: LiveConnectionState; compactBackground?: boolean }) {
  const summary = deriveSystemSummary(data);
  const state = [
    { label: "IoT Devices", value: `${data.simulation.online_devices} / ${data.simulation.device_count}`, status: "Online", tone: "healthy" },
    { label: "Active Synthetic Attacks", value: String(data.activeAttacks.filter((attack) => attack.status === "active").length), status: "User-launched scenarios", tone: summary.activeAttacks ? "critical" : "healthy" },
    { label: "Incidents", value: String(groupIncidents(data.events).length), status: "Retained cases", tone: "warning" },
    { label: "Agents", value: String(data.agentHealth.total_agents), status: data.runtimeStatus.active ? `${data.agentHealth.healthy_agents} healthy` : "Runtime stopped", tone: data.runtimeStatus.active && summary.degraded ? "warning" : "healthy" },
  ];
  return <section className="overview-hero">
    <div className="overview-introduction"><span>SMART AGRICULTURE · CYBER DEFENSE</span><div className="overview-title"><i aria-hidden="true"><ShieldCheck /></i><h1>Smart Irrigation IoT Cyber Defense System</h1></div><p>AI + Quantum ML for cybersecurity in a virtual smart farm.</p></div>
    <div className="overview-primary-state" aria-label="Current runtime summary">{state.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><Badge value={item.status} tone={item.tone} /></div>)}<div><span>System Status</span><strong>{summary.overallLabel}</strong><Badge value={connection === "live" ? "Live" : titleCase(connection)} tone={connection === "live" ? "healthy" : connection} /></div></div>
  </section>;
}

export function CurrentSecurityState({ data }: { data: DashboardSnapshot }) {
  const incident = groupIncidents(data.events).find((group) => group.latest.payload.detected === true);
  if (!incident) return <Panel title="Retained Threat Assessment" kicker="Correlated model assessments in the bounded live snapshot." className="overview-security" action={<Link href="/incidents">View cases</Link>}><div className="normal-operation"><ShieldCheck aria-hidden="true" /><div><strong>No positive assessment retained</strong><p>This is not a verdict that the environment is attack-free.</p></div></div></Panel>;
  const payload = incident.latest.payload;
  const defense = [...data.defenses].reverse().find((item) => item.correlation_id === incident.correlationId || item.incident_id === incident.incidentId);
  const recovery = [...data.recoveries].reverse().find((item) => item.correlation_id === incident.correlationId || item.defense_action_id === defense?.action_id);
  return <Panel title="Retained Threat Assessment" kicker="Highest-severity retained positive case; attribution remains tentative." className="overview-security" action={<Link href="/incidents">View case details</Link>}>
    <div className="security-state-grid"><div className="security-lead"><Badge value={payload.severity} /><strong>{payload.suspected_attack_family ? titleCase(payload.suspected_attack_family) : "Attribution pending"}</strong><span>{payload.affected_devices.map((id) => deviceName(data, id)).join(", ") || "No affected device identified"}</span></div><SecurityFact label="Assessment evidence" value={payload.disagreement ? "Disagreement" : payload.evidence_strength === "corroborated" ? "Corroborated" : "Corroboration not recorded"} /><SecurityFact label="Defense record" value={defense ? titleCase(defense.status) : "No action recorded"} /><SecurityFact label="Recovery record" value={recoveryLabel(recovery)} /></div>
  </Panel>;
}

export function TestbedPreview({ data }: { data: DashboardSnapshot }) {
  const gateway = data.devices.find((device) => device.device_id === data.topology.gateway_id);
  const readings = telemetryReadings(data).slice(0, 3);
  const controlled = appliedControlCount(data.policy) > 0;
  const communication = data.activeAttacks.some((attack) => attack.status === "active") ? "Synthetic scenario active" : controlled ? "Policy controls set" : "No synthetic attack active";
  return <Panel title="Virtual IoT Testbed" kicker="The smart-farm environment where the framework is demonstrated." className="overview-testbed" action={<Link href="/iot-testbed">View IoT Testbed</Link>}>
    <div className="testbed-overview"><div className="testbed-mini-map" aria-label="Compact virtual farm topology"><div className="mini-gateway"><RadioTower aria-hidden="true" /><b>{gateway?.name ?? "Farm Gateway"}</b><small>{gateway ? titleCase(gateway.status) : "Unavailable"}</small></div>{data.devices.filter((device) => device.device_id !== data.topology.gateway_id).map((device, index) => <span className={`mini-device device-${index + 1}`} key={device.device_id}><i className={device.health} />{device.name}</span>)}</div><div className="testbed-facts"><div><span>Virtual devices</span><strong>{data.simulation.online_devices}/{data.simulation.device_count} online</strong></div><div><span>Gateway status</span><strong>{gateway ? titleCase(gateway.status) : "Unavailable"}</strong></div><div><span>Communication</span><strong>{communication}</strong></div></div></div>
    <div className="telemetry-preview">{readings.length ? readings.map((reading) => <div key={`${reading.device}-${reading.key}`}><span>{reading.label}</span><strong>{reading.value}</strong><small>{reading.device}</small></div>) : <span className="muted">Live telemetry appears when the simulator emits readings.</span>}</div>
  </Panel>;
}

export function OverviewDecision({ data }: { data: DashboardSnapshot }) {
  const incident = groupIncidents(data.events).find((group) => group.latest.payload.detected === true);
  const decisionEvents = incident ? data.events.filter((event) => event.correlation_id === incident.correlationId) : data.events;
  const evidence = deriveDetectionEvidence(decisionEvents);
  const classical = evidence.classical;
  const quantum = evidence.quantum;
  const agreement = evidence.agreement === "agreement" ? true : evidence.agreement === "disagreement" ? false : null;
  return <Panel title="Retained ML + QML Predictions" kicker="Model output for the displayed assessment, or latest retained flow when no positive case is available." className="overview-decision" action={<Link href="/detection">View technical detail</Link>}>
    {!classical && !quantum ? <Empty>No prediction is retained. Live network flows trigger both inference paths.</Empty> : <><div className="overview-models"><DecisionColumn label="Classical ML" role="Binary detection" prediction={classical} /><DecisionColumn label="QML" role="Binary comparison" prediction={quantum} quantum /></div><div className={`decision-outcome ${agreement === null ? "pending" : agreement ? "agreement" : "disagreement"}`}><span>Agreement</span><strong>{agreement === null ? classical ? "Awaiting QML" : "Awaiting evidence" : agreement ? "Agree" : "Disagree"}</strong><small>Compared only when both predictions refer to the same feature vector.</small></div></>}
    <p className="overview-qml-note">QML runs asynchronously on {data.models.qml_device}, a local quantum simulator. No quantum advantage is claimed.</p>
  </Panel>;
}

const stages = [
  { title: "IoT Testbed", description: "Virtual devices generate telemetry and communication.", href: "/iot-testbed", icon: Sprout },
  { title: "Network Traffic", description: "Communication is grouped into network flows.", href: "/detection", icon: Network },
  { title: "27 Features", description: "Flow behavior enters the frozen feature schema.", href: "/detection", icon: Database },
  { title: "Classical ML + QML", description: "Primary detection with QML corroboration.", href: "/detection", icon: Cpu },
  { title: "Threat Analysis", description: "Evidence is correlated and severity assigned.", href: "/incidents", icon: Activity },
  { title: "Defense", description: "Simulator-only mitigation is selected or executed.", href: "/attack-response", icon: ShieldCheck },
  { title: "Recovery", description: "Eligible policy rollback is followed by verification.", href: "/attack-response", icon: RotateCcw },
];
export function SystemProcessFlow() {
  return <Panel title="End-to-End System Flow" kicker="From virtual IoT traffic to autonomous response." className="process-panel"><div className="command-process-flow">{stages.map((stage, index) => { const Icon = stage.icon; return <Link href={stage.href} key={stage.title}><span><Icon aria-hidden="true" /></span><b>{stage.title}</b><small>{stage.description}</small>{index < stages.length - 1 && <i aria-hidden="true">→</i>}</Link>; })}</div></Panel>;
}

export function AutonomousResponseSummary({ data }: { data: DashboardSnapshot }) {
  const summary = deriveSystemSummary(data);
  const incident = groupIncidents(data.events).find((group) => group.latest.payload.detected === true);
  const defense = incident ? [...data.defenses].reverse().find((item) => item.correlation_id === incident.correlationId || item.incident_id === incident.incidentId) : undefined;
  const recovery = incident ? [...data.recoveries].reverse().find((item) => item.correlation_id === incident.correlationId || item.defense_action_id === defense?.action_id) : undefined;
  const predictionRetained = incident && data.events.some((event) => event.correlation_id === incident.correlationId && ["classical_prediction", "quantum_prediction"].includes(event.event_type));
  const responseStages = [["Detection", predictionRetained ? "Prediction retained" : "Prediction not retained"], ["Threat assessment", incident ? titleCase(incident.latest.payload.status) : "Not retained"], ["Defense record", defense ? titleCase(defense.status) : "Not recorded"], ["Recovery record", recoveryLabel(recovery)]];
  return <Panel title="Autonomous Response" kicker="Response records for the displayed assessment; counts cover the runtime snapshot." className="overview-response">
    <p>{summary.pendingApproval} pending approval · {summary.appliedControls} applied controls · {summary.manualReviewRecoveries} manual review</p>
    {incident ? <div className="response-chain">{responseStages.map(([label, status], index) => <div key={label}><span>{index + 1}</span><b>{label}</b><small>{status}</small></div>)}</div> : <div className="response-nominal"><Activity aria-hidden="true" /><div><strong>No positive case retained</strong><span>Defense and recovery histories remain available in Attack &amp; Response.</span></div></div>}
  </Panel>;
}

export function AgentHealthSummary({ data }: { data: DashboardSnapshot }) {
  const agents = data.agents.length ? data.agents : data.agentHealth.agents;
  const allHealthy = data.agentHealth.total_agents > 0 && data.agentHealth.healthy_agents === data.agentHealth.total_agents;
  const healthMessage = !data.runtimeStatus.active ? "Agents initialize when the system is activated." : allHealthy ? "All reported agents are operating normally." : "One or more agents are initializing or require attention.";
  return <Panel title="Agent Health" kicker="Six asynchronous agents coordinate the defense lifecycle." className="overview-agent-health" action={<Link href="/multi-agent">View agents</Link>}><div className="agent-health-lead"><Bot aria-hidden="true" /><div><strong>{data.runtimeStatus.active ? `${data.agentHealth.healthy_agents} / ${data.agentHealth.total_agents} Agents Healthy` : "Agents Inactive"}</strong><span>{healthMessage}</span></div></div><div className="agent-health-dots">{agents.map((agent) => <span key={agent.agent_id}><i className={data.runtimeStatus.active ? agent.health : "inactive"} />{agent.name.replace(" Agent", "")}</span>)}</div></Panel>;
}

export function FeaturePipeline() {
  return <Panel title="27-Feature Pipeline" kicker="Frozen ordered feature contract shared by both inference paths." className="pipeline-panel"><div className="simple-flow"><span>Network Flow</span><i>→</i><span>27 Ordered Features</span><i>→</i><span>Classical ML / QML</span></div><p>Each grouped flow is transformed into the same frozen 27-feature contract used by both inference paths.</p></Panel>;
}

function SecurityFact({ label, value }: { label: string; value: string }) { return <div className="security-fact"><span>{label}</span><strong>{value}</strong></div>; }
function DecisionColumn({ label, role, prediction, quantum = false }: { label: string; role: string; prediction?: PredictionPayload; quantum?: boolean }) { return <article className={quantum ? "quantum" : "classical"}><header><div><b>{label}</b><span>{role}</span></div>{prediction && <Badge value={prediction.binary.predicted_class_name} tone={prediction.binary.predicted_class_id === 0 ? "healthy" : "high"} />}</header>{prediction ? <><div className="decision-result"><strong>{prediction.binary.predicted_class_name}</strong><span>{(prediction.binary.confidence * 100).toFixed(1)}% confidence</span></div><dl><dt>Attribution</dt><dd>{titleCase(prediction.multiclass.predicted_class_name)}</dd><dt>Latency</dt><dd>{prediction.binary.latency_ms.toFixed(1)} ms</dd><dt>Model</dt><dd>{prediction.binary.model_name}</dd></dl></> : <p>Awaiting model result.</p>}</article>; }
function deviceName(data: DashboardSnapshot, id: string) { return data.devices.find((device) => device.device_id === id)?.name ?? id; }
function telemetryReadings(data: DashboardSnapshot) { const labels: Record<string, [string, string]> = { moisture_percent: ["Soil moisture", "%"], temperature_c: ["Temperature", "°C"], humidity_percent: ["Humidity", "%"], flow_liters_per_minute: ["Irrigation flow", " L/min"], air_temperature_c: ["Air temperature", "°C"], wind_speed_mps: ["Wind speed", " m/s"] }; return data.devices.flatMap((device) => Object.entries(device.telemetry_state).filter(([key, value]) => key in labels && typeof value === "number").map(([key, value]) => ({ key, device: device.name, label: labels[key][0], value: `${Number(value).toFixed(1)}${labels[key][1]}` }))); }

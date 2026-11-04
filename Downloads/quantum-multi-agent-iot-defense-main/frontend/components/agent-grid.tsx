"use client";

import { useMemo, useState } from "react";
import { Activity, Atom, Braces, Cpu, Radar, RotateCcw, Shield, ShieldAlert } from "lucide-react";
import type { Agent, AuditEntry } from "@/types/api";
import { relativeTime, titleCase } from "@/lib/format";
import { Badge, Panel } from "./ui";
import { useReportedChange } from "@/hooks/use-reported-change";

const agentDesign = [
  { id: "monitoring-agent", name: "Monitoring Agent", tone: "monitoring", role: "Observes runtime and network activity, then routes evidence.", input: "Network events, runtime status, and extracted feature vectors.", processing: "Tracks security-relevant events and dispatches work; feature extraction is handled separately.", output: "Observation events for the detection agents." },
  { id: "classical-ml-agent", name: "Classical ML Agent", tone: "classical", role: "Produces primary classical-model detection evidence.", input: "The frozen 27-feature representation.", processing: "Binary XGBoost detection and multiclass Logistic Regression attribution.", output: "Binary prediction, attack attribution, confidence/probability output, and inference metadata." },
  { id: "quantum-ml-agent", name: "Quantum ML Agent", tone: "quantum", role: "Produces binary and attack-class predictions with the frozen QML models.", input: "The same frozen 27-feature representation.", processing: "TRAIN-fitted StandardScaler → L2 normalization → append 5 zeros (32 amplitudes) → 5-qubit AmplitudeEmbedding → 3 StronglyEntanglingLayers → Pauli-Z expectations → output layer.", output: "Binary prediction, multiclass attribution, confidence, and inference metadata." },
  { id: "threat-analysis-agent", name: "Threat Analysis Agent", tone: "threat", role: "Correlates model evidence and determines incident-level response eligibility.", input: "Classical and QML evidence, runtime/security context, and correlated events.", processing: "Correlates evidence, assigns severity, tracks agreement/disagreement, and evaluates defense eligibility.", output: "Incident assessment, severity, attribution, affected target/device, eligibility, and correlation state." },
  { id: "defense-agent", name: "Defense Agent", tone: "defense", role: "Manages safe, simulator-only policy changes for eligible assessments.", input: "Eligible threat assessment, severity, and affected target/context.", processing: "Selects or manages simulator-only actions and human approval where required.", output: "Defense proposal/action and its current status." },
  { id: "recovery-agent", name: "Recovery Agent", tone: "recovery", role: "Verifies whether conditions support recovery or require review.", input: "Defense state, threat state, runtime health, and attack activity.", processing: "Monitors recovery conditions, threat clearance, and bounded verification.", output: "Recovery state, verified status, rollback status, or manual-review requirement." },
] as const;

type AgentDesign = (typeof agentDesign)[number];
const agentIcons = [Radar, Cpu, Atom, ShieldAlert, Shield, RotateCcw];

export function AgentGrid({ agents, audit, runtimeActive = true }: { agents: Agent[]; audit: AuditEntry[]; runtimeActive?: boolean }) {
  const [selectedId, setSelectedId] = useState<string>(agentDesign[0].id);
  const liveAgents = useMemo(() => new Map(agents.map((agent) => [agent.agent_id, agent])), [agents]);
  const selected = agentDesign.find((agent) => agent.id === selectedId) ?? agentDesign[0];
  const selectedLive = liveAgents.get(selected.id);
  const selectedAudit = audit.filter((entry) => entry.agent_id === selected.id).slice(-12).reverse();
  const healthyCount = agentDesign.filter(({ id }) => {
    const agent = liveAgents.get(id);
    return runtimeActive && agent?.health === "healthy" && agent.status === "running";
  }).length;

  return <Panel title="Six-Agent Coordination" kicker="Independent workers coordinate detection, threat analysis, defense, and recovery." className="agents-panel">
    <section className="agent-health-summary" aria-label="Agent health summary">
      <div><span className="agent-health-number">{runtimeActive ? `${healthyCount} / 6` : "— / 6"}</span><div><b>{runtimeActive ? "Agents Healthy" : "Agents Inactive"}</b><small>{runtimeActive ? "Current live worker health" : "Runtime stopped · health not evaluated"}</small></div></div>
      <p>{runtimeActive ? "Status and queue figures below come from the current runtime snapshot." : "Agent health is not evaluated while the runtime is stopped."}</p>
    </section>

    <div className="agent-pipeline-workspace">
    <section className="agent-architecture" aria-label="Six-agent architecture">
      <h3 className="pipeline-stage-label">01 · Monitor</h3>
      <AgentNode design={agentDesign[0]} agent={liveAgents.get(agentDesign[0].id)} active={runtimeActive} selected={selectedId === agentDesign[0].id} onSelect={() => setSelectedId(agentDesign[0].id)} />
      <div className="flow-connector" aria-hidden="true"><span>observes network context</span><i>↓</i></div>
      <div className="flow-connector" aria-hidden="true"><span>dispatches feature vectors to parallel detection agents</span><i>↓</i></div>
      <div className="parallel-agents" aria-label="Parallel detection evidence">
        {agentDesign.slice(1, 3).map((design) => <AgentNode key={design.id} design={design} agent={liveAgents.get(design.id)} active={runtimeActive} selected={selectedId === design.id} onSelect={() => setSelectedId(design.id)} />)}
      </div>
      <div className="flow-connector parallel-join" aria-hidden="true"><span>distinct evidence · no probability averaging</span><i>↓</i></div>
      {agentDesign.slice(3).map((design, index) => <div className="sequential-agent" key={design.id}><h3 className="pipeline-stage-label">{["03 · Analyze", "04 · Respond", "05 · Verify"][index]}</h3><AgentNode design={design} agent={liveAgents.get(design.id)} active={runtimeActive} selected={selectedId === design.id} onSelect={() => setSelectedId(design.id)} />{index < 2 && <div className="flow-connector" aria-hidden="true"><i>↓</i></div>}</div>)}
    </section>

    <AgentInspector design={selected} agent={selectedLive} active={runtimeActive} audit={selectedAudit} />
    </div>

    <h3 className="supporting-components-heading">Supporting Components <span>Not agents</span></h3>
    <div className="agent-source-path" aria-label="Supporting components, not agents"><div><Activity aria-hidden="true" /><span><b>Attack Controller</b><small>Schedules safe synthetic scenarios</small></span></div><span aria-hidden="true">→</span><div><Radar aria-hidden="true" /><span><b>Virtual IoT Testbed</b><small>Supplies simulated network activity</small></span></div><span aria-hidden="true">→</span><div><Braces aria-hidden="true" /><span><b>Feature Extraction Manager</b><small>Builds the fixed 27-feature input</small></span></div></div>

    <div className="agent-notes">
      <p><b>Separate simulator module:</b> Attack Controller generates safe synthetic scenarios; it is not one of the six agents.</p>
      <p><b>Feature extraction is separate:</b> a manager/compatibility layer builds the frozen feature representation; Monitoring Agent does not extract features.</p>
      <p className="human-approval-note"><b>Human in the loop:</b> eligible medium-severity defense proposals require approval, while higher-severity simulator-only actions may execute automatically under backend policy. The backend remains authoritative.</p>
    </div>

    <details className="architecture-details"><summary>Architecture Details</summary><dl><div><dt>Internal agent communication</dt><dd>Python asyncio queues; each worker has its own lifecycle and queue</dd></div><div><dt>Execution model</dt><dd>Independent asynchronous workers in one process</dd></div><div><dt>Frontend communication</dt><dd>REST snapshots/actions + WebSocket updates</dd></div><div><dt>Runtime storage</dt><dd>Process-local, in-memory state; not distributed microservices</dd></div></dl><p>Agents do not communicate internally through REST, Kafka, Redis, or another external message broker.</p></details>
  </Panel>;
}

function AgentNode({ design, agent, active, selected, onSelect }: { design: AgentDesign; agent?: Agent; active: boolean; selected: boolean; onSelect: () => void }) {
  const health = !active ? "inactive" : agent?.health ?? "unavailable";
  const Icon = agentIcons[agentDesign.findIndex(item => item.id === design.id)];
  const activityRef = useReportedChange<HTMLButtonElement>(agent?.processed_event_count ?? 0, active && agent?.status === "running");
  const queue = Number(agent?.state.queued_events ?? 0);
  return <button ref={activityRef} type="button" className={`architecture-agent ${design.tone} ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    <span className="architecture-agent-title"><Icon size={20} aria-hidden="true" /><b>{design.name}</b><Badge value={health} /></span>
    <span className="architecture-agent-role">{design.role}</span>
    <span className="agent-node-status">{titleCase(health)}</span>
    <span className="agent-card-metrics"><span>Processed <b>{active && agent ? agent.processed_event_count : "—"}</b></span><span>Queue <b>{active && agent ? queue : "—"}</b></span></span>
    {design.id === "quantum-ml-agent" && active && Number(agent?.state.coalesced_background_events ?? 0) > 0 && <small className="qml-coalesced-count">Background vectors coalesced <b>{Number(agent?.state.coalesced_background_events)}</b></small>}
    {!agent && active && <small className="agent-data-missing">No live runtime record</small>}
  </button>;
}

function AgentInspector({ design, agent, active, audit }: { design: AgentDesign; agent?: Agent; active: boolean; audit: AuditEntry[] }) {
  return <section className={`agent-inspector ${design.tone}`} aria-labelledby="agent-inspector-title">
    <header><div><span>Selected worker</span><h3 id="agent-inspector-title">{design.name}</h3><p>{design.role}</p></div><Badge value={!active ? "inactive" : agent?.health ?? "unavailable"} /></header>
    <div className="agent-io-grid"><article><b>Input</b><p>{design.input}</p></article><article><b>Processing</b><p>{design.processing}</p></article><article><b>Output</b><p>{design.output}</p></article></div>
    {design.id === "threat-analysis-agent" && <p className="agent-policy-callout"><b>Severity belongs here.</b> Severity is an incident-level assessment, not a prediction output.</p>}
    {design.id === "defense-agent" && <p className="agent-policy-callout"><b>Simulator-only policy actions:</b> isolate virtual device, quarantine synthetic source, rate-limit virtual service, restrict virtual port, protect gateway, or restore normal policy.</p>}
    <footer><span>Live status: <b>{!active ? "Runtime stopped" : agent ? `${titleCase(agent.status)} · ${titleCase(agent.health)}` : "No live runtime record"}</b></span><span>Queue <b>{active && agent ? Number(agent.state.queued_events ?? 0) : "—"}</b></span><span>Processed <b>{active && agent ? agent.processed_event_count : "—"}</b></span>{design.id === "quantum-ml-agent" && <span>Background vectors coalesced <b>{active && agent ? Number(agent.state.coalesced_background_events ?? 0) : "—"}</b></span>}<span>Errors <b>{active && agent ? agent.error_count : "—"}</b></span><span>Last activity <b>{active && agent ? relativeTime(agent.last_activity_at) : "—"}</b></span></footer>
    <details className="agent-audit"><summary>Technical Audit · Recent worker records ({audit.length})</summary>{audit.length ? audit.map((entry) => <p key={`${entry.agent_id}-${entry.sequence}`}><time>{new Date(entry.timestamp).toLocaleTimeString([], { hour12: false })}</time> · {titleCase(entry.action)} — {entry.detail}</p>) : <p className="muted">No recent audit entries for this worker.</p>}</details>
  </section>;
}

import { Activity, Bot, Clock3, Network, ShieldCheck, ShieldQuestion } from "lucide-react";
import { modelEvidenceForIncident, responseForIncident, type IncidentGroup } from "@/features/incidents";
import { formatTime, titleCase } from "@/lib/format";
import type { DashboardSnapshot, EventEnvelope, PredictionPayload } from "@/types/api";
import { Badge } from "./ui";
import { IncidentTimeline } from "./timeline";
import { isVerifiedRecovery, recoveryLabel, recoveryTone } from "@/features/runtime-semantics";
import { Disclosure, PagedRows } from "./evidence-disclosure";

export function IncidentDetail({ data, incident }: { data: DashboardSnapshot; incident?: IncidentGroup }) {
  if (!incident) return <section className="incident-detail incident-detail-empty"><ShieldCheck /><h2>No Assessments Retained</h2><p>Assessment updates appear here grouped into correlated cases.</p></section>;
  const p = incident.latest.payload;
  const modelEvidence = modelEvidenceForIncident(data.events, incident);
  const { defense, recovery } = responseForIncident(incident, data.defenses, data.recoveries);
  const agreement = modelEvidence.comparison === "awaiting_evidence" ? "Awaiting QML" : modelEvidence.comparison === "agreement" ? "Agree" : "Disagree";
  const deviceNames = p.affected_devices.map((id) => data.devices.find((device) => device.device_id === id)?.name ?? id);
  const attackEvents = data.events.filter((event) => event.correlation_id === incident.correlationId && event.event_type === "network_activity" && event.payload.direction === "synthetic_to_target").length;

  return <section className="incident-detail" aria-label="Selected incident investigation">
    <header className={`incident-summary severity-${p.severity}`}>
      <div><span>SELECTED CORRELATED CASE</span><h2>{p.suspected_attack_family ? titleCase(p.suspected_attack_family) : "Pending attribution"}</h2><small title={incident.incidentId}>{incident.incidentId.slice(0, 17)}…</small></div>
      <div className="incident-summary-badges"><Badge value={p.severity} /><Badge value={p.status} tone="info" /><Badge value={agreement} tone={modelEvidence.comparison === "agreement" ? "healthy" : modelEvidence.comparison === "disagreement" ? "medium" : "info"} /></div>
    </header>

    <div className="incident-summary-grid">
      <SummaryFact icon={<Network />} label="Affected context" value={deviceNames.join(", ") || "No affected device"} />
      <SummaryFact icon={<Clock3 />} label="First retained update" value={formatTime(incident.history[0].timestamp)} />
      <SummaryFact icon={<Activity />} label="Latest retained update" value={formatTime(incident.latest.timestamp)} />
      <SummaryFact icon={<Bot />} label="Evidence / retained updates" value={`${p.evidence.length} items · ${incident.history.length} retained updates`} />
    </div>

    <section className="investigation-section model-investigation" aria-labelledby="incident-model-heading">
      <div className="investigation-heading"><div><span>MODEL EVIDENCE</span><h3 id="incident-model-heading">Classical ML vs QML</h3></div><Badge value={agreement} tone={modelEvidence.comparison === "agreement" ? "healthy" : modelEvidence.comparison === "disagreement" ? "medium" : "info"} /></div>
      <div className="incident-model-grid">
        <EvidenceCard label="Classical ML Prediction" role="Primary Detection" event={modelEvidence.classicalEvent} />
        <EvidenceCard label="QML Prediction" role="Corroborating Evidence" event={modelEvidence.quantumEvent} quantum />
      </div>
      <p className="incident-model-note">Model evidence contributes to incident analysis but does not determine severity by confidence. No probabilities are averaged and no fused confidence is created.</p>
    </section>

    <div className="incident-analysis-grid">
      <section className="investigation-section threat-output"><div className="investigation-heading"><div><span>AGENT ASSESSMENT</span><h3>Threat Analysis Output</h3></div><ShieldQuestion /></div>
        <p>Threat Analysis correlates model and runtime evidence into an incident-level assessment.</p>
        <dl><dt>Severity</dt><dd><Badge value={p.severity} /></dd><dt>Tentative attributed class</dt><dd>{p.suspected_attack_family ? titleCase(p.suspected_attack_family) : "Not attributed"}</dd><dt>Assessment state</dt><dd>{titleCase(p.status)}</dd><dt>Agreement state</dt><dd>{agreement}</dd><dt>Evidence count</dt><dd>{p.evidence.length}</dd><dt>Defense eligibility</dt><dd>{defense ? "Response action recorded" : "Not exposed by assessment"}</dd></dl>
      </section>
      <section className="investigation-section response-status"><div className="investigation-heading"><div><span>RESPONSE</span><h3>Defense & Recovery</h3></div><Badge value={recovery ? recoveryLabel(recovery) : defense ? titleCase(defense.status) : "No response recorded"} tone={recovery ? recoveryTone(recovery) : "info"} /></div>
        {!defense && !recovery ? <p>No response action is recorded for this incident.</p> : <dl><dt>Defense</dt><dd>{defense ? `${titleCase(defense.action_type)} · ${titleCase(defense.status)}` : "No defense recorded"}</dd><dt>Target</dt><dd>{defense?.target ?? "Not available"}</dd><dt>Initiated by</dt><dd>{defense?.initiated_by ?? "Not available"}</dd><dt>Recovery state</dt><dd>{recoveryLabel(recovery)}</dd><dt>Recovery success verified</dt><dd>{String(isVerifiedRecovery(recovery))}</dd><dt>Runtime verified flag</dt><dd>{recovery ? String(recovery.verified) : "Not applicable"}</dd><dt>Reason</dt><dd>{recovery?.reason ?? defense?.reason ?? "No response reason recorded"}</dd></dl>}
      </section>
    </div>

    <Disclosure title="Incident Timeline — retained technical chronology"><IncidentTimeline events={data.events} correlationId={incident.correlationId} embedded /></Disclosure>

    <Disclosure title="Evidence and revision details"><div className="incident-technical-grid"><div><b>Incident ID</b><code>{incident.incidentId}</code></div><div><b>Correlation ID</b><code>{incident.correlationId}</code></div><div><b>Retained synthetic events for this correlation</b><span>{attackEvents}</span></div><div><b>Evidence strength</b><span>{titleCase(p.evidence_strength)}</span></div></div><p className="incident-ground-truth">Case evidence and tentative attribution come from model/runtime assessments; they are not confirmed attacks or simulator ground truth.</p><div className="incident-evidence-list">{p.evidence.map((item, index) => <article key={`${item.source}-${item.category}-${index}`}><b>{item.source}</b><span>{titleCase(item.category)} · {titleCase(item.strength)}</span><p>{item.summary}</p></article>)}</div><PagedRows rows={[...incident.history].reverse()} label="evidence updates" render={revision=><details key={revision.event_id}><summary>{formatTime(revision.timestamp)} · {titleCase(revision.payload.severity)} · {revision.payload.decision_reason}</summary><pre>{JSON.stringify(revision,null,2)}</pre></details>} /></Disclosure>
  </section>;
}

function SummaryFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="incident-summary-fact"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>; }

function EvidenceCard({ label, role, event, quantum = false }: { label: string; role: string; event?: EventEnvelope<PredictionPayload>; quantum?: boolean }) {
  const p = event?.payload;
  return <article className={quantum ? "quantum" : "classical"}><header><div><b>{label}</b><span>{role}</span></div>{event && <time>{formatTime(event.timestamp)}</time>}</header>{p ? <><div className="incident-binary"><strong>{p.binary.predicted_class_name}</strong><span>{(p.binary.confidence * 100).toFixed(1)}% confidence</span></div><dl><dt>Attribution</dt><dd>{titleCase(p.multiclass.predicted_class_name)} <small>({p.multiclass.predicted_class_name})</small></dd><dt>Attribution confidence</dt><dd>{(p.multiclass.confidence * 100).toFixed(1)}%</dd><dt>Recorded prediction latency</dt><dd>{p.binary.latency_ms.toFixed(1)} ms binary · {p.multiclass.latency_ms.toFixed(1)} ms multiclass</dd><dt>Model</dt><dd>{p.binary.model_name}</dd></dl></> : <div className="incident-evidence-awaiting"><b>Awaiting evidence</b><span>No correlation-matched {label} result is retained.</span></div>}</article>;
}

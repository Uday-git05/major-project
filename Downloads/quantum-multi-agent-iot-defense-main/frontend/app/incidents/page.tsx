"use client";

import { useMemo } from "react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui";
import { Disclosure } from "@/components/evidence-disclosure";
import { useLiveRuntime } from "@/components/live-runtime-provider";
import { groupIncidents } from "@/features/incidents";
import { isVerifiedRecovery, recoveryLabel } from "@/features/runtime-semantics";
import { scenarioModelEvidence, scenarioQmlPending, scenarioRecords } from "@/features/scenario-focus";
import { attackName, formatTime, titleCase } from "@/lib/format";
import type { EventEnvelope, PredictionPayload } from "@/types/api";

export default function IncidentsPage() {
  const { data, selectedIncident, setSelectedIncident, focusedScenario } = useLiveRuntime();
  const incidents = useMemo(() => groupIncidents(data.events), [data.events]);
  const focus = focusedScenario ?? null;
  const scenario = scenarioRecords(data, focus);
  const focusedIncident = incidents.find((item) => item.correlationId === focus?.correlationId);
  const threat = [...scenario.events].reverse().find((event) => event.event_type === "threat_assessment");
  const threatPayload = threat?.payload;
  const threatEvidenceCount = Array.isArray(threatPayload?.evidence) ? threatPayload.evidence.length : 0;
  const threatReason = typeof threatPayload?.decision_reason === "string" ? threatPayload.decision_reason : "No assessment retained";
  const classical = [...scenario.events].reverse().find((event) => event.event_type === "classical_prediction") as EventEnvelope<PredictionPayload> | undefined;
  const qml = scenarioModelEvidence(scenario.events).quantum;
  const assessment = scenarioModelEvidence(scenario.events);
  const defense = scenario.defenses.at(-1);
  const recovery = scenario.recoveries.at(-1);
  const qmlDegraded = data.runtimeStatus.components.qml_inference === "degraded" || data.agents.find((agent) => agent.agent_id === "quantum-ml-agent")?.health === "unhealthy";
  const qmlWaiting = scenarioQmlPending(scenario.attack, scenario.features.length > 0, data.runtimeStatus.active, qmlDegraded, Boolean(qml));
  const meaningful = incidents.filter((item) => item.correlationId !== focus?.correlationId && (
    item.latest.payload.detected === true || item.latest.payload.severity === "high" || item.latest.payload.severity === "critical"
    || data.defenses.some((action) => action.correlation_id === item.correlationId)
    || data.recoveries.some((record) => record.correlation_id === item.correlationId)
  )).sort((a, b) => Date.parse(b.latest.timestamp) - Date.parse(a.latest.timestamp));
  const recent = meaningful.slice(0, 6);
  const selected = incidents.find((item) => item.correlationId === selectedIncident && item.correlationId !== focus?.correlationId);
  const updates = incidents.reduce((total, item) => total + item.history.length, 0);
  const provisional = incidents.filter((item) => !["closed", "resolved"].includes(item.latest.payload.status.toLowerCase())).length;
  const targetName = focus ? data.devices.find((device) => device.device_id === focus.target)?.name ?? focus.target : "—";
  const severity = threatPayload ? titleCase(String(threatPayload.severity)) : focus ? "Not assessed" : "Monitoring";
  const responseStatus = recovery ? recoveryLabel(recovery) : defense ? titleCase(defense.status) : focus ? "Monitoring" : "Monitoring";

  return <div className="application-page incidents-page" data-page="incidents">
    <PageHeading eyebrow="04 · Correlated threat cases" title="Threat Center" purpose="Investigate detected threats and follow their response lifecycle." />
    <section className="incident-overview-cards" aria-label="Incident summary">
      <SummaryCard label="Focused Incident" value={focus ? attackName(focus.attackType) : "None"} detail={focus ? "Selected synthetic scenario" : "Monitoring"} />
      <SummaryCard label="Severity" value={severity} detail={threatPayload ? "Threat assessment" : "No focused assessment"} />
      <SummaryCard label="Affected Device" value={targetName} detail={focus ? "Virtual testbed target" : "No focused target"} />
      <SummaryCard label="Response Status" value={responseStatus} detail={recovery ? isVerifiedRecovery(recovery) ? "Verified recovery" : recovery.state === "manual_review" ? "Manual review" : "Verification not complete" : defense ? "Defense lifecycle" : "Monitoring"} />
    </section>

    <section className="focused-incident-card" aria-labelledby="focused-incident-title">
      <header><div><span className="kicker">FOCUSED INCIDENT</span><h2 id="focused-incident-title">{focus ? attackName(focus.attackType) : "Monitoring"}</h2><p>{focus ? `Scenario ${scenario.attack?.status ? titleCase(scenario.attack.status) : "record retained"} · ${targetName}` : "No focused synthetic scenario. Background assessments are not additional user-launched attacks."}</p></div>{threatPayload && <Badge value={titleCase(String(threatPayload.severity))} />}</header>
      {focus ? <>
        <div className="incident-decision-grid">
          <PredictionSummary label="Classical ML" event={classical} pending={false} />
          <PredictionSummary label="QML" event={qml} pending={qmlWaiting} unavailable={qmlDegraded} />
          <SummaryCard label="Agreement" value={assessment.comparison === "Agreement" ? "Agree" : assessment.comparison === "Disagreement" ? "Disagree" : qmlWaiting || assessment.comparison === "No matched feature evidence" ? "Awaiting QML" : "Not available"} detail="Binary predictions, same feature vector" />
          <SummaryCard label="Threat Analysis" value={threatPayload ? threatPayload.detected === true ? "Actionable Threat" : "Observation" : "Monitoring"} detail={threatPayload ? titleCase(String(threatPayload.severity)) : "No correlated assessment yet"} />
          <SummaryCard label="Defense" value={defense ? defense.status === "completed" ? "Virtual Defense Applied" : defense.human_override_state === "pending" ? "Human Decision Required" : titleCase(defense.status) : "Not recorded"} detail={defense ? titleCase(defense.action_type.replaceAll("_", " ")) : "No eligible proposal recorded"} />
          <SummaryCard label="Recovery" value={recovery ? recoveryLabel(recovery) : "Not started"} detail={recovery ? isVerifiedRecovery(recovery) ? "Verified: Yes" : "Verified: No" : "Waiting for an eligible defense"} />
        </div>
        <p className="incident-truth-note">Classical ML and QML values are real predictions retained for this correlation. Severity and response are separate runtime decisions; model output is not simulator ground truth.</p>
        <Disclosure title="Technical Details"><dl className="incident-technical-details"><dt>Incident ID</dt><dd>{focusedIncident?.incidentId ?? "Not retained"}</dd><dt>Correlation</dt><dd>{focus.correlationId}</dd><dt>Evidence items</dt><dd>{threatEvidenceCount}</dd><dt>Grouped assessment updates</dt><dd>{focusedIncident?.history.length ?? 0}</dd><dt>Assessment reason</dt><dd>{threatReason}</dd></dl></Disclosure>
      </> : <div className="focused-incident-empty"><b>No focused scenario</b><span>Launch a synthetic scenario from Response to follow its correlated incident here.</span></div>}
    </section>

    <section className="recent-incidents" aria-labelledby="recent-incidents-title">
      <header><div><span className="kicker">CORRELATED CASES</span><h2 id="recent-incidents-title">Recent Incidents</h2><p>Latest meaningful threat cases, with each case’s assessment revisions grouped together.</p></div></header>
      {!recent.length ? <div className="focused-incident-empty">No additional meaningful cases are retained. Background assessments remain available below.</div> : <div className="recent-incidents-table-wrap"><table className="recent-incidents-table"><thead><tr><th>Time</th><th>Threat</th><th>Device</th><th>Severity</th><th>Status</th></tr></thead><tbody>{recent.map((incident) => {
        const payload = incident.latest.payload;
        const device = payload.affected_devices.map((id) => data.devices.find((item) => item.device_id === id)?.name ?? id).join(", ") || "Not reported";
        return <tr key={incident.incidentId} className={selected?.incidentId === incident.incidentId ? "selected" : ""}>
          <td><button type="button" onClick={() => setSelectedIncident(incident.correlationId)} aria-pressed={selected?.incidentId === incident.incidentId}>{formatTime(incident.latest.timestamp)}</button></td>
          <td>{payload.suspected_attack_family ? titleCase(payload.suspected_attack_family) : "Pending attribution"}</td><td>{device}</td><td><Badge value={titleCase(payload.severity)} /></td><td>{titleCase(payload.status)}</td>
        </tr>;
      })}</tbody></table></div>}
      {selected && <Disclosure title="Selected case details"><div className="selected-background-case"><b>{titleCase(selected.latest.payload.suspected_attack_family ?? "Pending attribution")}</b><span>{selected.latest.payload.decision_reason}</span><small>{selected.history.length} assessment updates grouped in this case · not confirmed ground truth</small><code>{selected.incidentId} · {selected.correlationId}</code></div></Disclosure>}
    </section>

    <Disclosure title="Background Model Activity">
      <section className="background-model-activity" aria-label="Background Model Activity details">
        <p>These are retained model-driven assessments for analysis. They are not additional user-launched attacks.</p>
        <div className="background-case-counts"><SummaryCard label="Retained Cases" value={String(incidents.length)} detail="Correlated assessment cases" /><SummaryCard label="Assessment Updates" value={String(updates)} detail="Revisions grouped by incident" /><SummaryCard label="Provisional Cases" value={String(provisional)} detail="Not confirmed attacks" /></div>
        <div className="background-case-list">{incidents.filter((item) => item.correlationId !== focus?.correlationId).slice(0, 12).map((incident) => <article key={incident.incidentId}><b>{incident.latest.payload.suspected_attack_family ? titleCase(incident.latest.payload.suspected_attack_family) : "Pending attribution"}</b><span>{titleCase(incident.latest.payload.severity)} · {incident.history.length} update{incident.history.length === 1 ? "" : "s"}</span><small>{formatTime(incident.latest.timestamp)} · {incident.latest.payload.decision_reason}</small></article>)}</div>
      </section>
    </Disclosure>
  </div>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="incident-summary-card"><span>{label}</span><b>{value}</b><small>{detail}</small></article>;
}

function PredictionSummary({ label, event, pending, unavailable = false }: { label: string; event?: EventEnvelope<PredictionPayload>; pending: boolean; unavailable?: boolean }) {
  const prediction = event?.payload.binary;
  const title = prediction?.predicted_class_id === 1 ? "Attack" : prediction?.predicted_class_id === 0 ? "Normal" : pending ? "Analyzing…" : unavailable ? "Unavailable" : "No result";
  return <article className={`incident-prediction-summary ${label === "QML" ? "qml" : "classical"}`}><span>{label}</span><b>{title}</b><small>{prediction ? `Confidence ${(prediction.confidence * 100).toFixed(1)}%` : unavailable ? "QML inference is degraded" : pending ? "Waiting for the correlated model result" : "No correlated prediction retained"}</small></article>;
}

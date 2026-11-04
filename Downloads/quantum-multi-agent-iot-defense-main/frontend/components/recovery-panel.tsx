"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { Agent, DefenseAction, EventEnvelope, PolicyState, Recovery } from "@/types/api";
import { formatTime, titleCase } from "@/lib/format";
import { Badge, Empty, Panel } from "./ui";
import { CountSummary } from "./count-summary";
import { isVerifiedRecovery, recoveryLabel, recoverySummary, recoveryTone } from "@/features/runtime-semantics";
import { Disclosure, PagedRows } from "./evidence-disclosure";

const stages = ["monitoring", "eligible", "recovering", "verifying"];
export function RecoveryPanel({ records, actions = [], focusedRecoveryId, focusedCorrelation, agent, policy, events = [], onComplete = () => undefined }: {
  records: Recovery[]; actions?: DefenseAction[]; focusedRecoveryId?: string; focusedCorrelation?: string | null; agent?: Agent; policy?: PolicyState;
  events?: EventEnvelope[]; onComplete?: () => Promise<void> | void;
}) {
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusScoped = focusedCorrelation !== undefined;
  const scopedRecords = focusScoped ? (focusedCorrelation ? records.filter((record) => record.correlation_id === focusedCorrelation) : []) : records;
  const backgroundRecords = focusScoped ? records.filter((record) => record.correlation_id !== focusedCorrelation) : [];
  const primary = scopedRecords.find(r=>r.recovery_id === focusedRecoveryId) ?? [...scopedRecords].reverse().find(r=>!isVerifiedRecovery(r) && !["failed", "manual_review"].includes(r.state)) ?? scopedRecords.at(-1);
  const current = scopedRecords.find(r=>r.recovery_id === (selectedId ?? focusedRecoveryId ?? primary?.recovery_id));
  const ordered = current ? [current] : [];
  const unresolved = scopedRecords.filter(r=>r.recovery_id !== focusedRecoveryId && !isVerifiedRecovery(r)).sort((a,b)=>recoveryPriority(a.state)-recoveryPriority(b.state)||b.state_tick-a.state_tick);
  const history = scopedRecords.filter(isVerifiedRecovery).sort((a,b)=>b.state_tick-a.state_tick);
  const row = (record: Recovery) => <article className="compact-evidence-row" key={record.recovery_id}><button onClick={()=>setSelectedId(record.recovery_id)}>{recoveryLabel(record)} · {record.reason}</button><small>State tick {record.state_tick} · verified success: {String(isVerifiedRecovery(record))}</small></article>;
  const counts = recoverySummary(scopedRecords);
  const currentAction = current && actions.find((item) => item.action_id === current.defense_action_id);
  const rollbackAvailable = currentAction?.status === "completed" && currentAction.reversible && currentAction.rollback_state === "not_requested" && !!policy && policyEffectIsActive(currentAction, policy);
  const rollback = async () => {
    if (!currentAction || !rollbackAvailable || busy) return;
    setBusy(true); setError(null);
    try { await api.defense(currentAction.action_id, "rollback"); await onComplete(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Rollback request failed"); }
    finally { setBusy(false); }
  };
  const manual = current?.state === "manual_review";
  const verified = isVerifiedRecovery(current);
  const primaryTitle = !current ? "No Recovery Record" : verified ? "Recovery Verified" : manual ? "Manual Review Required" : current.state === "failed" ? "Recovery Failed" : current.state === "recovered" ? "Recovery Not Verified" : titleCase(current.state);
  return <Panel title="Recovery Verification" kicker="Recovery Agent · Monitors defended incidents, evaluates recovery conditions, coordinates reversible policy restoration, and verifies whether the virtual system has returned to a stable state." className="recovery-panel">
    <section className="recovery-agent-status" aria-label="Recovery Agent status">
      <div><span>RECOVERY AGENT</span><b>{agent ? titleCase(agent.status) : "No live runtime record"}</b><small>{agent ? `${titleCase(agent.health)} · ${agent.processed_event_count} events processed · queue ${Number(agent.state.queued_events ?? 0)} · ${agent.error_count} errors` : "Agent metrics unavailable"}</small></div>
      <Badge value={agent?.health ?? "unavailable"} />
    </section>
    <section className={`recovery-primary-state ${manual ? "manual-review" : verified ? "verified" : current?.state === "failed" ? "failed" : "tracking"}`} aria-live="polite">
      <span className="kicker">CURRENT RECOVERY OUTCOME</span>
      <h3>{primaryTitle}</h3>
      <p>{!current ? "The Recovery Agent is waiting for an eligible defense lifecycle; no recovery outcome is being claimed." : manual ? "Automatic verification did not establish recovery. Human review is required; this is not a successful recovery." : current.state === "failed" ? current.reason : verified ? current.reason : current.state === "recovered" ? "The runtime reports a recovered state, but verified=true is required before this can be called successful." : "Recovery is still being tracked; success has not yet been verified."}</p>
    </section>
    <CountSummary label="Recovery count definitions" items={[
      { label: "In-progress Records", value: counts.inProgress, definition: "Pending, monitoring, eligible, recovering, or verifying; may be paused with runtime." },
      { label: "Manual Review Required", value: counts.manualReview, definition: "Retained manual-review outcomes; not active verification or success." },
      { label: "Verified Recoveries", value: counts.verified, definition: "Retained recovered records with verified=true." },
      { label: "Failed Records", value: counts.failed, definition: "Retained records with recovery state failed." },
    ]} />
    {!scopedRecords.length ? <Empty>{focusScoped ? "No recovery record is linked to the focused scenario. The Recovery Agent is waiting for a completed eligible defense; no recovery outcome is being claimed." : "No recovery records retained. The Recovery Agent waits for a completed eligible defense."}</Empty> : <div className="recovery-list" data-testid="recovery-history">{ordered.map((record) => {
      const stageIndex = stages.indexOf(record.state);
      const visibleStage = record.state === "recovered" && !record.verified ? 3 : stageIndex;
      const action = actions.find((item) => item.action_id === record.defense_action_id);
      const event = [...events].reverse().find((item) => item.correlation_id === record.correlation_id && ["recovery_started", "recovery_progress", "recovery_verified", "recovery_failed"].includes(item.event_type));
      const actionTarget = action?.target ?? "Not reported";
      const incidentId = action?.incident_id || record.correlation_id;
      return <article className={record.state === "manual_review" ? "manual-review" : ""} key={record.recovery_id}>
        <h3>{record.recovery_id === focusedRecoveryId ? "Focused Scenario Recovery" : "Selected Recovery Record"}</h3>
        <header><div><b title={record.recovery_id}>{record.state === "manual_review" ? "Manual Review Required" : record.recovery_id}</b>{record.state === "manual_review" && <small>{record.recovery_id}</small>}</div><Badge value={recoveryLabel(record)} tone={recoveryTone(record)} /></header>
        <dl className="recovery-context"><div><dt>Incident / correlation</dt><dd>{incidentId}</dd></div><div><dt>Defense action</dt><dd>{action ? `${titleCase(action.action_type.replaceAll("_", " "))} · ${titleCase(action.status)}` : record.defense_action_id}</dd></div><div><dt>Target</dt><dd>{actionTarget}</dd></div><div><dt>Recovery Agent</dt><dd>{agent ? `${titleCase(agent.status)} · ${titleCase(agent.health)}` : "Status unavailable"}</dd></div><div><dt>Last reported update</dt><dd>{event ? formatTime(event.timestamp) : `Tick ${record.state_tick}`}</dd></div><div><dt>Rollback</dt><dd>{rollbackState(action, rollbackAvailable)}</dd></div></dl>
        <div className="recovery-track" aria-label="Recovery lifecycle">{stages.map((name, index) => <div className={visibleStage >= 0 && index < visibleStage || verified ? "complete" : index === visibleStage && !manual && record.state !== "failed" ? "current" : ""} key={name} aria-current={index === visibleStage && !manual ? "step" : undefined}><i /><span>{titleCase(name)}</span></div>)}<div className={verified ? "complete" : ""} aria-current={verified ? "step" : undefined}><i /><span>Recovered · verified</span></div></div>
        {(manual || record.state === "failed" || record.state === "recovered" && !record.verified) && <div className="recovery-review-branch" role="status"><b>{manual ? "Manual review required" : record.state === "failed" ? "Recovery failed" : "Verification incomplete"}</b><span>{record.reason}</span></div>}
        <dl><div><dt>Verification ticks</dt><dd>{record.verification_ticks}</dd></div><div><dt title="Telemetry/network events observed by the recovery manager during verification; not a detector correctness verdict.">Verification activity events</dt><dd>{record.normal_events_observed}</dd></div><div><dt>High assessment during verification</dt><dd>{record.high_assessment_seen ? "Observed" : "Not observed"}</dd></div><div><dt>Verified</dt><dd>{isVerifiedRecovery(record) ? "Yes" : "No"}</dd></div><div><dt>Policy scope</dt><dd>Simulator only</dd></div></dl><p>{record.reason}</p>
        {rollbackAvailable && <div className="recovery-controls"><p>The completed defense is reversible. Rolling it back changes simulator policy; recovery verification remains a separate runtime result.</p><button className="button secondary" disabled={busy} onClick={() => void rollback()}>{busy ? "Submitting…" : "Rollback defense"}</button></div>}
        {error && <p role="alert" className="inline-error">Rollback was not confirmed: {error}</p>}
      </article>;
    })}</div>}
    {focusedRecoveryId && <button onClick={()=>setSelectedId(null)}>View focused recovery</button>}
    {!focusScoped && !!unresolved.length && <section aria-label="Unresolved recovery"><h3>Other Unresolved / Manual Review</h3><p>{unresolved.length} retained items · showing {Math.min(5,unresolved.length)}. Manual review and failure precede tracking states.</p>{unresolved.slice(0,5).map(row)}{unresolved.length>5 && <Disclosure title={`View All Unresolved Recovery (${unresolved.length})`}><PagedRows rows={unresolved} label="unresolved recovery" render={row} /></Disclosure>}</section>}
    {!!history.length && <Disclosure title={`${focusScoped ? "Focused recovery history" : "Recovery History"} (${history.length}) — View Full History`}><PagedRows rows={history} label={focusScoped ? "focused recovery history" : "recovery history"} render={row} /></Disclosure>}
    {!!backgroundRecords.length && <Disclosure title={`Background recovery history (${backgroundRecords.length})`}><PagedRows rows={backgroundRecords} label="background recovery records" render={r=><details key={r.recovery_id}><summary>{r.recovery_id} · {recoveryLabel(r)} · {r.reason}</summary><pre>{JSON.stringify(r,null,2)}</pre></details>} /></Disclosure>}
  </Panel>;
}
function recoveryPriority(state: string) { return state === "manual_review" ? 0 : state === "failed" ? 1 : 2; }
function rollbackState(action: DefenseAction | undefined, available: boolean) { return !action || action.rollback_state === "not_requested" ? (available ? "Available" : "Not available") : titleCase(action.rollback_state); }
function policyEffectIsActive(action: DefenseAction, policy: PolicyState) {
  switch (action.action_type) {
    case "isolate_virtual_device": return policy.isolated_devices.includes(action.target);
    case "quarantine_synthetic_source": return policy.quarantined_sources.includes(action.target);
    case "rate_limit_virtual_service": return Object.hasOwn(policy.rate_limited_services, action.target);
    case "restrict_virtual_port": return policy.restricted_ports.includes(Number(action.target));
    case "protect_gateway_mode": return policy.gateway_protection;
    default: return false;
  }
}

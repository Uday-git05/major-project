"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { DashboardSnapshot } from "@/types/api";
import type { ScenarioFocus } from "@/features/scenario-focus";
import { Badge, Panel } from "./ui";
import { formatTime, titleCase } from "@/lib/format";

export function HumanDecisionPanel({ data, focus, onComplete }: { data: DashboardSnapshot; focus: ScenarioFocus | null; onComplete: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correlatedActions = focus ? data.defenses.filter((item) => item.correlation_id === focus.correlationId) : [];
  const focusedAction = focus
    ? [...correlatedActions].reverse().find((item) => item.status === "planned" && item.human_override_state === "pending")
      ?? [...correlatedActions].reverse()[0]
    : undefined;
  // Never promote a background proposal into the operator's selected demo story.
  const action = focus ? focusedAction : undefined;
  const pending = action?.status === "planned" && action.human_override_state === "pending";
  const status = pending ? "Human Decision Required" : action ? explainState(action.status, action.human_override_state) : "No approval required";
  const applied = action ? actionIsApplied(action.action_type, action.target, data.policy) : false;
  const canRollback = !!action && action.status === "completed" && action.reversible && applied;
  const run = async (decision: "approve" | "reject" | "cancel" | "rollback") => {
    if (!action || busy || (decision !== "rollback" && (!pending || decision === "cancel" && action.status !== "planned")) || (decision === "rollback" && !canRollback)) return;
    setBusy(true); setError(null);
    try { await api.defense(action.action_id, decision); await onComplete(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Decision request failed"); }
    finally { setBusy(false); }
  };
  return <Panel title="Human Approval & Active Defense" kicker="Real backend proposals, applied simulator controls, and lifecycle-permitted actions." className={`human-decision-panel ${pending ? "requires-decision" : "no-decision"}`}>
    {pending && action ? <><div className="decision-required-heading"><Badge value="Human Decision Required" tone="warning" /><p>Approving immediately applies this simulator-only policy change.</p></div><dl><div><dt>Proposed action</dt><dd>{titleCase(action.action_type.replaceAll("_", " "))}</dd></div><div><dt>Target</dt><dd>{action.target}</dd></div><div><dt>Reason</dt><dd>{action.reason}</dd></div><div><dt>Assessment evidence</dt><dd>{action.evidence.join(" · ") || "No additional evidence text retained"}</dd></div></dl><div className="human-decision-actions"><button className="button primary" disabled={busy} onClick={() => void run("approve")}>{busy ? "Submitting…" : "Approve & apply virtual defense"}</button><button className="button secondary" disabled={busy} onClick={() => void run("reject")}>Reject proposal</button><button className="button secondary" disabled={busy} onClick={() => void run("cancel")}>Cancel proposal</button></div></> : <div className="decision-explanation"><b>{status}</b><p>{decisionExplanation(focus, action, data)}</p>{action && <span>Current focused action: {titleCase(action.status)} · {titleCase(action.human_override_state)}</span>}</div>}
    {action && <section className={`active-defense-summary ${applied ? "is-applied" : ""}`} aria-label="Active defense details">
      <h3>{applied ? "Active Virtual Defense" : "Focused Defense Action"}</h3>
      <dl><div><dt>Action</dt><dd>{titleCase(action.action_type.replaceAll("_", " "))}</dd></div><div><dt>Target</dt><dd>{action.target}</dd></div><div><dt>State</dt><dd><Badge value={applied ? "Applied" : titleCase(action.status)} tone={applied ? "healthy" : undefined} /></dd></div><div><dt>{applied ? "Applied" : "Requested"}</dt><dd>{formatTime(applied ? action.completed_at ?? action.started_at ?? action.requested_at : action.requested_at)}</dd></div><div><dt>Reversible</dt><dd>{action.reversible ? "Yes · simulator policy only" : "No"}</dd></div><div><dt>Rollback</dt><dd>{action.rollback_state === "not_requested" && action.reversible && applied ? "Available" : titleCase(action.rollback_state)}</dd></div></dl>
      {canRollback && <p className="muted">Rollback reverses the simulated security control. Recovery verification remains a separate runtime result.</p>}
      {canRollback && <div className="human-decision-actions"><button className="button secondary" disabled={busy} onClick={() => void run("rollback")}>{busy ? "Submitting…" : "Rollback active defense"}</button></div>}
    </section>}
    {error && <p role="alert" className="inline-error">Decision was not confirmed: {error}</p>}
  </Panel>;
}

function explainState(status: string, override: string) {
  if (status === "completed") return "Action completed";
  if (status === "running") return "Defense executing";
  if (status === "approved" || override === "approved") return "Decision already approved";
  if (status === "rejected" || override === "rejected") return "Decision rejected";
  if (status === "cancelled" || override === "cancelled") return "Proposal cancelled";
  if (status === "rolled_back") return "Action rolled back";
  return `No approval required · ${titleCase(status)}`;
}

function decisionExplanation(focus: ScenarioFocus | null, action: DashboardSnapshot["defenses"][number] | undefined, data: DashboardSnapshot) {
  if (!focus) return data.defenses.some((item) => item.status === "planned" && item.human_override_state === "pending")
    ? "A proposal is awaiting a decision in background history, but no synthetic scenario is focused. Select the proposal's launched scenario to expose its decision controls here."
    : "No defense proposal currently requires human confirmation. Select a launched scenario to inspect its defense lifecycle.";
  if (!action) {
    const assessment = [...data.events].reverse().find((event) => event.correlation_id === focus.correlationId && event.event_type === "threat_assessment");
    const severity = assessment && typeof assessment.payload.severity === "string" ? assessment.payload.severity : undefined;
    const detected = assessment?.payload.detected;
    if (severity && ["informational", "low"].includes(severity)) return `The latest correlated assessment is ${severity}; the current policy observes this severity and no defense proposal is required.`;
    if (detected === false) return "The latest correlated assessment did not detect a threat; no defense proposal is currently required.";
    if (!assessment) return "No correlated threat assessment or actionable defense proposal has been retained for this scenario yet.";
    return "The focused scenario has a threat assessment, but no actionable defense proposal is currently retained. The backend policy remains authoritative.";
  }
  if (action.status === "completed" && action.human_override_state === "approved") return "This proposal was approved and the simulator defense was applied. Approval is complete; rollback is offered only while the completed reversible policy effect remains active.";
  if (action.status === "completed") return "This action completed under runtime policy. Approval is no longer available; rollback is offered only while a reversible policy effect remains active.";
  if (action.status === "running") return "The backend reports this defense as executing; no approval decision is currently available.";
  if (action.status === "rolled_back") return "The completed reversible action has been rolled back by the runtime.";
  if (action.status === "rejected" || action.human_override_state === "rejected") return "The human decision rejected this proposal; it will not be applied.";
  if (action.status === "cancelled" || action.human_override_state === "cancelled") return "This proposal was cancelled and is no longer awaiting a decision.";
  return "This focused action is not awaiting human approval. Review its current state in Defense Decision & Action.";
}

function actionIsApplied(type: string, target: string, policy: DashboardSnapshot["policy"]) {
  switch (type) {
    case "isolate_virtual_device": return policy.isolated_devices.includes(target);
    case "quarantine_synthetic_source": return policy.quarantined_sources.includes(target);
    case "rate_limit_virtual_service": return Object.hasOwn(policy.rate_limited_services, target);
    case "restrict_virtual_port": return policy.restricted_ports.includes(Number(target));
    case "protect_gateway_mode": return policy.gateway_protection;
    default: return false;
  }
}

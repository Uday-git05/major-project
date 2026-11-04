"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { DefenseAction, EventEnvelope, PolicyState } from "@/types/api";
import { formatTime, titleCase } from "@/lib/format";
import { Badge, Empty, Panel } from "./ui";
import { CountSummary } from "./count-summary";
import { defenseSummary } from "@/features/runtime-semantics";
import { appliedControls, defenseGroups, reviewQueue } from "@/features/presentation";
import { Disclosure, PagedRows } from "./evidence-disclosure";

type DefenseCommand = "approve" | "reject" | "cancel" | "rollback";
const TERMINAL_STATUSES = new Set(["completed", "rejected", "cancelled", "failed", "rolled_back"]);

export function DefensePanel({ actions, policy, onComplete, events = [], focusedCorrelation }: { actions: DefenseAction[]; policy: PolicyState; onComplete: () => Promise<void> | void; events?: EventEnvelope[]; focusedCorrelation?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groups = useMemo(()=>defenseGroups(actions),[actions]);
  const queue = useMemo(()=>reviewQueue(actions,events,focusedCorrelation),[actions,events,focusedCorrelation]);
  const history = groups.filter(g=>TERMINAL_STATUSES.has(g.action.status)).sort((a,b)=>Date.parse(b.action.requested_at)-Date.parse(a.action.requested_at));
  const other = groups.filter(g=>!TERMINAL_STATUSES.has(g.action.status) && !(g.action.status === "planned" && g.action.human_override_state === "pending"));
  const row = ({ action, revisions }: typeof groups[number]) => <article className="compact-evidence-row" key={JSON.stringify([action.action_id,action.correlation_id,action.action_type,action.target])}><button onClick={()=>setSelectedId(action.action_id)} aria-pressed={selectedId === action.action_id}>{titleCase(action.action_type)} · {action.target} · {titleCase(action.status)}{action.correlation_id === focusedCorrelation ? " · Focused scenario" : ""}</button><small>{formatTime(action.requested_at)} · {revisions.length} retained record{revisions.length === 1 ? "" : "s"}</small></article>;
  const [busyActionIds, setBusyActionIds] = useState<Set<string>>(() => new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());

  const run = async (record: DefenseAction, command: DefenseCommand) => {
    const { action_id: id } = record;
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusyActionIds((current) => new Set(current).add(id));
    setRowErrors((current) => withoutKey(current, id));
    try {
      await api.defense(id, command);
      await onComplete();
    } catch (error) {
      if (!isLifecycleConflict(error)) { setRowErrors(current => ({...current,[id]: error instanceof Error ? error.message : "Request failed"})); return; }
      const status = conflictStatus(error.message) ?? record.status;
      setStatusOverrides((current) => ({ ...current, [id]: status }));
      setRowErrors((current) => ({ ...current, [id]: `Action state changed. Current status: ${status.replaceAll("_", " ")}.` }));
      try { await onComplete(); } catch { /* Keep the expected conflict non-blocking if resync is temporarily unavailable. */ }
    } finally {
      inFlight.current.delete(id);
      setBusyActionIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  };

  const ordered = groups.filter(g=>g.action.action_id === selectedId).slice(0,1).map(g=>g.action);
  const counts = defenseSummary(groups.map(g=>g.action), policy);
  return <Panel title="Defense Decision & Action" kicker="Recorded decisions and current simulator policy settings." className="defense-panel" action={<span className="count-label" title="Applied-action snapshots retained by the policy store; not a count of executing actions or distinct controls.">{counts.recordedPolicyActions} recorded policy actions</span>}>
    <CountSummary label="Defense count definitions" items={[
      { label: "Pending Approval", value: counts.pendingApproval, definition: "Retained planned proposals awaiting human approval." },
      { label: "Applied Controls", value: counts.appliedControls, definition: "Policy entries currently set: device, source, service, port, or gateway." },
      { label: "Executing Actions", value: counts.executing, definition: "Retained actions with runtime status running." },
      { label: "Completed Actions", value: counts.completed, definition: "Retained completed records; control effects are counted separately." },
    ]} />
    <p className="muted">{groups.length} retained actions · {counts.approved} approved · {counts.historical} ended. Bounded retained history; action records are not applied controls.</p>
    <section aria-label="Review Queue"><h3>Review Queue</h3><p>{queue.length} proposals awaiting human approval · showing top {Math.min(5,queue.length)} by assessment severity, recency, then scenario relevance.</p>{queue.slice(0,5).map(row)}{!queue.length && <p>No proposals awaiting human approval.</p>}{queue.length > 5 && <Disclosure title={`View All Pending Proposals (${queue.length})`}><PagedRows rows={queue} label="proposals" render={row} /></Disclosure>}</section>
    <section aria-label="Current Applied Controls"><h3>Current Applied Controls</h3><p>Current policy entries only; independent of retained action status.</p>{!counts.appliedControls ? <p>No controls currently applied.</p> : <PagedRows rows={appliedControls(policy)} size={5} label="controls" render={control=><p key={control}>{control}</p>} />}</section>
    {!!other.length && <Disclosure title={`Executing / Other Nonterminal Actions (${other.length})`}><PagedRows rows={other} label="nonterminal actions" render={row} /></Disclosure>}
    <Disclosure title={`Response History (${history.length}) — View Full History`}><div data-testid="defense-history"><PagedRows rows={history} label="defense history" render={row} /></div></Disclosure>
    <Disclosure title={`Retained Defense Technical Records (${actions.length})`}><PagedRows rows={actions} label="defense records" render={(action,index)=><details key={`${action.action_id}-${index}`}><summary>{titleCase(action.action_type)} · {titleCase(action.status)} · {action.action_id}</summary><pre>{JSON.stringify(action,null,2)}</pre></details>} /></Disclosure>
    {!selectedId && !!actions.length && <p>Select a proposal or history record to inspect details and lifecycle-permitted actions. No bulk approval.</p>}
    {!actions.length ? <Empty>No defense action records retained.</Empty> : <div className="defense-list" data-testid="defense-selected">{ordered.map((action) => {
      const effectiveAction = statusOverrides[action.action_id] ? { ...action, status: statusOverrides[action.action_id] } : action;
      const commands = allowedCommands(effectiveAction);
      const isBusy = busyActionIds.has(action.action_id);
      return <article key={action.action_id}>
        <header><Badge value={effectiveAction.status} /><b>{titleCase(action.action_type)}</b><time>{formatTime(action.requested_at)}</time></header>
        <h3>Selected Defense Record</h3><dl><dt>Target</dt><dd>{action.target}</dd><dt>Policy operation</dt><dd>{impact(action.action_type)}</dd><dt>Approval</dt><dd>{action.status === "planned" && action.human_override_state === "pending" ? "Human confirmation required" : titleCase(action.human_override_state ?? "none")}</dd><dt>Trigger</dt><dd>{action.reason}</dd></dl><Disclosure title="Defense technical identity and updates"><pre>{JSON.stringify(groups.find(g=>g.action === action)?.revisions,null,2)}</pre></Disclosure>
        {action.status === "completed" && <p className="muted">{action.reversible ? "Rollback is available for this completed reversible simulator action." : "Rollback is unavailable because this action is not reversible."}</p>}
        {rowErrors[action.action_id] && <p className="defense-inline-error" role="status">{rowErrors[action.action_id]}</p>}
        <footer>
          <span>{action.reversible ? "Reversible simulator policy" : "Non-reversible"} · Rollback {titleCase(action.rollback_state ?? "not_requested")}</span>
          <div>
            {TERMINAL_STATUSES.has(effectiveAction.status) && <span className={`defense-status-marker ${effectiveAction.status}`}>{titleCase(effectiveAction.status)}</span>}
            {commands.map((command) => <button key={command} disabled={isBusy} aria-busy={isBusy} onClick={() => void run(action, command)}>{isBusy ? "Pending" : titleCase(command)}</button>)}
            {!commands.length && !TERMINAL_STATUSES.has(effectiveAction.status) && <span className={`defense-status-marker ${effectiveAction.status}`}>{titleCase(effectiveAction.status)}</span>}
          </div>
        </footer>
      </article>;
    })}</div>}
  </Panel>;
}

export function allowedCommands(action: Pick<DefenseAction, "status" | "reversible">): DefenseCommand[] {
  if (action.status === "planned") return ["approve", "reject", "cancel"];
  if (action.status === "approved") return ["reject", "cancel"];
  if (action.status === "completed" && action.reversible) return ["rollback"];
  return [];
}

function isLifecycleConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 400 || error.status === 409);
}

function conflictStatus(message: string) {
  const match = message.match(/while\s+([a-z_]+)\b/i);
  return match?.[1]?.toLowerCase();
}

function withoutKey(values: Record<string, string>, key: string) {
  const next = { ...values };
  delete next[key];
  return next;
}

function impact(type: string) { const impacts: Record<string, string> = { isolate_virtual_device: "Block device communications", quarantine_synthetic_source: "Block synthetic source", rate_limit_virtual_service: "Reduce attack service to 25%", restrict_virtual_port: "Block selected virtual port", protect_gateway_mode: "Block synthetic gateway ingress", restore_normal_policy: "Clear all virtual restrictions" }; return impacts[type] ?? "Adjust simulator policy"; }

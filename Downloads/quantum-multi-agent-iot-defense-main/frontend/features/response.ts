import { groupIncidents, type IncidentGroup } from "@/features/incidents";
import type { Attack, DashboardSnapshot, DefenseAction, EventEnvelope, Recovery, ThreatPayload } from "@/types/api";
import { isRecoveryTracking, isVerifiedRecovery, recoveryLabel } from "@/features/runtime-semantics";
import { scenarioRecords, scenarioModelEvidence, type ScenarioFocus } from "@/features/scenario-focus";

export type LifecycleState = "waiting" | "active" | "completed" | "failed" | "manual_review" | "not_required" | "recorded";

export interface LifecycleStage {
  key: "attack" | "detection" | "analysis" | "defense" | "recovery" | "verification";
  label: string;
  state: LifecycleState;
  detail: string;
}

export interface ResponseContext {
  attack?: Attack;
  threat?: EventEnvelope<ThreatPayload>;
  incident?: IncidentGroup;
  defense?: DefenseAction;
  recovery?: Recovery;
  status: string;
  stages: LifecycleStage[];
  correlationIds: string[];
  focus?: ScenarioFocus | null;
}

const LIVE_DEFENSE = new Set(["planned", "approved", "running"]);
const LIVE_RECOVERY = new Set(["pending", "monitoring", "eligible", "recovering", "verifying"]);

export function responseContext(data: DashboardSnapshot, selection?: ScenarioFocus | null): ResponseContext {
  // Explicit null is Monitoring. Omitted selection supports existing record-inspection
  // callers, but anchors ALL records to one correlation rather than merging global picks.
  const scope = scenarioRecords(data, selection);
  const correlation = selection === undefined
    ? selectDefense(data.defenses)?.correlation_id ?? data.recoveries.at(-1)?.correlation_id ?? groupIncidents(data.events)[0]?.correlationId ?? data.activeAttacks[0]?.correlation_id
    : scope.focus?.correlationId;
  const events = correlation ? data.events.filter((event) => event.correlation_id === correlation) : [];
  const incident = groupIncidents(events)[0];
  const threat = incident?.latest;
  const defense = selectDefense(data.defenses.filter((action) => action.correlation_id === correlation));
  const recovery = selectRecovery((selection === undefined ? data.recoveries : scope.recoveries).filter((record) => record.correlation_id === correlation), defense);
  const attack = selection === undefined ? [...data.attacks, ...data.activeAttacks].find((item) => item.correlation_id === correlation) : scope.attack;
  const stages = lifecycle(attack, threat, defense, recovery);
  if (selection !== undefined) {
    if (scope.focus && !attack) stages[0] = { key: "attack", label: "Synthetic Attack", state: "waiting", detail: "Scenario status not retained" };
    const evidence = scenarioModelEvidence(events);
    stages[1] = { key: "detection", label: "Detection", state: evidence.classical || evidence.quantum ? "recorded" : "waiting", detail: evidence.classical || evidence.quantum ? evidence.comparison : "No correlated model evidence yet" };
    if (!threat) stages[2] = { key: "analysis", label: "Threat Analysis", state: "waiting", detail: "No correlated assessment yet" };
    if (!defense) stages[3] = { key: "defense", label: "Defense", state: "waiting", detail: "No correlated defense yet" };
    if (!recovery) stages[4] = { key: "recovery", label: "Recovery", state: "waiting", detail: "Not Started" };
    if (!recovery) stages[5] = { key: "verification", label: "Verification / Rollback", state: "waiting", detail: "No verification record yet" };
  }
  return { attack, threat, incident, defense, recovery, correlationIds: correlation ? [correlation] : [], focus: scope.focus,
    status: selection !== undefined && !scope.focus ? "Monitoring" : responseStatus(attack, defense, recovery), stages };
}

export function responseTimeline(events: EventEnvelope[], correlationIds: string[]) {
  if (!correlationIds.length) return [];
  const accepted = new Set([
    "attack_scheduled", "attack_started", "attack_activity", "attack_completed", "attack_cancelled",
    "classical_prediction", "quantum_prediction", "threat_assessment", "defense_action",
    "defense_action_requested", "defense_action_started", "defense_action_completed", "defense_action_failed",
    "human_override", "defense_rollback", "recovery_started", "recovery_progress", "recovery_verified", "recovery_failed",
  ]);
  const identities = new Set(correlationIds);
  return events.filter((event) => identities.has(event.correlation_id) && accepted.has(event.event_type))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function responseStatus(attack?: Attack, defense?: DefenseAction, recovery?: Recovery) {
  if (isVerifiedRecovery(recovery)) return "Recovered";
  if (recovery?.state === "manual_review") return "Manual Review Required";
  if (recovery?.state === "failed") return "Recovery Failed";
  if (recovery?.state === "recovered") return "Recovery Unverified";
  if (recovery && isRecoveryTracking(recovery)) return `Recovery ${recoveryLabel(recovery)}`;
  if (defense?.status === "running") return "Defense Active";
  if (defense?.status === "planned") return "Defense Proposed";
  if (defense?.status === "approved") return "Defense Approved";
  if (defense?.status === "completed") return "Defense Completed";
  if (defense?.status === "failed") return "Defense Failed";
  if (defense?.status === "rejected") return "Defense Rejected";
  if (defense?.status === "cancelled") return "Defense Cancelled";
  if (defense?.status === "rolled_back") return "Defense Rolled Back";
  if (attack?.status === "active") return "Synthetic Attack Active";
  if (attack?.status === "scheduled") return "Attack Scheduled";
  if (attack?.status === "completed") return "Attack Completed · Recovery Not Established";
  if (attack?.status === "cancelled") return "Attack Cancelled";
  return "No Active Response";
}

function selectDefense(defenses: DefenseAction[]) {
  return [...defenses].sort((a, b) => defenseRank(a.status) - defenseRank(b.status) || dateValue(b.requested_at) - dateValue(a.requested_at))[0];
}

function selectRecovery(recoveries: Recovery[], defense?: DefenseAction) {
  const candidates = defense ? recoveries.filter((item) => item.defense_action_id === defense.action_id && item.correlation_id === defense.correlation_id) : recoveries;
  return [...candidates].sort((a, b) => recoveryRank(a.state) - recoveryRank(b.state) || b.state_tick - a.state_tick)[0];
}

function lifecycle(attack?: Attack, threat?: EventEnvelope<ThreatPayload>, defense?: DefenseAction, recovery?: Recovery): LifecycleStage[] {
  const attackState: LifecycleState = !attack ? "not_required" : attack.status === "failed" ? "failed" : attack.status === "active" ? "active" : attack.status === "scheduled" ? "waiting" : attack.status === "completed" ? "completed" : "recorded";
  const detectionState: LifecycleState = threat ? (threat.payload.detected === null ? "waiting" : "recorded") : attack && ["active", "scheduled"].includes(attack.status) ? "waiting" : "not_required";
  const analysisState: LifecycleState = threat ? "recorded" : detectionState === "waiting" ? "waiting" : "not_required";
  const defenseState: LifecycleState = !defense ? "not_required" : defense.status === "failed" ? "failed" : defense.status === "running" ? "active" : ["planned", "approved"].includes(defense.status) ? "waiting" : ["completed", "rolled_back"].includes(defense.status) ? "completed" : "recorded";
  const recoveryState: LifecycleState = !recovery ? "not_required" : recovery.state === "manual_review" ? "manual_review" : recovery.state === "failed" ? "failed" : isVerifiedRecovery(recovery) ? "completed" : isRecoveryTracking(recovery) ? "active" : "recorded";
  const verificationState: LifecycleState = !recovery ? "not_required" : recovery.state === "manual_review" ? "manual_review" : recovery.state === "failed" ? "failed" : isVerifiedRecovery(recovery) ? "completed" : recovery.state === "verifying" ? "active" : isRecoveryTracking(recovery) ? "waiting" : "recorded";
  return [
    { key: "attack", label: "Synthetic Attack", state: attackState, detail: attack ? readable(attack.status) : "No active attack" },
    { key: "detection", label: "Detection", state: detectionState, detail: threat ? (threat.payload.detected === true ? "Attack predicted" : threat.payload.detected === false ? "No attack predicted" : "Pending evidence") : detectionState === "waiting" ? "Awaiting detector output" : "No prediction retained" },
    { key: "analysis", label: "Threat Analysis", state: analysisState, detail: threat ? `${readable(threat.payload.severity)} severity · ${readable(threat.payload.status)}` : "No assessment retained" },
    { key: "defense", label: "Defense", state: defenseState, detail: defense ? readable(defense.status) : "No action recorded" },
    { key: "recovery", label: "Recovery", state: recoveryState, detail: recoveryLabel(recovery) },
    { key: "verification", label: "Verification / Rollback", state: verificationState, detail: isVerifiedRecovery(recovery) ? "Verified" : recovery?.state === "manual_review" ? "Manual Review Required" : recovery?.state === "verifying" ? "Verification in progress" : recovery?.state === "recovered" ? "Unverified" : defense?.rollback_state ? readable(defense.rollback_state) : "Not required" },
  ];
}

function defenseRank(status: string) { return LIVE_DEFENSE.has(status) ? 0 : status === "completed" ? 1 : 2; }
function recoveryRank(state: string) { return LIVE_RECOVERY.has(state) ? 0 : state === "manual_review" ? 1 : 2; }
function dateValue(value: string) { const result = new Date(value).getTime(); return Number.isFinite(result) ? result : 0; }
function readable(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

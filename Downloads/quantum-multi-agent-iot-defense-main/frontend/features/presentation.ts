import type { DefenseAction, EventEnvelope, PolicyState, Recovery } from "@/types/api";
import type { IncidentGroup } from "./incidents";
import { severityRank } from "@/lib/format";

export function priorityCases(cases: IncidentGroup[], actions: DefenseAction[], recoveries: Recovery[]) {
  const pending = new Set(actions.filter(a => a.status === "planned" && a.human_override_state === "pending").map(a => a.correlation_id));
  const unresolved = new Set(recoveries.filter(r => ["manual_review", "failed"].includes(r.state)).map(r => r.correlation_id));
  const rank = (c: IncidentGroup) => c.latest.payload.severity === "critical" ? 0 : c.latest.payload.severity === "high" ? 1 : pending.has(c.correlationId) ? 2 : unresolved.has(c.correlationId) ? 3 : 4;
  return [...cases].sort((a,b) => rank(a)-rank(b) || Date.parse(b.latest.timestamp)-Date.parse(a.latest.timestamp));
}

// A backend action ID is the deduplication boundary. Same target/type is NOT identity.
export function defenseGroups(actions: DefenseAction[]) {
  const groups = new Map<string, DefenseAction[]>();
  for (const action of actions) {
    const key = JSON.stringify([action.action_id, action.correlation_id, action.action_type, action.target]);
    const rows = groups.get(key) ?? []; rows.push(action); groups.set(key, rows);
  }
  return [...groups.values()].map(revisions => ({ action: revisions.at(-1)!, revisions }));
}
export function reviewQueue(actions: DefenseAction[], events: EventEnvelope[], focus?: string) {
  const severities = new Map<string, string>();
  for (const event of events) if (event.event_type === "threat_assessment") severities.set(event.correlation_id, String(event.payload.severity));
  return defenseGroups(actions).filter(g => g.action.status === "planned" && g.action.human_override_state === "pending")
    .sort((a,b) => (severityRank[severities.get(b.action.correlation_id) ?? ""] ?? -1)-(severityRank[severities.get(a.action.correlation_id) ?? ""] ?? -1)
      || Date.parse(b.action.requested_at)-Date.parse(a.action.requested_at)
      || Number(b.action.correlation_id === focus)-Number(a.action.correlation_id === focus));
}
export function appliedControls(policy: PolicyState) {
  return [...policy.isolated_devices.map(x => `Virtual Isolation · ${x}`), ...policy.quarantined_sources.map(x => `Quarantine · ${x}`),
    ...Object.entries(policy.rate_limited_services).map(([x, rate]) => `Rate Limit · ${x} · ${rate}`),
    ...policy.restricted_ports.map(x => `Port Restriction · ${x}`), ...(policy.gateway_protection ? ["Gateway Protection"] : [])];
}

export interface EventGroup { key: string; type: string; correlation: string; first: string; latest: string; events: EventEnvelope[] }
export function auditGroups(events: EventEnvelope[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of events) {
    const key = JSON.stringify([event.event_type, event.correlation_id]);
    let group = groups.get(key);
    if (!group) { group = { key, type: event.event_type, correlation: event.correlation_id, first: event.timestamp, latest: event.timestamp, events: [] }; groups.set(key, group); }
    group.events.push(event);
    if (event.timestamp < group.first) group.first = event.timestamp;
    if (event.timestamp > group.latest) group.latest = event.timestamp;
  }
  return [...groups.values()].sort((a,b) => Date.parse(b.latest)-Date.parse(a.latest));
}

// Confidence/latency/evidence-count changes alone are processing noise, not verdict changes.
// Runs are grouped per exact correlation and entity; transitions A -> B -> A remain distinct.
export function importantEvents(events: EventEnvelope[]): EventGroup[] {
  const previous = new Map<string, { signature: string; group: EventGroup }>();
  const result: EventGroup[] = [];
  for (const event of [...events].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp))) {
    const p = event.payload; const type = event.event_type;
    let signature: unknown; let entity = "";
    if (["classical_prediction", "quantum_prediction"].includes(type)) {
      const binary = p.binary as Record<string, unknown> | undefined; const multi = p.multiclass as Record<string, unknown> | undefined;
      signature = [binary?.predicted_class_id, multi?.predicted_class_id];
    } else if (type === "threat_assessment") signature = [p.severity, p.detected, p.suspected_attack_family, p.status, p.disagreement, p.evidence_strength];
    else if (type.startsWith("defense_") || type === "human_override") { entity = String(p.action_id ?? event.event_id); signature = [type,p.status,p.human_override_state,p.rollback_state]; }
    else if (type.startsWith("recovery_")) { entity = String(p.recovery_id ?? event.event_id); signature = [p.state,p.verified]; }
    else if (["attack_scheduled","attack_started","attack_completed","attack_cancelled"].includes(type)) { entity = String(p.attack_id ?? event.event_id); signature = type; }
    else if (type === "device_state") { entity = String(p.device_id); signature = [p.status,p.health,p.reason]; }
    else if (type === "agent_status") { entity = String(p.agent_id); signature = [p.status,p.health]; }
    else continue;
    const key = JSON.stringify([event.correlation_id, type.startsWith("recovery_") ? "recovery" : type, entity]);
    const text = JSON.stringify(signature); const prior = previous.get(key);
    if (prior?.signature === text) { prior.group.events.push(event); prior.group.latest = event.timestamp; }
    else { const group = { key: event.event_id, type, correlation: event.correlation_id, first: event.timestamp, latest: event.timestamp, events: [event] }; result.push(group); previous.set(key,{signature:text,group}); }
  }
  return result.sort((a,b) => Date.parse(b.latest)-Date.parse(a.latest));
}

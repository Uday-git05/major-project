// Static fixture preview for manual Phase 1 acceptance. Never imported by the application.
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardSnapshot } from "./fixtures";
import type { DefenseAction, Recovery } from "@/types/api";
import { SystemHeader } from "@/components/system-header";
import { OverviewHero } from "@/components/overview-panels";
import { CurrentDetectionState } from "@/components/detection-state";
import { DefensePanel } from "@/components/defense-panel";
import { RecoveryPanel } from "@/components/recovery-panel";
import { TrafficPanel } from "@/components/traffic-panel";
import { IncidentPanel } from "@/components/incident-panel";

export const previewStates = ["stopped", "normal-active", "background-signals", "many-defense-records", "pending-proposal", "completed-defense", "manual-review", "unverified-recovery"];

export function renderSemanticPreview(state: string) {
  const data = dashboardSnapshot();
  const action: DefenseAction = { action_id: "fixture-action", correlation_id: "fixture-correlation", incident_id: "fixture-case", action_type: "protect_gateway_mode", target: "gateway-01", reason: "Fixture proposal for a model-positive assessment; simulator ground truth remains separate.", evidence: [], status: "planned", requested_at: "2026-01-01T00:00:01Z", started_at: null, completed_at: null, result: {}, reversible: true, rollback_state: "not_requested", initiated_by: "defense-agent", human_override_state: "pending" };
  const recovery: Recovery = { recovery_id: "fixture-recovery", defense_action_id: action.action_id, correlation_id: action.correlation_id, state: "manual_review", created_tick: 1, state_tick: 12, verification_ticks: 2, normal_events_observed: 4, high_assessment_seen: true, verified: false, reason: "Fixture manual-review outcome: verification did not establish recovery." };
  if (state === "stopped") { data.runtimeStatus.active = false; data.runtimeStatus.overall = "offline"; data.simulation.state = "stopped"; data.simulation.tick_number = 0; }
  if (state !== "stopped") {
    data.featureStatus.vectors_emitted = 374;
    data.events = [{ event_id: "fixture-network", event_type: "network_activity", timestamp: "2026-01-01T00:00:01Z", source: "simulation", correlation_id: action.correlation_id, payload: { direction: "device_to_gateway", service: "mqtt" } }];
  }
  if (!["stopped", "normal-active"].includes(state)) {
    const prediction = { predicted_class_id: 1, predicted_class_name: "Attack", confidence: .8, model_name: "Fixture only", latency_ms: 1, created_at: "2026-01-01T00:00:01Z" };
    data.events.push({ event_id: "fixture-prediction", event_type: "classical_prediction", timestamp: prediction.created_at, source: "classical-ml-agent", correlation_id: action.correlation_id, payload: { binary: prediction, multiclass: { ...prediction, predicted_class_name: "HTTP_Flood" }, device_ids: ["gateway-01"] } });
    for (let revision = 1; revision <= 2; revision++) data.events.push({ event_id: `fixture-assessment-${revision}`, event_type: "threat_assessment", timestamp: `2026-01-01T00:00:0${revision}Z`, source: "threat-analysis-agent", correlation_id: action.correlation_id, payload: { incident_id: action.incident_id, affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "HTTP_Flood", severity: "medium", evidence_strength: "primary", evidence: [], disagreement: false, decision_reason: "Fixture positive model assessment during nominal simulator traffic.", status: "provisional" } });
  }
  if (state === "pending-proposal") data.defenses = [action];
  if (state === "many-defense-records") {
    data.defenses = Array.from({ length: 66 }, (_, index) => ({ ...action, action_id: `fixture-${index}`, status: index < 2 ? "planned" : index % 3 === 0 ? "rejected" : "completed", human_override_state: index < 2 ? "pending" : "none" }));
    data.policy.action_count = 66; data.policy.gateway_protection = true;
  }
  if (["completed-defense", "manual-review", "unverified-recovery"].includes(state)) {
    data.defenses = [{ ...action, status: "completed", human_override_state: "none" }];
    data.policy.action_count = 1; data.policy.gateway_protection = true;
  }
  if (state === "manual-review") data.recoveries = [recovery];
  if (state === "unverified-recovery") data.recoveries = [{ ...recovery, state: "recovered", verified: false, reason: "Fixture inconsistent record: recovered state without verification. It must not display success." }];
  return renderToStaticMarkup(<>
    <aside style={{ padding: 16, background: "#fff4d3" }}><b>PHASE 1 FIXTURE QA — {state}</b><p>Static fixture render. These are test inputs, not live measurements. Controls are inactive; no backend is running for this preview.</p><nav style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{previewStates.map((name) => <a href={`/?state=${name}`} key={name}>{name}</a>)}</nav></aside>
    <SystemHeader data={data} connection="offline" refreshing={false} />
    <main style={{ padding: 20 }}><OverviewHero data={data} connection="offline" /><CurrentDetectionState data={data} />
      <div className="response-primary-grid"><DefensePanel actions={data.defenses} policy={data.policy} onComplete={() => undefined} /><RecoveryPanel records={data.recoveries} actions={data.defenses} /></div>
      <TrafficPanel events={data.events} flows={data.flows} featureStatus={data.featureStatus} /><IncidentPanel events={data.events} onSelect={() => undefined} />
    </main>
  </>);
}

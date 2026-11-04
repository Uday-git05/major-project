import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DefensePanel } from "@/components/defense-panel";
import { RecoveryPanel } from "@/components/recovery-panel";
import { SystemHeader } from "@/components/system-header";
import { CurrentDetectionState } from "@/components/detection-state";
import { TrafficPanel } from "@/components/traffic-panel";
import { IncidentPanel } from "@/components/incident-panel";
import { IncidentDetail } from "@/components/incident-detail";
import { EventStream } from "@/components/event-stream";
import { ResponseState } from "@/components/response-state";
import { OverviewHero, CurrentSecurityState, AutonomousResponseSummary } from "@/components/overview-panels";
import { appliedControlCount, defenseSummary, isVerifiedRecovery, recoverySummary } from "@/features/runtime-semantics";
import { deriveSystemSummary } from "@/features/system-status";
import { groupIncidents } from "@/features/incidents";
import { responseContext } from "@/features/response";
import type { DefenseAction, EventEnvelope, Recovery } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";
import { toggle } from "./disclosure-helper";

function action(status: string, id = status): DefenseAction {
  return { action_id: id, correlation_id: "case-1", incident_id: "incident-1", action_type: "protect_gateway_mode", target: "gateway-01", reason: "Recorded model assessment", evidence: [], status, requested_at: "2026-01-01T00:00:01Z", started_at: null, completed_at: null, result: {}, reversible: true, rollback_state: "not_requested", initiated_by: "defense-agent", human_override_state: status === "planned" ? "pending" : "none" };
}
function recovery(state: string, verified = false): Recovery {
  return { recovery_id: `r-${state}`, defense_action_id: "completed", correlation_id: "case-1", state, created_tick: 1, state_tick: 3, verification_ticks: 2, normal_events_observed: 4, high_assessment_seen: false, verified, reason: `Backend state: ${state}` };
}
function assessment(revision: number, detected: boolean | null = true): EventEnvelope {
  return { event_id: `a-${revision}`, timestamp: `2026-01-01T00:00:0${revision}Z`, event_type: "threat_assessment", source: "threat-analysis-agent", correlation_id: "case-1", payload: { incident_id: "incident-1", affected_devices: ["gateway-01"], detected, suspected_attack_family: detected ? "HTTP_Flood" : null, severity: detected ? "medium" : "informational", evidence_strength: "primary", evidence: [], disagreement: false, decision_reason: "Primary model evidence", status: "provisional" } };
}

describe("Phase 1 defense count meanings", () => {
  it("separates 66 recorded snapshots from one effective control and retained lifecycle records", () => {
    const policy = { ...dashboardSnapshot().policy, action_count: 66, gateway_protection: true };
    const actions = [action("planned"), action("approved"), action("running"), ...Array.from({ length: 60 }, (_, i) => action("completed", `c-${i}`)), action("rejected"), action("cancelled"), action("rolled_back"), action("failed")];
    expect(defenseSummary(actions, policy)).toEqual({ pendingApproval: 1, approved: 1, executing: 1, completed: 60, historical: 64, appliedControls: 1, recordedPolicyActions: 66 });
    render(<DefensePanel actions={actions} policy={policy} onComplete={() => undefined} />);
    expect(screen.getByText("66 recorded policy actions")).toBeInTheDocument();
    expect(screen.queryByText(/66 active/i)).not.toBeInTheDocument();
    for (const [label, count] of [["Pending Approval", "1"], ["Applied Controls", "1"], ["Executing Actions", "1"], ["Completed Actions", "60"]]) {
      expect(screen.getByText(label).parentElement?.querySelector("dd")).toHaveTextContent(count);
    }
    expect(screen.queryByTestId("defense-history")).not.toBeInTheDocument();
    expect(screen.getByText(/67 retained actions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Protect Gateway Mode · gateway-01 · Planned/ }));
    expect(screen.getAllByText("Policy operation").length).toBeGreaterThan(0);
    expect(screen.queryByText("Synthetic gateway ingress blocked")).not.toBeInTheDocument();
  });

  it.each(["completed", "cancelled", "rejected", "rolled_back", "failed"])("does not turn a %s record into an applied control or executing action", (status) => {
    const counts = defenseSummary([action(status)], dashboardSnapshot().policy);
    expect(counts.appliedControls).toBe(0); expect(counts.executing).toBe(0); expect(counts.pendingApproval).toBe(0); expect(counts.historical).toBe(1);
  });

  it("counts every supported policy entry and does not infer approval from a planned automatic action", () => {
    const policy = { ...dashboardSnapshot().policy, isolated_devices: ["sensor"], quarantined_sources: ["source"], rate_limited_services: { mqtt: .25 }, restricted_ports: [80], gateway_protection: true };
    expect(appliedControlCount(policy)).toBe(5);
    expect(defenseSummary([{ ...action("planned"), human_override_state: "none" }], policy).pendingApproval).toBe(0);
  });
});

describe("Phase 1 recovery truth", () => {
  it("counts only supported nonterminal tracking states as in progress", () => {
    const states = ["pending", "monitoring", "eligible", "recovering", "verifying", "manual_review", "failed", "recovered"];
    expect(recoverySummary(states.map((state) => recovery(state, state === "recovered")))).toEqual({ inProgress: 5, manualReview: 1, failed: 1, verified: 1 });
    const data = dashboardSnapshot(); data.recoveries = [recovery("manual_review")];
    expect(deriveSystemSummary(data).inProgressRecoveries).toBe(0);
    expect(deriveSystemSummary(data).manualReviewRecoveries).toBe(1);
  });

  it.each([["manual_review", false], ["manual_review", true], ["failed", true], ["verifying", true], ["recovered", false]] as const)("does not show successful recovery for state=%s verified=%s", (state, verified) => {
    const record = recovery(state, verified);
    const data = dashboardSnapshot(); data.events = [assessment(1)]; data.defenses = [action("completed")]; data.recoveries = [record];
    expect(isVerifiedRecovery(record)).toBe(false);
    const context = responseContext(data);
    expect(context.status).not.toBe("Recovered");
    expect(context.stages.find((stage) => stage.key === "verification")?.state).not.toBe("completed");
    const { container } = render(<><RecoveryPanel records={[record]} focusedRecoveryId={record.recovery_id} /><IncidentDetail data={data} incident={groupIncidents(data.events)[0]} /><ResponseState context={context} onViewIncident={() => undefined} /></>);
    expect(screen.queryByText("Verified: Yes")).not.toBeInTheDocument();
    expect(container.querySelector(".recovery-track > div:last-child")).not.toHaveClass("complete");
    expect(container.querySelector(".recovery-list .badge")).not.toHaveClass("healthy");
    if (state === "manual_review") expect(screen.getAllByText("Manual Review Required").length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(verified)).length).toBeGreaterThan(0);
  });

  it("shows verified success only for a recovered record with verified=true", () => {
    const data = dashboardSnapshot(); const record = recovery("recovered", true); data.recoveries = [record];
    expect(recoverySummary([record]).verified).toBe(1);
    const { container } = render(<><RecoveryPanel records={[record]} focusedRecoveryId={record.recovery_id} /><ResponseState context={responseContext(data)} onViewIncident={() => undefined} /></>);
    expect(screen.getByText("Verified: Yes")).toBeInTheDocument();
    expect(container.querySelector(".recovery-track > div:last-child")).toHaveClass("complete");
  });

  it.each(["rejected", "cancelled"])("does not give %s proposals a completed defense stage", (status) => {
    const data = dashboardSnapshot(); data.defenses = [action(status)];
    expect(responseContext(data).stages.find((stage) => stage.key === "defense")?.state).toBe("recorded");
  });
});

describe("Phase 1 representative state and window labels", () => {
  it("renders the clock labeled UTC in UTC rather than the browser timezone", () => {
    const data = dashboardSnapshot(); data.simulation.simulation_time = "2026-01-01T05:30:07+05:30";
    render(<SystemHeader data={data} connection="live" refreshing={false} />);
    expect(screen.getByText("00:00:07 UTC")).toBeInTheDocument();
  });
  it.each([false, true])("separates operational state (enabled=%s) from an empty evidence window", (active) => {
    const data = dashboardSnapshot(); data.runtimeStatus.active = active; data.simulation.state = active ? "running" : "stopped";
    render(<><SystemHeader data={data} connection="live" refreshing={false} /><OverviewHero data={data} connection="live" /><CurrentSecurityState data={data} /><AutonomousResponseSummary data={data} /></>);
    expect(screen.getAllByText(active ? "Operational" : "Inactive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 background cases retained").length).toBeGreaterThan(0);
    expect(screen.queryByText("No active threat")).not.toBeInTheDocument();
  });

  it("keeps positive background predictions visible with no synthetic attack, and groups revisions without claiming confirmation", () => {
    const data = dashboardSnapshot(); data.events = [assessment(1), assessment(2)];
    const prediction = { predicted_class_id: 1, predicted_class_name: "Attack", confidence: .8, model_name: "frozen", latency_ms: 1, created_at: "2026-01-01T00:00:01Z" };
    data.events.push({ event_id: "classical", event_type: "classical_prediction", timestamp: prediction.created_at, source: "classical-ml-agent", correlation_id: "case-1", payload: { binary: prediction, multiclass: { ...prediction, predicted_class_name: "HTTP_Flood" }, device_ids: ["gateway-01"] } });
    render(<><SystemHeader data={data} connection="live" refreshing={false} /><CurrentDetectionState data={data} /><IncidentPanel events={data.events} onSelect={() => undefined} /></>);
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("0 active")).toBeInTheDocument();
    expect(screen.getByText("1 background cases retained")).toBeInTheDocument();
    expect(screen.getByText("Attack")).toBeInTheDocument();
    expect(screen.getByText(/No synthetic attack active/)).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1 retained records")).toBeInTheDocument();
    expect(screen.getByText(/2 retained updates/)).toBeInTheDocument();
    expect(screen.queryByText("Models aligned")).not.toBeInTheDocument();
    expect(screen.getByText(/not additional user-launched attacks/)).toBeInTheDocument();
  });

  it("keeps negative and provisional assessments available without counting them as positive cases", () => {
    const data = dashboardSnapshot(); data.events = [assessment(1, null), assessment(2, false)];
    expect(groupIncidents(data.events)[0].history).toHaveLength(2);
    expect(deriveSystemSummary(data).retainedPositiveCases).toBe(0);
    render(<IncidentPanel events={data.events} onSelect={() => undefined} />);
    expect(screen.getByText("Showing 1–1 of 1 retained records")).toBeInTheDocument();
  });

  it("does not infer a retained prediction from an assessment alone", () => {
    const data = dashboardSnapshot(); data.events = [assessment(1)];
    render(<AutonomousResponseSummary data={data} />);
    expect(screen.getByText("Prediction not retained")).toBeInTheDocument();
    expect(screen.queryByText("Prediction retained")).not.toBeInTheDocument();
  });

  it("labels retained network counts and cumulative features separately, even after old events leave the window", () => {
    const data = dashboardSnapshot(); data.featureStatus.vectors_emitted = 374;
    const event = { event_id: "network", event_type: "network_activity", timestamp: "2026-01-01T00:00:01Z", source: "sim", correlation_id: "n", payload: { direction: "synthetic_to_target", service: "http" } };
    const view = render(<TrafficPanel events={[event]} flows={[]} featureStatus={data.featureStatus} />);
    expect(screen.getByText("Retained Network Events").parentElement?.parentElement).toHaveTextContent("1");
    expect(screen.getByText("Cumulative Feature Vectors")).toBeInTheDocument();
    expect(screen.getByText("374")).toBeInTheDocument();
    expect(screen.getByText(/no fixed time window/)).toBeInTheDocument();
    expect(screen.getByText(/since the feature extractor was last reset/)).toBeInTheDocument();
    view.rerender(<TrafficPanel events={[]} flows={[]} featureStatus={data.featureStatus} />);
    expect(screen.getByText("374")).toBeInTheDocument();
    expect(screen.getByText("Retained Network Events").closest("div")).toHaveTextContent("0");
  });

  it("retains the existing event filters and discloses the visible limit separately from retention", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({ ...assessment(1), event_id: `event-${i}` }));
    render(<EventStream events={events} />);
    expect(screen.getByTestId("important-events").children).toHaveLength(1);
    toggle(screen.getByText("Advanced — Technical Audit").closest("details")!, { target: { open: true } });
    expect(screen.getByText(/100 bounded runtime events/)).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "All" }).parentElement!).getAllByRole("button")).toHaveLength(7);
  });
});

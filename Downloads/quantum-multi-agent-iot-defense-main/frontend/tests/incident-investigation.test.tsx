import { toggle } from "./disclosure-helper";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IncidentDetail } from "@/components/incident-detail";
import { IncidentPanel } from "@/components/incident-panel";
import { groupIncidents, incidentTimeline, modelEvidenceForIncident } from "@/features/incidents";
import type { EventEnvelope, PredictionPayload, ThreatPayload } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";

const correlation = "corr-investigation-12345678";
const incidentId = "incident-investigation-12345678";

function threat(revision: number, severity: "medium" | "high" = "high"): EventEnvelope {
  const payload: ThreatPayload = { incident_id: incidentId, affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "Port_Scanning", severity, evidence_strength: "corroborated", evidence: [{ source: "classical-ml-agent", category: "classical_binary", summary: "Primary detector predicted Attack.", strength: "primary" }], disagreement: true, decision_reason: `Assessment revision ${revision}`, status: revision === 1 ? "provisional" : "active" };
  return { event_id: `threat-${revision}`, timestamp: `2026-01-01T00:00:0${revision}Z`, event_type: "threat_assessment", source: "threat-analysis-agent", correlation_id: correlation, payload: payload as unknown as Record<string, unknown> };
}
function prediction(kind: "classical_prediction" | "quantum_prediction", binaryClass: number, name: string): EventEnvelope {
  const payload: PredictionPayload = { feature_vector_event_id: "feature-1", binary: { predicted_class_id: binaryClass, predicted_class_name: name, confidence: .9, model_name: `${kind}.model`, latency_ms: kind === "classical_prediction" ? 2.1 : 12.4, created_at: "2026-01-01T00:00:02Z" }, multiclass: { predicted_class_id: 5, predicted_class_name: "Port_Scanning", confidence: .8, model_name: `${kind}.multiclass`, latency_ms: kind === "classical_prediction" ? .8 : 10.2, created_at: "2026-01-01T00:00:02Z" }, device_ids: ["gateway-01"] };
  return { event_id: kind, timestamp: "2026-01-01T00:00:02Z", event_type: kind, source: kind === "classical_prediction" ? "classical-ml-agent" : "quantum-ml-agent", correlation_id: correlation, payload: payload as unknown as Record<string, unknown> };
}

describe("UI-6 incident investigation", () => {
  it("provides master/detail selection, severity filters, short and full IDs, and grouped revisions", () => {
    const other = { ...threat(1, "medium"), event_id: "other", correlation_id: "corr-other", payload: { ...threat(1, "medium").payload, incident_id: "incident-other", suspected_attack_family: "HTTP_Flood" } };
    const onSelect = vi.fn();
    const { container } = render(<IncidentPanel events={[threat(1), threat(2), other]} selectedId={correlation} onSelect={onSelect} />);
    expect(container.querySelectorAll(".incident-row")).toHaveLength(2);
    expect(screen.getAllByText(/2 retained updates/)).toHaveLength(1);
    expect(screen.queryByText(incidentId)).not.toBeInTheDocument();
    fireEvent.click(container.querySelector(`button[title="${incidentId}"]`)!);
    expect(screen.getByText(incidentId)).toBeInTheDocument();
    fireEvent.click(screen.getByText("View Evidence Updates (2)"));
    toggle(screen.getByText("View Evidence Updates (2)").closest("details")!, { target: { open: true } });
    expect(screen.getByLabelText(`Assessment history for ${incidentId}`).querySelectorAll("details")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "medium" }));
    expect(container.querySelectorAll(".incident-row")).toHaveLength(1);
  });

  it("renders correlation-matched disagreement evidence without converting confidence into severity", () => {
    const data = dashboardSnapshot(); data.events = [threat(1), threat(2), prediction("classical_prediction", 1, "Attack"), prediction("quantum_prediction", 0, "Normal")];
    const incident = groupIncidents(data.events)[0];
    render(<IncidentDetail data={data} incident={incident} />);
    expect(screen.getAllByText("Disagree").length).toBeGreaterThan(0);
    expect(screen.getAllByText("90.0% confidence")).toHaveLength(2);
    expect(screen.getByText("12.4 ms binary · 10.2 ms multiclass")).toBeInTheDocument();
    expect(screen.getByText(/does not determine severity by confidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/fused confidence:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top feature|SHAP|reasoning chain/i)).not.toBeInTheDocument();
  });

  it("renders agreement and awaiting evidence from correlation-matched model results", () => {
    const events = [threat(1), prediction("classical_prediction", 1, "Attack"), prediction("quantum_prediction", 1, "Attack")];
    const incident = groupIncidents(events)[0];
    expect(modelEvidenceForIncident(events, incident).comparison).toBe("agreement");
    expect(modelEvidenceForIncident(events.slice(0, 2), incident).comparison).toBe("awaiting_evidence");
    const unmatched = prediction("quantum_prediction", 0, "Normal");
    unmatched.payload = { ...unmatched.payload, feature_vector_event_id: "different-feature" };
    expect(modelEvidenceForIncident([...events.slice(0, 2), unmatched], incident).comparison).toBe("awaiting_evidence");
  });

  it("shows manual review and verified=false truthfully", () => {
    const data = dashboardSnapshot(); data.events = [threat(1), prediction("classical_prediction", 1, "Attack")];
    data.defenses = [{ action_id: "defense-1", correlation_id: correlation, incident_id: incidentId, action_type: "quarantine_synthetic_source", target: "gateway-01", reason: "Policy action", evidence: [], status: "completed", requested_at: "2026-01-01T00:00:03Z", started_at: null, completed_at: "2026-01-01T00:00:04Z", result: {}, reversible: true, rollback_state: "not_requested", initiated_by: "defense-agent", human_override_state: "none" }];
    data.recoveries = [{ recovery_id: "recovery-1", defense_action_id: "defense-1", correlation_id: correlation, state: "manual_review", created_tick: 1, state_tick: 3, verification_ticks: 2, normal_events_observed: 1, high_assessment_seen: true, verified: false, reason: "Verification did not establish stable recovery." }];
    render(<IncidentDetail data={data} incident={groupIncidents(data.events)[0]} />);
    const response = screen.getByRole("heading", { name: "Defense & Recovery" }).closest("section")!;
    expect(within(response).getAllByText("Manual Review Required")[0]).toBeInTheDocument();
    expect(within(response).getAllByText("false")[0]).toBeInTheDocument();
    expect(screen.queryByText("Recovered")).not.toBeInTheDocument();
  });

  it("keeps the selected timeline strictly correlation-scoped", () => {
    const relevant = { event_id: "feature", timestamp: "2026-01-01T00:00:02Z", event_type: "feature_vector", source: "extractor", correlation_id: correlation, payload: { flow_id: "flow-1" } } as EventEnvelope;
    const unrelated = { ...relevant, event_id: "other-feature", correlation_id: "other" };
    const timeline = incidentTimeline([relevant, unrelated], correlation);
    expect(timeline.map((event) => event.event_id)).toEqual(["feature"]);
  });
});

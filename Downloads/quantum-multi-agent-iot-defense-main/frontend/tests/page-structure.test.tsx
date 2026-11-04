import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardSnapshot } from "./fixtures";

const runtime = vi.hoisted(() => ({ value: {} as ReturnType<typeof runtimeValue> }));
function runtimeValue() {
  return { data: dashboardSnapshot(), telemetry: {}, connection: "live", refreshing: false, refresh: vi.fn(), selectedIncident: undefined, setSelectedIncident: vi.fn() };
}
runtime.value = runtimeValue();

vi.mock("@/components/live-runtime-provider", () => ({ useLiveRuntime: () => runtime.value }));

import OverviewPage from "@/app/page";
import IotTestbedPage from "@/app/iot-testbed/page";
import DetectionPage from "@/app/detection/page";
import IncidentsPage from "@/app/incidents/page";
import AttackResponsePage from "@/app/attack-response/page";
import MultiAgentPage from "@/app/multi-agent/page";
import ResearchResultsPage from "@/app/research-results/page";

afterEach(() => { cleanup(); runtime.value = runtimeValue(); });

describe("page-specific component placement", () => {
  it("presents the simplified Overview with a live farm, model evidence, and system flow", () => { render(<OverviewPage />); expect(screen.getByRole("heading", { name: "Smart Irrigation IoT Cyber Defense System" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Virtual smart farm" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Retained ML + QML Predictions" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "End-to-End System Flow" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Technical Event Stream" })).not.toBeInTheDocument(); });
  it("shows real-shaped model, incident, defense, and recovery state on Overview", () => {
    const data = dashboardSnapshot();
    data.events = [
      { event_id: "cp", timestamp: "2026-01-01T00:00:01Z", event_type: "classical_prediction", source: "classical-ml-agent", correlation_id: "corr-1", payload: { binary: { predicted_class_id: 1, predicted_class_name: "Attack", confidence: .98, model_name: "binary_xgboost_gpu_v1.json", latency_ms: 2.4, created_at: "2026-01-01T00:00:01Z" }, multiclass: { predicted_class_id: 1, predicted_class_name: "TCP_Flood", confidence: .91, model_name: "multiclass_logistic_regression_v1.joblib", latency_ms: 2.5, created_at: "2026-01-01T00:00:01Z" }, device_ids: ["gateway-01"] } },
      { event_id: "qp", timestamp: "2026-01-01T00:00:02Z", event_type: "quantum_prediction", source: "quantum-ml-agent", correlation_id: "corr-1", payload: { binary: { predicted_class_id: 0, predicted_class_name: "Normal", confidence: .87, model_name: "binary_qml_amplitude_v1.pt", latency_ms: 21.4, created_at: "2026-01-01T00:00:02Z" }, multiclass: { predicted_class_id: 0, predicted_class_name: "Normal", confidence: .74, model_name: "multiclass_qml_amplitude_v1.pt", latency_ms: 24.2, created_at: "2026-01-01T00:00:02Z" }, device_ids: ["gateway-01"] } },
      { event_id: "threat", timestamp: "2026-01-01T00:00:03Z", event_type: "threat_assessment", source: "threat-analysis-agent", correlation_id: "corr-1", payload: { incident_id: "incident-1", affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "TCP_Flood", severity: "high", evidence_strength: "corroborated", evidence: [], disagreement: true, decision_reason: "Classical detection is positive while QML disagrees.", status: "active" } },
    ] as never;
    data.defenses = [{ action_id: "defense-1", correlation_id: "corr-1", incident_id: "incident-1", status: "completed" } as never];
    data.recoveries = [{ recovery_id: "recovery-1", defense_action_id: "defense-1", correlation_id: "corr-1", state: "verifying" } as never];
    runtime.value = { ...runtimeValue(), data };
    render(<OverviewPage />);
    expect(screen.getAllByText("TCP Flood").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disagreement").length).toBeGreaterThan(0);
    expect(screen.getByText("binary_xgboost_gpu_v1.json")).toBeInTheDocument();
    expect(screen.getByText("binary_qml_amplitude_v1.pt")).toBeInTheDocument();
    expect(screen.getAllByText("Verifying").length).toBeGreaterThan(0);
  });
  it("places the illustrated smart farm and telemetry on IoT Testbed by default", () => { render(<IotTestbedPage />); expect(screen.getByRole("heading", { name: "Virtual devices & communication" })).toBeInTheDocument(); expect(screen.getByRole("region", { name: "Testbed status and telemetry" })).toBeInTheDocument(); expect(screen.getByRole("tab", { name: "Farm View" })).toHaveAttribute("aria-selected", "true"); expect(screen.getByRole("tab", { name: "Advanced 3D View" })).toBeInTheDocument(); });
  it("keeps truthful traffic metrics and model outputs on Detection with technical details secondary", () => { render(<DetectionPage />); expect(screen.getByRole("heading", { name: "Detection Intelligence" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Network Activity" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Background Model Signals" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Recent Detection Results" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "27-Feature Pipeline" })).not.toBeInTheDocument(); });
  it("places the focused investigation and concise recent cases on the Threat Center", () => { render(<IncidentsPage />); expect(screen.getByRole("heading", { name: "Threat Center" })).toBeInTheDocument(); expect(screen.getByText("FOCUSED INCIDENT")).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Recent Incidents" })).toBeInTheDocument(); expect(screen.getByText("Background Model Activity")).toBeInTheDocument(); });
  it("presents the response workflow one tab at a time", () => { render(<AttackResponsePage />); expect(screen.getByRole("region", { name: "Monitoring" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Attack Simulation" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Defense Decision & Action" })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("tab", { name: "Defense Actions" })); expect(screen.getByRole("heading", { name: "Defense Decision & Action" })).toBeInTheDocument(); fireEvent.click(screen.getByRole("tab", { name: "Recovery Verification" })); expect(screen.getByRole("heading", { name: "Recovery Verification" })).toBeInTheDocument(); });
  it("presents exactly six canonical agents in a shared architecture with the audit stream", () => {
    const data = dashboardSnapshot();
    const names = ["Monitoring", "Classical ML", "Quantum ML", "Threat Analysis", "Defense", "Recovery"];
    data.agents = names.map((name) => {
      const id = `${name.toLowerCase().replaceAll(" ", "-")}-agent`;
      return { agent_id: id, agent_type: id.replace("-agent", ""), name: `${name} Agent`, role: `${name} worker`, status: "running", health: "healthy", started_at: null, last_activity_at: null, processed_event_count: 12, error_count: 0, subscriptions: [], dependencies: {}, state: { queued_events: 2 } };
    });
    runtime.value = { ...runtimeValue(), data };
    render(<MultiAgentPage />);
    expect(screen.getByRole("heading", { name: "Multi-Agent Intelligence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Six-Agent Coordination" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Important Events" })).toBeInTheDocument();
    expect(screen.getByTestId("important-events")).toBeInTheDocument();
    expect(screen.getByText("Advanced — Technical Audit")).toBeInTheDocument();
    for (const name of names) expect(screen.getByRole("button", { name: new RegExp(`${name} Agent`) })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Agent/ })).toHaveLength(6);
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
    expect(screen.getByText("Input", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("Processing", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("Output", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("Feature Extraction Manager", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(/Attack Controller generates safe synthetic scenarios; it is not one of the six agents/)).toBeInTheDocument();
    expect(screen.getByText(/Monitoring Agent does not extract features/)).toBeInTheDocument();
    expect(screen.getByText(/no probability averaging/i)).toBeInTheDocument();
    expect(screen.getByText(/Python asyncio queues/)).toBeInTheDocument();
    expect(screen.getByText(/not distributed microservices/)).toBeInTheDocument();
    expect(screen.queryByText(/Attacker Agent|Feature Agent|probabilities are averaged/)).not.toBeInTheDocument();
    expect(screen.getByText(/do not communicate internally through REST, Kafka, Redis/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Queue2/ })).toHaveLength(0);
    expect(screen.getByText("2", { selector: ".agent-inspector b" })).toBeInTheDocument();
    expect(screen.getAllByText("12", { selector: "b" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Threat Analysis Agent/ }));
    expect(screen.getByText(/Severity belongs here/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Defense Agent/ }));
    expect(screen.getByText(/quarantine synthetic source, rate-limit virtual service/)).toBeInTheDocument();
  });
  it("keeps worker health neutral when runtime is stopped and exposes QML processing details", () => {
    const data = dashboardSnapshot();
    data.runtimeStatus.active = false;
    data.agents = [];
    runtime.value = { ...runtimeValue(), data };
    render(<MultiAgentPage />);
    expect(screen.getByText("Agents Inactive")).toBeInTheDocument();
    expect(screen.getByText("Runtime stopped · health not evaluated")).toBeInTheDocument();
    expect(screen.getByText("Runtime stopped")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Quantum ML Agent/ }));
    expect(screen.getByText(/TRAIN-fitted StandardScaler → L2 normalization/)).toBeInTheDocument();
    expect(screen.getByText(/5-qubit AmplitudeEmbedding/)).toBeInTheDocument();
    expect(screen.getByText(/Binary prediction, multiclass attribution/)).toBeInTheDocument();
  });
  it("uses frozen evaluation data and distinguishes evaluated candidates from selected runtime models", () => { render(<ResearchResultsPage />); expect(screen.getByRole("heading", { name: "Models Evaluated" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Selected Runtime Models" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Binary Detection — Model Comparison" })).toBeInTheDocument(); expect(screen.getByText(/95\.38% \(0\.953762\)/)).toBeInTheDocument(); expect(screen.getByText("Research Notes")).toBeInTheDocument(); });
});

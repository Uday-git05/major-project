import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrentDetectionState } from "@/components/detection-state";
import { DetectionPipeline } from "@/components/detection-pipeline";
import { IntelligencePanel } from "@/components/intelligence-panel";
import { TrafficPanel } from "@/components/traffic-panel";
import { deriveDetectionEvidence, FROZEN_FEATURE_NAMES, recentPredictionCorrelations } from "@/features/detection";
import type { ActiveFlow, EventEnvelope, ModelInfo, PredictionPayload } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";

const expectedFeatures = ["missed_bytes", "orig_pkts", "orig_ip_bytes", "resp_pkts", "resp_ip_bytes", "fwd_pkts_per_sec", "bwd_pkts_per_sec", "flow_pkts_per_sec", "down_up_ratio", "fwd_header_size_tot", "fwd_header_size_min", "fwd_header_size_max", "bwd_header_size_tot", "bwd_header_size_min", "bwd_header_size_max", "fwd_pkts_payload.tot", "fwd_pkts_payload.avg", "bwd_pkts_payload.tot", "bwd_pkts_payload.avg", "flow_pkts_payload.tot", "flow_pkts_payload.avg", "fwd_iat.tot", "fwd_iat.avg", "bwd_iat.tot", "bwd_iat.avg", "flow_iat.tot", "flow_iat.avg"];
const models: ModelInfo = { feature_count: 27, feature_names: expectedFeatures, qml_device: "default.qubit", models: { classical_binary: "binary_xgboost_gpu_v1.json", classical_multiclass: "multiclass_logistic_regression_v1.joblib", qml_binary: "binary_qml_amplitude_v1.pt", qml_multiclass: "multiclass_qml_selected_final_v1.pt" }, thresholds: { classical_binary: 0.012, qml_binary: 0.39 } };

function prediction(binaryClass: number, binaryName: string, model: string): PredictionPayload { return { feature_vector_event_id: "feature-1", binary: { predicted_class_id: binaryClass, predicted_class_name: binaryName, confidence: .91, model_name: model, latency_ms: 3.2, created_at: "2026-01-01T00:00:01Z" }, multiclass: { predicted_class_id: binaryClass, predicted_class_name: binaryClass ? "Port_Scanning" : "Normal", confidence: .82, model_name: model.replace("binary", "multiclass"), latency_ms: 4.3, created_at: "2026-01-01T00:00:01Z" }, device_ids: ["gateway-01"] }; }
function predictionEvent(kind: "classical_prediction" | "quantum_prediction", correlation: string, payload: PredictionPayload): EventEnvelope { return { event_id: `${kind}-${correlation}`, timestamp: "2026-01-01T00:00:01Z", event_type: kind, source: kind, correlation_id: correlation, payload: payload as unknown as Record<string, unknown> }; }

describe("UI-5 detection presentation", () => {
  it("preserves the exact frozen feature order in progressive disclosure", () => {
    expect([...FROZEN_FEATURE_NAMES]).toEqual(expectedFeatures);
    render(<DetectionPipeline />);
    fireEvent.click(screen.getByText("View 27 Features"));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(expectedFeatures);
    expect(screen.queryByText("BotNet_DDOS")).not.toBeInTheDocument();
  });

  it("derives agreement, disagreement, and correlation-aware awaiting QML", () => {
    const cp = predictionEvent("classical_prediction", "latest", prediction(1, "Attack", "binary_xgboost_gpu_v1.json"));
    const matching = predictionEvent("quantum_prediction", "latest", prediction(1, "Attack", "binary_qml_amplitude_v1.pt"));
    const disagreeing = predictionEvent("quantum_prediction", "latest", prediction(0, "Normal", "binary_qml_amplitude_v1.pt"));
    const stale = predictionEvent("quantum_prediction", "older", { ...prediction(1, "Attack", "binary_qml_amplitude_v1.pt"), feature_vector_event_id: "feature-older" });
    expect(deriveDetectionEvidence([cp, matching]).agreement).toBe("agreement");
    expect(deriveDetectionEvidence([cp, disagreeing]).agreement).toBe("disagreement");
    expect(deriveDetectionEvidence([stale, cp]).agreement).toBe("awaiting_qml");
    const unrelatedVector = predictionEvent("quantum_prediction", "latest", { ...prediction(1, "Attack", "qml"), feature_vector_event_id: "feature-other" });
    expect(deriveDetectionEvidence([cp, unrelatedVector]).agreement).toBe("awaiting_qml");
    expect(deriveDetectionEvidence([]).agreement).toBe("no_prediction");
  });

  it("prioritizes a focused scenario correlation in the bounded recent results", () => {
    const events = ["focus", "background-a", "background-b"].map((correlation) =>
      predictionEvent("classical_prediction", correlation, prediction(0, "Normal", "classical")));
    expect(recentPredictionCorrelations(events, "focus", 2)).toEqual(["focus", "background-b"]);
  });

  it("shows frozen model identities, simulator disclosure, live latency, and no fused score", () => {
    const events = [predictionEvent("classical_prediction", "c", prediction(1, "Attack", "binary_xgboost_gpu_v1.json")), predictionEvent("quantum_prediction", "c", prediction(0, "Normal", "binary_qml_amplitude_v1.pt"))];
    render(<IntelligencePanel events={events} models={models} />);
    expect(screen.getAllByText("Disagree").length).toBeGreaterThan(0);
    expect(screen.getAllByText("binary_xgboost_gpu_v1.json").length).toBeGreaterThan(0);
    expect(screen.getByText("multiclass_logistic_regression_v1.joblib")).toBeInTheDocument();
    expect(screen.getAllByText("binary_qml_amplitude_v1.pt").length).toBeGreaterThan(0);
    expect(screen.getByText(/Runs on default.qubit, a quantum simulator/)).toBeInTheDocument();
    expect(screen.getByText(/No probability averaging or fused confidence is used/)).toBeInTheDocument();
    expect(screen.queryByText(/fused confidence:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/It is not incident severity/)).toBeInTheDocument();
    expect(screen.getAllByText(/3.2 ms binary/).length).toBe(2);
    expect(screen.queryByText("BotNet_DDOS")).not.toBeInTheDocument();
  });

  it("shows a truthful pending QML state for an active focused scenario", () => {
    const classical = predictionEvent("classical_prediction", "focused", prediction(1, "Attack", "classical"));
    render(<IntelligencePanel events={[classical]} models={models} focusedCorrelation="focused" qmlQueued />);
    expect(screen.getAllByText("Queued / analyzing")).toHaveLength(2);
    expect(screen.getAllByText("Awaiting QML")).toHaveLength(2);
  });

  it("renders current real-shaped flow activity and keeps full IDs secondary", () => {
    const flow: ActiveFlow = { flow_id: "flow-internal-identifier", source_address: "10.42.0.2", destination_address: "10.42.0.1", source_port: 20002, destination_port: 1883, protocol: "TCP", source_device_id: "soil-01", destination_device_id: "gateway-01", flow_start: "2026-01-01T00:00:00Z", flow_end: "2026-01-01T00:00:01Z", packet_count: 6, source_event_count: 3 };
    const event = { event_id: "n", timestamp: "2026-01-01T00:00:01Z", event_type: "network_activity", source: "sim", correlation_id: "n", payload: { source_device_id: "soil-01", destination_device_id: "gateway-01", direction: "device_to_gateway", service: "mqtt" } } as EventEnvelope;
    render(<TrafficPanel events={[event]} flows={[flow]} featureStatus={{ running: true, extractor_version: "1", active_flow_count: 1, flows_created: 1, vectors_emitted: 2, invalid_events: 0, duplicate_events: 0, out_of_order_events: 0, minimum_packets: 2 }} />);
    expect(screen.getByText("soil-01")).toBeInTheDocument(); expect(screen.getByText("gateway-01")).toBeInTheDocument(); expect(screen.getAllByText("Mqtt").length).toBeGreaterThan(0); expect(screen.getByText("6 pkt")).toBeInTheDocument();
    expect(screen.queryByText("flow-internal-identifier")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("flow-internal-identifier"));
    expect(screen.getByText("flow-internal-identifier")).toBeInTheDocument();
  });

  it("keeps prediction and severity semantically separate in the current state", () => {
    const data = dashboardSnapshot(); data.events = [predictionEvent("classical_prediction", "c", prediction(1, "Attack", "binary_xgboost_gpu_v1.json"))];
    render(<CurrentDetectionState data={data} />);
    expect(screen.getAllByText("Awaiting QML").length).toBeGreaterThan(0);
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "Severity is assigned separately by the Threat Analysis Agent at incident level.")).toBeInTheDocument();
    expect(screen.queryByText(/high severity/i)).not.toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { scenarioFocus, scenarioRecords, scenarioModelEvidence, scenarioQmlPending, validFocus } from "@/features/scenario-focus";
import { responseContext, responseTimeline } from "@/features/response";
import { ScenarioEvidence } from "@/components/scenario-evidence";
import { ScenarioStory } from "@/components/scenario-story";
import { ScenarioContextBar } from "@/components/scenario-context";
import { scenarioData, scenarioAttack, scenarioAssessment, scenarioPrediction, scenarioDefense, scenarioRecovery } from "./scenario-fixtures";

describe("deterministic scenario identity", () => {
  it("starts in Monitoring even with high-severity background response records", () => {
    const data = scenarioData(); const context = responseContext(data, null);
    expect(context).toMatchObject({ status: "Monitoring", correlationIds: [] });
    expect(context.attack).toBeUndefined(); expect(context.defense).toBeUndefined(); expect(context.recovery).toBeUndefined();
    render(<ScenarioStory data={data} focus={null} onViewIncident={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();
    expect(data.events).toHaveLength(5);
  });
  it("anchors every primary record to A while higher severity B shares its type and target", () => {
    const data = scenarioData(); const focus = scenarioFocus(data.attacks[0], data.epoch);
    const context = responseContext(data, focus);
    expect(context.attack?.attack_id).toBe("attack-A"); expect(context.incident?.incidentId).toBe("incident-A");
    expect(context.defense?.action_id).toBe("defense-A"); expect(context.recovery?.recovery_id).toBe("recovery-A");
    expect(context.status).toBe("Manual Review Required"); expect(context.correlationIds).toEqual(["corr-A"]);
    expect(responseTimeline(data.events, context.correlationIds).every((event) => event.correlation_id === "corr-A")).toBe(true);
  });
  it.each(["events", "defenses", "recoveries"] as const)("does not borrow unrelated %s when A has no matching record", (key) => {
    const data = scenarioData(); const focus = scenarioFocus(data.attacks[0], data.epoch);
    data[key] = data[key].filter((item) => item.correlation_id === "corr-B") as never;
    const context = responseContext(data, focus);
    expect(key === "events" ? context.threat : key === "defenses" ? context.defense : context.recovery).toBeUndefined();
    expect(context.attack?.attack_id).toBe("attack-A");
  });
  it("never combines attack A with defense B even in legacy record inspection", () => {
    const data = scenarioData(); data.defenses = [scenarioDefense("B")];
    const context = responseContext(data);
    expect(context.attack?.correlation_id).toBe("corr-B"); expect(context.correlationIds).toEqual(["corr-B"]);
  });
  it("links recovery to the chosen defense action, not just any recovery in the same scenario", () => {
    const data = scenarioData(); data.recoveries = [{ ...scenarioRecovery(), defense_action_id: "other-action" }];
    expect(responseContext(data, scenarioFocus(data.attacks[0], data.epoch)).recovery).toBeUndefined();
  });
  it("rejects a contradictory recovery pointing at a defense from B", () => {
    const data = scenarioData(); data.defenses = [scenarioDefense("B")]; data.recoveries = [{ ...scenarioRecovery(), defense_action_id: "defense-B" }];
    expect(responseContext(data, scenarioFocus(data.attacks[0], data.epoch)).recovery).toBeUndefined();
  });
  it("invalidates a focus after epoch change even when deterministic attack IDs repeat", () => {
    const data = scenarioData(); const focus = scenarioFocus(data.attacks[0], data.epoch); data.epoch++;
    expect(validFocus(focus, data.epoch)).toBeNull(); expect(responseContext(data, focus).status).toBe("Monitoring");
  });
  it("preserves selected identity when bounded history no longer contains its attack", () => {
    const data = scenarioData(); const focus = scenarioFocus(data.attacks[0], data.epoch); data.attacks = []; data.activeAttacks = [];
    expect(scenarioRecords(data, focus).focus).toEqual(focus); expect(responseContext(data, focus).attack).toBeUndefined();
    render(<ScenarioContextBar data={data} focus={focus} onFocus={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/Scenario status not retained/)).toBeInTheDocument();
  });
  it("keeps attack completion separate from recovery success", () => {
    const data = scenarioData(); data.attacks = [scenarioAttack("A", "completed")]; data.activeAttacks = []; data.defenses = []; data.recoveries = [];
    const context = responseContext(data, scenarioFocus(data.attacks[0], data.epoch));
    expect(context.status).toBe("Attack Completed · Recovery Not Established");
    expect(context.stages.find((stage) => stage.key === "recovery")?.state).toBe("waiting");
  });
  it.each([["manual_review", false, "Manual Review Required"], ["recovered", false, "Recovery Unverified"], ["recovered", true, "Recovered"], ["failed", false, "Recovery Failed"]] as const)("preserves focused recovery truth: %s verified=%s", (state, verified, expected) => {
    const data = scenarioData(); data.recoveries = [scenarioRecovery("A", state, verified), scenarioRecovery("B", "recovered", true)];
    const focus = scenarioFocus(data.attacks[0], data.epoch);
    expect(responseContext(data, focus).status).toBe(expected);
    render(<ScenarioStory data={data} focus={focus} onViewIncident={vi.fn()} />);
    expect(screen.getByText(verified ? "Verified: Yes" : "Verified: No")).toBeInTheDocument();
  });
});

describe("scenario model / flow evidence", () => {
  it("stops labeling QML as analyzing when the focused synthetic scenario is complete", () => {
    const active = scenarioAttack("A", "active");
    const completed = scenarioAttack("A", "completed");
    expect(scenarioQmlPending(active, true, true, false, false)).toBe(true);
    expect(scenarioQmlPending(completed, true, true, false, false)).toBe(false);
    expect(scenarioQmlPending(active, true, true, false, true)).toBe(false);
    expect(scenarioQmlPending(active, true, true, true, false)).toBe(false);
  });
  it("does not fill missing detector evidence with a globally latest prediction", () => {
    const data = scenarioData(); data.events = [scenarioPrediction("B")];
    const scope = scenarioRecords(data, scenarioFocus(data.attacks[0], data.epoch));
    expect(scenarioModelEvidence(scope.events).comparison).toBe("No correlated model evidence yet");
  });
  it("shows Awaiting QML only in the scoped evidence view and discloses missing-retention uncertainty", () => {
    const data = scenarioData(); data.events = [scenarioPrediction(), scenarioPrediction("B", true)];
    render(<ScenarioEvidence data={data} focus={scenarioFocus(data.attacks[0], data.epoch)} />);
    expect(screen.getByText(/Awaiting QML — no correlated/)).toBeInTheDocument();
    expect(screen.getByText(/Missing QML may be pending, unavailable, or outside retention/)).toBeInTheDocument();
  });
  it("preserves a QML-only retained result instead of hiding it", () => {
    expect(scenarioModelEvidence([scenarioPrediction("A", true)]).quantum).toBeDefined();
  });
  it("keeps QML from a different feature vector visible but refuses to compare it", () => {
    const classical = scenarioPrediction("A");
    const unrelatedQml = { ...scenarioPrediction("A", true, false), payload: { ...scenarioPrediction("A", true, false).payload, feature_vector_event_id: "different-vector" } };
    const evidence = scenarioModelEvidence([classical, unrelatedQml]);
    expect(evidence.quantum).toBeDefined();
    expect(evidence.matchedQuantum).toBeUndefined();
    expect(evidence.comparison).toBe("No matched feature evidence");
  });
  it("shows model disagreement and attribution independently of Port Scanning ground truth", () => {
    const data = scenarioData(); render(<ScenarioEvidence data={data} focus={scenarioFocus(data.attacks[0], data.epoch)} />);
    expect(screen.getByText(/Port Scanning/)).toBeInTheDocument();
    expect(screen.getAllByText("HTTP Flood")).toHaveLength(2);
    expect(screen.getByText(/Disagreement/)).toBeInTheDocument();
    expect(screen.getByText(/Agreement does not prove correct attribution/)).toBeInTheDocument();
  });
  it("joins flow identity only through retained feature provenance and the current window", () => {
    const data = scenarioData(); const feature = { ...scenarioAssessment(), event_type: "feature_vector", payload: { flow_id: "f", features: {} } };
    data.recentFeatures = [feature]; data.events.push(feature);
    data.flows = [{ flow_id: "f", flow_start: "2026-01-01T00:00:00Z", flow_end: "2026-01-01T00:00:08Z" } as never, { flow_id: "unlinked", source_device_id: "source-A" } as never];
    const focus = scenarioFocus(data.attacks[0], data.epoch);
    expect(scenarioRecords(data, focus).features).toHaveLength(1); expect(scenarioRecords(data, focus).flows.map((flow) => flow.flow_id)).toEqual(["f"]);
    data.flows[0].flow_start = "2026-01-01T00:00:09Z";
    expect(scenarioRecords(data, focus).flows).toHaveLength(0);
  });
  it("counts background assessment updates without deleting or merging them", () => {
    const data = scenarioData(); const scope = scenarioRecords(data, scenarioFocus(data.attacks[0], data.epoch));
    expect(scope.backgroundAssessments).toBe(1); expect(data.events).toHaveLength(5);
    render(<ScenarioContextBar data={data} focus={scope.focus} onFocus={vi.fn()} onClear={vi.fn()} />);
    expect(within(screen.getByRole("region", { name: "Scenario focus" })).getByText("Background assessments: 1 retained updates")).toBeInTheDocument();
  });
});

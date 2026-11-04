import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Attack, AttackType, DefenseAction, EventEnvelope, Recovery, ThreatPayload } from "@/types/api";
import { responseStatus, responseTimeline } from "@/features/response";
import { dashboardSnapshot } from "./fixtures";
import { scenarioFocus, type ScenarioFocus } from "@/features/scenario-focus";
import { scenarioAttack } from "./scenario-fixtures";
import { api } from "@/lib/api-client";

const runtime = vi.hoisted(() => ({ value: {} as ReturnType<typeof runtimeValue> }));
function runtimeValue() { return { data: dashboardSnapshot(), telemetry: {}, connection: "live", refreshing: false, refresh: vi.fn(), selectedIncident: undefined, setSelectedIncident: vi.fn(), focusedScenario: null as ScenarioFocus | null }; }
runtime.value = runtimeValue();
vi.mock("@/components/live-runtime-provider", () => ({ useLiveRuntime: () => runtime.value }));

import AttackResponsePage from "@/app/attack-response/page";

const attackNames = ["Arp_Spoofing", "HTTP_Flood", "ICMP_Flood", "MQTT_Flood", "Port_Scanning", "TCP_Flood", "UDP_Flood"];
const attackTypes: AttackType[] = attackNames.map((attack_type) => ({ attack_type, name: attack_type.replaceAll("_", " "), description: `Safe ${attack_type} scenario`, default_target_types: ["gateway"], default_duration_ticks: 4, default_intensity: "medium", protocol: "TCP", service: "test", behavior_summary: "Synthetic metadata" }));
const attack = (status = "active"): Attack => ({ attack_id: "attack-1", attack_type: "TCP_Flood", name: "TCP Flood", description: "Safe scenario", target_device_id: "gateway-01", source_device_id: "synthetic-source-1", status, severity_hint: "high", start_tick: 5, end_tick: 9, duration_ticks: 4, intensity: "medium", seed: 42, correlation_id: "attack-corr", metadata: {}, ticks_active: 2, network_events_generated: 8 });
const threatEvent = (): EventEnvelope => ({ event_id: "threat-1", timestamp: "2026-01-01T00:00:04Z", event_type: "threat_assessment", source: "threat-analysis-agent", correlation_id: "incident-corr", payload: { incident_id: "incident-1", affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "TCP_Flood", severity: "high", evidence_strength: "corroborated", evidence: [], disagreement: false, decision_reason: "Corroborated high-severity assessment.", status: "active" } satisfies ThreatPayload as unknown as Record<string, unknown> });
const defense = (status = "planned", overrides: Partial<DefenseAction> = {}): DefenseAction => ({ action_id: "defense-1", correlation_id: "incident-corr", incident_id: "incident-1", action_type: "protect_gateway_mode", target: "gateway-01", reason: "Corroborated high-severity assessment.", evidence: ["classical:attack"], status, requested_at: "2026-01-01T00:00:05Z", started_at: null, completed_at: null, result: {}, reversible: true, rollback_state: "not_requested", initiated_by: "defense-agent", human_override_state: status === "planned" ? "pending" : "none", ...overrides });
const recovery = (state: string, verified = false, overrides: Partial<Recovery> = {}): Recovery => ({ recovery_id: "recovery-1", defense_action_id: "defense-1", correlation_id: "incident-corr", state, created_tick: 10, state_tick: 12, verification_ticks: 1, normal_events_observed: 2, high_assessment_seen: false, verified, reason: state === "manual_review" ? "Attack did not reach an inactive state in the bounded window." : "Runtime recovery state.", ...overrides });
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

afterEach(() => { cleanup(); runtime.value = runtimeValue(); vi.restoreAllMocks(); });

describe("Attack & Response workspace", () => {
  it("shows the nominal response state without inventing response activity", () => {
    runtime.value = { ...runtimeValue(), data: { ...dashboardSnapshot(), attackTypes } };
    render(<AttackResponsePage />);
    expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();
    expect(screen.getByText(/No focused scenario. Background security signals remain available/)).toBeInTheDocument();
  });

  it("offers exactly the seven frozen synthetic scenario cards and excludes BotNet_DDOS", () => {
    runtime.value = { ...runtimeValue(), data: { ...dashboardSnapshot(), attackTypes } };
    render(<AttackResponsePage />);
    const options = within(screen.getByRole("group", { name: "Supported synthetic scenarios" })).getAllByRole("button");
    expect(options.map((item) => item.querySelector("b")?.textContent?.toLowerCase())).toEqual(attackNames.map(name => name.replaceAll("_", " ").toLowerCase()));
    expect(screen.queryByText("BotNet_DDOS")).not.toBeInTheDocument();
    expect(screen.getByText(/No external traffic or real ARP poisoning/i)).toBeInTheDocument();
  });

  it("keeps an active synthetic attack separate from detector and incident truth", () => {
    const active = attack(); const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.attacks = [active]; data.activeAttacks = [active];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus(active, data.epoch) };
    render(<AttackResponsePage />);
    expect(screen.getByRole("heading", { name: "Synthetic Attack Active" })).toBeInTheDocument();
    expect(screen.getAllByText("gateway-01").length).toBeGreaterThan(0);
    expect(screen.getByText("Source synthetic-source-1")).toBeInTheDocument();
    expect(screen.getAllByText("No correlated model evidence yet").length).toBeGreaterThan(0);
  });

  it("shows a proposed defense, human approval requirement, and real incident linkage", async () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.events = [threatEvent()]; data.defenses = [defense()];
    const setSelectedIncident = vi.fn(); runtime.value = { ...runtimeValue(), data, setSelectedIncident, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />);
    expect(screen.getByRole("heading", { name: "Defense Proposed" })).toBeInTheDocument();
    openTab("Defense Actions");
    fireEvent.click(await screen.findByRole("button", { name: /Protect Gateway Mode · gateway-01 · Planned/ }));
    expect(screen.getAllByText("Human confirmation required").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    fireEvent.click(screen.getByRole("link", { name: /view incident/i }));
    expect(setSelectedIncident).toHaveBeenCalledWith("incident-corr");
  });

  it("makes Approve and Reject visible for a real focused pending proposal without selecting a history row", () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.defenses = [defense()];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />);
    openTab("Defense Actions");
    expect(screen.getByText("Human Decision Required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve & apply virtual defense" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject proposal" })).toBeEnabled();
    expect(screen.getAllByText("Protect Gateway Mode").length).toBeGreaterThan(0);
  });

  it("sends real lifecycle commands for a pending focused proposal", async () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.defenses = [defense()];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    const command = vi.spyOn(api, "defense").mockResolvedValue(defense("cancelled", { human_override_state: "cancelled" }));
    render(<AttackResponsePage />); openTab("Defense Actions");
    fireEvent.click(screen.getByRole("button", { name: "Cancel proposal" }));
    expect(command).toHaveBeenCalledWith("defense-1", "cancel");
  });

  it("shows rollback only for a completed reversible defense whose policy effect remains active", () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.defenses = [defense("completed", { human_override_state: "none" })]; data.policy.gateway_protection = true;
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    const command = vi.spyOn(api, "defense").mockResolvedValue(defense("rolled_back", { rollback_state: "completed" }));
    render(<AttackResponsePage />); openTab("Defense Actions");
    expect(screen.getByText("Active Virtual Defense")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rollback active defense" }));
    expect(command).toHaveBeenCalledWith("defense-1", "rollback");
  });

  it("explains why approval is unavailable after a defense completes", () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes; data.defenses = [defense("completed", { human_override_state: "none" })];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />);
    openTab("Defense Actions");
    expect(screen.getByText("Action completed")).toBeInTheDocument();
    expect(screen.getByText(/Approval is no longer available; rollback is offered only while a reversible policy effect remains active/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & apply virtual defense" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject proposal" })).not.toBeInTheDocument();
  });

  it("does not substitute an unrelated background proposal for a focused scenario", async () => {
    const data = dashboardSnapshot(); data.attackTypes = attackTypes;
    data.defenses = [defense("completed", { correlation_id: "focused-correlation", human_override_state: "none" }), defense("planned", { action_id: "background-defense", correlation_id: "other-correlation" })];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "focused-correlation" }, data.epoch) };
    render(<AttackResponsePage />); openTab("Defense Actions");
    expect(screen.getByText("Action completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & apply virtual defense" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Background defense history & technical audit/));
    expect(await screen.findByRole("button", { name: /Protect Gateway Mode · gateway-01 · Planned/ })).toBeInTheDocument();
  });

  it("explains the no-focus state without surfacing background approval buttons", async () => {
    const data = dashboardSnapshot();
    data.defenses = [defense("planned", { correlation_id: "background-correlation" })];
    runtime.value = { ...runtimeValue(), data };
    render(<AttackResponsePage />); openTab("Defense Actions");
    expect(screen.getByText(/no synthetic scenario is focused/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & apply virtual defense" })).not.toBeInTheDocument();
    expect(screen.getByText(/Background defense history & technical audit/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Background defense history & technical audit/));
    expect(await screen.findByRole("button", { name: /Protect Gateway Mode · gateway-01 · Planned/ })).toBeInTheDocument();
  });

  it("does not promote unrelated background recovery into the focused recovery view", () => {
    const data = dashboardSnapshot();
    data.recoveries = [recovery("manual_review", false, { correlation_id: "background-correlation" })];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />); openTab("Recovery Verification");
    expect(screen.getByText(/No recovery record is linked to the focused scenario/)).toBeInTheDocument();
    expect(screen.getByText(/Background recovery history \(1\)/).closest("details")).not.toHaveAttribute("open");
  });

  it.each(["monitoring", "eligible", "recovering", "verifying"])("renders the real %s recovery stage as unverified", (state) => {
    const data = dashboardSnapshot(); data.events = [threatEvent()]; data.defenses = [defense("completed")]; data.recoveries = [recovery(state)]; runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />); openTab("Recovery Verification");
    expect(screen.getAllByText(state.replace(/^./, (value) => value.toUpperCase())).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verified: No").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Recovered" })).not.toBeInTheDocument();
  });

  it("makes manual review distinct, leaves verified false, and reports rollback truth", () => {
    const data = dashboardSnapshot(); data.events = [threatEvent()]; data.defenses = [defense("completed", { rollback_state: "not_requested" })]; data.recoveries = [recovery("manual_review")]; runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />); openTab("Recovery Verification");
    expect(screen.getAllByRole("heading", { name: "Manual Review Required" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attack did not reach an inactive state in the bounded window.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verified: No").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rollback: Not requested/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Recovered" })).not.toBeInTheDocument();
  });

  it("keeps manual review visible as a Recovery Agent outcome and shows real agent metrics", () => {
    const data = dashboardSnapshot(); data.recoveries = [recovery("manual_review")]; data.defenses = [defense("completed")];
    data.agents = [...data.agents, { ...data.agents[0], agent_id: "recovery-agent", agent_type: "recovery", name: "Recovery Agent", processed_event_count: 7, error_count: 1, state: { queued_events: 2 } }];
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    render(<AttackResponsePage />); openTab("Recovery Verification");
    expect(screen.getAllByRole("heading", { name: "Manual Review Required" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/7 events processed · queue 2 · 1 errors/)).toBeInTheDocument();
    expect(screen.getByText(/Human review is required/)).toBeInTheDocument();
  });

  it("offers recovery-tab rollback only when the linked reversible policy effect is active", () => {
    const data = dashboardSnapshot(); data.defenses = [defense("completed")]; data.recoveries = [recovery("verifying")]; data.policy.gateway_protection = true;
    runtime.value = { ...runtimeValue(), data, focusedScenario: scenarioFocus({ ...scenarioAttack(), correlation_id: "incident-corr" }, data.epoch) };
    const command = vi.spyOn(api, "defense").mockResolvedValue(defense("rolled_back", { rollback_state: "completed" }));
    render(<AttackResponsePage />); openTab("Recovery Verification");
    fireEvent.click(screen.getByRole("button", { name: "Rollback defense" }));
    expect(command).toHaveBeenCalledWith("defense-1", "rollback");
  });

  it("only reports Recovered for a genuinely verified recovered record", () => {
    expect(responseStatus(undefined, defense("rolled_back"), recovery("recovered", false))).not.toBe("Recovered");
    expect(responseStatus(undefined, defense("rolled_back"), recovery("recovered", true))).toBe("Recovered");
  });

  it("bounds the response timeline to matching runtime correlation identities", () => {
    const matching = { event_id: "one", timestamp: "2026-01-01T00:00:01Z", event_type: "defense_action_requested", source: "defense-manager", correlation_id: "incident-corr", payload: { status: "planned" } } as EventEnvelope;
    const unrelated = { ...matching, event_id: "two", correlation_id: "other-corr" };
    expect(responseTimeline([unrelated, matching], ["incident-corr"])).toEqual([matching]);
  });
});

import type { DashboardSnapshot } from "@/types/api";
import type { ScenarioFocus } from "@/features/scenario-focus";
import { scenarioModelEvidence, scenarioRecords } from "@/features/scenario-focus";
import { Badge } from "./ui";

export function ScenarioLifecycle({ data, focus }: { data: DashboardSnapshot; focus: ScenarioFocus | null }) {
  if (!focus) return <section className="scenario-lifecycle lifecycle-monitoring" aria-label="Scenario lifecycle"><header><span className="kicker">DEMO STORY</span><h2>System Monitoring</h2><p>No focused synthetic scenario. Background model signals are detector outputs, not additional user-launched attacks.</p></header><div className="lifecycle-empty"><b>No focused scenario</b><span>Launch a controlled scenario from Attack &amp; Response to follow its correlated lifecycle.</span></div></section>;
  const scope = scenarioRecords(data, focus);
  const evidence = scenarioModelEvidence(scope.events);
  const attack = scope.attack;
  const network = scope.events.some((event) => event.event_type === "network_activity");
  const defense = scope.defenses.at(-1);
  const recovery = scope.recoveries.at(-1);
  const assessments = scope.events.filter((event) => event.event_type === "threat_assessment");
  const stages = [
    { label: "Synthetic Scenario", value: attack ? human(attack.status) : "Identity retained", state: attack?.status === "active" ? "active" : attack?.status === "completed" || attack?.status === "cancelled" ? "complete" : "waiting" },
    { label: "Network Activity", value: network ? "Recorded" : "Waiting for correlated traffic", state: network ? "complete" : "waiting" },
    { label: "Detection", value: ["No correlated model evidence yet", "Awaiting QML", "No matched feature evidence"].includes(evidence.comparison) ? "Analyzing" : evidence.comparison, state: evidence.classical ? evidence.comparison === "Disagreement" ? "attention" : evidence.comparison === "Agreement" ? "complete" : "waiting" : "waiting" },
    { label: "Threat Assessment", value: assessments.length ? human(String(assessments.at(-1)?.payload.severity ?? "Recorded")) : "Waiting", state: assessments.length ? "complete" : "waiting" },
    { label: "Defense", value: defense ? defense.human_override_state === "pending" ? "Approval Required" : human(defense.status) : "No eligible proposal recorded", state: !defense ? "waiting" : defense.human_override_state === "pending" ? "attention" : ["completed", "rolled_back"].includes(defense.status) ? "complete" : "active" },
    { label: "Recovery", value: recovery ? recovery.verified && recovery.state === "recovered" ? "Verified" : human(recovery.state) : "Not started", state: recovery?.verified && recovery.state === "recovered" ? "complete" : recovery?.state === "manual_review" || recovery?.state === "failed" ? "attention" : recovery ? "active" : "waiting" },
  ];
  return <section className="scenario-lifecycle" aria-label="Focused scenario lifecycle">
    <header><div><span className="kicker">FOCUSED SCENARIO</span><h2>{human(focus.attackType)}</h2><p>Target: {data.devices.find((device) => device.device_id === focus.target)?.name ?? focus.target} · {attack ? human(attack.status) : "Scenario status not retained"}</p></div><div className="ground-truth-note"><b>Simulator ground truth</b><span>User-launched scenario record; model predictions are displayed separately.</span></div></header>
    <ol className="scenario-lifecycle-stages">{stages.map((stage, index) => <li className={`lifecycle-${stage.state}`} key={stage.label}><span className="lifecycle-index">{String(index + 1).padStart(2, "0")}</span><div><b>{stage.label}</b><small>{stage.value}</small></div>{index < stages.length - 1 && <i aria-hidden="true">→</i>}</li>)}</ol>
    <footer><Badge value={["Awaiting QML", "No correlated model evidence yet", "No matched feature evidence"].includes(evidence.comparison) ? "Analyzing" : evidence.comparison} tone={evidence.comparison === "Agreement" ? "healthy" : evidence.comparison === "Disagreement" ? "medium" : "info"} /><span>Agreement compares binary results from the same feature vector. It is evidence, not a correctness guarantee.</span></footer>
  </section>;
}

function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

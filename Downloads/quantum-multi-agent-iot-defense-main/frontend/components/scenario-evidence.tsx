import type { DashboardSnapshot } from "@/types/api";
import { scenarioModelEvidence, scenarioRecords, type ScenarioFocus } from "@/features/scenario-focus";
import { titleCase } from "@/lib/format";
import { Panel } from "./ui";

export function ScenarioEvidence({ data, focus }: { data: DashboardSnapshot; focus: ScenarioFocus }) {
  const scope = scenarioRecords(data, focus);
  const evidence = scenarioModelEvidence(scope.events);
  return <Panel title="Focused Scenario Evidence" kicker="Correlation-linked model output; synthetic scenario identity is not a model verdict." className="scenario-evidence">
    <p><b>Synthetic Scenario:</b> {titleCase(focus.attackType)} · <b>Correlated Detection:</b> {evidence.comparison}</p>
    {!evidence.classical && !evidence.quantum && <p>No correlated model evidence yet. Unrelated predictions are not substituted.</p>}
    <div className="scenario-models">{[["Classical ML Prediction", evidence.classical], ["QML Prediction", evidence.quantum]].map(([label, value]) => {
      const event = typeof value === "string" ? undefined : value;
      return <article key={String(label)}><b>{String(label)}</b>{event ? <dl><dt>Binary prediction</dt><dd>{event.payload.binary.predicted_class_name}</dd><dt>Model Attribution</dt><dd>{titleCase(event.payload.multiclass.predicted_class_name)}</dd><dt>Binary confidence</dt><dd>{(event.payload.binary.confidence * 100).toFixed(1)}%</dd><dt>Recorded binary latency</dt><dd>{event.payload.binary.latency_ms.toFixed(1)} ms</dd></dl> : <p>{label === "QML Prediction" ? "Awaiting QML — no correlated QML result retained" : "No correlated Classical result retained"}</p>}</article>;
    })}</div>
    <p className="scenario-evidence-note">Agreement does not prove correct attribution. It compares binary predictions only when both reference the same feature vector. Multiclass attribution is shown separately and may differ. Missing QML may be pending, unavailable, or outside retention.</p>
    <p>{scope.events.filter((event) => event.event_type === "network_activity").length} correlated network events retained · {scope.features.length} correlated feature vectors retained · {scope.flows.length} current flow windows linked by retained feature provenance</p>
    <details><summary>Correlated flow / feature details</summary><p>Flow joins require an explicit feature flow ID within the current flow window. Unlinked flows are not inferred from target or attack family. The flow read model does not prove exclusive scenario ownership.</p>{scope.features.map((event) => <div key={event.event_id}><b>Feature vector · {event.timestamp}</b><p>Flow: {String(event.payload.flow_id ?? "Not retained")}</p><pre>{JSON.stringify(event.payload.features, null, 2)}</pre></div>)}</details>
  </Panel>;
}

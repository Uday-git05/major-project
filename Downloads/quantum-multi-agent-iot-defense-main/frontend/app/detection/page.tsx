"use client";

import { useLiveRuntime } from "@/components/live-runtime-provider";
import { DetectionPipeline } from "@/components/detection-pipeline";
import { IntelligencePanel } from "@/components/intelligence-panel";
import { PageHeading } from "@/components/page-heading";
import { TrafficPanel } from "@/components/traffic-panel";
import { ScenarioEvidence } from "@/components/scenario-evidence";
import { ScenarioLifecycle } from "@/components/scenario-lifecycle";
import { Disclosure } from "@/components/evidence-disclosure";
import type { EventEnvelope, PredictionPayload } from "@/types/api";
import { formatTime } from "@/lib/format";
import { recentPredictionCorrelations } from "@/features/detection";
import { scenarioAttacks, scenarioQmlPending } from "@/features/scenario-focus";

export default function DetectionPage() {
  const { data, focusedScenario } = useLiveRuntime();
  const qmlAgent = data.agents.find((agent) => agent.agent_id === "quantum-ml-agent");
  const qmlDegraded = !qmlAgent || qmlAgent.health === "degraded" || qmlAgent.health === "unhealthy" || qmlAgent.status === "error";
  const focusedAttack = focusedScenario ? scenarioAttacks(data).find((attack) => attack.attack_id === focusedScenario.attackId) : undefined;
  const focusedEvents = focusedScenario ? data.events.filter((event) => event.correlation_id === focusedScenario.correlationId) : [];
  const focusedHasFeatures = [...data.recentFeatures, ...focusedEvents].some((event) => event.event_type === "feature_vector" && event.correlation_id === focusedScenario?.correlationId);
  const focusedHasQml = focusedEvents.some((event) => event.event_type === "quantum_prediction");
  const qmlQueued = Boolean(focusedScenario && scenarioQmlPending(focusedAttack, focusedHasFeatures,
    data.runtimeStatus.active && data.simulation.state === "running", qmlDegraded, focusedHasQml));
  return <div className="application-page detection-page" data-page="detection">
    <PageHeading eyebrow="03 · Traffic and model evidence" title="Detection Intelligence" purpose="Network traffic analysis with Classical ML and Quantum ML." />
    <div className="detection-stack">
      <TrafficPanel events={data.events} flows={data.flows} featureStatus={data.featureStatus} />
      <IntelligencePanel events={data.events} models={data.models} focusedCorrelation={focusedScenario?.correlationId} qmlQueued={qmlQueued} />
      <RecentPredictionResults events={data.events} focusedCorrelation={focusedScenario?.correlationId} />
      <Disclosure title="Technical details · feature contract and scenario evidence">
        <p>Classical ML is primary detection evidence; QML is asynchronous corroboration. Simulator ground truth remains separate from either prediction.</p>
        <DetectionPipeline />
        <ScenarioLifecycle data={data} focus={focusedScenario ?? null} />
        {focusedScenario && <ScenarioEvidence data={data} focus={focusedScenario} />}
      </Disclosure>
    </div>
  </div>;
}

function RecentPredictionResults({ events, focusedCorrelation }: { events: EventEnvelope[]; focusedCorrelation?: string }) {
  const correlations = recentPredictionCorrelations(events, focusedCorrelation);
  return <section className="recent-results panel"><header className="panel-header"><div><span className="kicker">RECENT MODEL OUTPUTS</span><h2>Recent Detection Results</h2></div><span className="muted">{focusedCorrelation ? "Focused scenario prioritized" : "Bounded retained snapshot"}</span></header>
    {correlations.length ? <div className="recent-results-scroll"><table><thead><tr><th>Time</th><th>Flow / Correlation</th><th>Classical ML</th><th>QML</th><th>Agreement</th><th>Confidence</th></tr></thead><tbody>{correlations.map(correlation => {
      const classical = events.filter(event => event.correlation_id === correlation && event.event_type === "classical_prediction").at(-1);
      const cp = classical?.payload as unknown as PredictionPayload | undefined;
      const quantum = events.filter(event => event.correlation_id === correlation && event.event_type === "quantum_prediction")
        .filter(event => cp?.feature_vector_event_id && (event.payload as unknown as PredictionPayload).feature_vector_event_id === cp.feature_vector_event_id).at(-1);
      const qp = quantum?.payload as unknown as PredictionPayload | undefined;
      const agreement = cp && qp ? cp.binary.predicted_class_id === qp.binary.predicted_class_id ? "Agree" : "Disagree" : "Awaiting QML";
      const last = [classical, quantum].filter(Boolean).sort((a,b) => a!.timestamp.localeCompare(b!.timestamp)).at(-1);
      return <tr key={correlation}><td>{last ? formatTime(last.timestamp) : "—"}</td><td title={correlation}>{correlation.slice(0, 12)}</td><td>{cp?.binary.predicted_class_name ?? "Awaiting"}</td><td>{qp?.binary.predicted_class_name ?? "Awaiting"}</td><td>{agreement}</td><td>{cp ? `${(cp.binary.confidence * 100).toFixed(1)}%` : "—"}</td></tr>;
    })}</tbody></table></div> : <p className="recent-results-empty">No model results are retained yet. Results appear when network flows produce feature vectors.</p>}
  </section>;
}

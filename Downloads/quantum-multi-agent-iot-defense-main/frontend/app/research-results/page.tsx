import { PageHeading } from "@/components/page-heading";
import { formatExact, formatMetric, researchData } from "@/lib/research-data";
import type { ReactNode } from "react";

const binaryQml = researchData.binaryMatched.find((row) => row.model.toLowerCase().includes("qml"));
const multiclassQml = researchData.multiclassMatched.find((row) => row.model.toLowerCase().includes("qml"));

export default function ResearchResultsPage() {
  return <div className="application-page research-page research-dashboard" data-page="research-results">
    <PageHeading eyebrow="07 · Frozen evaluation" title="Model Performance" purpose="Evaluation of the Classical ML and simulator-based Quantum ML components." />
    <p className="research-source-note">Every metric below comes from the frozen production evaluations, matched comparison CSVs, and Phase 16 validation artifacts. Runtime predictions are not used as research metrics.</p>

    <ResearchSection title="Selected Runtime Models" kicker="Production classical metrics use the full test evaluation; QML metrics use the matched controlled experiment." className="research-production">
      <div className="production-model-grid research-model-cards">
        <ModelCard title="Classical Binary · Production" model={researchData.production.binary.model} accuracy={researchData.production.binary.metrics[0].value} macroF1={researchData.production.binary.metrics.find((metric) => metric.label === "Macro F1")!.value} artifact={researchData.production.binary.artifact} family="classical" threshold={researchData.production.binary.threshold} />
        <ModelCard title="Classical Multiclass · Production" model={researchData.production.multiclass.model} accuracy={researchData.production.multiclass.metrics[0].value} macroF1={researchData.production.multiclass.metrics.find((metric) => metric.label === "Macro F1")!.value} artifact={researchData.production.multiclass.artifact} family="classical" />
        {binaryQml && <ModelCard title="Binary QML · Matched" model="5-Qubit Amplitude QML" accuracy={binaryQml.accuracy} macroF1={binaryQml.macroF1} artifact={researchData.production.qmlBinary.artifact} family="qml" threshold={researchData.production.qmlBinary.threshold} />}
        {multiclassQml && <ModelCard title="Multiclass QML · Matched" model="5-Qubit Amplitude QML" accuracy={multiclassQml.accuracy} macroF1={multiclassQml.macroF1} artifact={researchData.production.qmlMulticlass.artifact} family="qml" />}
      </div>
      <p className="research-caption">Production-test and matched-subset scores answer different evaluation questions; compare models only within the matched charts below.</p>
    </ResearchSection>

    <ResearchSection title="Models Evaluated" kicker="The experiment evaluated multiple classical baselines; the runtime uses the selected models listed at right." className="research-evaluated-dashboard">
      <div className="models-evaluated-layout">
        <div className="model-family-card classical-family"><h3>Classical ML</h3><ul><li>Logistic Regression</li><li>Random Forest</li><li>Classical MLP</li><li>XGBoost · production binary</li></ul></div>
        <div className="model-family-card qml-family"><h3>Quantum ML</h3><ul><li>5-Qubit Amplitude QML</li></ul><p>Simulator-based binary and multiclass classifiers.</p></div>
        <div className="runtime-selection-card"><h3>Selected for Runtime</h3><dl><dt>Binary</dt><dd>XGBoost</dd><dt>Multiclass</dt><dd>Logistic Regression</dd><dt>Binary QML</dt><dd>5-Qubit QML</dd><dt>Multiclass QML</dt><dd>5-Qubit QML</dd></dl></div>
      </div>
    </ResearchSection>

    <div className="research-comparison-grid">
      <ResearchSection title="Binary Detection — Model Comparison" kicker="Macro F1 · frozen matched test subset." className="research-comparison binary-comparison">
        <ComparisonChart rows={researchData.binaryMatched} label="Binary detection model comparison" metric="macroF1" />
        <p className="research-takeaway">QML outperformed Logistic Regression and the Classical MLP in this matched experiment, but not Random Forest.</p>
      </ResearchSection>
      <ResearchSection title="Attack Attribution — Model Comparison" kicker="Macro F1 · frozen matched test subset." className="research-comparison multiclass-comparison">
        <ComparisonChart rows={researchData.multiclassMatched} label="Multiclass attribution model comparison" metric="macroF1" />
        <p className="research-takeaway">Multiclass attribution is more challenging; Logistic Regression achieved the best Macro F1 in the matched comparison.</p>
      </ResearchSection>
    </div>
    <ResearchSection title="QML Validation vs Test Performance" kicker="Macro F1 · frozen evaluation notebook values." className="research-qml-generalization">
      <GeneralizationChart />
    </ResearchSection>
    <p className="research-no-advantage">No quantum advantage is claimed. These are controlled, simulator-based comparisons.</p>

    <ResearchSection title="Runtime Benchmarks" kicker="Representative local measurements from the Phase 16 validation run; not hardware-independent benchmarks." className="research-latency-dashboard">
      <LatencyChart />
      <p className="research-takeaway">In this local simulator environment, QML inference is slower than Classical ML.</p>
    </ResearchSection>

    <ResearchSection title="QML Architecture" kicker="The frozen representation and five-qubit model pipeline." className="research-architecture-dashboard">
      <ol className="qml-architecture-flow" aria-label="QML architecture pipeline">
        {["27 ordered network features", "TRAIN-fitted StandardScaler", "L2 normalization", "Append 5 zeros · 27 → 32", "32 amplitude values", "5 qubits", "AmplitudeEmbedding", "3 StronglyEntanglingLayers", "5 Pauli-Z expectation values", "Prediction output layer"].map((step, index) => <li key={step}><span className="architecture-step-number">{String(index + 1).padStart(2, "0")}</span><b>{step}</b>{index < 9 && <i aria-hidden="true">↓</i>}</li>)}
      </ol>
      <div className="architecture-facts"><p><b>Binary output</b><span>nn.Linear(5, 1) · 51 trainable parameters · threshold {researchData.production.qmlBinary.threshold.toFixed(3)}</span></p><p><b>Multiclass output</b><span>nn.Linear(5, 8) · 93 trainable parameters · argmax</span></p><p><b>Preprocessing</b><span>Each model uses its corresponding TRAIN-fitted scaler; no feature reduction or PCA is applied.</span></p><p><b>Execution</b><span>PennyLane simulator on {researchData.qmlDevice}. {researchData.qmlDeviceReason} No quantum hardware execution.</span></p></div>
      <details className="research-technical-disclosure"><summary>Frozen class mapping and experiment context</summary><div className="research-class-grid">{researchData.experiment.classes.map(({ id, label }) => <span key={id}><b>{id}</b>{label}</span>)}</div><p>BotNet_DDOS is excluded from the frozen class mapping. Production test rows: binary {researchData.experiment.binaryTestRows.toLocaleString()}, multiclass {researchData.experiment.multiclassTestRows.toLocaleString()}. Matched binary test samples: {researchData.binaryMatched[0].testSamples.toLocaleString()}; multiclass: {researchData.multiclassMatched[0].testSamples.toLocaleString()}.</p></details>
    </ResearchSection>

    <details className="research-notes"><summary>Research Notes</summary><ResearchSection title="Known Limitations" kicker="Validated scope boundaries for interpreting the results." className="research-limitations-dashboard">
      <ul className="research-limitations-list"><li>QML is simulator-based; no quantum advantage is claimed.</li><li>QML is slower than Classical ML in this environment.</li><li>Multiclass attribution remains challenging and tentative.</li><li>Classical and QML may disagree; binary predictions are reported independently.</li><li>Compatibility-layer normal traffic produced substantial false-positive-style signals in validation.</li><li>Recovery may require manual review; success requires a verified recovery state.</li><li>Runtime state is process-local and in-memory, not durable across backend restarts.</li></ul>
      <p className="research-limit-detail">The feature-only approximately 89.49% ceiling is an ambiguity-analysis result on the complete raw dataset, not a model accuracy measurement. Matched multiclass evaluation also has a known feature-group split limitation.</p>
    </ResearchSection></details>

    <details className="research-technical-disclosure research-artifact-disclosure"><summary>Reproducibility and artifact integrity</summary><p>{researchData.validation.artifactIntegrityPassed ? `The ${researchData.validation.artifactCount} frozen files in the Phase 16 integrity manifest passed SHA-256 validation during final validation.` : "Artifact integrity validation did not pass in the final validation manifest."}</p><p>Values are loaded from the frozen evaluation records and matched CSVs. Model files, thresholds, feature order, and experiment splits remain unchanged.</p></details>
  </div>;
}

function ModelCard({ title, model, accuracy, macroF1, artifact, family, threshold }: { title: string; model: string; accuracy: number; macroF1: number; artifact: string; family: "classical" | "qml"; threshold?: number }) {
  return <article className={`production-model ${family}`}><span>{title}</span><h3>{model}</h3><div className="research-model-metric"><b>{formatMetric(accuracy, "percent")}</b><small>Test accuracy</small></div><p>Macro F1 <strong>{formatMetric(macroF1, "percent")}</strong></p>{threshold !== undefined && <small>Frozen threshold {threshold.toFixed(3)}</small>}<code>{artifact}</code></article>;
}

function ComparisonChart({ rows, label, metric }: { rows: ReadonlyArray<{ model: string; accuracy: number; macroF1: number }>; label: string; metric: "accuracy" | "macroF1" }) {
  return <div className="comparison-chart" role="img" aria-label={label}>
    <div className="comparison-chart-head"><span>MODEL</span><span>{metric === "macroF1" ? "MACRO F1" : "ACCURACY"}</span></div>
    {rows.map((row) => <div className={`comparison-chart-row single-metric ${row.model.toLowerCase().includes("qml") ? "qml" : "classical"}`} key={row.model}>
      <b className="comparison-chart-model">{row.model}</b>
      <MetricBar value={row[metric]} label={`${row.model} ${metric === "macroF1" ? "Macro F1" : "accuracy"}`} />
    </div>)}
    <p className="comparison-chart-scale">Bars share a 0–1 scale · exact frozen values shown to six decimals</p>
  </div>;
}

function GeneralizationChart() {
  const data = [
    { model: "Binary QML", validation: 0.959969, test: 0.960962 },
    { model: "Multiclass QML", validation: 0.550067, test: 0.350461 },
  ];
  return <div className="generalization-chart" role="img" aria-label="QML validation and test Macro F1 comparison">
    <div className="generalization-head"><span>MODEL</span><span>VALIDATION MACRO F1</span><span>TEST MACRO F1</span></div>
    {data.map((row) => <div className="generalization-row" key={row.model}><b>{row.model}</b><MetricBar value={row.validation} label={`${row.model} validation Macro F1`} /><MetricBar value={row.test} label={`${row.model} test Macro F1`} /></div>)}
  </div>;
}

function MetricBar({ value, label }: { value: number; label: string }) {
  return <div className="comparison-metric" aria-label={`${label}: ${formatExact(value)} (${(value * 100).toFixed(2)}%)`}><div className="comparison-track"><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div><strong>{formatExact(value)}</strong></div>;
}

function LatencyChart() {
  const maxLatency = Math.max(...researchData.latency.map((measurement) => measurement.value));
  return <div className="latency-dashboard-chart">{researchData.latency.map((measurement) => <div className={`latency-dashboard-row ${measurement.kind}`} key={measurement.label}><span>{measurement.label}</span><div className="latency-dashboard-track"><i style={{ width: `${Math.max(1, measurement.value / maxLatency * 100)}%` }} /></div><strong>{measurement.value.toFixed(3)} <small>ms</small></strong><code>{formatExact(measurement.value)}</code></div>)}</div>;
}

function ResearchSection({ title, kicker, className, children }: { title: string; kicker?: string; className: string; children: ReactNode }) {
  const id = `research-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return <section className={`panel research-section ${className}`} aria-labelledby={id}><header className="panel-header"><div><h2 id={id}>{title}</h2>{kicker && <p className="panel-description">{kicker}</p>}</div></header><div className="panel-body">{children}</div></section>;
}

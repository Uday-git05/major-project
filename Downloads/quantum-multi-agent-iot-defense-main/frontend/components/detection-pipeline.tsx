import { Braces, Cpu, Network, Rows3 } from "lucide-react";
import { FROZEN_FEATURE_NAMES } from "@/features/detection";
import { Panel } from "./ui";

const stages = [
  { label: "Network Events", detail: "Individual virtual communication activity", icon: Network },
  { label: "Flow Aggregation", detail: "Related events grouped into a communication session", icon: Rows3 },
  { label: "27 Ordered Features", detail: "Frozen, reproducible numerical representation", icon: Braces },
  { label: "Classical ML / QML", detail: "Primary detection with asynchronous corroboration", icon: Cpu },
];

export function DetectionPipeline() { return <Panel title="27-Feature Pipeline" kicker="One frozen and reproducible representation is supplied to both inference paths." className="detection-pipeline-panel"><div className="detection-pipeline-flow">{stages.map((stage, index) => { const Icon = stage.icon; return <div className="detection-pipeline-stage" key={stage.label}><span><Icon aria-hidden="true" /></span><div><b>{stage.label}</b><small>{stage.detail}</small></div>{index < stages.length - 1 && <i aria-hidden="true">→</i>}</div>; })}</div><p className="pipeline-contract-note">The order and meaning of all 27 features are fixed. No PCA or dimensionality reduction is applied.</p><details className="feature-disclosure"><summary>View 27 Features <span>Exact contract order</span></summary><ol>{FROZEN_FEATURE_NAMES.map((name) => <li key={name}><code>{name}</code></li>)}</ol></details></Panel>; }

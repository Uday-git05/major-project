import { Activity, GitCompareArrows, Network, ScanSearch } from "lucide-react";
import { deriveDetectionEvidence, type AgreementState } from "@/features/detection";
import { titleCase } from "@/lib/format";
import type { DashboardSnapshot } from "@/types/api";
import { Badge } from "./ui";

export function CurrentDetectionState({ data }: { data: DashboardSnapshot }) {
  const evidence = deriveDetectionEvidence(data.events);
  const prediction = evidence.classical;
  const deviceNames = prediction?.device_ids.map((id) => data.devices.find((device) => device.device_id === id)?.name ?? id) ?? [];
  const context = deviceNames.length ? deviceNames.join(", ") : data.flows[0] ? `${data.flows[0].source_device_id} → ${data.flows[0].destination_device_id}` : "No active flow context";
  const comparison = agreementText(evidence.agreement);
  return <section className="current-detection-state" aria-labelledby="current-detection-heading"><header><div><span>RETAINED MODEL OUTPUT</span><h2 id="current-detection-heading">Latest Retained Prediction</h2></div><Badge value={comparison} tone={evidence.agreement === "agreement" ? "healthy" : evidence.agreement === "disagreement" ? "medium" : "info"} /></header><div className="detection-state-grid"><StateFact icon={<ScanSearch />} label="Classical ML Prediction" value={prediction?.binary.predicted_class_name ?? "No prediction"} tone={prediction?.binary.predicted_class_id === 1 ? "threat" : ""} /><StateFact icon={<Activity />} label="Tentative attribution" value={prediction ? titleCase(prediction.multiclass.predicted_class_name) : "Not available"} /><StateFact icon={<GitCompareArrows />} label="Model comparison" value={comparison} /><StateFact icon={<Network />} label="Affected context" value={context} /></div><footer><span><b>Simulator ground truth:</b> {data.activeAttacks.some((attack) => attack.status === "active") ? `${data.activeAttacks.filter((attack) => attack.status === "active").length} synthetic scenario(s) active` : "No synthetic attack active"}. This is independent of model output.</span><span><b>Prediction</b> is model output.</span><span><b>Severity</b> is assigned separately by the Threat Analysis Agent at incident level.</span></footer></section>;
}

function StateFact({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) { return <div className={`detection-state-fact ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }
export function agreementText(value: AgreementState) { if (value === "agreement") return "Agree"; if (value === "disagreement") return "Disagree"; if (value === "awaiting_qml") return "Awaiting QML"; return "No prediction retained"; }

"use client";

import { useMemo, useState } from "react";
import type { ActiveFlow, EventEnvelope, FeatureStatus } from "@/types/api";
import { compactNumber, titleCase } from "@/lib/format";
import { Empty, Panel } from "./ui";

const metricHelp = {
  "Retained Network Events": "Network activity events in the bounded live snapshot; no fixed time window.",
  "Current Flow Windows": "Flow windows currently held by the extractor; collection may be paused.",
  "Cumulative Feature Vectors": "Feature vectors emitted since the feature extractor was last reset.",
  "Retained Synthetic Events": "Synthetic-to-target network events in the bounded snapshot; not model detections.",
};

export function TrafficPanel({ events, flows, featureStatus }: { events: EventEnvelope[]; flows: ActiveFlow[]; featureStatus: FeatureStatus }) {
  const [selected, setSelected] = useState<ActiveFlow | null>(null);
  const network = useMemo(() => events.filter((e) => e.event_type === "network_activity"), [events]);
  const attack = network.filter((e) => (e.payload as { direction?: string }).direction === "synthetic_to_target");
  const services = new Map<string, number>(); network.forEach((e) => { const s = String((e.payload as { service?: string }).service ?? "unknown"); services.set(s, (services.get(s) ?? 0) + 1); });
  const protocols = useMemo(() => { const counts = new Map<string, number>(); for (const flow of flows) counts.set(flow.protocol, (counts.get(flow.protocol) ?? 0) + 1); return [...counts.entries()].sort((a,b) => b[1]-a[1]); }, [flows]);
  return <Panel title="Network Activity" kicker="Each metric has its own scope: retained events, current flow windows, or cumulative extraction." className="traffic-panel detection-traffic-panel">
    <div className="metric-strip detection-metrics"><Metric label="Retained Network Events" value={compactNumber(network.length)} /><Metric label="Current Flow Windows" value={String(flows.length)} /><Metric label="Cumulative Feature Vectors" value={compactNumber(featureStatus.vectors_emitted)} /><Metric label="Retained Synthetic Events" value={String(attack.length)} /></div>
    <div className="flow-layout"><div><h3>Current flow windows <span>{flows.length} current</span></h3>{!flows.length ? <Empty>No flow windows currently held by the extractor.</Empty> : <div className="flow-list detection-flow-list">{flows.slice(0, 12).map((flow) => { const state = flowState(flow, network); const service = flowService(flow, network); return <button key={flow.flow_id} title={flow.flow_id} onClick={() => setSelected(flow)}><span><b>{flow.source_device_id}</b><small>{flow.source_address}:{flow.source_port}</small></span><span className="flow-direction" aria-hidden="true">→</span><span><b>{flow.destination_device_id}</b><small>{flow.destination_address}:{flow.destination_port}</small></span><span><b>{titleCase(service)}</b><small>{flow.protocol}</small></span><strong>{flow.packet_count} pkt<small>{state}</small></strong></button>; })}</div>}</div>
      <aside className="traffic-insights"><div className="service-rank"><h3 title="Service counts from retained network events, not cumulative totals or rates.">Top services · retained events</h3>{!services.size && <p className="muted">No retained service activity.</p>}{[...services.entries()].sort((a,b) => b[1]-a[1]).slice(0,5).map(([name,count]) => <div key={name}><span>{titleCase(name)}</span><i><em style={{ width: `${Math.min(100, count / Math.max(1, network.length) * 100)}%` }} /></i><b>{count}</b></div>)}</div><div className="protocol-mix"><h3>Protocol mix · current flow windows</h3>{protocols.length ? protocols.map(([protocol,count]) => <div key={protocol}><span>{protocol}</span><meter min={0} max={flows.length} value={count} aria-label={`${protocol} flow windows`} /><b>{count}</b></div>) : <p className="muted">No current flow windows.</p>}<p>Snapshot counts, not a traffic rate or trend.</p></div></aside></div>
    {selected && <div className="flow-detail"><button onClick={() => setSelected(null)}>Close</button><div><small>Full flow identifier</small><b>{selected.flow_id}</b></div><span>{selected.protocol} · {titleCase(flowService(selected, network))} · {selected.packet_count} packets · {selected.source_event_count} source events</span></div>}
  </Panel>;
}
function Metric({ label, value }: { label: keyof typeof metricHelp; value: string }) { return <div title={metricHelp[label]}><span>{label}<i aria-hidden="true">i</i></span><strong>{value}</strong><small>{metricHelp[label]}</small></div>; }
function flowState(flow: ActiveFlow, network: EventEnvelope[]) { const synthetic = network.some((event) => { const payload = event.payload as { source_device_id?: string; destination_device_id?: string; direction?: string }; return payload.source_device_id === flow.source_device_id && payload.destination_device_id === flow.destination_device_id && payload.direction === "synthetic_to_target"; }); return synthetic ? "Synthetic attack" : "Observed flow"; }
function flowService(flow: ActiveFlow, network: EventEnvelope[]) { const match = [...network].reverse().find((event) => { const payload = event.payload as { source_device_id?: string; destination_device_id?: string }; return payload.source_device_id === flow.source_device_id && payload.destination_device_id === flow.destination_device_id; }); return String((match?.payload as { service?: string } | undefined)?.service ?? "unknown service"); }

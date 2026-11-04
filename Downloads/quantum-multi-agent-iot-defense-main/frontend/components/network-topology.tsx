"use client";

import { Cpu, Droplets, Gauge, RadioTower, Router, Thermometer, Wind, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { mapTopology, TOPOLOGY_VIEWBOX } from "@/features/topology";
import type { Attack, Device, PolicyState, Topology } from "@/types/api";
import { titleCase } from "@/lib/format";
import { Badge, Panel } from "./ui";

const icons: Record<string, React.ComponentType<{ size?: number }>> = {
  gateway: Router,
  soil_moisture_sensor: Droplets,
  temperature_sensor: Thermometer,
  humidity_sensor: Gauge,
  water_flow_sensor: Droplets,
  pump_controller: Zap,
  weather_node: Wind,
  synthetic_source: RadioTower,
};

interface NetworkTopologyProps { topology: Topology; devices: Device[]; attacks: Attack[]; policy: PolicyState; focusedCorrelationId?: string; selectedDeviceId?: string | null; onSelectDevice?: (deviceId: string | null) => void; }

export function NetworkTopology({ topology, devices, attacks, policy, focusedCorrelationId, selectedDeviceId, onSelectDevice }: NetworkTopologyProps) {
  const graph = useMemo(() => mapTopology(topology, devices, attacks, policy, focusedCorrelationId), [topology, devices, attacks, policy, focusedCorrelationId]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const effectiveSelectedId = selectedDeviceId === undefined ? internalSelectedId : selectedDeviceId;
  const selected = graph.nodes.find((node) => node.id === effectiveSelectedId) ?? null;
  const [hoveredId, setHoveredId] = useState<string>();
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const focusedId = hoveredId ?? selected?.id;

  return <Panel title="Live Network Topology" kicker="Virtual devices and their current communication relationships." className="topology-panel" action={<div className="legend"><i className="normal" />Normal<i className="attack" />Attack<i className="blocked" />Blocked</div>}>
    <div className="topology-canvas" data-testid="topology-canvas">
      <svg viewBox={`0 0 ${TOPOLOGY_VIEWBOX.width} ${TOPOLOGY_VIEWBOX.height}`} preserveAspectRatio="none" aria-hidden="true">
        {graph.edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const connected = focusedId === edge.source || focusedId === edge.target;
          return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`topology-edge ${edge.state}${connected ? " connected" : ""}`} />;
        })}
      </svg>
      {graph.nodes.map((node) => {
        const Icon = icons[node.kind] ?? Cpu;
        return <button
          key={node.id}
          className={`topology-node ${node.status} ${node.scenarioTarget ? `scenario-${node.scenarioTarget}` : ""} ${selected?.id === node.id ? "selected" : ""}`}
          style={{ left: `${node.x / 10}%`, top: `${node.y / 4.8}%` }}
          onClick={() => { setInternalSelectedId(node.id); onSelectDevice?.(node.id); }}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(undefined)}
          aria-label={`Inspect ${node.label}${node.scenarioTarget ? `; focused scenario target ${node.scenarioTarget}` : ""}`}
          aria-pressed={selected?.id === node.id}
        >
          <span className="topology-node-icon"><Icon size={18} /></span>
          <b>{node.label}</b>
          <small>{node.address}</small>
          <em><i />{titleCase(node.status)}</em>
        </button>;
      })}
    </div>
    {selected && <aside className="node-inspector">
      <button aria-label="Close inspector" onClick={() => { setInternalSelectedId(null); onSelectDevice?.(null); }}>×</button>
      <div><span className="kicker">NODE INSPECTOR</span><h3>{selected.label}</h3></div>
      <Badge value={selected.status} />
      <dl><dt>Type</dt><dd>{titleCase(selected.kind)}</dd><dt>Address</dt><dd>{selected.address}</dd><dt>Health</dt><dd>{selected.health}</dd><dt>Source</dt><dd>{selected.synthetic ? "Simulator truth" : "Virtual topology"}</dd></dl>
    </aside>}
  </Panel>;
}

import type { Attack, Device, PolicyState, Topology } from "@/types/api";

export const TOPOLOGY_VIEWBOX = { width: 1000, height: 480 } as const;
export const TOPOLOGY_NODE_SIZE = { width: 150, height: 78 } as const;

export interface SocNode {
  id: string;
  label: string;
  kind: string;
  status: string;
  health: string;
  address: string;
  synthetic: boolean;
  scenarioTarget?: "attack" | "blocked";
  x: number;
  y: number;
}

export interface SocEdge {
  id: string;
  source: string;
  target: string;
  state: "normal" | "attack" | "blocked";
}

type UnpositionedNode = Omit<SocNode, "x" | "y">;

/** Keep the gateway anchored while distributing every other node over a bounded ellipse. */
export function positionTopologyNodes(nodes: UnpositionedNode[], gatewayId: string): SocNode[] {
  const gateway = nodes.find((node) => node.id === gatewayId);
  const peripheral = nodes.filter((node) => node.id !== gatewayId);
  const centerX = TOPOLOGY_VIEWBOX.width / 2;
  const centerY = TOPOLOGY_VIEWBOX.height / 2;
  const radiusX = 365;
  const radiusY = 162;
  const positioned = peripheral.map((node, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(peripheral.length, 1);
    return { ...node, x: Math.round(centerX + Math.cos(angle) * radiusX), y: Math.round(centerY + Math.sin(angle) * radiusY) };
  });
  return gateway ? [{ ...gateway, x: centerX, y: centerY }, ...positioned] : positioned;
}

export function mapTopology(topology: Topology, devices: Device[], attacks: Attack[], policy: PolicyState, focusedCorrelationId?: string) {
  const focusedAttacks = focusedCorrelationId ? attacks.filter((attack) => attack.correlation_id === focusedCorrelationId) : [];
  const focused = focusedAttacks.find((attack) => attack.status === "active" || attack.status === "scheduled"
    || (attack.status === "completed" && (policy.quarantined_sources.includes(attack.source_device_id) || policy.isolated_devices.includes(attack.target_device_id))));
  const targetBlocked = focused ? policy.quarantined_sources.includes(focused.source_device_id) || policy.isolated_devices.includes(focused.target_device_id) : false;
  const deviceMap = new Map(devices.map((device) => [device.device_id, device]));
  const nodes: UnpositionedNode[] = topology.nodes.map((node) => {
    const device = deviceMap.get(node.device_id);
    return {
      id: node.device_id,
      label: node.name,
      kind: node.device_type,
      status: policy.isolated_devices.includes(node.device_id) ? "isolated" : device?.status ?? "unknown",
      health: device?.health ?? "unknown",
      address: node.address,
      synthetic: false,
      ...(focused?.target_device_id === node.device_id ? { scenarioTarget: targetBlocked ? "blocked" as const : "attack" as const } : {}),
    };
  });
  const active = focusedAttacks.filter((attack) => attack.status === "active" || (attack.status === "completed"
    && (policy.quarantined_sources.includes(attack.source_device_id) || policy.isolated_devices.includes(attack.target_device_id))));
  active.forEach((attack, index) => nodes.push({
    id: attack.source_device_id,
    label: `Synthetic source ${index + 1}`,
    kind: "synthetic_source",
    status: policy.quarantined_sources.includes(attack.source_device_id) ? "quarantined" : attack.status,
    health: "simulator",
    address: String(attack.metadata.synthetic_source_address ?? "virtual"),
    synthetic: true,
  }));
  const edges: SocEdge[] = topology.links.map((link, index) => ({
    id: `normal-${index}`,
    source: link.source_device_id,
    target: link.destination_device_id,
    state: policy.isolated_devices.includes(link.source_device_id) ? "blocked" : "normal",
  }));
  active.forEach((attack) => edges.push({
    id: `attack-${attack.attack_id}`,
    source: attack.source_device_id,
    target: attack.target_device_id,
    state: policy.quarantined_sources.includes(attack.source_device_id) ? "blocked" : "attack",
  }));
  return { nodes: positionTopologyNodes(nodes, topology.gateway_id), edges };
}

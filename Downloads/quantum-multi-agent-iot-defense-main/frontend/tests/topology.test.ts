import { describe, expect, it } from "vitest";
import { mapTopology, positionTopologyNodes, TOPOLOGY_NODE_SIZE, TOPOLOGY_VIEWBOX } from "@/features/topology";
import type { Attack, Device, PolicyState, Topology } from "@/types/api";
describe("topology mapping", () => {
  it("maps backend nodes, active synthetic sources, and policy blocks", () => {
    const topology = { gateway_id: "g", nodes: [{ device_id: "g", device_type: "gateway", name: "Gateway", address: "10.0.0.1" }, { device_id: "s", device_type: "temperature_sensor", name: "Sensor", address: "10.0.0.2" }], links: [{ source_device_id: "s", destination_device_id: "g", relationship: "telemetry" }] } as Topology;
    const devices = topology.nodes.map((n) => ({ ...n, protocol: "TCP", service: "mqtt", status: "online", health: "healthy", last_seen: null, telemetry_state: {}, network_profile: {} })) as unknown as Device[];
    const attack = { attack_id: "a", correlation_id: "focus", source_device_id: "synthetic-source-1", target_device_id: "g", status: "active", metadata: {} } as Attack;
    const policy = { isolated_devices: ["s"], quarantined_sources: ["synthetic-source-1"], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 2 } as PolicyState;
    const graph = mapTopology(topology, devices, [attack], policy, "focus");
    expect(graph.nodes.find((n) => n.id === "s")?.status).toBe("isolated"); expect(graph.nodes.find((n) => n.synthetic)?.status).toBe("quarantined"); expect(graph.edges.every((e) => e.state === "blocked")).toBe(true);
  });

  it("renders only the focused scenario path and marks its target according to applied policy", () => {
    const topology = { gateway_id: "g", nodes: [{ device_id: "g", device_type: "gateway", name: "Gateway", address: "10.0.0.1" }, { device_id: "s", device_type: "sensor", name: "Sensor", address: "10.0.0.2" }], links: [] } as Topology;
    const devices = topology.nodes.map((n) => ({ ...n, protocol: "TCP", service: "mqtt", status: "online", health: "healthy", last_seen: null, telemetry_state: {}, network_profile: {} })) as unknown as Device[];
    const focused = { attack_id: "focused", correlation_id: "focus", source_device_id: "source-focused", target_device_id: "s", status: "active", metadata: {} } as Attack;
    const unrelated = { ...focused, attack_id: "unrelated", correlation_id: "other", source_device_id: "source-other", target_device_id: "g" };
    const policy = { isolated_devices: [], quarantined_sources: [], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 0 } as PolicyState;
    const graph = mapTopology(topology, devices, [focused, unrelated], policy, "focus");
    expect(graph.edges.filter((edge) => edge.state === "attack")).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.synthetic)).toHaveLength(1);
    expect(graph.nodes.find((node) => node.id === "s")?.scenarioTarget).toBe("attack");
    const defended = mapTopology(topology, devices, [focused, unrelated], { ...policy, quarantined_sources: [focused.source_device_id] }, "focus");
    expect(defended.edges.filter((edge) => edge.state === "blocked")).toHaveLength(1);
    expect(defended.nodes.find((node) => node.id === "s")?.scenarioTarget).toBe("blocked");
  });

  it("anchors the gateway and keeps the standard eight-node layout collision free", () => {
    const nodes = ["gateway", "soil-1", "soil-2", "temperature", "humidity", "flow", "pump", "weather"].map((id) => ({
      id, label: id, kind: id === "gateway" ? "gateway" : "sensor", status: "online", health: "healthy", address: "10.42.0.1", synthetic: false,
    }));
    const positioned = positionTopologyNodes(nodes, "gateway");
    expect(positioned.find((node) => node.id === "gateway")).toMatchObject({ x: TOPOLOGY_VIEWBOX.width / 2, y: TOPOLOGY_VIEWBOX.height / 2 });
    for (let first = 0; first < positioned.length; first += 1) {
      for (let second = first + 1; second < positioned.length; second += 1) {
        const a = positioned[first];
        const b = positioned[second];
        const overlaps = Math.abs(a.x - b.x) < TOPOLOGY_NODE_SIZE.width && Math.abs(a.y - b.y) < TOPOLOGY_NODE_SIZE.height;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

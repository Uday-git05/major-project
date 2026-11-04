import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { NetworkTopology } from "@/components/network-topology";
import type { Device, PolicyState, Topology } from "@/types/api";

const topology: Topology = {
  gateway_id: "gateway",
  nodes: [
    { device_id: "gateway", device_type: "gateway", name: "Farm Gateway", address: "10.42.0.1" },
    { device_id: "sensor", device_type: "temperature_sensor", name: "Temperature Sensor", address: "10.42.0.2" },
  ],
  links: [{ source_device_id: "sensor", destination_device_id: "gateway", relationship: "telemetry" }],
};

const devices = topology.nodes.map((node) => ({
  ...node,
  protocol: "TCP",
  service: "mqtt",
  status: "online",
  health: "healthy",
  last_seen: null,
  telemetry_state: {},
  network_profile: {},
})) as Device[];

const policy = { isolated_devices: [], quarantined_sources: [], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 0 } as PolicyState;

describe("NetworkTopology", () => {
  it("renders separate node details and preserves click-to-inspect behavior", () => {
    const { container } = render(<NetworkTopology topology={topology} devices={devices} attacks={[]} policy={policy} />);
    expect(screen.getByText("10.42.0.2")).toBeInTheDocument();
    expect(screen.getAllByText("Online")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Temperature Sensor" }));
    expect(screen.getByText("NODE INSPECTOR")).toBeInTheDocument();
    expect(container.querySelector(".topology-edge.connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByText("NODE INSPECTOR")).not.toBeInTheDocument();
  });

  it("supports shared controlled selection without changing topology semantics", () => {
    const onSelect = vi.fn();
    render(<NetworkTopology topology={topology} devices={devices} attacks={[]} policy={policy} selectedDeviceId="sensor" onSelectDevice={onSelect} />);
    expect(screen.getByText("NODE INSPECTOR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect Temperature Sensor" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

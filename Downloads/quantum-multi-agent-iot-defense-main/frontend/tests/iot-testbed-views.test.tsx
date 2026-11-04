import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardSnapshot } from "./fixtures";
import { visualData } from "./visual-fixtures";
import type { Attack } from "@/types/api";

const mocks = vi.hoisted(() => ({ useLiveRuntime: vi.fn() }));
vi.mock("@/components/live-runtime-provider", () => ({ useLiveRuntime: mocks.useLiveRuntime }));
vi.mock("@react-three/fiber", () => ({ Canvas: () => null }));
vi.mock("@react-three/drei", () => ({ Line: () => null, OrbitControls: () => null }));

import IotTestbedPage from "@/app/iot-testbed/page";

afterEach(() => { vi.restoreAllMocks(); mocks.useLiveRuntime.mockReset(); });

describe("IoT testbed views", () => {
  it("uses one shared runtime hook, switches views, and preserves real-device selection", async () => {
    const data = visualData();
    const focusedAttack = { attack_id: "focused", correlation_id: "focus-1", attack_type: "TCP_Flood", target_device_id: "humidity-01", source_device_id: "synthetic-source-1", status: "active", metadata: { synthetic_source_address: "172.31.0.1" } } as unknown as Attack;
    const unrelatedAttack = { ...focusedAttack, attack_id: "unrelated", correlation_id: "focus-2", target_device_id: "soil_moisture-01", source_device_id: "synthetic-source-2" };
    data.attacks = [focusedAttack, unrelatedAttack]; data.runtimeStatus.active = true; data.simulation.state = "running";
    mocks.useLiveRuntime.mockReturnValue({ data, telemetry: {}, connection: "live", focusedScenario: { attackId: "focused", correlationId: "focus-1", attackType: "TCP_Flood", target: "humidity-01", startTick: 1 } });
    const { container } = render(<IotTestbedPage />);
    expect(mocks.useLiveRuntime).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: "Farm View" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: /Illustrated virtual smart farm with 8 runtime devices/ })).toBeInTheDocument();
    for (const device of data.devices) expect(screen.getByRole("button", { name: new RegExp(`Inspect ${device.name}`) })).toBeInTheDocument();
    expect(container.querySelectorAll(".farm-link.attack")).toHaveLength(1);
    expect(container.querySelectorAll("foreignObject")[2]).toHaveAttribute("x", "-155");
    expect(container.querySelectorAll("foreignObject")[5]).toHaveAttribute("x", "16");
    expect(container.querySelectorAll("foreignObject")[6]).toHaveAttribute("x", "-50");

    fireEvent.click(screen.getByRole("tab", { name: "Topology View" }));
    expect(screen.getByRole("heading", { name: "Live Network Topology" })).toBeInTheDocument();
    expect(container.querySelectorAll(".topology-edge.attack")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Inspect Humidity Sensor 1; focused scenario target attack/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Inspect Synthetic source/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Farm Gateway" }));
    expect(screen.getByText("NODE INSPECTOR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Farm View" }));
    expect(screen.getByRole("heading", { name: "Farm Gateway" })).toBeInTheDocument();
    expect(screen.getByText("SELECTED RUNTIME DEVICE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Advanced 3D View" }));
    expect(screen.getByRole("heading", { name: "Advanced 3D Farm View" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Farm Gateway" })).toBeInTheDocument();
    expect(screen.getByText(/Focused target: Humidity Sensor 1/)).toBeInTheDocument();
  });

  it("keeps topology and telemetry usable when WebGL is unavailable", async () => {
    mocks.useLiveRuntime.mockReturnValue({ data: dashboardSnapshot(), telemetry: {}, connection: "live" });
    Object.defineProperty(window, "WebGLRenderingContext", { configurable: true, value: undefined });
    render(<IotTestbedPage />);
    expect(screen.getByRole("img", { name: /Illustrated virtual smart farm/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Advanced 3D View" }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });
    await waitFor(() => expect(screen.getByText("3D view unavailable")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Testbed status and telemetry" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Network Topology" }));
    expect(screen.getByRole("heading", { name: "Live Network Topology" })).toBeInTheDocument();
  });
});

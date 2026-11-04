import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestbedTelemetryStrip } from "@/components/testbed-telemetry-strip";
import { AgentGrid } from "@/components/agent-grid";
import { TrafficPanel } from "@/components/traffic-panel";
import { IntelligencePanel } from "@/components/intelligence-panel";
import { visualData } from "./visual-fixtures";
import { positionDevices } from "@/features/digital-twin";

afterEach(() => vi.restoreAllMocks());
describe("Phase 4 visual presentation", () => {
  it("uses exactly the eight supplied devices and real telemetry, not made-up pump effects", () => {
    const data = visualData();
    expect(data.devices).toHaveLength(8);
    expect(positionDevices(data.devices).size).toBe(8);
    render(<TestbedTelemetryStrip devices={data.devices} active state="running" />);
    expect(screen.getByText("8 runtime devices · latest snapshot")).toBeInTheDocument();
    expect(screen.getByText("44 %")).toBeInTheDocument();
    expect(screen.getByText("0.1 L/min")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
  it("does not imply active collection while stopped", () => {
    render(<TestbedTelemetryStrip devices={visualData().devices} active={false} state="stopped" />);
    expect(screen.getByText(/Collection is not running/)).toBeInTheDocument();
  });
  it("animates only a changed reported value, never initial or stopped data", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as never;
    try {
      const data = visualData();
      const {rerender} = render(<TestbedTelemetryStrip devices={data.devices} active state="running" />);
      expect(animate).not.toHaveBeenCalled();
      const changed = data.devices.map(d => d.device_id === "soil_moisture-01" ? {...d,telemetry_state:{moisture_percent:45}} : d);
      rerender(<TestbedTelemetryStrip devices={changed} active state="running" />);
      expect(animate).toHaveBeenCalledTimes(1);
      rerender(<TestbedTelemetryStrip devices={data.devices} active={false} state="stopped" />);
      expect(animate).toHaveBeenCalledTimes(1);
    } finally { HTMLElement.prototype.animate = original; vi.unstubAllGlobals(); }
  });
  it("respects reduced motion even when live readings change", () => {
    const animate = vi.fn(); const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    try {
      const data = visualData();
      const {rerender} = render(<TestbedTelemetryStrip devices={data.devices} active state="running" />);
      rerender(<TestbedTelemetryStrip devices={data.devices.map(d => ({...d,telemetry_state:{temperature_c:23}}))} active state="running" />);
      expect(animate).not.toHaveBeenCalled();
    } finally { HTMLElement.prototype.animate = original; vi.unstubAllGlobals(); }
  });
  it("connects six agents with parallel detection and keeps non-agents outside", () => {
    const data = visualData(); render(<AgentGrid agents={data.agents} audit={[]} />);
    const pipeline = screen.getByRole("region", {name:"Six-agent architecture"});
    expect(within(pipeline).getAllByRole("button")).toHaveLength(6);
    expect(within(pipeline).queryByText("Attack Controller")).not.toBeInTheDocument();
    expect(within(pipeline).queryByText("Feature Extraction Manager")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Supporting Components/ })).toBeInTheDocument();
    expect(screen.getByText("Not agents")).toBeInTheDocument();
    fireEvent.click(within(pipeline).getByRole("button", {name:/Quantum ML Agent/}));
    expect(screen.getByText(/TRAIN-fitted StandardScaler/)).toBeInTheDocument();
    expect(screen.getAllByText("Input",{selector:"b"})).toHaveLength(1);
  });
  it("uses actual current flow counts for protocol bars and provides research context", () => {
    const data = visualData();
    const {unmount} = render(<TrafficPanel events={data.events} flows={data.flows} featureStatus={data.featureStatus} />);
    expect(screen.getByRole("meter",{name:"TCP flow windows"})).toHaveAttribute("value","4");
    expect(screen.getByRole("meter",{name:"UDP flow windows"})).toHaveAttribute("value","3");
    expect(screen.getByText("Snapshot counts, not a traffic rate or trend.")).toBeInTheDocument(); unmount();
    render(<IntelligencePanel events={[]} models={data.models} />);
    expect(screen.getByRole("link",{name:/View Evaluated Models/})).toHaveAttribute("href","/research-results");
    expect(screen.getByText(/Research baselines are not all executed live/)).toBeInTheDocument();
  });
});

"use client";

import { useLiveRuntime } from "@/components/live-runtime-provider";
import { FarmDigitalTwin } from "@/components/farm-digital-twin";
import { SmartFarmView } from "@/components/smart-farm-view";
import { NetworkTopology } from "@/components/network-topology";
import { PageHeading } from "@/components/page-heading";
import { TelemetryPanel } from "@/components/telemetry-panel";
import { TestbedTelemetryStrip } from "@/components/testbed-telemetry-strip";
import { Disclosure } from "@/components/evidence-disclosure";
import { useState } from "react";

export default function IotTestbedPage() {
  const { data, telemetry, focusedScenario, refresh, beginScenarioFocus } = useLiveRuntime();
  const [view, setView] = useState<"farm" | "topology" | "3d">("farm");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  return <div className="application-page testbed-page" data-page="iot-testbed">
    <PageHeading eyebrow="02 · Virtual environment" title="Virtual Smart Farm Testbed" purpose="Simulated IoT devices with live sensor data and network communication." />
    <TestbedTelemetryStrip devices={data.devices} active={data.runtimeStatus.active} state={data.simulation.state} />
    <div className="testbed-view-tabs" role="tablist" aria-label="Testbed view">
      <button role="tab" aria-selected={view === "farm"} onClick={() => setView("farm")}>Farm View</button>
      <button role="tab" aria-selected={view === "topology"} onClick={() => setView("topology")}>Topology View</button>
      <button role="tab" aria-selected={view === "3d"} onClick={() => setView("3d")}>Advanced 3D View</button>
    </div>
    <div className="page-grid testbed-grid">
      {view === "farm" ? <SmartFarmView topology={data.topology} devices={data.devices} attacks={data.attacks} attackTypes={data.attackTypes} policy={data.policy} active={data.runtimeStatus.active && data.simulation.state === "running"} selectedDeviceId={selectedDeviceId} focusedCorrelation={focusedScenario?.correlationId} onSelectDevice={setSelectedDeviceId} onComplete={refresh} beginScenarioFocus={beginScenarioFocus} /> : view === "topology" ? <NetworkTopology topology={data.topology} devices={data.devices} attacks={data.attacks} policy={data.policy} focusedCorrelationId={focusedScenario?.correlationId} selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} /> : <FarmDigitalTwin topology={data.topology} devices={data.devices} attacks={data.attacks} policy={data.policy} selectedDeviceId={selectedDeviceId} focusedCorrelationId={focusedScenario?.correlationId} focusedDeviceId={data.attacks.find(attack => attack.correlation_id === focusedScenario?.correlationId)?.target_device_id} onSelectDevice={setSelectedDeviceId} onShowTopology={() => setView("topology")} />}
    </div>
    <Disclosure title="Telemetry history — retained readings"><TelemetryPanel devices={data.devices} histories={telemetry} /></Disclosure>
  </div>;
}

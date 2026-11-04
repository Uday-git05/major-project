"use client";

import { useLiveRuntime } from "@/components/live-runtime-provider";
import { useState } from "react";
import { AgentHealthSummary, AutonomousResponseSummary, CurrentSecurityState, OverviewDecision, OverviewHero, SystemProcessFlow } from "@/components/overview-panels";
import { SmartFarmView } from "@/components/smart-farm-view";
import { groupIncidents } from "@/features/incidents";
import { titleCase } from "@/lib/format";
import Link from "next/link";

export default function OverviewPage() {
  const { data, connection, focusedScenario, setSelectedIncident } = useLiveRuntime();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const incidents = groupIncidents(data.events);
  return <div className="application-page overview-page" data-page="overview">
    <OverviewHero data={data} connection={connection} compactBackground />
    <div className="overview-main-grid">
      <section className="overview-farm-card"><header><div><span>LIVE IOT FARM SIMULATION</span><h2>Virtual smart farm</h2></div><Link href="/iot-testbed">Open testbed</Link></header><SmartFarmView topology={data.topology} devices={data.devices} attacks={data.attacks} policy={data.policy} active={data.runtimeStatus.active && data.simulation.state === "running"} selectedDeviceId={selectedDeviceId} focusedCorrelation={focusedScenario?.correlationId} onSelectDevice={setSelectedDeviceId} /></section>
      <aside className="overview-side-cards"><OverviewDecision data={data} /><CurrentSecurityState data={data} /><section className="overview-threat-card"><span>CURRENT THREAT</span><strong>{focusedScenario ? `${titleCase(focusedScenario.attackType)} · scenario in focus` : "No active focused threat"}</strong><small>Simulator activity and model prediction are reported separately.</small>{focusedScenario && <button onClick={() => setSelectedIncident(focusedScenario.correlationId)}>View related incident</button>}</section></aside>
    </div>
    <div className="overview-micro-summary"><span>{data.devices.length} configured virtual devices</span><span>{data.activeAttacks.filter((attack) => attack.status === "active").length} user-launched active scenario(s)</span><span>{incidents.length} correlated case(s) in retained snapshot</span><span>{data.agentHealth.total_agents} runtime agents</span></div>
    <SystemProcessFlow />
    <details className="overview-technical-details"><summary>Background activity and retained security records</summary><p>Background cases and model signals are retained independently from the selected scenario.</p><AutonomousResponseSummary data={data} /><AgentHealthSummary data={data} /></details>
  </div>;
}

"use client";

import { AgentGrid } from "@/components/agent-grid";
import { EventStream } from "@/components/event-stream";
import { useLiveRuntime } from "@/components/live-runtime-provider";
import { PageHeading } from "@/components/page-heading";

export default function MultiAgentPage() {
  const { data, focusedScenario } = useLiveRuntime();
  return <div className="application-page agents-page" data-page="multi-agent">
    <PageHeading eyebrow="06 · Coordinated control plane" title="Multi-Agent Intelligence" purpose="Six specialized agents coordinate monitoring, detection, threat analysis, defense and recovery." />
    <div className="page-grid agents-page-grid">
      <AgentGrid agents={data.agents} audit={data.audit} runtimeActive={data.runtimeStatus.active} />
      <EventStream key={data.epoch} events={data.events} focusedCorrelation={focusedScenario?.correlationId} runtime={{epoch:data.epoch,active:data.runtimeStatus.active,state:data.simulation.state}} />
    </div>
  </div>;
}

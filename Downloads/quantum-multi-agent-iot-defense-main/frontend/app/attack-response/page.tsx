"use client";

import { AttackControl } from "@/components/attack-control";
import { DefensePanel } from "@/components/defense-panel";
import { useLiveRuntime } from "@/components/live-runtime-provider";
import { PageHeading } from "@/components/page-heading";
import { RecoveryPanel } from "@/components/recovery-panel";
import { ResponseState } from "@/components/response-state";
import { ResponseTimeline } from "@/components/response-timeline";
import { responseContext, responseTimeline } from "@/features/response";
import { Disclosure } from "@/components/evidence-disclosure";
import { ScenarioLifecycle } from "@/components/scenario-lifecycle";
import { HumanDecisionPanel } from "@/components/human-decision-panel";
import { useState } from "react";
import Link from "next/link";

type ResponseTab = "scenario" | "defense" | "recovery";

export default function AttackResponsePage() {
  const { data, refresh, setSelectedIncident, focusedScenario, beginScenarioFocus } = useLiveRuntime();
  const [tab, setTab] = useState<ResponseTab>("scenario");
  const context = responseContext(data, focusedScenario ?? null);
  const timeline = responseTimeline(data.events, context.correlationIds);
  const focusedDefenses = focusedScenario
    ? data.defenses.filter((action) => action.correlation_id === focusedScenario.correlationId)
    : [];
  const pendingApprovals = focusedDefenses.filter(action => action.status === "planned" && action.human_override_state === "pending").length;
  return <div className="application-page response-page" data-page="attack-response">
    <PageHeading eyebrow="05 · Controlled validation" title="Attack Simulation & Response" purpose="Test controlled synthetic scenarios and observe defense and recovery." />
    <p className="attack-lab-entry"><Link href="/attack-lab">Open the separate Attack Lab interface →</Link></p>
    <ResponseState context={context} onViewIncident={setSelectedIncident} />
    <div className="response-tabs" role="tablist" aria-label="Response workflow">
      {([{id:"scenario",label:"Synthetic Attack Control"},{id:"defense",label:"Defense Actions"},{id:"recovery",label:"Recovery Verification"}] as const).map(item => <button key={item.id} className={item.id === "defense" && pendingApprovals ? "has-pending-approval" : ""} role="tab" aria-label={item.label} aria-selected={tab === item.id} aria-controls={`response-${item.id}`} onClick={() => setTab(item.id)}>{item.label}{item.id === "defense" && pendingApprovals > 0 && <span className="pending-tab-count" aria-hidden="true">{pendingApprovals} pending</span>}</button>)}
    </div>
    <section id="response-scenario" role="tabpanel" hidden={tab !== "scenario"}>
      <ScenarioLifecycle data={data} focus={focusedScenario ?? null} />
      <AttackControl types={data.attackTypes} devices={data.devices} attacks={data.attacks} onComplete={refresh} beginScenarioFocus={beginScenarioFocus} />
    </section>
    <section id="response-defense" role="tabpanel" hidden={tab !== "defense"}>
      <HumanDecisionPanel data={data} focus={focusedScenario ?? null} onComplete={refresh} />
      <DefensePanel key={`${data.epoch}-focused`} actions={focusedDefenses} policy={data.policy} events={focusedScenario ? data.events : []} focusedCorrelation={focusedScenario?.correlationId} onComplete={refresh} />
      {data.defenses.some((action) => action.correlation_id !== focusedScenario?.correlationId) && <Disclosure title="Background defense history & technical audit">
        <DefensePanel key={`${data.epoch}-background`} actions={data.defenses.filter((action) => action.correlation_id !== focusedScenario?.correlationId)} policy={data.policy} events={data.events} onComplete={refresh} />
      </Disclosure>}
      <Disclosure title="Defense policy and decision context"><section className="defense-policy" aria-labelledby="defense-policy-title"><header><span>DECISION CONTEXT</span><h2 id="defense-policy-title">Defense Policy</h2><p>Explanatory only. The backend remains the source of truth for every decision.</p></header><div><article><b>Low</b><span>Observe; no defense action is proposed.</span></article><article><b>Medium</b><span>A detected Medium assessment creates a pending proposal for human confirmation.</span></article><article><b>High / Critical</b><span>Simulator-only automatic action requires the configured policy to be enabled, the minimum severity to be met, corroborated evidence, and no model disagreement. Otherwise, the Defense Agent keeps a human-decision proposal.</span></article></div></section></Disclosure>
    </section>
    <section id="response-recovery" role="tabpanel" hidden={tab !== "recovery"}>
      <RecoveryPanel key={data.epoch} records={data.recoveries} actions={data.defenses} policy={data.policy} focusedRecoveryId={context.recovery?.recovery_id} focusedCorrelation={focusedScenario?.correlationId ?? null} agent={data.agents.find(item => item.agent_id === "recovery-agent")} events={data.events} onComplete={refresh} />
      <Disclosure title="Retained response timeline"><ResponseTimeline events={timeline} /></Disclosure>
    </section>
  </div>;
}

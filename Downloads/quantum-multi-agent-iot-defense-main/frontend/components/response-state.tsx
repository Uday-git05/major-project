"use client";

import Link from "next/link";
import { Activity, CheckCircle2, CircleDashed, ExternalLink, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import type { ResponseContext } from "@/features/response";
import { titleCase } from "@/lib/format";
import { Badge } from "./ui";
import { isVerifiedRecovery, recoveryLabel, recoveryTone } from "@/features/runtime-semantics";

export function ResponseState({ context, onViewIncident }: { context: ResponseContext; onViewIncident: (correlationId: string) => void }) {
  const { attack, threat, incident, defense, recovery } = context;
  const liveAttack = attack && ["active", "scheduled"].includes(attack.status) ? attack : undefined;
  if (context.status === "Monitoring") return <section className="response-state" aria-label="Monitoring"><header><div><span>SCENARIO WORKFLOW</span><h2>Monitoring</h2><p>No focused scenario. Background security signals remain available below; they do not select the demonstration storyline.</p></div></header></section>;
  return <section className={`response-state response-${stateTone(context.status)}`} aria-labelledby="current-response-title">
    <header>
      <div><span>{context.focus ? "FOCUSED SCENARIO RESPONSE" : "RESPONSE RECORD SUMMARY"}</span><h2 id="current-response-title">{context.status === "No Active Response" && context.focus ? "Awaiting correlated response" : context.status}</h2><p>{context.status === "No Active Response" ? "No in-progress response is identified in the available records. Retained evidence remains below." : responseDescription(context)}</p></div>
      <div className="response-state-actions"><Badge value={recovery ? recoveryLabel(recovery) : defense?.status ?? liveAttack?.status ?? "no response recorded"} tone={recovery ? recoveryTone(recovery) : stateTone(context.status)} />{incident && <Link href="/incidents" onClick={() => onViewIncident(incident.correlationId)}>View Incident / Case <ExternalLink aria-hidden="true" /></Link>}</div>
    </header>
    <dl className="response-facts">
      <div><dt>Synthetic scenario</dt><dd>{context.focus ? titleCase(context.focus.attackType) : attack ? titleCase(attack.attack_type) : "No scenario recorded"}</dd><small>{attack ? titleCase(attack.status) : "Simulator status not retained; independent of predictions"}</small></div>
      <div><dt>Virtual target</dt><dd>{context.focus?.target ?? attack?.target_device_id ?? threat?.payload.affected_devices[0] ?? defense?.target ?? "Not applicable"}</dd><small>{liveAttack?.source_device_id ? `Source ${liveAttack.source_device_id}` : "Simulator state"}</small></div>
      <div><dt>Threat Analysis severity</dt><dd>{threat ? titleCase(threat.payload.severity) : "No assessment retained"}</dd><small>{threat ? (threat.payload.detected === true ? "Attack predicted" : threat.payload.detected === false ? "No attack predicted" : "Pending evidence") : "Severity is separate from prediction"}</small></div>
      <div><dt>Defense record</dt><dd>{defense ? titleCase(defense.action_type) : "No action recorded"}</dd><small>{defense ? defenseLabel(defense.status, defense.human_override_state) : "See current applied controls below"}</small></div>
      <div><dt>Recovery record</dt><dd>{recoveryLabel(recovery)}</dd><small>{recovery?.reason ?? "No recovery record available"}</small></div>
      <div><dt>Recovery verification</dt><dd>{isVerifiedRecovery(recovery) ? "Verified: Yes" : "Verified: No"}</dd><small>{recovery ? `Runtime verified flag: ${String(recovery.verified)} · ` : ""}{rollbackLabel(defense?.rollback_state)}</small></div>
    </dl>
    <div className="response-lifecycle" aria-label="Response lifecycle">
      {context.stages.map((stage, index) => <div className={`response-stage ${stage.state}`} key={stage.key}>
        <span className="response-stage-icon">{stageIcon(stage.state)}</span>
        <div><b>{index + 1}. {stage.label}</b><small>{stage.detail}</small></div>
        {index < context.stages.length - 1 && <i aria-hidden="true">→</i>}
      </div>)}
    </div>
    <footer><ShieldCheck aria-hidden="true" /><span>All attacks and responses are simulator-only and do not affect external systems.</span></footer>
  </section>;
}

function responseDescription(context: ResponseContext) {
  if (context.recovery?.state === "manual_review") return context.recovery.reason;
  if (isVerifiedRecovery(context.recovery)) return "This retained recovery record reports verified simulator activity after policy rollback.";
  if (context.recovery) return context.recovery.reason;
  if (context.defense) return "A simulator defense decision is recorded for the correlated incident.";
  if (context.attack?.status === "active") return "A controlled synthetic scenario is active inside the virtual testbed.";
  return "Retained simulator scenario and response records are shown below; terminal records are history.";
}

function defenseLabel(status: string, override: string) {
  if (status === "planned" && override === "pending") return "Awaiting Approval";
  if (status === "running") return "Executing";
  return titleCase(status);
}

function rollbackLabel(value?: string) {
  if (!value || value === "not_requested") return "Rollback: Not requested";
  return `Rollback: ${titleCase(value)}`;
}

function stateTone(status: string) {
  if (status === "Recovered") return "healthy";
  if (status.includes("Failed")) return "failed";
  if (status.includes("Manual") || status.includes("Proposed")) return "warning";
  if (status === "No Active Response") return "neutral";
  return "info";
}

function stageIcon(state: string) {
  if (state === "completed") return <CheckCircle2 aria-hidden="true" />;
  if (state === "failed") return <XCircle aria-hidden="true" />;
  if (state === "manual_review") return <TriangleAlert aria-hidden="true" />;
  if (state === "active") return <Activity aria-hidden="true" />;
  return <CircleDashed aria-hidden="true" />;
}

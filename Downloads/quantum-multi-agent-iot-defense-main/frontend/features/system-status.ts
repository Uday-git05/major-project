import { groupIncidents } from "@/features/incidents";
import type { DashboardSnapshot } from "@/types/api";
import { defenseSummary, recoverySummary } from "@/features/runtime-semantics";

export interface SystemSummary {
  degraded: boolean;
  retainedPositiveCases: number;
  activeAttacks: number;
  appliedControls: number;
  pendingApproval: number;
  executingActions: number;
  inProgressRecoveries: number;
  manualReviewRecoveries: number;
  healthyAgents: number;
  totalAgents: number;
  overallLabel: string;
  securityLabel: string;
  backgroundLabel: string;
}

export function deriveSystemSummary(data: DashboardSnapshot): SystemSummary {
  const retainedPositiveCases = groupIncidents(data.events).filter((incident) => incident.latest.payload.detected === true).length;
  const degraded = data.runtimeStatus.overall === "degraded" || data.agentHealth.degraded_agents > 0 || data.agentHealth.unhealthy_agents > 0;
  const defenses = defenseSummary(data.defenses, data.policy);
  const recoveries = recoverySummary(data.recoveries);
  const activeAttacks = data.activeAttacks.filter((attack) => attack.status === "active").length;
  return {
    degraded,
    retainedPositiveCases,
    activeAttacks,
    appliedControls: defenses.appliedControls,
    pendingApproval: defenses.pendingApproval,
    executingActions: defenses.executing,
    inProgressRecoveries: recoveries.inProgress,
    manualReviewRecoveries: recoveries.manualReview,
    healthyAgents: data.agentHealth.healthy_agents,
    totalAgents: data.agentHealth.total_agents,
    overallLabel: degraded ? "Degraded" : data.runtimeStatus.active ? "Operational" : "Inactive",
    securityLabel: `${activeAttacks} active`,
    backgroundLabel: `${retainedPositiveCases} background cases retained`,
  };
}

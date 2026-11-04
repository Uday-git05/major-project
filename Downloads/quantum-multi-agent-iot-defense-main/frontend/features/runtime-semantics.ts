import type { DefenseAction, PolicyState, Recovery } from "@/types/api";
import { titleCase } from "@/lib/format";

const RECOVERY_TRACKING = new Set(["pending", "monitoring", "eligible", "recovering", "verifying"]);
const ENDED_ACTIONS = new Set(["completed", "rejected", "cancelled", "failed", "rolled_back"]);

// Count effective policy entries, not action records: several actions can affect one control.
export function appliedControlCount(policy: PolicyState): number {
  return policy.isolated_devices.length + policy.quarantined_sources.length
    + Object.keys(policy.rate_limited_services).length + policy.restricted_ports.length
    + Number(policy.gateway_protection);
}

export function defenseSummary(actions: DefenseAction[], policy: PolicyState) {
  return {
    pendingApproval: actions.filter((action) => action.status === "planned" && action.human_override_state === "pending").length,
    approved: actions.filter((action) => action.status === "approved").length,
    executing: actions.filter((action) => action.status === "running").length,
    completed: actions.filter((action) => action.status === "completed").length,
    historical: actions.filter((action) => ENDED_ACTIONS.has(action.status)).length,
    appliedControls: appliedControlCount(policy),
    recordedPolicyActions: policy.action_count,
  };
}

export function isVerifiedRecovery(record?: Pick<Recovery, "state" | "verified">): boolean {
  return record?.state === "recovered" && record.verified === true;
}

export function isRecoveryTracking(record: Pick<Recovery, "state">): boolean {
  return RECOVERY_TRACKING.has(record.state);
}

export function recoveryLabel(record?: Pick<Recovery, "state" | "verified">): string {
  if (!record) return "Not Active";
  if (record.state === "manual_review") return "Manual Review Required";
  if (record.state === "recovered" && !isVerifiedRecovery(record)) return "Recovered state · unverified";
  return titleCase(record.state);
}

export function recoveryTone(record: Pick<Recovery, "state" | "verified">): string {
  if (isVerifiedRecovery(record)) return "healthy";
  if (record.state === "failed") return "failed";
  if (record.state === "manual_review" || record.state === "recovered") return "warning";
  return "info";
}

export function recoverySummary(records: Recovery[]) {
  return {
    inProgress: records.filter(isRecoveryTracking).length,
    manualReview: records.filter((record) => record.state === "manual_review").length,
    verified: records.filter(isVerifiedRecovery).length,
    failed: records.filter((record) => record.state === "failed").length,
  };
}

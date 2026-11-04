import type { EventEnvelope } from "@/types/api";
import { formatTime, titleCase } from "@/lib/format";
import { Empty, Panel } from "./ui";

const labels: Record<string, string> = {
  attack_scheduled: "Synthetic attack scheduled", attack_started: "Synthetic attack started", attack_activity: "Synthetic traffic generated",
  attack_completed: "Synthetic attack ended", attack_cancelled: "Synthetic attack cancelled", classical_prediction: "Classical detector result",
  quantum_prediction: "QML corroboration", threat_assessment: "Assessment update recorded", defense_action: "Defense proposed",
  defense_action_requested: "Defense proposed", defense_action_started: "Defense executing", defense_action_completed: "Defense applied",
  defense_action_failed: "Defense failed", human_override: "Human decision", defense_rollback: "Simulator policy rollback",
  recovery_started: "Recovery monitoring started", recovery_progress: "Recovery advanced", recovery_verified: "Recovery verified",
  recovery_failed: "Recovery requires attention",
};

export function ResponseTimeline({ events }: { events: EventEnvelope[] }) {
  const bounded = events.slice(-30);
  return <Panel title="Response Timeline" kicker="Up to 30 retained lifecycle events for the displayed correlation IDs." className="response-timeline-panel">
    {!bounded.length ? <Empty>No correlated response events are available. Start a controlled scenario to build the timeline.</Empty> : <div className="response-timeline" data-testid="response-timeline">{bounded.map((event) => <article key={event.event_id}>
      <time>{formatTime(event.timestamp)}</time><i aria-hidden="true" /><div><b>{event.payload.state === "manual_review" ? "Manual Review Required" : labels[event.event_type] ?? titleCase(event.event_type)}</b><span>{event.source}</span><p>{summary(event)}</p><code title={event.correlation_id}>CORR {event.correlation_id}</code></div>
    </article>)}</div>}
  </Panel>;
}

function summary(event: EventEnvelope) {
  const payload = event.payload as Record<string, unknown>;
  return String(payload.decision_reason ?? payload.reason ?? payload.attack_type ?? payload.status ?? `${titleCase(event.event_type)} recorded`);
}

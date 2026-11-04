import { describe, expect, it } from "vitest";
import { groupIncidents } from "@/features/incidents";
import type { EventEnvelope } from "@/types/api";
const threat = (id: string, timestamp: string, severity: string): EventEnvelope => ({ event_id: `${id}-${timestamp}`, timestamp, event_type: "threat_assessment", source: "threat", correlation_id: id, payload: { incident_id: id, affected_devices: [], detected: true, suspected_attack_family: null, severity, evidence_strength: "primary", evidence: [], disagreement: false, decision_reason: "test", status: "provisional" } });
describe("incident grouping", () => {
  it("deduplicates provisional updates and preserves history", () => {
    const groups = groupIncidents([threat("one", "2026-01-01T00:00:00Z", "medium"), threat("one", "2026-01-01T00:00:01Z", "high"), threat("two", "2026-01-01T00:00:02Z", "low")]);
    expect(groups).toHaveLength(2); expect(groups[0].incidentId).toBe("one"); expect(groups[0].history).toHaveLength(2); expect(groups[0].latest.payload.severity).toBe("high");
  });
});

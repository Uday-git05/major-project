import { toggle } from "./disclosure-helper";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefensePanel } from "@/components/defense-panel";
import { IncidentPanel, shortIncidentId } from "@/components/incident-panel";
import { RecoveryPanel } from "@/components/recovery-panel";
import type { DefenseAction, EventEnvelope, Recovery } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";

function threat(index: number, severity = "low", revision = 0): EventEnvelope {
  const suffix = index.toString(16).padStart(8, "0");
  const incidentId = `incident-${suffix}-1234-5678-9012-abcdefabcdef`;
  return {
    event_id: `${incidentId}-${revision}`,
    timestamp: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:${String(revision).padStart(2, "0")}Z`,
    event_type: "threat_assessment",
    source: "threat-analysis-agent",
    correlation_id: `correlation-${suffix}`,
    payload: { incident_id: incidentId, affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "HTTP_Flood", severity, evidence_strength: "primary", evidence: [], disagreement: true, decision_reason: `revision ${revision}`, status: "provisional" },
  };
}

describe("acceptance history panels", () => {
  it("groups 100+ incidents, filters severity, shortens IDs, and preserves full revision detail", async () => {
    const events = Array.from({ length: 105 }, (_, index) => threat(index, index >= 100 ? "high" : "low"));
    events.push(threat(104, "high", 1));
    const onSelect = vi.fn();
    const { container } = render(<IncidentPanel events={events} focusedCorrelation="correlation-00000068" onSelect={onSelect} />);

    expect(container.querySelectorAll(".incident-row")).toHaveLength(1);
    expect(screen.getByText("105 retained cases")).toBeInTheDocument();
    toggle(screen.getByText("All Retained Cases (105)").closest("details")!, { target: { open: true } });
    expect(screen.getByText("Showing 1–10 of 105 retained records")).toBeInTheDocument();
    const fullId = "incident-00000068-1234-5678-9012-abcdefabcdef";
    const latest = container.querySelector(`button[title="${fullId}"]`);
    expect(latest).toHaveTextContent(shortIncidentId(fullId));
    fireEvent.click(latest!);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("correlation-00000068"));
    expect(screen.getByText(fullId)).toBeInTheDocument();
    toggle(screen.getByText("View Evidence Updates (2)").closest("details")!, { target: { open: true } });
    expect(screen.getByLabelText(`Assessment history for ${fullId}`).querySelectorAll("details")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "high" }));
    expect(container.querySelectorAll(".incident-row")).toHaveLength(1);
    expect(screen.getByText("Showing 1–1 of 1 retained records")).toBeInTheDocument();
  });

  it("keeps histories collapsed and available through paginated drill-down", () => {
    const defenses = Array.from({ length: 60 }, (_, index) => ({
      action_id: `defense-${index}`, correlation_id: `correlation-${index}`, incident_id: `incident-${index}`,
      action_type: "quarantine_synthetic_source", target: `source-${index}`, reason: `reason ${index}`,
      evidence: [], status: index === 0 ? "planned" : "rolled_back", requested_at: `2026-01-01T00:00:${String(index).padStart(2, "0")}Z`,
      started_at: null, completed_at: null, result: {}, reversible: true, rollback_state: "completed", initiated_by: "defense-agent", human_override_state: "none",
    })) as DefenseAction[];
    const recoveries = Array.from({ length: 60 }, (_, index) => ({
      recovery_id: `recovery-${index}`, defense_action_id: `defense-${index}`, correlation_id: `correlation-${index}`,
      state: index === 0 ? "monitoring" : "recovered", created_tick: index, state_tick: index,
      verification_ticks: 2, normal_events_observed: 4, high_assessment_seen: false, verified: index !== 0, reason: `result ${index}`,
    })) as Recovery[];
    const { rerender } = render(<DefensePanel actions={defenses} policy={{ ...dashboardSnapshot().policy, action_count: 1 }} onComplete={() => undefined} />);
    expect(screen.queryByTestId("defense-history")).not.toBeInTheDocument();
    toggle(screen.getByText("Response History (59) — View Full History").closest("details")!, { target: { open: true } });
    expect(screen.getByLabelText("defense history").querySelectorAll("article")).toHaveLength(10);
    rerender(<RecoveryPanel records={recoveries} />);
    expect(screen.getByTestId("recovery-history").children).toHaveLength(1);
    expect(screen.queryByLabelText("recovery history")).not.toBeInTheDocument();
    toggle(screen.getByText("Recovery History (59) — View Full History").closest("details")!, { target: { open: true } });
    expect(screen.getByLabelText("recovery history").querySelectorAll("article")).toHaveLength(10);
  });
});

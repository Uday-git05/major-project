import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorScreen, LoadingScreen } from "@/components/ui";
import { AgentGrid } from "@/components/agent-grid";
import { SystemHeader } from "@/components/system-header";
import { dashboardSnapshot } from "./fixtures";
describe("dashboard states and agents", () => {
  it("renders clear loading and error states", () => { const { rerender } = render(<LoadingScreen />); expect(screen.getByText(/establishing secure telemetry/i)).toBeInTheDocument(); rerender(<ErrorScreen message="timed out" retry={() => undefined} />); expect(screen.getByText("timed out")).toBeInTheDocument(); });
  it("renders live agent status and QML background coalescing counters", () => { render(<AgentGrid agents={[{ agent_id: "monitoring-agent", name: "Monitoring Agent", role: "Observe", status: "running", health: "healthy", processed_event_count: 12, error_count: 0, last_activity_at: null, state: { queued_events: 2 } }, { agent_id: "quantum-ml-agent", name: "Quantum ML Agent", role: "QML", status: "running", health: "healthy", processed_event_count: 8, error_count: 0, last_activity_at: null, state: { queued_events: 1, coalesced_background_events: 9 } }] as never} audit={[]} />); expect(screen.getAllByText("Monitoring Agent").length).toBeGreaterThan(0); expect(screen.getAllByText("12", { selector: "b" }).length).toBeGreaterThan(0); expect(screen.getAllByText("2", { selector: "b" }).length).toBeGreaterThan(0); expect(screen.getByText("Background vectors coalesced")).toBeInTheDocument(); expect(screen.getAllByText("9", { selector: "b" }).length).toBeGreaterThan(0); });
  it("surfaces degraded runtime health in the system header", () => {
    const data = { events: [], defenses: [], activeAttacks: [], recoveries: [], policy: dashboardSnapshot().policy, simulation: { state: "running", tick_number: 4, simulation_time: "2026-01-01T00:00:04Z" }, runtimeStatus: { overall: "degraded" }, agentHealth: { healthy_agents: 5, degraded_agents: 1, unhealthy_agents: 0, total_agents: 6 } } as never;
    render(<SystemHeader data={data} connection="live" refreshing={false} />);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("Degraded").closest(".status-item")?.querySelector(".status-icon")).toHaveClass("warning");
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});

import { toggle } from "./disclosure-helper";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimulationControls } from "@/components/simulation-controls";
import { AttackControl } from "@/components/attack-control";
import { DefensePanel } from "@/components/defense-panel";
import { api, ApiError } from "@/lib/api-client";
import type { DefenseAction } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const defense = (status: string, extra: Partial<DefenseAction> = {}) => ({
  action_id: `defense-${status}`,
  action_type: "protect_gateway_mode",
  target: "gateway-01",
  reason: "high threat",
  status,
  requested_at: "2026-01-01T00:00:00Z",
  reversible: true,
  human_override_state: "pending",
  ...extra,
}) as DefenseAction;

function selectDefenseRecord() {
  for (const node of document.querySelectorAll("details")) { (node as HTMLDetailsElement).open = true; toggle(node); }
  const button = screen.getAllByRole("button").find(b=>b.textContent?.startsWith("Protect Gateway Mode ·"));
  if (button) fireEvent.click(button);
}

const renderDefense = (action: DefenseAction, onComplete = vi.fn()) => {
  render(<DefensePanel actions={[action]} policy={dashboardSnapshot().policy} onComplete={onComplete} />);
  selectDefenseRecord();
  return onComplete;
};

describe("operator controls", () => {
  it("activates the complete runtime", async () => { vi.spyOn(api, "activateSystem").mockResolvedValue({} as never); const done = vi.fn(); render(<SimulationControls state="stopped" systemActive={false} onComplete={done} />); fireEvent.click(screen.getByRole("button", { name: /activate system/i })); await waitFor(() => expect(api.activateSystem).toHaveBeenCalled()); expect(done).toHaveBeenCalled(); });
  it("deactivates the complete runtime", async () => { vi.spyOn(api, "deactivateSystem").mockResolvedValue({} as never); render(<SimulationControls state="running" systemActive onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /deactivate/i })); await waitFor(() => expect(api.deactivateSystem).toHaveBeenCalled()); });
  it("pauses and resumes through the existing simulation API", async () => { const operation = vi.spyOn(api, "simulation").mockResolvedValue({} as never); const view = render(<SimulationControls state="running" systemActive onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /pause/i })); await waitFor(() => expect(operation).toHaveBeenCalledWith("pause")); view.unmount(); render(<SimulationControls state="paused" systemActive onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /resume/i })); await waitFor(() => expect(operation).toHaveBeenCalledWith("resume")); });
  it("advances one logical tick", async () => { vi.spyOn(api, "tick").mockResolvedValue({} as never); render(<SimulationControls state="running" systemActive onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /advance tick/i })); await waitFor(() => expect(api.tick).toHaveBeenCalled()); });
  it("keeps full reset connected to the coordinated runtime reset", async () => { vi.spyOn(api, "resetSystem").mockResolvedValue({} as never); render(<SimulationControls state="running" systemActive onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /full reset/i })); await waitFor(() => expect(api.resetSystem).toHaveBeenCalled()); });
  it("schedules a safe synthetic attack", async () => { vi.spyOn(api, "scheduleAttack").mockResolvedValue({} as never); render(<AttackControl types={[{ attack_type: "TCP_Flood", name: "TCP Flood", description: "", default_target_types: ["gateway"], default_duration_ticks: 4, default_intensity: "medium", protocol: "TCP", service: "tcp", behavior_summary: "" }]} devices={[{ device_id: "g", device_type: "gateway", name: "Gateway" } as never]} attacks={[]} onComplete={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: /schedule scenario/i })); await waitFor(() => expect(api.scheduleAttack).toHaveBeenCalledWith(expect.objectContaining({ attack_type: "TCP_Flood", target_device_id: "g" }))); });
});

describe("defense lifecycle controls", () => {
  it("shows all valid controls for a planned action", () => {
    renderDefense(defense("planned"));
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("shows no approval control for a completed action", () => {
    renderDefense(defense("completed"));
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText("Completed", { selector: ".defense-status-marker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rollback" })).toBeEnabled();
  });

  it("renders a rejected action as read-only", () => {
    renderDefense(defense("rejected"));
    expect(screen.queryByRole("button", { name: /^(Approve|Reject|Cancel|Rollback)$/ })).not.toBeInTheDocument();
    expect(screen.getByText("Rejected", { selector: ".defense-status-marker" })).toBeInTheDocument();
  });

  it("renders a cancelled action as read-only", () => {
    renderDefense(defense("cancelled"));
    expect(screen.queryByRole("button", { name: /^(Approve|Reject|Cancel|Rollback)$/ })).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled", { selector: ".defense-status-marker" })).toBeInTheDocument();
  });

  it("renders a rolled-back action as read-only", () => {
    renderDefense(defense("rolled_back"));
    expect(screen.queryByRole("button", { name: /^(Approve|Reject|Cancel|Rollback)$/ })).not.toBeInTheDocument();
    expect(screen.getByText("Rolled Back", { selector: ".defense-status-marker" })).toBeInTheDocument();
  });

  it("sends reject and cancel only while their lifecycle controls are valid", async () => {
    const call = vi.spyOn(api, "defense").mockResolvedValue({} as never);
    const first = render(<DefensePanel actions={[defense("planned", { action_id: "reject-me" })]} policy={dashboardSnapshot().policy} onComplete={vi.fn()} />);
    selectDefenseRecord();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("reject-me", "reject"));
    first.unmount();
    render(<DefensePanel actions={[defense("approved", { action_id: "cancel-me" })]} policy={dashboardSnapshot().policy} onComplete={vi.fn()} />);
    selectDefenseRecord();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("cancel-me", "cancel"));
  });

  it("prevents duplicate approve requests while the row is in flight", async () => {
    let resolveRequest!: (value: DefenseAction) => void;
    const request = new Promise<DefenseAction>((resolve) => { resolveRequest = resolve; });
    const call = vi.spyOn(api, "defense").mockReturnValue(request);
    renderDefense(defense("planned"));
    const approve = screen.getByRole("button", { name: "Approve" });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(call).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Pending" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    resolveRequest(defense("completed"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
  });

  it("handles a lifecycle conflict inline without crashing", async () => {
    vi.spyOn(api, "defense").mockRejectedValue(new ApiError("Cannot approve action while completed", 409));
    renderDefense(defense("planned"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Action state changed. Current status: completed.");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rollback" })).toBeEnabled();
    expect(screen.getByText("Defense Decision & Action")).toBeInTheDocument();
  });

  it("refreshes defense state after a lifecycle conflict", async () => {
    vi.spyOn(api, "defense").mockRejectedValue(new ApiError("Cannot approve action while completed", 400));
    const refresh = renderDefense(defense("planned"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

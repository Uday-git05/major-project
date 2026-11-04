import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveRuntimeProvider, useLiveRuntime } from "@/components/live-runtime-provider";
import { api } from "@/lib/api-client";
import type { Attack } from "@/types/api";
import Overview from "@/app/page";
import Response from "@/app/attack-response/page";
import Detection from "@/app/detection/page";
import Incidents from "@/app/incidents/page";
import Agents from "@/app/multi-agent/page";
import { scenarioData, scenarioAttack, scenarioAssessment } from "./scenario-fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
class Socket {
  static all: Socket[] = [];
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() { Socket.all.push(this); }
  close() { this.onclose?.(); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); Socket.all = []; });
const focusSelect = () => screen.getByRole("combobox", { name: "Scenario focus" });
async function ready() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
function setup(data = scenarioData()) {
  vi.useFakeTimers(); vi.stubGlobal("WebSocket", Socket); vi.spyOn(api, "snapshot").mockImplementation(async () => data);
  return data;
}

describe("persistent operator scenario focus", () => {
  it("launches from returned attack identity, navigates all six pages, and uses one shared socket", async () => {
    const data = setup(); const scheduled = scenarioAttack("C", "scheduled");
    vi.spyOn(api, "scheduleAttack").mockImplementation(async () => { data.attacks = [...data.attacks, scheduled]; return scheduled; });
    const view = render(<LiveRuntimeProvider><Overview /></LiveRuntimeProvider>); await ready();
    expect(focusSelect()).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Smart Irrigation IoT Cyber Defense System" })).toBeInTheDocument();
    view.rerender(<LiveRuntimeProvider><Response /></LiveRuntimeProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Port Scanning/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Schedule scenario" })); });
    expect(focusSelect()).toHaveValue("attack-C");
    for (const Page of [Detection, Incidents, Agents, Overview]) {
      view.rerender(<LiveRuntimeProvider><Page /></LiveRuntimeProvider>);
      expect(focusSelect()).toHaveValue("attack-C"); expect(Socket.all).toHaveLength(1);
    }
    expect(screen.getByText(/Port Scanning · Target: gateway-01 · Scheduled/)).toBeInTheDocument();
    view.unmount();
  }, 10_000);
  it("does not hijack focus with live unrelated assessment B and keeps all records", async () => {
    const data = setup(); const view = render(<LiveRuntimeProvider><Response /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } });
    const event = { ...scenarioAssessment("B"), event_id: "new-B" };
    act(() => Socket.all[0].onmessage?.({ data: JSON.stringify({ epoch: data.epoch, sequence: data.sequence + 1, type: "threat_assessment", payload: { event } }) }));
    expect(focusSelect()).toHaveValue("attack-A"); expect(screen.getByRole("heading", { name: "Manual Review Required" })).toBeInTheDocument();
    expect(screen.getByText("Background assessments: 2 retained updates")).toBeInTheDocument(); expect(Socket.all).toHaveLength(1);
    view.unmount();
  });
  it("switches explicitly, clears to monitoring, and does not cancel attacks", async () => {
    setup(); const cancel = vi.spyOn(api, "cancelAttack"); const view = render(<LiveRuntimeProvider><Response /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } }); fireEvent.change(focusSelect(), { target: { value: "attack-B" } });
    expect(focusSelect()).toHaveValue("attack-B");
    fireEvent.click(screen.getByRole("button", { name: /Clear focus/ }));
    expect(focusSelect()).toHaveValue(""); expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument(); expect(cancel).not.toHaveBeenCalled(); view.unmount();
  });
  it("keeps the focused scenario prominent through higher-severity background updates", async () => {
    const data = setup(); const view = render(<LiveRuntimeProvider><Incidents /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } });
    expect(screen.getByRole("heading", { name: "Port Scanning" })).toBeInTheDocument();
    expect(screen.getByText("Background Model Activity").closest("details")).not.toHaveAttribute("open");
    const event = { ...scenarioAssessment("B"), event_id: "newer-B", payload: { ...scenarioAssessment("B").payload, severity: "critical" } };
    act(() => Socket.all[0].onmessage?.({ data: JSON.stringify({ epoch: data.epoch, sequence: data.sequence + 1, type: "threat_assessment", payload: { event } }) }));
    expect(focusSelect()).toHaveValue("attack-A");
    expect(screen.getByRole("heading", { name: "Port Scanning" })).toBeInTheDocument();
    expect(screen.getByText("Background Model Activity").closest("details")).not.toHaveAttribute("open");
    view.unmount();
  });
  it("preserves focus on reconnect and fresh same-epoch snapshot without navigation subscriptions", async () => {
    setup(); const view = render(<LiveRuntimeProvider><Detection /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } });
    act(() => Socket.all[0].onclose?.()); await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(focusSelect()).toHaveValue("attack-A"); expect(Socket.all).toHaveLength(2);
    act(() => Socket.all[1].onopen?.()); expect(api.snapshot).toHaveBeenCalledTimes(2); view.unmount();
  });
  it("clears old epoch focus when the reset marker reconciles to the new snapshot", async () => {
    const data = setup(); const view = render(<LiveRuntimeProvider><Response /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } }); data.epoch += 1;
    act(() => Socket.all[0].onmessage?.({ data: JSON.stringify({ epoch: data.epoch, sequence: 0, type: "runtime_reset", payload: {} }) }));
    expect(focusSelect()).toHaveValue("");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(focusSelect()).toHaveValue(""); expect(Socket.all).toHaveLength(1); view.unmount();
  });
  it("successful Full reset clears focus even before snapshot refresh completes", async () => {
    const data = setup(); vi.spyOn(api, "resetSystem").mockResolvedValue(data.runtimeStatus);
    const view = render(<LiveRuntimeProvider><Response /></LiveRuntimeProvider>); await ready();
    fireEvent.change(focusSelect(), { target: { value: "attack-A" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Full reset" })); });
    expect(focusSelect()).toHaveValue(""); expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument(); view.unmount();
  });
  it("ignores an old launch response after the user clears or switches focus", async () => {
    setup(); let commit: ((attack: Attack) => void) | undefined;
    function Intent() { const runtime = useLiveRuntime(); return <button onClick={() => { commit = runtime.beginScenarioFocus(); }}>Begin delayed launch</button>; }
    const view = render(<LiveRuntimeProvider><Intent /></LiveRuntimeProvider>); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Begin delayed launch" }));
    fireEvent.change(focusSelect(), { target: { value: "attack-B" } });
    act(() => commit?.(scenarioAttack("A"))); expect(focusSelect()).toHaveValue("attack-B");
    fireEvent.click(screen.getByRole("button", { name: "Begin delayed launch" }));
    fireEvent.click(screen.getByRole("button", { name: /Clear focus/ }));
    act(() => commit?.(scenarioAttack("A"))); expect(focusSelect()).toHaveValue(""); view.unmount();
  });
});

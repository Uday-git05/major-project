import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppNavigation } from "@/components/app-navigation";
import { LiveRuntimeProvider, useLiveRuntime } from "@/components/live-runtime-provider";
import { api } from "@/lib/api-client";
import { dashboardSnapshot } from "./fixtures";

const routeState = vi.hoisted(() => ({ pathname: "/detection" }));
vi.mock("next/navigation", () => ({ usePathname: () => routeState.pathname }));

class MockSocket {
  static instances: MockSocket[] = [];
  onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) { MockSocket.instances.push(this); }
  close() { this.onclose = null; }
}

function RuntimeProbe({ name }: { name: string }) {
  const runtime = useLiveRuntime();
  return <div><span>{name}</span><span data-testid="tick">{runtime.data.simulation.tick_number}</span><span data-testid="selected">{runtime.selectedIncident ?? "none"}</span><button onClick={() => runtime.setSelectedIncident("corr-1")}>Select incident</button></div>;
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); MockSocket.instances = []; });

describe("UI navigation and shared runtime", () => {
  it("renders six main routes, keeps Research Results secondary, and marks the active page", () => {
    render(<AppNavigation connection="live" />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent?.replace(/^\d+/, ""))).toEqual(["FarmFlow", "Dashboard", "Smart Farm", "AI Detection", "Threat Center", "Defense & Recovery", "AI Agents", "Model Performance"]);
    expect(screen.getByRole("link", { name: /AI Detection/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("System Online · Live")).toBeInTheDocument();
  });

  it("keeps six readable main page names visible and highlights AI Agents", () => {
    routeState.pathname = "/multi-agent";
    render(<AppNavigation connection="live" />);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(nav.querySelectorAll("a")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "AI Agents" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "AI Agents" })).toHaveTextContent("AI Agents");
    routeState.pathname = "/detection";
  });

  it("preserves one WebSocket, the live tick, and selected incident while page content changes", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "snapshot").mockResolvedValue(dashboardSnapshot());
    vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);
    const view = render(<LiveRuntimeProvider><RuntimeProbe name="Overview content" /></LiveRuntimeProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(MockSocket.instances).toHaveLength(1);
    expect(screen.getByTestId("tick")).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button", { name: "Select incident" }));
    view.rerender(<LiveRuntimeProvider><RuntimeProbe name="Detection content" /></LiveRuntimeProvider>);
    expect(screen.getByText("Detection content")).toBeInTheDocument();
    expect(screen.getByTestId("tick")).toHaveTextContent("7");
    expect(screen.getByTestId("selected")).toHaveTextContent("corr-1");
    expect(MockSocket.instances).toHaveLength(1);
    view.unmount();
  });
});

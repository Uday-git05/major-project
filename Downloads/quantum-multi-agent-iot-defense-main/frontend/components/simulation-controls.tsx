"use client";

import { Pause, Play, RotateCcw, StepForward, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { SimulationState } from "@/types/api";

export function SimulationControls({ state, systemActive = false, onComplete, onReset }: { state: SimulationState; systemActive?: boolean; onComplete: () => Promise<void> | void; onReset?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, operation: () => Promise<unknown>) => { setBusy(name); try { await operation(); await onComplete(); } finally { setBusy(null); } };
  return <nav className="control-bar" aria-label="Simulation controls">
    <span><b>SIMULATION CONTROL</b><small>Safe virtual environment</small></span>
    {!systemActive && <button className="primary" onClick={() => run("system", () => api.activateSystem())} disabled={!!busy}><Users /> Activate system</button>}
    {systemActive && <button onClick={() => run("deactivate", () => api.deactivateSystem())} disabled={!!busy}><Pause /> Deactivate</button>}
    {state === "stopped" && systemActive && <button onClick={() => run("start", () => api.simulation("start"))} disabled={!!busy}><Play /> Start</button>}
    {state === "running" && <button onClick={() => run("pause", () => api.simulation("pause"))} disabled={!!busy}><Pause /> Pause</button>}
    {state === "paused" && <button onClick={() => run("resume", () => api.simulation("resume"))} disabled={!!busy}><Play /> Resume</button>}
    <button onClick={() => run("tick", () => api.tick())} disabled={state !== "running" || !!busy}><StepForward /> Advance tick</button>
    <button className="subtle" onClick={() => run("reset", async () => { const result = await api.resetSystem(); onReset?.(); return result; })} disabled={!!busy}><RotateCcw /> Full reset</button>
  </nav>;
}

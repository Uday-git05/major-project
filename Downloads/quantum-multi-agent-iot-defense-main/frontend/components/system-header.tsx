"use client";

import { Activity, Radio, ShieldCheck, Swords } from "lucide-react";
import type { DashboardSnapshot, LiveConnectionState } from "@/types/api";
import { formatUtcTime } from "@/lib/format";
import { deriveSystemSummary } from "@/features/system-status";

export function SystemHeader({ data, connection, refreshing }: { data: DashboardSnapshot; connection: LiveConnectionState; refreshing: boolean }) {
  const summary = deriveSystemSummary(data);
  return <header className="system-header">
    <div className="brand"><div className="brand-mark">FF</div><div><span>FARMFLOW SECURITY</span><strong>Operations Command</strong></div></div>
    <div className="status-ribbon">
      <StatusItem icon={<ShieldCheck />} label="Operational health" value={summary.overallLabel} tone={summary.degraded ? "warning" : data.runtimeStatus.active ? "healthy" : "neutral"} />
      <StatusItem icon={<Radio />} label="Simulation" value={data.simulation.state} tone={data.simulation.state === "running" ? "healthy" : "neutral"} />
      <StatusItem icon={<Swords />} label="Synthetic scenarios" value={summary.securityLabel} detail={summary.backgroundLabel} tone={summary.activeAttacks ? "critical" : "neutral"} />
      <StatusItem icon={<Activity />} label="Connection" value={refreshing ? "Syncing" : connection === "live" ? "Live" : connection} tone={connection === "live" ? "healthy" : connection} />
    </div>
    <div className="clock-block"><strong>TICK {data.simulation.tick_number.toString().padStart(4, "0")}</strong><span>{formatUtcTime(data.simulation.simulation_time)} UTC</span></div>
  </header>;
}

function StatusItem({ icon, label, value, tone, detail }: { icon: React.ReactNode; label: string; value: string; tone: string; detail?: string }) {
  return <div className={`status-item ${label.toLowerCase()}`}><span className={`status-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail && <small className="status-detail">{detail}</small>}</div></div>;
}

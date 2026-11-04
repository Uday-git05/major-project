"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Device } from "@/types/api";
import type { TelemetryPoint } from "@/hooks/use-live-dashboard";
import { Panel, Empty } from "./ui";
import { titleCase } from "@/lib/format";

const colors = ["#0f8f7a", "#2563eb", "#d99a20"];

export function TelemetryPanel({ devices, histories }: { devices: Device[]; histories: Record<string, TelemetryPoint[]> }) {
  const sensors = devices.filter((device) => Object.values(device.telemetry_state).some((value) => typeof value === "number"));
  return <Panel title="Live Telemetry" kicker="Live sensor readings from the virtual farm." className="telemetry-panel">
    {!sensors.length ? <Empty>No telemetry available. Start the simulation to begin collection.</Empty> : <div className="telemetry-grid">{sensors.slice(0, 6).map((device) => {
      const keys = Object.keys(device.telemetry_state).filter((key) => typeof device.telemetry_state[key] === "number").slice(0, 2);
      const data = histories[device.device_id] ?? [];
      return <article className="sensor-chart" key={device.device_id}><header><div><b>{device.name}</b><small>{device.network_profile.service}</small></div><strong>{keys.map((key) => `${Number(device.telemetry_state[key]).toFixed(1)} ${unit(key)}`).join(" · ")}</strong></header>
        <ResponsiveContainer width="100%" height={84}><LineChart data={data}><XAxis dataKey="tick" hide /><YAxis hide domain={["auto", "auto"]} /><Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dde5ec", color: "#172033", fontSize: 12, borderRadius: 6 }} labelFormatter={(v) => `Tick ${v}`} />{keys.map((key, i) => <Line key={key} type="monotone" dataKey={`values.${key}`} stroke={colors[i]} dot={false} strokeWidth={2} isAnimationActive={false} name={titleCase(key)} />)}</LineChart></ResponsiveContainer>
      </article>;
    })}</div>}
  </Panel>;
}

function unit(key: string) { if (key.includes("temperature")) return "°C"; if (key.includes("percent")) return "%"; if (key.includes("flow")) return "L/m"; if (key.includes("wind")) return "m/s"; return ""; }

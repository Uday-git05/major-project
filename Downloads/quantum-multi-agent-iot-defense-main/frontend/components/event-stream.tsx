"use client";
import { useMemo, useState } from "react";
import type { EventEnvelope } from "@/types/api";
import { formatTime, titleCase } from "@/lib/format";
import { Panel } from "./ui";
import { auditGroups, importantEvents, type EventGroup } from "@/features/presentation";
import { Disclosure, PagedRows } from "./evidence-disclosure";

const filters: Record<string, string[]> = { all: [], simulation: ["simulation_tick", "telemetry", "device_state", "network_activity", "system_health"], features: ["feature_vector"], agents: ["agent_status", "agent_message", "observation", "classical_prediction", "quantum_prediction", "threat_assessment"], attacks: ["attack_scheduled", "attack_started", "attack_activity", "attack_completed", "attack_cancelled"], defense: ["defense_action", "defense_action_requested", "defense_action_started", "defense_action_completed", "defense_action_failed", "defense_rollback", "human_override"], recovery: ["recovery", "recovery_started", "recovery_progress", "recovery_verified", "recovery_failed"] };
export function EventStream({ events, focusedCorrelation, runtime }: { events: EventEnvelope[]; focusedCorrelation?: string; runtime?: { epoch: number; active: boolean; state: string } }) {
  const [filter,setFilter] = useState("all");
  const important = useMemo(()=>importantEvents(events),[events]);
  const audit = useMemo(()=>auditGroups(events),[events]);
  const filtered = audit.filter(g=>!filters[filter].length || filters[filter].includes(g.type));
  const preferred = [...important.filter(g=>g.correlation === focusedCorrelation), ...important.filter(g=>g.correlation !== focusedCorrelation)].slice(0,8);
  const row = (group: EventGroup) => {
    const latest = group.events.at(-1)!; const p = latest.payload;
    const verdict = (p.binary as {predicted_class_name?: string}|undefined)?.predicted_class_name;
    const attribution = (p.multiclass as {predicted_class_name?: string}|undefined)?.predicted_class_name;
    const summary = p.state === "manual_review" ? "Manual Review Required" : group.type === "threat_assessment"
      ? `${titleCase(String(p.severity))} · ${titleCase(String(p.status))}${p.disagreement ? " · Model disagreement" : ""}`
      : verdict ? `${verdict} · Model attribution: ${attribution ? titleCase(attribution) : "Not retained"}`
      : String(p.state ?? p.status ?? "Recorded");
    const source = verdict ? group.type === "quantum_prediction" ? "Quantum ML" : "Classical ML" : titleCase(group.type.replaceAll("_", " "));
    return <article className="compact-evidence-row" key={group.key}><b><time>{formatTime(group.latest)}</time> · {source}{group.correlation === focusedCorrelation ? " · Focused scenario" : ""}</b><span>{summary}</span><Disclosure title="Technical event details"><p>{group.events.length} grouped event{group.events.length === 1 ? "" : "s"} · Correlation <code>{group.correlation}</code> · Type: {group.type}</p><PagedRows rows={group.events} size={20} label="raw events" render={event=><details key={event.event_id}><summary>{formatTime(event.timestamp)} · {event.source} · {event.event_id}</summary><pre>{JSON.stringify(event,null,2)}</pre></details>} /></Disclosure></article>;
  };
  return <Panel title="Recent Important Events" kicker="The latest meaningful changes, grouped to keep repeated model activity readable." className="events-panel">
    {runtime && <p className="event-runtime-state">Runtime {runtime.active ? "active" : "inactive"} · {titleCase(runtime.state)}</p>}
    <p className="muted">A model signal is not a confirmed attack. Detailed processing records stay in the technical audit.</p>
    <div data-testid="important-events">{preferred.map(row)}</div>
    <Disclosure title="Advanced — Technical Audit"><p>{events.length} bounded runtime events are grouped below. This is technical process history, not a count of attacks.</p><div className="filter-tabs">{Object.keys(filters).map(name=><button aria-pressed={filter === name} key={name} onClick={()=>setFilter(name)}>{titleCase(name)}</button>)}</div><p>{filtered.reduce((n,g)=>n+g.events.length,0)} matching events in {filtered.length} groups.</p><PagedRows rows={filtered} label="audit groups" render={row} /></Disclosure>
    {!events.length && <p>No technical events retained.</p>}
  </Panel>;
}

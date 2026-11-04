"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { groupIncidents } from "@/features/incidents";
import type { EventEnvelope } from "@/types/api";
import { formatTime, titleCase } from "@/lib/format";
import { Badge, Panel } from "./ui";
import { priorityCases } from "@/features/presentation";
import type { DefenseAction, Recovery } from "@/types/api";
import { Disclosure, PagedRows } from "./evidence-disclosure";

const filters = ["all", "critical", "high", "medium", "low"];

export function IncidentPanel({ events, selectedId, onSelect, focusedCorrelation, actions = [], recoveries = [] }: { events: EventEnvelope[]; selectedId?: string; onSelect: (correlationId: string) => void; focusedCorrelation?: string; actions?: DefenseAction[]; recoveries?: Recovery[] }) {
  const incidents = useMemo(() => groupIncidents(events), [events]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const ordered = useMemo(() => priorityCases(incidents, actions, recoveries), [incidents, actions, recoveries]);
  const filtered = ordered.filter(incident => filter === "all" || incident.latest.payload.severity === filter);
  const focusedCases = filtered.filter((incident) => incident.correlationId === focusedCorrelation);
  const visible = focusedCases.length ? focusedCases : filtered.slice(0, 3);
  const background = incidents.filter(c => c.correlationId !== focusedCorrelation);
  useEffect(() => {
    if (!focusedCorrelation && incidents.length && (!selectedId || !incidents.some((item) => item.correlationId === selectedId))) onSelect(incidents[0].correlationId);
  }, [incidents, onSelect, selectedId, focusedCorrelation]);

  return <Panel title={focusedCases.length ? "Focused Case" : "Priority Background Assessments"} kicker="Cases are correlated threat assessments and may include false-positive-style model activity. Assessment updates stay grouped under one case." className="incidents-panel incident-queue" action={<span className="count-label" title="Cases reconstructed from bounded retained assessment events, not an active incident total.">{incidents.length} retained cases</span>}>
    <p className="incident-focus-explanation">{focusedCases.length ? "The selected synthetic scenario is shown first. Background cases remain secondary and cannot replace it." : "No case is linked to a focused synthetic scenario. A few priority background assessments are shown for context."}</p>
    <div className="incident-filters" aria-label="Incident severity filter">{filters.map((name) => <button type="button" className={filter === name ? "active" : ""} aria-pressed={filter === name} key={name} onClick={() => setFilter(name)}>{name}</button>)}</div>
    {!incidents.length ? <div className="incident-empty"><b>No Assessments Retained</b><span>Assessment updates will appear here grouped by their existing incident IDs.</span></div> : !visible.length ? <div className="incident-empty"><b>No {titleCase(filter)} Assessments</b><span>No retained case matches this assessment severity filter.</span></div> : <div className="incident-table incident-queue-list" data-testid="incident-history"><PagedRows rows={visible} size={10} label="cases" render={(incident) => {
      const p = incident.latest.payload; const isSelected = selectedId === incident.correlationId; const isExpanded = expanded === incident.incidentId;
      return <article key={incident.incidentId} className={isSelected ? "selected" : ""}>
        <button className="incident-row" title={incident.incidentId} onClick={() => { onSelect(incident.correlationId); setExpanded(isExpanded ? null : incident.incidentId); }}>
          {incident.correlationId === focusedCorrelation && <strong>Focused scenario case</strong>}
          {recoveries.some(r => r.correlation_id === incident.correlationId && r.state === "manual_review") && <strong>Manual Review Required</strong>}
          <span className="incident-row-top"><Badge value={p.severity} /><time>{formatTime(incident.latest.timestamp)}</time></span>
          <span className="incident-row-title"><b>{p.suspected_attack_family ? titleCase(p.suspected_attack_family) : "Pending attribution"}</b><small>{shortIncidentId(incident.incidentId)}</small></span>
          <span className="incident-row-context"><b>{p.affected_devices.join(", ") || "No affected device"}</b><small>{titleCase(p.status)} · {p.disagreement ? "Model disagreement" : p.evidence_strength === "corroborated" ? "Corroborated evidence" : "Corroboration not recorded"}</small></span>
          <span className="incident-row-meta"><small>{p.evidence.length} evidence items · {incident.history.length} retained update{incident.history.length === 1 ? "" : "s"}</small><ChevronDown aria-hidden="true" /></span>
        </button>
        {isExpanded && <div className="incident-expand"><p><b>Full incident ID</b><code>{incident.incidentId}</code></p><p>{p.decision_reason}</p><Disclosure title={`View Evidence Updates (${incident.history.length})`}><PagedRows rows={[...incident.history].reverse()} label={`Assessment history for ${incident.incidentId}`} render={revision => <details key={revision.event_id}><summary>{formatTime(revision.timestamp)} · {titleCase(revision.payload.severity)} · {revision.payload.decision_reason}</summary><pre>{JSON.stringify(revision,null,2)}</pre></details>} /></Disclosure></div>}
      </article>;
    }} /></div>}
    <section aria-label="Background Assessment Summary"><h3>Priority Background Cases</h3><p>{background.length} background cases · {background.reduce((n,c)=>n+c.history.length,0)} assessment updates</p><p className="muted">These are retained model-driven assessments, not additional user-launched attacks. Revisions are grouped by incident ID.</p><Disclosure title={`All Retained Cases (${incidents.length})`}><button onClick={() => setFilter("all")}>Clear severity filter</button><PagedRows rows={filtered} label="all retained cases" render={(incident) => <button className="incident-background-row" title={incident.incidentId} aria-label={`Inspect ${incident.latest.payload.suspected_attack_family ? titleCase(incident.latest.payload.suspected_attack_family) : "pending attribution"}, ${titleCase(incident.latest.payload.severity)}, ${incident.history.length} assessment updates`} key={incident.incidentId} onClick={() => onSelect(incident.correlationId)}><b>{incident.latest.payload.suspected_attack_family ? titleCase(incident.latest.payload.suspected_attack_family) : "Pending attribution"}</b><span>{titleCase(incident.latest.payload.severity)} · Assessment updates: {incident.history.length}</span></button>} /></Disclosure></section>
  </Panel>;
}

export function shortIncidentId(value: string) {
  const prefix = value.startsWith("incident-") ? "incident-" : "";
  const remainder = value.slice(prefix.length);
  return remainder.length > 8 ? `${prefix}${remainder.slice(0, 8)}…` : value;
}

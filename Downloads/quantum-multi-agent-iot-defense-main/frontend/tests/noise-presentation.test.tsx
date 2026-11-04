import { toggle } from "./disclosure-helper";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { priorityCases, defenseGroups, reviewQueue, appliedControls, auditGroups, importantEvents } from "@/features/presentation";
import { groupIncidents } from "@/features/incidents";
import { IncidentPanel } from "@/components/incident-panel";
import { DefensePanel } from "@/components/defense-panel";
import { RecoveryPanel } from "@/components/recovery-panel";
import { EventStream } from "@/components/event-stream";
import { api } from "@/lib/api-client";
import { noisyData } from "./noise-fixtures";
import { scenarioAssessment, scenarioDefense, scenarioPrediction } from "./scenario-fixtures";
import type { EventEnvelope } from "@/types/api";

const open = (label: string) => toggle(screen.getByText(label).closest("details")!,{target:{open:true}});
describe("Phase 3 compact evidence hierarchy",()=>{
  it("bounds priority cases, preserves focus, counts background revisions and exposes every case",()=>{
    const d=noisyData(); const select=vi.fn(); const {container}=render(<IncidentPanel events={d.events} actions={d.defenses} recoveries={d.recoveries} focusedCorrelation="corr-A" selectedId="corr-A" onSelect={select} />);
    expect(container.querySelectorAll(".incident-row")).toHaveLength(1);
    expect(screen.getByText("81 background cases · 241 assessment updates")).toBeInTheDocument();
    expect(screen.getByTitle("incident-A").closest("article")).toHaveClass("selected");
    open("All Retained Cases (82)");
    expect(screen.getByText("Showing 1–10 of 82 retained records")).toBeInTheDocument();
    expect(screen.getByLabelText("all retained cases").querySelectorAll("button.incident-background-row")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button",{name:"Next all retained cases"}));
    expect(screen.getByText("Showing 11–20 of 82 retained records")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"high"}));
    expect(container.querySelectorAll(".incident-row")).toHaveLength(3);
  });
  it("groups revisions without losing raw assessments",()=>{
    const d=noisyData();const cases=groupIncidents(d.events);
    expect(cases).toHaveLength(82);expect(cases.reduce((n,c)=>n+c.history.length,0)).toBe(242);
    const c=cases.find(c=>c.correlationId==="corr-background-0")!;
    render(<IncidentPanel events={c.history.map(e=>({...e,payload:{...e.payload}}))} selectedId={c.correlationId} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTitle(c.incidentId));open("View Evidence Updates (3)");
    expect(screen.getByLabelText(`Assessment history for ${c.incidentId}`).querySelectorAll("pre")).toHaveLength(3);
  });
  it("prioritizes severity, then human action/manual review above lower background cases",()=>{
    const cases=groupIncidents([scenarioAssessment("A"),scenarioAssessment("B"),{...scenarioAssessment("C"),payload:{...scenarioAssessment("C").payload,severity:"low"}}]);
    expect(priorityCases(cases,[scenarioDefense("A","planned")],[]).map(c=>c.correlationId)).toEqual(["corr-B","corr-A","corr-C"]);
  });
  it("deduplicates exact action identities without merging distinct actions or correlations",()=>{
    const a=scenarioDefense("A","planned"); const later={...a,status:"completed"};
    const groups=defenseGroups([a,later,{...a,action_id:"other"},scenarioDefense("B","planned")]);
    expect(groups).toHaveLength(3);expect(groups[0].revisions).toHaveLength(2);expect(groups[0].action.status).toBe("completed");
    expect(reviewQueue([a,later],[],undefined)).toHaveLength(0);
  });
  it("shows at most five proposals, no approval controls until selection, and never bulk approves",()=>{
    const d=noisyData();const call=vi.spyOn(api,"defense");render(<DefensePanel actions={d.defenses} policy={d.policy} events={d.events} onComplete={vi.fn()} />);
    const queue=screen.getByRole("region",{name:"Review Queue"});expect(within(queue).getAllByRole("button")).toHaveLength(5);
    expect(screen.queryByRole("button",{name:"Approve"})).not.toBeInTheDocument();
    fireEvent.click(within(queue).getAllByRole("button")[0]);expect(screen.getAllByRole("button",{name:"Approve"})).toHaveLength(1);
    expect(call).not.toHaveBeenCalled();call.mockRestore();
    open("View All Pending Proposals (60)");expect(screen.getByLabelText("proposals").querySelectorAll("article")).toHaveLength(10);
    expect(screen.queryByRole("button",{name:/Approve all/i})).not.toBeInTheDocument();
  });
  it("derives applied controls from policy only and keeps history collapsed",()=>{
    const d=noisyData(); expect(appliedControls(d.policy)).toEqual([]);
    render(<DefensePanel actions={d.defenses} policy={{...d.policy,gateway_protection:true}} onComplete={vi.fn()} />);
    expect(screen.getByText("Gateway Protection")).toBeInTheDocument();expect(screen.queryByTestId("defense-history")).not.toBeInTheDocument();
    open("Response History (21) — View Full History");expect(screen.getByLabelText("defense history").querySelectorAll("article")).toHaveLength(10);
  });
  it("keeps manual review easy to find and recovery history behind deliberate selection",()=>{
    const d=noisyData(); render(<RecoveryPanel records={d.recoveries} focusedRecoveryId="recovery-A" />);
    expect(screen.getByTestId("recovery-history").children).toHaveLength(1);
    expect(within(screen.getByRole("region",{name:"Unresolved recovery"})).getAllByRole("button")).toHaveLength(5);
    expect(screen.getByText("Recovery History (21) — View Full History")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-history")).toHaveTextContent("Manual Review Required");
  });
  it("defaults to a bounded Important Events view and keeps 1000+ processing events in audit",()=>{
    const d=noisyData();render(<EventStream events={d.events} focusedCorrelation="corr-A" />);
    expect(screen.getByTestId("important-events").children).toHaveLength(8);
    expect(screen.queryByText("Feature Vector")).not.toBeInTheDocument();
    const auditDisclosure = screen.getByText("Advanced — Technical Audit");
    open(auditDisclosure.textContent!);fireEvent.click(screen.getByRole("button",{name:"Features"}));
    expect(screen.getByText("1200 matching events in 4 groups.")).toBeInTheDocument();
    toggle(screen.getAllByText("Technical event details")[0].closest("details")!,{target:{open:true}});
    expect(screen.getAllByLabelText("raw events")[0].querySelectorAll("details").length).toBeGreaterThan(0);
  });
  it("audit aggregation preserves every event ID, correlation, count and timestamp bounds",()=>{
    const events=noisyData().events;const groups=auditGroups(events);
    expect(groups.reduce((n,g)=>n+g.events.length,0)).toBe(events.length);
    expect(new Set(groups.flatMap(g=>g.events.map(e=>e.event_id)))).toEqual(new Set(events.map(e=>e.event_id)));
    expect(groups.every(g=>g.events.every(e=>e.event_type===g.type && e.correlation_id===g.correlation && e.timestamp>=g.first && e.timestamp<=g.latest))).toBe(true);
  });
  it("groups repeated verdicts but preserves disagreement and return-to-earlier-verdict transitions",()=>{
    const a=scenarioPrediction(); const b=scenarioPrediction("A",false,false);
    const events=[a,{...a,event_id:"repeat"},{...b,event_id:"change"},{...a,event_id:"return"},scenarioPrediction("B")];
    const groups=importantEvents(events);expect(groups).toHaveLength(4);expect(groups[0].events).toHaveLength(2);
    expect(groups.reduce((n,g)=>n+g.events.length,0)).toBe(5);
  });
  it("retains real attack, defense, human and recovery lifecycle events including manual review",()=>{
    const types=["attack_scheduled","attack_started","attack_completed","attack_cancelled","defense_action_requested","human_override","defense_action_completed","defense_action_failed","defense_rollback","recovery_started","recovery_progress","recovery_verified"];
    const events=types.map((type,i)=>({event_id:String(i),event_type:type,source:"fixture",correlation_id:"A",timestamp:new Date(i*1000).toISOString(),payload:{action_id:"a",recovery_id:"r",state:type==="recovery_progress"?"manual_review":type}})) as EventEnvelope[];
    expect(importantEvents(events)).toHaveLength(types.length);render(<EventStream events={events} />);expect(screen.getByText("Manual Review Required")).toBeInTheDocument();
  });
  it("shows runtime state and clears summaries on reset without synthetic audit rows",()=>{
    const d=noisyData();const view=render(<EventStream events={d.events} runtime={{epoch:1,active:true,state:"running"}} />);
    expect(screen.getByText("Runtime active · Running")).toBeInTheDocument();
    view.rerender(<EventStream events={[]} runtime={{epoch:2,active:false,state:"stopped"}} />);
    expect(screen.getByText("Runtime inactive · Stopped")).toBeInTheDocument();expect(screen.getByText("No technical events retained.")).toBeInTheDocument();
  });
});

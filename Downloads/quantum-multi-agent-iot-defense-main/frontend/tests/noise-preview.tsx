// Manual acceptance harness only. Never imported by the production application.
import { noisyData } from "./noise-fixtures";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "@/lib/api-client";
import { LiveRuntimeProvider } from "@/components/live-runtime-provider";
import Overview from "@/app/page";
import Response from "@/app/attack-response/page";
import Detection from "@/app/detection/page";
import Incidents from "@/app/incidents/page";
import Agents from "@/app/multi-agent/page";
import { dashboardSnapshot } from "./fixtures";
import { scenarioData, scenarioAttack, scenarioPrediction, scenarioAssessment, scenarioDefense, scenarioRecovery } from "./scenario-fixtures";
import type { EventEnvelope } from "@/types/api";
import "@/styles/globals.css";

let fixture = noisyData();
fixture.attacks = fixture.attacks.map(attack => ({...attack,status:"completed"}));
fixture.activeAttacks = [];
let nextId = 0;
class FixtureSocket {
  static sockets: FixtureSocket[] = [];
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() { FixtureSocket.sockets.push(this); setTimeout(() => this.onopen?.(), 0); }
  close() { FixtureSocket.sockets = FixtureSocket.sockets.filter((socket) => socket !== this); this.onclose?.(); }
}
window.WebSocket = FixtureSocket as unknown as typeof WebSocket;
api.snapshot = async () => structuredClone(fixture);
api.scheduleAttack = async (body) => {
  const attack = { ...scenarioAttack(String(++nextId), "scheduled"), attack_type: body.attack_type, target_device_id: body.target_device_id };
  fixture.attacks.push(attack); return attack;
};
api.startAttack = async (id) => { const attack = fixture.attacks.find((item) => item.attack_id === id)!; attack.status = "active"; fixture.activeAttacks = fixture.attacks.filter((item) => item.status === "active"); return attack; };
api.cancelAttack = async (id) => { const attack = fixture.attacks.find((item) => item.attack_id === id)!; attack.status = "cancelled"; fixture.activeAttacks = fixture.attacks.filter((item) => item.status === "active"); return attack; };
api.resetSystem = async () => { fixture = { ...dashboardSnapshot(), attackTypes: scenarioData().attackTypes, epoch: fixture.epoch + 1 }; nextId = 0; return { ...fixture.runtimeStatus, epoch: fixture.epoch }; };
api.defense = async (id, action) => { const record = fixture.defenses.find((item) => item.action_id === id)!; record.status = action === "approve" ? "completed" : action === "rollback" ? "rolled_back" : action === "reject" ? "rejected" : "cancelled"; return record; };
// Keep every harness control local, including controls not needed for this acceptance path.
api.activateSystem = async () => fixture.runtimeStatus;
api.deactivateSystem = async () => { fixture.runtimeStatus.active = false; return fixture.runtimeStatus; };
api.simulation = async (action) => ({ action, status: fixture.simulation, events_emitted: 0 });
api.tick = async () => ({ action: "tick", status: fixture.simulation, events_emitted: 0 });

function emit(event: EventEnvelope) {
  fixture.events.push(event); fixture.sequence++;
  for (const socket of FixtureSocket.sockets) socket.onmessage?.({ data: JSON.stringify({ epoch: fixture.epoch, sequence: fixture.sequence, type: event.event_type, payload: { event } }) });
}
const pages = { Overview, "Attack & Response": Response, Detection, Incidents, "Multi-Agent": Agents };
function addFixture(kind: string) {
    const id = String(nextId || 1);
    if (kind === "background") { fixture.defenses.push(scenarioDefense("B", "running")); fixture.recoveries.push(scenarioRecovery("B", "recovered", true)); emit({ ...scenarioAssessment("B"), event_id: `background-${fixture.sequence}` }); }
    if (kind === "classical") { emit(scenarioPrediction(id)); emit(scenarioAssessment(id)); }
    if (kind === "qml") emit(scenarioPrediction(id, true, false));
    if (kind === "defense") { fixture.defenses.push(scenarioDefense(id)); fixture.policy.gateway_protection = true; fixture.policy.action_count++; emit({ ...scenarioAssessment(id), event_id: `defense-event-${id}`, event_type: "defense_action_completed" }); }
    if (kind === "review") { fixture.recoveries.push(scenarioRecovery(id)); const attack = fixture.attacks.find((item) => item.correlation_id === `corr-${id}`); if (attack) attack.status = "completed"; fixture.activeAttacks = []; emit({ ...scenarioAssessment(id), event_id: `recovery-event-${id}`, event_type: "recovery_progress" }); }
}
function Preview() {
  const [page, setPage] = useState<keyof typeof pages>("Overview"); const [, repaint] = useState(0);
  const Page = pages[page];
  const add = (kind: string) => { addFixture(kind); repaint((value) => value + 1); };
  return <><aside style={{ padding: 16, background: "#fff4d3" }}><b>PHASE 3 HIGH-NOISE FIXTURE QA — NOT LIVE MODEL RESULTS</b><p>Local fixtures drive actual page components and the shared provider. No backend or external network operations. In-memory socket instances: {FixtureSocket.sockets.length}</p><nav>{Object.keys(pages).map((name) => <button key={name} onClick={() => setPage(name as keyof typeof pages)}>{name}</button>)}</nav><div>{["background", "classical", "qml", "defense", "review"].map((kind) => <button key={kind} onClick={() => add(kind)}>Fixture: {kind}</button>)}</div></aside><LiveRuntimeProvider><Page /></LiveRuntimeProvider></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);

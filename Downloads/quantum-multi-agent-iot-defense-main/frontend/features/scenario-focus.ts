import type { Attack, DashboardSnapshot, EventEnvelope, PredictionPayload } from "@/types/api";

// Operator selection only. Runtime lifecycle/evidence always comes from the shared snapshot.
export interface ScenarioFocus {
  epoch: number;
  attackId: string;
  correlationId: string;
  attackType: string;
  target: string;
  startTick: number;
}

export function scenarioFocus(attack: Attack, epoch: number): ScenarioFocus {
  return { epoch, attackId: attack.attack_id, correlationId: attack.correlation_id,
    attackType: attack.attack_type, target: attack.target_device_id, startTick: attack.start_tick };
}

export function validFocus(focus: ScenarioFocus | null | undefined, epoch: number) {
  return focus?.epoch === epoch ? focus : null;
}

export function scenarioQmlPending(attack: Attack | undefined, hasFeatures: boolean, runtimeActive: boolean, qmlDegraded: boolean, hasQmlResult: boolean) {
  return !hasQmlResult && hasFeatures && runtimeActive && !qmlDegraded
    && (attack?.status === "scheduled" || attack?.status === "active");
}

export function scenarioAttacks(data: DashboardSnapshot) {
  return [...new Map([...data.attacks, ...data.activeAttacks].map((attack) => [attack.attack_id, attack])).values()];
}

export function scenarioRecords(data: DashboardSnapshot, selection: ScenarioFocus | null | undefined) {
  const focus = validFocus(selection, data.epoch);
  const events = focus ? data.events.filter((event) => event.correlation_id === focus.correlationId) : [];
  const features = focus ? [...new Map([...data.recentFeatures, ...events.filter((event) => event.event_type === "feature_vector")]
    .filter((event) => event.correlation_id === focus.correlationId).map((event) => [event.event_id, event])).values()] : [];
  // The flow read model has no correlation ID. Only join explicit feature flow IDs,
  // and only while the retained feature timestamp belongs to that current flow window.
  const flows = data.flows.filter((flow) => features.some((event) => event.payload.flow_id === flow.flow_id
    && Date.parse(event.timestamp) >= Date.parse(flow.flow_start) && Date.parse(event.timestamp) <= Date.parse(flow.flow_end)));
  const defenses = focus ? data.defenses.filter((action) => action.correlation_id === focus.correlationId) : [];
  const recoveries = focus ? data.recoveries.filter((record) => record.correlation_id === focus.correlationId
    && !data.defenses.some((action) => action.action_id === record.defense_action_id && action.correlation_id !== focus.correlationId)) : [];
  return { focus, events, features, flows, defenses, recoveries,
    attack: focus ? scenarioAttacks(data).find((attack) => attack.attack_id === focus.attackId && attack.correlation_id === focus.correlationId) : undefined,
    backgroundAssessments: data.events.filter((event) => event.event_type === "threat_assessment" && (!focus || event.correlation_id !== focus.correlationId)).length };
}

export function scenarioModelEvidence(events: EventEnvelope[]) {
  const classical = [...events].reverse().find((event) => event.event_type === "classical_prediction") as EventEnvelope<PredictionPayload> | undefined;
  const classicalVectorId = classical?.payload.feature_vector_event_id;
  // Agreement is valid only when both agents evaluated the exact same feature vector.
  // Older retained events without vector provenance remain visible independently but cannot be paired.
  const quantum = [...events].reverse().find((event) => event.event_type === "quantum_prediction") as EventEnvelope<PredictionPayload> | undefined;
  const matchedQuantum = classicalVectorId ? [...events].reverse().find((event) => event.event_type === "quantum_prediction"
    && (event.payload as unknown as PredictionPayload).feature_vector_event_id === classicalVectorId) as EventEnvelope<PredictionPayload> | undefined : undefined;
  const comparison = !classical && !quantum ? "No correlated model evidence yet"
    : !classical ? "No correlated Classical evidence retained" : !matchedQuantum ? quantum ? "No matched feature evidence" : "Awaiting QML"
    : classical.payload.binary.predicted_class_id === matchedQuantum.payload.binary.predicted_class_id ? "Agreement" : "Disagreement";
  return { classical, quantum, matchedQuantum, comparison };
}

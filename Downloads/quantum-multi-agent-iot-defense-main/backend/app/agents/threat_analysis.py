from dataclasses import dataclass, field

from app.domain.agents import AgentType
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    ClassicalPredictionEvent,
    ObservationEvent,
    QuantumPredictionEvent,
    SimulationEvent,
    ThreatAssessmentEvent,
    ThreatAssessmentPayload,
    ThreatEvidence,
)

from .base import BaseAgent
from .utils import event_identity


@dataclass
class IncidentState:
    correlation_id: str
    affected_devices: set[str] = field(default_factory=set)
    observations: list[ObservationEvent] = field(default_factory=list)
    classical: ClassicalPredictionEvent | None = None
    quantum: QuantumPredictionEvent | None = None
    assessment_count: int = 0


class ThreatAnalysisAgent(BaseAgent):
    """Builds provisional, rule-explained assessments without probability averaging."""

    def __init__(self, bus: AsyncEventBus, *, incident_limit: int = 500, audit_limit: int = 500):
        super().__init__(
            agent_id="threat-analysis-agent",
            agent_type=AgentType.THREAT_ANALYSIS,
            name="Threat Analysis Agent",
            role="Correlate monitoring, classical, and QML evidence into provisional assessments",
            bus=bus,
            subscriptions={"observation", "classical_prediction", "quantum_prediction"},
            audit_limit=audit_limit,
        )
        self.incidents: dict[str, IncidentState] = {}
        self.incident_limit = incident_limit

    async def handle_event(self, event: SimulationEvent) -> None:
        if not isinstance(
            event, (ObservationEvent, ClassicalPredictionEvent, QuantumPredictionEvent)
        ):
            return
        key = str(event.correlation_id)
        incident = self.incidents.setdefault(key, IncidentState(correlation_id=key))
        if isinstance(event, ObservationEvent):
            incident.observations.append(event)
            incident.affected_devices.update(event.payload.device_ids)
        elif isinstance(event, ClassicalPredictionEvent):
            incident.classical = event
            incident.affected_devices.update(event.payload.device_ids)
        else:
            incident.quantum = event
            incident.affected_devices.update(event.payload.device_ids)
        if len(self.incidents) > self.incident_limit:
            self.incidents.pop(next(iter(self.incidents)))

        incident.assessment_count += 1
        assessment = ThreatAssessmentEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=self._assess(incident),
        )
        await self.publish(assessment, "published provisional rule-based threat assessment")

    def _assess(self, incident: IncidentState) -> ThreatAssessmentPayload:
        evidence: list[ThreatEvidence] = []
        anomaly = any(item.payload.anomaly_detected for item in incident.observations)
        for observation in incident.observations[-5:]:
            evidence.append(
                ThreatEvidence(
                    source=observation.source,
                    category="monitoring",
                    summary=observation.payload.summary,
                    strength="context",
                )
            )

        if incident.classical is None:
            return ThreatAssessmentPayload(
                incident_id=f"incident-{incident.correlation_id}",
                affected_devices=sorted(incident.affected_devices),
                detected=None,
                suspected_attack_family=None,
                severity="low" if anomaly else "informational",
                evidence_strength="context_only" if evidence else "insufficient",
                evidence=evidence,
                disagreement=False,
                decision_reason=(
                    "Structural anomaly observed; feature-based evidence is not yet available."
                    if anomaly
                    else "Monitoring context only; no feature-based detection decision is available."
                ),
            )

        classical_attack = incident.classical.payload.binary.predicted_class_id == 1
        evidence.append(
            ThreatEvidence(
                source=incident.classical.source,
                category="classical_binary",
                summary=(
                    f"Primary classical detector predicted "
                    f"{incident.classical.payload.binary.predicted_class_name}."
                ),
                strength="primary",
            )
        )
        classical_family = incident.classical.payload.multiclass.predicted_class_name
        if classical_family != "Normal":
            evidence.append(
                ThreatEvidence(
                    source=incident.classical.source,
                    category="classical_attribution",
                    summary=f"Classical attribution suggests {classical_family}; attribution is supporting only.",
                    strength="supporting",
                )
            )

        qml_attack: bool | None = None
        qml_family: str | None = None
        quantum_event = incident.quantum
        if (quantum_event is not None and quantum_event.payload.feature_vector_event_id
                != incident.classical.payload.feature_vector_event_id):
            quantum_event = None
        if quantum_event is not None and quantum_event.payload.feature_vector_event_id is not None:
            qml_attack = quantum_event.payload.binary.predicted_class_id == 1
            qml_family = quantum_event.payload.multiclass.predicted_class_name
            evidence.append(
                ThreatEvidence(
                    source=quantum_event.source,
                    category="qml_binary",
                    summary=(
                        f"QML corroborator predicted "
                        f"{incident.quantum.payload.binary.predicted_class_name}."
                    ),
                    strength="supporting",
                )
            )
            if qml_family != "Normal":
                evidence.append(
                    ThreatEvidence(
                        source=quantum_event.source,
                        category="qml_attribution",
                        summary=f"QML attribution suggests {qml_family}; it is not treated as certainty.",
                        strength="supporting",
                    )
                )

        disagreement = qml_attack is not None and qml_attack != classical_attack
        corroborated = qml_attack is not None and qml_attack == classical_attack
        if classical_attack:
            severity = "high" if corroborated else "medium"
            if anomaly and corroborated:
                severity = "high"
            strength = "corroborated" if corroborated else "primary"
            reason = (
                "Classical binary detection is the primary signal and QML independently corroborates it."
                if corroborated
                else "Classical binary detection is positive; QML evidence is absent or disagrees."
            )
        else:
            severity = "low" if anomaly or disagreement else "informational"
            strength = "corroborated" if corroborated else "primary"
            reason = (
                "Classical primary detector is negative and QML corroborates the negative result."
                if corroborated
                else "Classical primary detector is negative; context or QML disagreement requires observation."
            )

        suspected = None
        if classical_attack and classical_family != "Normal":
            suspected = classical_family
            if qml_family and qml_family != classical_family:
                reason += " Multiclass attribution models disagree, so family attribution remains tentative."
        return ThreatAssessmentPayload(
            incident_id=f"incident-{incident.correlation_id}",
            affected_devices=sorted(incident.affected_devices),
            detected=classical_attack,
            suspected_attack_family=suspected,
            severity=severity,
            evidence_strength=strength,
            evidence=evidence,
            disagreement=disagreement,
            decision_reason=reason,
        )

    def public_state(self) -> dict[str, object]:
        return {
            "incident_count": len(self.incidents),
            "provisional_assessments": sum(
                incident.assessment_count for incident in self.incidents.values()
            ),
            "queued_events": self._queue.qsize(),
        }

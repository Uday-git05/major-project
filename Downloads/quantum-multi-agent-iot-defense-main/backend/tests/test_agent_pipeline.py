from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.agents.factory import create_default_agent_manager
from app.agents.monitoring import MonitoringAgent
from app.agents.threat_analysis import ThreatAnalysisAgent
from app.agents.defense import DefenseAgent
from app.agents.recovery import RecoveryAgent
from app.agents.manager import AgentManager
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    NetworkActivityEvent,
    NetworkActivityPayload,
)

from agent_test_utils import FakeInferenceService, feature_event


@pytest.mark.anyio
async def test_monitoring_to_threat_event_propagation_preserves_correlation():
    bus = AsyncEventBus()
    manager = AgentManager()
    monitoring = MonitoringAgent(bus)
    threat = ThreatAnalysisAgent(bus)
    manager.register(monitoring)
    manager.register(threat)
    assessments = []
    await bus.subscribe("threat_assessment", assessments.append)
    await manager.start_all()
    correlation_id = uuid4()
    network = NetworkActivityEvent(
        event_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        source="soil-01",
        correlation_id=correlation_id,
        payload=NetworkActivityPayload(
            source_device_id="soil-01",
            destination_device_id="gateway-01",
            source_address="10.42.0.2",
            destination_address="10.42.0.1",
            source_port=20002,
            destination_port=1883,
            protocol="TCP",
            service="mqtt",
            direction="device_to_gateway",
            packet_count=2,
            byte_count=120,
            payload_bytes=40,
            header_bytes=80,
            duration_seconds=0.02,
            inter_arrival_time_seconds=0.01,
            response_packet_count=1,
            response_byte_count=58,
            success=True,
        ),
    )
    await bus.publish(network)
    await manager.wait_idle()
    assert assessments
    assert assessments[-1].correlation_id == correlation_id
    assert assessments[-1].payload.detected is None
    assert assessments[-1].payload.evidence_strength == "context_only"
    await manager.stop_all()


@pytest.mark.anyio
async def test_correlated_model_threat_defense_recovery_chain_is_planning_only():
    bus = AsyncEventBus()
    manager = create_default_agent_manager(bus, FakeInferenceService(attack=True))
    emitted = []
    await bus.subscribe("*", emitted.append)
    await manager.start_all()
    source = feature_event()
    await bus.publish(source)
    await manager.wait_idle()
    correlated = [event for event in emitted if event.correlation_id == source.correlation_id]
    kinds = {event.event_type for event in correlated}
    assert {
        "feature_vector",
        "classical_prediction",
        "quantum_prediction",
        "threat_assessment",
        "defense_action",
        "recovery",
    }.issubset(kinds)
    defense_events = [event for event in correlated if event.event_type == "defense_action"]
    assert defense_events
    assert all(event.payload.status == "planned" for event in defense_events)
    assert all(event.payload.executed is False for event in defense_events)
    recovery_events = [event for event in correlated if event.event_type == "recovery"]
    assert all(event.payload.verified is False for event in recovery_events)
    assert len({event.correlation_id for event in correlated}) == 1
    await manager.stop_all()


@pytest.mark.anyio
async def test_threat_policy_uses_primary_and_corroborating_evidence_not_average():
    bus = AsyncEventBus()
    manager = create_default_agent_manager(bus, FakeInferenceService(attack=True))
    assessments = []
    await bus.subscribe("threat_assessment", assessments.append)
    await manager.start_all()
    await bus.publish(feature_event())
    await manager.wait_idle()
    assert any(item.payload.evidence_strength == "primary" for item in assessments)
    assert any(item.payload.evidence_strength == "corroborated" for item in assessments)
    final = assessments[-1].payload
    assert "primary" in final.decision_reason.lower()
    assert final.status == "provisional"
    await manager.stop_all()


@pytest.mark.anyio
async def test_defense_and_recovery_expose_interface_state_only():
    bus = AsyncEventBus()
    manager = create_default_agent_manager(bus, FakeInferenceService(attack=True))
    await manager.start_all()
    await bus.publish(feature_event())
    await manager.wait_idle()
    defense = manager.get("defense-agent")
    recovery = manager.get("recovery-agent")
    assert isinstance(defense, DefenseAgent)
    assert isinstance(recovery, RecoveryAgent)
    assert defense.planned_actions
    assert all(action.executed is False for action in defense.planned_actions)
    assert recovery.recovery_records
    assert all(record.state == "awaiting_execution" for record in recovery.recovery_records)
    await manager.stop_all()

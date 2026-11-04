from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import TypeAdapter
from fastapi.testclient import TestClient

from app.defense.manager import DefenseActionError, DefenseManager
from app.defense.policy import VirtualSecurityPolicyStore
from app.recovery.manager import RecoveryManager
from app.main import app
from app.defense.dependencies import get_defense_manager
from app.recovery.dependencies import get_recovery_manager
from app.simulation.engine import SimulationEngine
from app.simulation.events import (
    AttackCompletedEvent, AttackLifecyclePayload, DefenseActionCompletedEvent,
    DefenseLifecyclePayload, NetworkActivityEvent, NetworkActivityPayload,
    RecoveryVerifiedEvent, SimulationEvent, ThreatAssessmentEvent,
    ThreatAssessmentPayload, ThreatEvidence,
)


def assessment(engine, *, severity="high", disagreement=False, corroborated=True):
    return ThreatAssessmentEvent(
        event_id=uuid4(), timestamp=engine.clock.current_time, source="threat-analysis-agent",
        correlation_id=uuid4(), payload=ThreatAssessmentPayload(
            incident_id=f"incident-{uuid4()}",
            affected_devices=["synthetic-source-7", "gateway-01"], detected=True,
            suspected_attack_family="Port_Scanning", severity=severity,
            evidence_strength="corroborated" if corroborated else "primary",
            evidence=[ThreatEvidence(source="classical-ml-agent", category="prediction",
                                     summary="primary", strength="primary")],
            disagreement=disagreement, decision_reason="Classical primary; QML corroborating."))


def stack(*, verification_ticks=2):
    engine = SimulationEngine(seed=13)
    policy = VirtualSecurityPolicyStore()
    engine.attach_security_policy(policy)
    defense = DefenseManager(engine.bus, engine, policy)
    recovery = RecoveryManager(engine.bus, engine, defense, verification_ticks=verification_ticks)
    return engine, policy, defense, recovery


@pytest.mark.anyio
async def test_corroborated_high_executes_simulator_only_quarantine():
    engine, policy, defense, _ = stack()
    record = await defense.assess(assessment(engine))
    assert record.status == "completed"
    assert record.target in policy.quarantined_sources
    assert record.result == {"changed": True, "simulator_only": True}


@pytest.mark.anyio
async def test_disagreement_stays_proposal_and_does_not_change_policy():
    engine, policy, defense, _ = stack()
    record = await defense.assess(assessment(engine, severity="medium", disagreement=True,
                                              corroborated=False))
    assert record.status == "planned"
    assert record.human_override_state == "pending"
    assert policy.view().action_count == 0


@pytest.mark.anyio
async def test_low_severity_is_observation_only():
    engine, policy, defense, _ = stack()
    assert await defense.assess(assessment(engine, severity="low")) is None
    assert defense.history() == []
    assert policy.view().action_count == 0


@pytest.mark.anyio
async def test_human_approve_reject_cancel_and_idempotent_rollback():
    engine, policy, defense, _ = stack()
    proposed = await defense.assess(assessment(engine, severity="medium", disagreement=True,
                                                corroborated=False))
    approved = await defense.approve(proposed.action_id, "operator", "verified evidence")
    assert approved.status == "completed"
    first = await defense.rollback(approved.action_id, "operator", "incident closed")
    second = await defense.rollback(approved.action_id, "operator", "repeat")
    assert first.action_id == second.action_id
    assert first.status == "rolled_back"
    assert approved.target not in policy.quarantined_sources

    rejectable = await defense.request(incident_id="r", action_type="protect_gateway_mode",
        target="gateway-01", reason="review", evidence=[], correlation_id=uuid4(), initiated_by="human")
    assert (await defense.reject(rejectable.action_id, "operator", "false positive")).status == "rejected"
    with pytest.raises(DefenseActionError):
        await defense.cancel(rejectable.action_id, "operator", "too late")


def test_policy_suppresses_attack_selectively_and_rate_limits_without_blocking_all():
    policy = VirtualSecurityPolicyStore()
    events = [_network("synthetic-source-7", "mqtt", 1883) for _ in range(8)]
    policy.apply("rate", "rate_limit_virtual_service", "mqtt")
    accepted = policy.filter_attack_events(events)
    assert 0 < len(accepted) < len(events)
    policy.apply("quarantine", "quarantine_synthetic_source", "synthetic-source-7")
    assert policy.filter_attack_events(events) == []
    assert policy.counters["attack_events_suppressed"] == len(events)


@pytest.mark.anyio
async def test_isolation_suppresses_normal_virtual_device_communications():
    engine, policy, _, _ = stack()
    policy.apply("isolate", "isolate_virtual_device", "soil_moisture-01")
    await engine.start()
    await engine.tick()
    events = engine.events(event_type="telemetry", limit=100)
    assert all(event.payload.device_id != "soil_moisture-01" for event in events)
    assert policy.counters["normal_events_suppressed"] > 0


@pytest.mark.anyio
async def test_recovery_waits_for_attack_completion_then_rolls_back_and_verifies():
    engine, policy, defense, recovery = stack(verification_ticks=2)
    await engine.start()
    action = await defense.assess(assessment(engine))
    completed = _defense_completed(engine, action)
    await recovery.handle_event(completed)
    await engine.tick()
    tick_event = engine.events(event_type="simulation_tick", limit=1)[0]
    await recovery.handle_event(tick_event)
    record = recovery.history()[0]
    assert record.state == "monitoring"

    attack_done = AttackCompletedEvent(
        event_id=uuid4(), timestamp=engine.clock.current_time, source="attack-controller",
        correlation_id=action.correlation_id,
        payload=AttackLifecyclePayload(attack_id="a", attack_type="Port_Scanning",
            target_device_id="gateway-01", status="completed", start_tick=1, end_tick=1,
            intensity="high", severity_hint="high"))
    await recovery.handle_event(attack_done)
    for _ in range(3):
        await engine.tick()
        await recovery.handle_event(engine.events(event_type="simulation_tick", limit=1)[0])
        for normal in engine.events(event_type="telemetry", limit=1):
            await recovery.handle_event(normal)
    assert record.state == "recovered"
    assert record.verified is True
    assert action.target not in policy.quarantined_sources


def test_new_events_are_part_of_discriminated_simulation_contract():
    engine, _, _, _ = stack()
    event = RecoveryVerifiedEvent(
        event_id=uuid4(), timestamp=datetime.now(timezone.utc), source="recovery-agent",
        correlation_id=uuid4(), payload={"recovery_id": "r", "defense_action_id": "d",
            "state": "recovered", "tick_number": 2, "reason": "stable", "verified": True})
    validated = TypeAdapter(SimulationEvent).validate_python(event.model_dump())
    assert isinstance(validated, RecoveryVerifiedEvent)


def test_defense_and_recovery_api_contracts_expose_history_and_manual_controls():
    engine, policy, defense, recovery = stack()
    app.dependency_overrides[get_defense_manager] = lambda: defense
    app.dependency_overrides[get_recovery_manager] = lambda: recovery
    try:
        with TestClient(app) as client:
            response = client.post("/v1/defense/manual", json={
                "actor": "operator", "reason": "contain test source",
                "action_type": "quarantine_synthetic_source",
                "target": "synthetic-source-api", "incident_id": "api-test"})
            assert response.status_code == 200
            action_id = response.json()["action_id"]
            assert client.get("/v1/defense/actions").json()[0]["status"] == "completed"
            rollback = client.post(f"/v1/defense/actions/{action_id}/rollback", json={
                "actor": "operator", "reason": "test complete"})
            assert rollback.status_code == 200
            assert rollback.json()["status"] == "rolled_back"
            assert client.get("/v1/recovery").json() == []
    finally:
        app.dependency_overrides.pop(get_defense_manager, None)
        app.dependency_overrides.pop(get_recovery_manager, None)


def _network(source, service, port):
    return NetworkActivityEvent(
        event_id=uuid4(), timestamp=datetime.now(timezone.utc), source=source,
        correlation_id=uuid4(), payload=NetworkActivityPayload(
            source_device_id=source, destination_device_id="gateway-01",
            source_address="172.31.0.2", destination_address="10.0.0.1",
            source_port=44444, destination_port=port, protocol="TCP", service=service,
            direction="synthetic_to_target", packet_count=1, byte_count=40,
            payload_bytes=0, header_bytes=40, duration_seconds=.1,
            inter_arrival_time_seconds=.1, response_packet_count=0,
            response_byte_count=0, success=False))


def _defense_completed(engine, action):
    return DefenseActionCompletedEvent(
        event_id=uuid4(), timestamp=engine.clock.current_time, source="defense-manager",
        correlation_id=action.correlation_id,
        payload=DefenseLifecyclePayload(action_id=action.action_id,
            incident_id=action.incident_id, action_type=action.action_type,
            target=action.target, status="completed", reason=action.reason,
            result=action.result, initiated_by=action.initiated_by))

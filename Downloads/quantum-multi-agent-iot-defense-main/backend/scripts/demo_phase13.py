"""Deterministic Phase 13 demonstrations; no real network or device operations."""
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.defense import DefenseAgent
from app.agents.manager import AgentManager
from app.agents.recovery import RecoveryAgent
from app.attacks.controller import AttackController
from app.attacks.schemas import ScheduleAttackRequest
from app.defense.manager import DefenseManager
from app.defense.policy import VirtualSecurityPolicyStore
from app.recovery.manager import RecoveryManager
from app.simulation.engine import SimulationEngine
from app.simulation.events import ThreatAssessmentEvent, ThreatAssessmentPayload, ThreatEvidence


async def main() -> None:
    corroborated = await corroborated_cycle()
    disagreement = await disagreement_cycle()
    print(json.dumps({"corroborated_high": corroborated,
                      "disagreement_medium": disagreement}, indent=2, default=str))


async def corroborated_cycle() -> dict[str, object]:
    engine, policy, defense, recovery, agents, attacks = build_stack()
    await agents.start_all(); await attacks.start(); await engine.start()
    scenario = await attacks.schedule(ScheduleAttackRequest(
        attack_type="Port_Scanning", duration_ticks=3, intensity="high", seed=17))
    await engine.tick(); before = scenario.network_events_generated
    await engine.bus.publish(threat(engine, scenario.correlation_id, scenario.source_device_id,
                                    severity="high", disagreement=False))
    await agents.wait_idle()
    action = defense.history()[-1]
    await engine.tick(2); await agents.wait_idle()
    suppressed = policy.counters["attack_events_suppressed"]
    await engine.tick(3); await agents.wait_idle()
    record = recovery.history()[-1]
    result = {
        "chain": ["ThreatAssessmentEvent", "DefenseAgent", action.action_type,
                  "RecoveryAgent", record.state],
        "action_status": action.status, "attack_events_before_defense": before,
        "attack_events_suppressed": suppressed, "recovery_verified": record.verified,
        "policy_state": policy.view().model_dump(), "simulator_only": True,
    }
    await attacks.stop(); await agents.stop_all()
    return result


async def disagreement_cycle() -> dict[str, object]:
    engine, policy, defense, _, agents, attacks = build_stack()
    await agents.start_all(); await attacks.start(); await engine.start()
    correlation = uuid4()
    await engine.bus.publish(threat(engine, correlation, "synthetic-source-23",
                                    severity="medium", disagreement=True))
    await agents.wait_idle()
    action = defense.history()[-1]
    result = {"action_status": action.status, "human_override_state": action.human_override_state,
              "aggressive_isolation_applied": bool(policy.isolated_devices),
              "policy_action_count": policy.view().action_count,
              "decision": "classical primary retained; QML disagreement created proposal only"}
    await attacks.stop(); await agents.stop_all()
    return result


def build_stack():
    engine = SimulationEngine(seed=1313)
    policy = VirtualSecurityPolicyStore(); engine.attach_security_policy(policy)
    defense = DefenseManager(engine.bus, engine, policy)
    recovery = RecoveryManager(engine.bus, engine, defense, verification_ticks=2)
    agents = AgentManager()
    agents.register(DefenseAgent(engine.bus, manager=defense))
    agents.register(RecoveryAgent(engine.bus, manager=recovery))
    attacks = AttackController(engine.bus, engine); attacks.attach_security_policy(policy)
    return engine, policy, defense, recovery, agents, attacks


def threat(engine, correlation_id, source, *, severity, disagreement):
    return ThreatAssessmentEvent(
        event_id=uuid4(), timestamp=engine.clock.current_time, source="demo-threat-analysis",
        correlation_id=correlation_id, payload=ThreatAssessmentPayload(
            incident_id=f"demo-{correlation_id}", affected_devices=[source, "gateway-01"],
            detected=True, suspected_attack_family="Port_Scanning", severity=severity,
            evidence_strength="primary" if disagreement else "corroborated",
            evidence=[ThreatEvidence(source="classical-ml-agent", category="binary",
                summary="Primary detector flagged synthetic flow", strength="primary"),
                ThreatEvidence(source="quantum-ml-agent", category="binary",
                summary="Asynchronous corroboration" if not disagreement else "Disagreement",
                strength="supporting")], disagreement=disagreement,
            decision_reason="Classical model is primary; QML is corroborating evidence only."))


if __name__ == "__main__":
    asyncio.run(main())

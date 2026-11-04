"""Deterministic real-model Phase 15 normal -> attack -> defense -> recovery run."""
import asyncio
from collections import Counter
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.attacks.schemas import ScheduleAttackRequest
from app.runtime.dependencies import get_runtime_coordinator


async def wait_until(predicate, *, timeout_seconds: float = 120.0) -> None:
    loop = asyncio.get_running_loop(); deadline = loop.time() + timeout_seconds
    while not predicate():
        if loop.time() >= deadline:
            raise TimeoutError("Phase 15 demonstration condition was not reached")
        await asyncio.sleep(0.05)


async def main() -> None:
    runtime = get_runtime_coordinator()
    captured = []
    target_correlation = None
    async def capture(event):
        if target_correlation is not None and event.correlation_id == target_correlation:
            captured.append(event)
    await runtime.simulation.bus.subscribe("*", capture)
    await runtime.initialize(); await runtime.reset(); await runtime.activate()
    print("SYSTEM ACTIVATED", flush=True)
    await wait_until(lambda: runtime.simulation.clock.tick_number >= 2)
    normal_tick = runtime.simulation.clock.tick_number
    scenario = await runtime.attacks.schedule(ScheduleAttackRequest(
        attack_type="Port_Scanning", duration_ticks=4, intensity="high", seed=1515))
    target_correlation = scenario.correlation_id
    await wait_until(lambda: runtime.attacks.get(scenario.attack_id).status in {"completed", "failed"})
    await wait_until(lambda: runtime.agents.get("classical-ml-agent").is_idle())
    # Recovery is conditional on actual frozen-model evidence; never synthesize success.
    await wait_until(lambda: runtime.simulation.clock.tick_number >= scenario.end_tick + 4)
    await runtime.simulation.pause()
    await runtime.agents.wait_idle()
    events = captured
    predictions = [event for event in events if event.event_type in
                   {"classical_prediction", "quantum_prediction"}]
    assessments = [event for event in events if event.event_type == "threat_assessment"]
    actions = [item for item in runtime.defense.history()
               if item.correlation_id == scenario.correlation_id]
    recoveries = [item for item in runtime.recovery.history()
                  if item.correlation_id == scenario.correlation_id]
    first_classical = next((event for event in predictions
                            if event.event_type == "classical_prediction"), None)
    first_quantum = next((event for event in predictions
                          if event.event_type == "quantum_prediction"), None)
    lifecycle_types = {
        "attack_started", "attack_completed", "defense_action_requested",
        "defense_action_started", "defense_action_completed", "defense_rollback",
        "recovery_started", "recovery_progress", "recovery_verified", "recovery_failed",
    }
    output = {
        "demo_seed": 1515, "normal_period_end_tick": normal_tick,
        "attack": scenario.model_dump(mode="json"),
        "event_counts": dict(Counter(event.event_type for event in events)),
        "lifecycle_sequence": [event.event_type for event in events
                               if event.event_type in lifecycle_types],
        "first_classical_prediction": prediction_summary(first_classical),
        "first_quantum_prediction": prediction_summary(first_quantum),
        "assessment_transitions": assessment_transitions(assessments),
        "defenses": [item.model_dump(mode="json") for item in actions],
        "recoveries": [item.model_dump(mode="json") for item in recoveries],
        "suppressed_attack_events": runtime.defense.policy.counters["attack_events_suppressed"],
        "final_tick": runtime.simulation.clock.tick_number,
        "normal_telemetry_resumed": any(event.event_type == "telemetry"
            and event.timestamp > runtime.simulation.clock.initial_time for event in runtime.broadcaster.recent_events),
    }
    print(json.dumps(output, indent=2), flush=True)
    await runtime.deactivate(); await runtime.shutdown()


def prediction_summary(event):
    if event is None:
        return None
    return {
        "type": event.event_type,
        "binary_label": event.payload.binary.predicted_class_name,
        "binary_confidence": event.payload.binary.confidence,
        "binary_latency_ms": event.payload.binary.latency_ms,
        "multiclass_label": event.payload.multiclass.predicted_class_name,
        "multiclass_confidence": event.payload.multiclass.confidence,
        "multiclass_latency_ms": event.payload.multiclass.latency_ms,
    }


def assessment_transitions(events):
    transitions = []
    for event in events:
        transition = {
            "severity": event.payload.severity,
            "status": event.payload.status,
            "evidence_strength": event.payload.evidence_strength,
            "model_disagreement": event.payload.disagreement,
        }
        if not transitions or transitions[-1] != transition:
            transitions.append(transition)
    return transitions


if __name__ == "__main__":
    asyncio.run(main())

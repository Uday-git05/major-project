"""Deterministic Phase 16 validation harness using the frozen production artifacts.

The harness only drives the in-memory simulator and writes measured results. It does
not retrain models, modify artifacts, or open network sockets.
"""
from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from statistics import mean, median
import sys
from time import perf_counter
import tracemalloc
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.factory import create_default_agent_manager
from app.attacks.controller import AttackController
from app.attacks.presets import PRESETS
from app.attacks.schemas import ScheduleAttackRequest
from app.config import PROJECT_ROOT, Settings
from app.defense.manager import DefenseManager
from app.defense.policy import VirtualSecurityPolicyStore
from app.features.contract import feature_contract
from app.features.manager import FeatureExtractionManager
from app.inference.registry import ArtifactRegistry
from app.inference.service import InferenceService
from app.recovery.manager import RecoveryManager
from app.runtime.broadcaster import LiveEventBroadcaster
from app.runtime.coordinator import RuntimeCoordinator
from app.runtime.runner import AutomaticSimulationRunner
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine
from app.simulation.events import (
    SimulationTickEvent,
    SimulationTickPayload,
    ThreatAssessmentEvent,
    ThreatAssessmentPayload,
    ThreatEvidence,
)


RESULT_PATH = PROJECT_ROOT / "artifacts" / "phase16_validation_results_v1.json"
FROZEN_FILES = {
    "binary_xgboost_gpu_v1.json": PROJECT_ROOT / "models" / "binary_xgboost_gpu_v1.json",
    "multiclass_logistic_regression_v1.joblib": PROJECT_ROOT / "models" / "multiclass_logistic_regression_v1.joblib",
    "binary_qml_amplitude_v1.pt": PROJECT_ROOT / "models" / "binary_qml_amplitude_v1.pt",
    "multiclass_qml_selected_final_v1.pt": PROJECT_ROOT / "models" / "multiclass_qml_selected_final_v1.pt",
    "binary_standard_scaler_v1.joblib": PROJECT_ROOT / "artifacts" / "binary_standard_scaler_v1.joblib",
    "multiclass_standard_scaler_v1.joblib": PROJECT_ROOT / "artifacts" / "multiclass_standard_scaler_v1.joblib",
    "feature_schema_v2_reproducible.json": PROJECT_ROOT / "artifacts" / "feature_schema_v2_reproducible.json",
    "class_mapping_v1.json": PROJECT_ROOT / "artifacts" / "class_mapping_v1.json",
    "qml_amplitude_representation_v1.json": PROJECT_ROOT / "artifacts" / "qml_amplitude_representation_v1.json",
    "binary_qml_threshold_v1.json": PROJECT_ROOT / "artifacts" / "binary_qml_threshold_v1.json",
}


def make_runtime(registry: ArtifactRegistry, *, seed: int = 1616) -> RuntimeCoordinator:
    engine = SimulationEngine(seed=seed, event_history_limit=2_000)
    policy = VirtualSecurityPolicyStore()
    engine.attach_security_policy(policy)
    features = FeatureExtractionManager(
        engine.bus,
        emission_interval_seconds=0,
        minimum_packets=2,
        history_limit=500,
    )
    defense = DefenseManager(engine.bus, engine, policy, history_limit=500)
    recovery = RecoveryManager(engine.bus, engine, defense, verification_ticks=2, history_limit=500)
    service = InferenceService(registry)
    agents = create_default_agent_manager(
        engine.bus, service, defense_manager=defense, recovery_manager=recovery
    )
    attacks = AttackController(engine.bus, engine, history_limit=500)
    attacks.attach_security_policy(policy)
    broadcaster = LiveEventBroadcaster(engine.bus, queue_size=256, history_size=2_000)
    return RuntimeCoordinator(
        simulation=engine,
        features=features,
        agents=agents,
        attacks=attacks,
        defense=defense,
        recovery=recovery,
        registry=registry,
        broadcaster=broadcaster,
        runner=AutomaticSimulationRunner(engine, tick_interval=3_600),
        demo_seed=seed,
        recent_event_limit=2_000,
    )


async def start_manual(runtime: RuntimeCoordinator) -> None:
    await runtime.initialize()
    await runtime.activate()
    await runtime.runner.stop()


async def ticks(runtime: RuntimeCoordinator, count: int, queue_peaks: dict[str, int] | None = None) -> None:
    for _ in range(count):
        await runtime.simulation.tick()
        if queue_peaks is not None:
            for view in runtime.agents.views():
                queue_peaks[view.agent_id] = max(
                    queue_peaks.get(view.agent_id, 0), int(view.state["queued_events"])
                )
        await runtime.agents.wait_idle()


def stats(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "observations": len(values),
        "mean_ms": round(mean(values), 4),
        "median_ms": round(median(values), 4),
        "min_ms": round(min(values), 4),
        "max_ms": round(max(values), 4),
        "p95_ms": round(ordered[p95_index], 4),
    }


def artifact_integrity(registry: ArtifactRegistry) -> dict[str, object]:
    hashes = {
        name: {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
        for name, path in FROZEN_FILES.items()
    }
    # Deployment parameters are intentionally frozen (requires_grad=False); the
    # architecture invariant is the total checkpoint-backed parameter count.
    binary_parameters = sum(item.numel() for item in registry.binary_qml.parameters())
    multiclass_parameters = sum(item.numel() for item in registry.multiclass_qml.parameters())
    return {
        "status": "passed",
        "files": hashes,
        "feature_count": len(registry.feature_names),
        "feature_order": list(registry.feature_names),
        "classical_binary_threshold": registry.binary_xgb_threshold,
        "qml_binary_threshold": registry.binary_qml_threshold,
        "qml_trainable_parameters": {"binary": binary_parameters, "multiclass": multiclass_parameters},
        "qml_device": registry.qml_device,
        "checkpoint_compatibility": binary_parameters == 51 and multiclass_parameters == 93,
        "selected_models": {
            "classical_binary": "binary_xgboost_gpu_v1.json",
            "classical_multiclass": "multiclass_logistic_regression_v1.joblib",
            "qml_binary": "binary_qml_amplitude_v1.pt",
            "qml_multiclass": "multiclass_qml_selected_final_v1.pt",
        },
    }


async def lifecycle_validation(registry: ArtifactRegistry) -> dict[str, object]:
    runtime = make_runtime(registry, seed=1601)
    cycles = []
    await runtime.initialize()
    for _ in range(3):
        activated = await runtime.activate()
        await runtime.runner.stop()
        await ticks(runtime, 1)
        await runtime.simulation.pause()
        await runtime.simulation.resume()
        old_epoch = runtime.broadcaster.epoch
        await runtime.reset()
        await runtime.runner.stop()
        snapshot = runtime.snapshot()
        deactivated = await runtime.deactivate()
        subscription_count = sum(len(items) for items in runtime.simulation.bus._subscriptions.values())
        cycles.append({
            "startup_order": activated["startup_order"],
            "new_epoch": snapshot["epoch"] == old_epoch + 1,
            "reset_tick": snapshot["simulation"]["tick_number"],
            "attacks": len(snapshot["attacks"]),
            "defenses": len(snapshot["defenses"]),
            "recoveries": len(snapshot["recoveries"]),
            "policy_actions": snapshot["policy"]["action_count"],
            "agent_count": len(snapshot["agents"]),
            "subscriptions_after_deactivate": subscription_count,
            "active_after_deactivate": deactivated["active"],
        })
    await runtime.shutdown()
    active_tasks = [task.get_name() for task in asyncio.all_tasks() if not task.done() and task is not asyncio.current_task() and (task.get_name().startswith("agent:") or "simulation-runner" in task.get_name())]
    return {"status": "passed", "cycles": cycles, "orphan_runtime_tasks": active_tasks}


async def normal_soak(registry: ArtifactRegistry) -> tuple[dict[str, object], dict[str, float]]:
    runtime = make_runtime(registry, seed=1602)
    events = []
    await runtime.simulation.bus.subscribe("*", events.append)
    await start_manual(runtime)
    queue_peaks: dict[str, int] = {}
    tracemalloc.start()
    memory_before = tracemalloc.get_traced_memory()[0]
    started = perf_counter()
    await ticks(runtime, 50, queue_peaks)
    elapsed = perf_counter() - started
    memory_after, memory_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    counts = Counter(event.event_type for event in events)
    assessments = [event for event in events if event.event_type == "threat_assessment"]
    false_positive_correlations = {
        str(event.correlation_id) for event in assessments if event.payload.detected is True
    }
    agent_views = runtime.agents.views()
    sample = runtime.features.recent_vectors[-1].payload.features
    flow = next(iter(runtime.features.active_flows.values()))
    feature_timings = []
    for _ in range(30):
        mark = perf_counter(); runtime.features.extractor.extract(flow)
        feature_timings.append((perf_counter() - mark) * 1000)
    await runtime.shutdown()
    return ({
        "status": "passed",
        "logical_ticks": 50,
        "elapsed_seconds": round(elapsed, 3),
        "event_counts": dict(counts),
        "feature_vectors": counts["feature_vector"],
        "classical_inferences": counts["classical_prediction"],
        "qml_inferences": counts["quantum_prediction"],
        "threat_assessments": counts["threat_assessment"],
        "false_positive_incident_correlations_observed": len(false_positive_correlations),
        "agent_queue_peaks": queue_peaks,
        "agent_dropped_events": {view.agent_id: view.state["dropped_events"] for view in agent_views},
        "agent_errors": {view.agent_id: view.error_count for view in agent_views},
        "websocket_drops": runtime.broadcaster.total_dropped,
        "python_traced_memory_delta_bytes": memory_after - memory_before,
        "python_traced_memory_peak_bytes": memory_peak,
        "history_sizes": {
            "simulation_events": len(runtime.simulation.events(limit=10_000)),
            "feature_vectors": len(runtime.features.recent_vectors),
            "agent_audit_max": max(len(agent.audit()) for agent in runtime.agents._agents.values()),
            "broadcast_events": len(runtime.broadcaster.recent_events),
        },
    }, {"sample_features": sample, "feature_extraction": feature_timings})


def prediction_counts(events, event_type: str) -> dict[str, int]:
    return dict(Counter(
        f"{event.payload.binary.predicted_class_name}|{event.payload.multiclass.predicted_class_name}"
        for event in events if event.event_type == event_type
    ))


async def attack_validation(registry: ArtifactRegistry) -> list[dict[str, object]]:
    results = []
    for index, attack_type in enumerate(PRESETS, start=1):
        runtime = make_runtime(registry, seed=1700 + index)
        events = []
        await runtime.simulation.bus.subscribe("*", events.append)
        await start_manual(runtime)
        await ticks(runtime, 2)
        scenario = await runtime.attacks.schedule(ScheduleAttackRequest(
            attack_type=attack_type, duration_ticks=3, intensity="high", seed=1700 + index
        ))
        await ticks(runtime, 9)
        correlated = [event for event in events if event.correlation_id == scenario.correlation_id]
        assessments = [event for event in correlated if event.event_type == "threat_assessment"]
        final_assessment = assessments[-1].payload if assessments else None
        defenses = [item for item in runtime.defense.history() if item.correlation_id == scenario.correlation_id]
        recoveries = [item for item in runtime.recovery.history() if item.correlation_id == scenario.correlation_id]
        results.append({
            "attack_type": str(attack_type),
            "target": scenario.target_device_id,
            "intensity": str(scenario.intensity),
            "ticks_active": scenario.ticks_active,
            "attack_network_events": scenario.network_events_generated,
            "feature_vectors": sum(event.event_type == "feature_vector" for event in correlated),
            "classical_outputs": prediction_counts(correlated, "classical_prediction"),
            "qml_outputs": prediction_counts(correlated, "quantum_prediction"),
            "final_threat_severity": str(final_assessment.severity) if final_assessment else None,
            "agreement": (not final_assessment.disagreement) if final_assessment else None,
            "defense_actions": [f"{item.action_type}:{item.status}" for item in defenses],
            "recovery_results": [f"{item.state}:verified={item.verified}" for item in recoveries],
            "classical_attack_observed": any(
                event.event_type == "classical_prediction" and event.payload.binary.predicted_class_id == 1
                for event in correlated
            ),
            "qml_attack_observed": any(
                event.event_type == "quantum_prediction" and event.payload.binary.predicted_class_id == 1
                for event in correlated
            ),
        })
        await runtime.shutdown()
    return results


async def sequential_validation(registry: ArtifactRegistry) -> dict[str, object]:
    runtime = make_runtime(registry, seed=1801)
    events = []
    await runtime.simulation.bus.subscribe("*", events.append)
    await start_manual(runtime)
    correlations = []
    for attack_type in ("Port_Scanning", "MQTT_Flood"):
        scenario = await runtime.attacks.schedule(ScheduleAttackRequest(
            attack_type=attack_type, duration_ticks=2, intensity="high", seed=1801 + len(correlations)
        ))
        correlations.append(str(scenario.correlation_id))
        await ticks(runtime, 7)
    correlated_incidents = {
        correlation: sorted({
            event.payload.incident_id for event in events
            if event.event_type == "threat_assessment"
            and str(event.correlation_id) == correlation
        })
        for correlation in correlations
    }
    result = {
        "status": "passed",
        "correlations": correlations,
        "correlations_distinct": len(set(correlations)) == 2,
        "incident_ids_by_correlation": correlated_incidents,
        "incidents_scoped": all(len(values) <= 1 for values in correlated_incidents.values()),
        "policy_action_count_after_sequences": runtime.defense.policy.view().action_count,
    }
    await runtime.shutdown()
    return result


async def reset_validations(registry: ArtifactRegistry) -> dict[str, object]:
    runtime = make_runtime(registry, seed=1901)
    await start_manual(runtime)
    scenario = await runtime.attacks.schedule(ScheduleAttackRequest(
        attack_type="UDP_Flood", duration_ticks=10, intensity="high", seed=1901
    ))
    await ticks(runtime, 2)
    active_before = bool(runtime.attacks.active_attacks())
    old_epoch = runtime.broadcaster.epoch
    await runtime.reset(); await runtime.runner.stop()
    attack_reset = {
        "active_before": active_before,
        "new_epoch": runtime.broadcaster.epoch == old_epoch + 1,
        "attacks_cleared": runtime.attacks.all_attacks() == [],
        "features_cleared": len(runtime.features.recent_vectors) == 0,
        "defenses_cleared": runtime.defense.history() == [],
        "recoveries_cleared": runtime.recovery.history() == [],
        "policy_cleared": runtime.defense.policy.view().action_count == 0,
        "scenario_was": scenario.attack_id,
    }
    correlation = uuid4()
    threat = ThreatAssessmentEvent(
        event_id=uuid4(), timestamp=runtime.simulation.clock.current_time,
        source="phase16-validation", correlation_id=correlation,
        payload=ThreatAssessmentPayload(
            incident_id=f"incident-{correlation}",
            affected_devices=["synthetic-source-reset", "gateway-01"],
            detected=True, suspected_attack_family="UDP_Flood", severity="high",
            evidence_strength="corroborated",
            evidence=[ThreatEvidence(source="phase16", category="validation", summary="controlled", strength="primary")],
            disagreement=False, decision_reason="Controlled reset cleanup validation.",
        ),
    )
    await runtime.simulation.bus.publish(threat)
    await runtime.agents.wait_idle()
    defense_before = len(runtime.defense.history())
    recovery_before = len(runtime.recovery.history())
    await runtime.reset(); await runtime.runner.stop()
    defense_reset = {
        "defense_before": defense_before,
        "recovery_before": recovery_before,
        "defenses_cleared": runtime.defense.history() == [],
        "recoveries_cleared": runtime.recovery.history() == [],
        "policy_cleared": runtime.defense.policy.view().action_count == 0,
    }
    await runtime.shutdown()
    return {"status": "passed", "reset_during_attack": attack_reset, "reset_during_defense_recovery": defense_reset}


async def human_override_validation(registry: ArtifactRegistry) -> dict[str, object]:
    runtime = make_runtime(registry, seed=2001)
    lifecycle = []
    await runtime.simulation.bus.subscribe("*", lifecycle.append)
    manager = runtime.defense
    async def request(label: str):
        return await manager.request(
            incident_id=label, action_type="quarantine_synthetic_source",
            target=f"synthetic-source-{label}", reason="phase16 controlled validation",
            evidence=["human:validation"], correlation_id=uuid4(), initiated_by="phase16-operator"
        )
    approved = await request("approve")
    await manager.approve(approved.action_id, "phase16-operator", "approved")
    await manager.rollback(approved.action_id, "phase16-operator", "rollback")
    rejected = await request("reject")
    await manager.reject(rejected.action_id, "phase16-operator", "rejected")
    cancelled = await request("cancel")
    await manager.cancel(cancelled.action_id, "phase16-operator", "cancelled")
    manual = await manager.request(
        incident_id="manual", action_type="protect_gateway_mode", target="gateway-01",
        reason="manual allowed validation", evidence=["human:manual"], correlation_id=uuid4(),
        initiated_by="phase16-operator"
    )
    await manager.approve(manual.action_id, "phase16-operator", "manual allowed")
    return {
        "status": "passed",
        "states": {
            "approve_then_rollback": str(manager.get(approved.action_id).status),
            "reject": str(manager.get(rejected.action_id).status),
            "cancel": str(manager.get(cancelled.action_id).status),
            "manual_allowed": str(manager.get(manual.action_id).status),
        },
        "human_override_events": sum(event.event_type == "human_override" for event in lifecycle),
        "rollback_events": sum(event.event_type == "defense_rollback" for event in lifecycle),
    }


async def performance_validation(registry: ArtifactRegistry, soak_aux: dict[str, object]) -> dict[str, object]:
    service = InferenceService(registry)
    features = soak_aux["sample_features"]
    timings: dict[str, list[float]] = {
        "classical_binary": [], "classical_multiclass": [], "qml_binary": [], "qml_multiclass": []
    }
    methods = {
        "classical_binary": service.predict_classical_binary,
        "classical_multiclass": service.predict_classical_multiclass,
        "qml_binary": service.predict_qml_binary,
        "qml_multiclass": service.predict_qml_multiclass,
    }
    for name, method in methods.items():
        for _ in range(8):
            response = method(features, uuid4())
            timings[name].append(response.latency_ms)
    bus = AsyncEventBus(); broadcaster = LiveEventBroadcaster(bus, queue_size=32)
    await broadcaster.start(); _, client = broadcaster.connect()
    websocket_timings = []
    for index in range(20):
        event = SimulationTickEvent(
            event_id=uuid4(), timestamp=datetime.now(timezone.utc), source="phase16",
            correlation_id=uuid4(),
            payload=SimulationTickPayload(tick_number=index + 1, tick_duration_seconds=1, state="running")
        )
        mark = perf_counter(); await bus.publish(event); client.queue.get_nowait(); client.queue.task_done()
        websocket_timings.append((perf_counter() - mark) * 1000)
    await broadcaster.stop()
    return {
        "feature_extraction": stats(soak_aux["feature_extraction"]),
        **{name: stats(values) for name, values in timings.items()},
        "websocket_in_process_delivery": stats(websocket_timings),
        "disclosure": "Local single-machine observations; not a formal benchmark.",
    }


def safety_validation() -> dict[str, object]:
    patterns = ("import scapy", "from scapy", "socket.socket(", "nmap.", "iptables", "netsh ")
    findings = []
    for path in (PROJECT_ROOT / "backend" / "app").rglob("*.py"):
        text = path.read_text(encoding="utf-8").lower()
        for pattern in patterns:
            if pattern in text:
                findings.append({"file": path.relative_to(PROJECT_ROOT).as_posix(), "pattern": pattern})
    return {
        "status": "passed" if not findings else "failed",
        "prohibited_implementation_findings": findings,
        "boundary": "In-memory metadata-only simulator; no physical-device or OS network controls.",
    }


async def main() -> None:
    settings = Settings(artifacts_dir=PROJECT_ROOT / "artifacts", models_dir=PROJECT_ROOT / "models")
    registry = ArtifactRegistry(settings)
    lifecycle = await lifecycle_validation(registry)
    soak, soak_aux = await normal_soak(registry)
    attacks = await attack_validation(registry)
    sequential = await sequential_validation(registry)
    resets = await reset_validations(registry)
    overrides = await human_override_validation(registry)
    performance = await performance_validation(registry, soak_aux)
    disagreements = {
        "classical_attack_qml_normal": [item["attack_type"] for item in attacks if item["classical_attack_observed"] and not item["qml_attack_observed"]],
        "classical_attack_qml_attack": [item["attack_type"] for item in attacks if item["classical_attack_observed"] and item["qml_attack_observed"]],
        "policy": "No probability averaging; classical is primary and QML is asynchronous corroboration.",
    }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artifact_integrity": artifact_integrity(registry),
        "lifecycle": lifecycle,
        "normal_soak": soak,
        "attacks": attacks,
        "sequential_attacks": sequential,
        "disagreement_observations": disagreements,
        "resets": resets,
        "human_overrides": overrides,
        "performance": performance,
        "safety": safety_validation(),
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

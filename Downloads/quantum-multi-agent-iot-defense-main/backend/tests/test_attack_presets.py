import pytest

from app.attacks.presets import PRESETS
from app.attacks.schemas import AttackStatus, AttackType, ScheduleAttackRequest

from attack_test_utils import attack_environment


def test_exactly_seven_supported_types_and_botnet_excluded():
    assert set(PRESETS) == set(AttackType)
    assert len(PRESETS) == 7
    assert "BotNet_DDOS" not in {item.value for item in AttackType}


@pytest.mark.anyio
@pytest.mark.parametrize("attack_type", list(AttackType))
async def test_each_preset_generates_internal_network_metadata(attack_type):
    bus, engine, controller, features = attack_environment()
    captured = []
    await bus.subscribe("*", captured.append)
    await controller.start()
    await features.start()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=attack_type,
            duration_ticks=1,
            seed=19,
        )
    )
    await engine.start()
    await engine.tick()
    attack_network = [
        event
        for event in captured
        if event.event_type == "network_activity"
        and controller.ground_truth_for_event(event.event_id) is not None
    ]
    assert scenario.status is AttackStatus.COMPLETED
    assert attack_network
    assert all(event.payload.packet_samples for event in attack_network)
    assert all(event.payload.destination_device_id == scenario.target_device_id for event in attack_network)
    assert controller.history() == [scenario]
    assert any(event.event_type == "feature_vector" for event in captured)
    await features.stop()
    await controller.stop()


@pytest.mark.anyio
async def test_same_seed_is_exactly_deterministic_and_different_seed_varies():
    async def run(seed):
        bus, engine, controller, _ = attack_environment(simulation_seed=77)
        captured = []
        await bus.subscribe("network_activity", captured.append)
        await controller.start()
        await controller.schedule(
            ScheduleAttackRequest(
                attack_type=AttackType.HTTP_FLOOD,
                duration_ticks=1,
                intensity="high",
                seed=seed,
            )
        )
        await engine.start()
        await engine.tick()
        result = [
            event.model_dump(mode="json")
            for event in captured
            if controller.ground_truth_for_event(event.event_id) is not None
        ]
        await controller.stop()
        return result

    assert await run(31) == await run(31)
    assert await run(31) != await run(32)

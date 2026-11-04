from functools import lru_cache

from app.api.agents import get_agent_manager
from app.api.attacks import get_attack_controller
from app.api.features import get_feature_manager
from app.api.routes import get_registry
from app.api.simulation import get_simulation_engine
from app.config import get_settings
from app.defense.dependencies import get_defense_manager
from app.recovery.dependencies import get_recovery_manager

from .broadcaster import LiveEventBroadcaster
from .coordinator import RuntimeCoordinator
from .runner import AutomaticSimulationRunner


@lru_cache
def get_broadcaster() -> LiveEventBroadcaster:
    settings = get_settings()
    return LiveEventBroadcaster(get_simulation_engine().bus,
        queue_size=settings.websocket_queue_size,
        history_size=settings.runtime_recent_event_limit)


@lru_cache
def get_runtime_coordinator() -> RuntimeCoordinator:
    settings = get_settings()
    engine = get_simulation_engine()
    return RuntimeCoordinator(
        simulation=engine, features=get_feature_manager(), agents=get_agent_manager(),
        attacks=get_attack_controller(), defense=get_defense_manager(),
        recovery=get_recovery_manager(), registry=get_registry(),
        broadcaster=get_broadcaster(),
        runner=AutomaticSimulationRunner(engine, tick_interval=settings.runtime_tick_interval_seconds),
        demo_seed=settings.demo_seed, recent_event_limit=settings.runtime_recent_event_limit,
    )

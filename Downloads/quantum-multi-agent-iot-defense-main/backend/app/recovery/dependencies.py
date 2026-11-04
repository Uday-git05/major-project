from functools import lru_cache

from app.api.simulation import get_simulation_engine
from app.config import get_settings
from app.defense.dependencies import get_defense_manager

from .manager import RecoveryManager


@lru_cache
def get_recovery_manager() -> RecoveryManager:
    engine = get_simulation_engine()
    return RecoveryManager(
        engine.bus, engine, get_defense_manager(),
        verification_ticks=get_settings().recovery_verification_ticks,
    )

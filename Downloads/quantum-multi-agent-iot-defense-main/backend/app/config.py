from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FARMFLOW_",
        env_file=PROJECT_ROOT / "backend" / ".env",
        extra="ignore",
    )

    app_name: str = "FarmFlow IDS Inference API"
    app_version: str = "0.1.0"
    artifacts_dir: Path = PROJECT_ROOT / "artifacts"
    models_dir: Path = PROJECT_ROOT / "models"
    qml_device: str = "lightning.qubit"
    log_level: str = "INFO"
    simulation_seed: int = 42
    simulation_tick_seconds: float = Field(default=1.0, gt=0.0)
    simulation_speed: float = Field(default=1.0, gt=0.0)
    simulation_telemetry_frequency: int = Field(default=1, ge=1)
    simulation_soil_sensor_count: int = Field(default=2, ge=1)
    simulation_temperature_sensor_count: int = Field(default=1, ge=1)
    simulation_humidity_sensor_count: int = Field(default=1, ge=1)
    feature_flow_inactivity_timeout_seconds: float = Field(default=5.0, gt=0.0)
    feature_flow_max_age_seconds: float = Field(default=30.0, gt=0.0)
    feature_emission_interval_seconds: float = Field(default=1.0, ge=0.0)
    feature_min_packets: int = Field(default=2, ge=1)
    feature_history_limit: int = Field(default=500, ge=1, le=10_000)
    feature_provenance_limit: int = Field(default=64, ge=1, le=1_000)
    attack_history_limit: int = Field(default=500, ge=1, le=10_000)
    autonomous_defense_enabled: bool = True
    autonomous_defense_minimum_severity: str = "high"
    recovery_verification_ticks: int = Field(default=2, ge=1, le=100)
    max_concurrent_defense_actions: int = Field(default=4, ge=1, le=100)
    auto_run_simulation: bool = False
    runtime_tick_interval_seconds: float = Field(default=1.0, gt=0.05, le=60.0)
    demo_seed: int = 1515
    websocket_queue_size: int = Field(default=256, ge=8, le=10_000)
    runtime_recent_event_limit: int = Field(default=2000, ge=50, le=10_000)
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @field_validator("artifacts_dir", "models_dir", mode="after")
    @classmethod
    def resolve_path(cls, value: Path) -> Path:
        if not value.is_absolute():
            value = (PROJECT_ROOT / "backend" / value).resolve()
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

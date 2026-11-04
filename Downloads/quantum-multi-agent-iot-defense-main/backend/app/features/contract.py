import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Mapping


EXTRACTOR_VERSION = "synthetic-farm-flow-compat-v1"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
FEATURE_SCHEMA_PATH = PROJECT_ROOT / "artifacts" / "feature_schema_v2_reproducible.json"


class FeatureContractError(ValueError):
    pass


@lru_cache(maxsize=1)
def feature_contract() -> tuple[str, tuple[str, ...]]:
    if not FEATURE_SCHEMA_PATH.is_file():
        raise FeatureContractError(f"Frozen feature schema is missing: {FEATURE_SCHEMA_PATH}")
    with FEATURE_SCHEMA_PATH.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    names = tuple(document.get("deployment_features", ()))
    declared_count = document.get("deployment_feature_count")
    if declared_count != 27 or len(names) != 27 or len(set(names)) != 27:
        raise FeatureContractError("Frozen feature schema must define 27 unique deployment features")
    return str(document.get("schema_version")), names


def validate_feature_mapping(features: Mapping[str, float]) -> None:
    _, expected = feature_contract()
    actual = tuple(features.keys())
    if actual != expected:
        raise FeatureContractError(
            "Feature names/order differ from frozen artifact; "
            f"expected={list(expected)}, actual={list(actual)}"
        )
    for name, value in features.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise FeatureContractError(f"Feature {name} must be numeric")
        if not math.isfinite(float(value)):
            raise FeatureContractError(f"Feature {name} must be finite")

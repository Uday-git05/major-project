from collections.abc import Mapping, Sequence
import warnings

import numpy as np

from .errors import FeatureContractError


def ordered_feature_array(
    features: Mapping[str, float], feature_names: Sequence[str]
) -> np.ndarray:
    expected = set(feature_names)
    actual = set(features)
    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing={missing}")
        if unexpected:
            details.append(f"unexpected={unexpected}")
        raise FeatureContractError("Feature contract mismatch: " + ", ".join(details))

    vector = np.asarray([[features[name] for name in feature_names]], dtype=np.float64)
    if vector.shape != (1, 27):
        raise FeatureContractError(f"Expected feature shape (1, 27), received {vector.shape}")
    if not np.isfinite(vector).all():
        raise FeatureContractError("All feature values must be finite")
    return vector


def scale_features(raw: np.ndarray, scaler: object) -> np.ndarray:
    # The registry has already proven the scaler's feature_names_in_ matches the schema.
    # Suppress sklearn's DataFrame-only advisory while keeping the inference core numpy-only.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="X does not have valid feature names, but StandardScaler was fitted with feature names",
            category=UserWarning,
        )
        return np.asarray(scaler.transform(raw), dtype=np.float64)


def qml_amplitude_preprocess(raw: np.ndarray, scaler: object) -> np.ndarray:
    scaled = scale_features(raw, scaler)
    if scaled.shape != (1, 27):
        raise FeatureContractError(f"Scaler returned incompatible shape {scaled.shape}")
    norm = float(np.linalg.norm(scaled[0], ord=2))
    if not np.isfinite(norm) or norm <= np.finfo(np.float64).eps:
        raise FeatureContractError("QML preprocessing produced a zero or invalid L2 norm")
    normalized = scaled[0] / norm
    padded = np.pad(normalized, (0, 5), mode="constant", constant_values=0.0)
    if padded.shape != (32,):
        raise FeatureContractError(f"Expected amplitude vector shape (32,), received {padded.shape}")
    return padded.astype(np.float32, copy=False)

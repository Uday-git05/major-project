import numpy as np
import pytest

from app.inference.errors import FeatureContractError
from app.inference.preprocessing import ordered_feature_array, qml_amplitude_preprocess


def test_feature_order_is_schema_order(registry, sample_features):
    reverse_order = dict(reversed(list(sample_features.items())))
    result = ordered_feature_array(reverse_order, registry.feature_names)
    assert result.shape == (1, 27)
    assert result[0, 0] == sample_features[registry.feature_names[0]]


def test_feature_contract_rejects_missing_and_extra(registry, sample_features):
    invalid = dict(sample_features)
    invalid.pop(registry.feature_names[0])
    invalid["invented_feature"] = 1.0
    with pytest.raises(FeatureContractError, match="missing=.*unexpected="):
        ordered_feature_array(invalid, registry.feature_names)


def test_qml_preprocessing_is_normalized_and_zero_padded(registry, sample_features):
    raw = ordered_feature_array(sample_features, registry.feature_names)
    result = qml_amplitude_preprocess(raw, registry.binary_scaler)
    assert result.shape == (32,)
    assert np.linalg.norm(result) == pytest.approx(1.0, abs=1e-6)
    assert result[27:].tolist() == [0.0] * 5

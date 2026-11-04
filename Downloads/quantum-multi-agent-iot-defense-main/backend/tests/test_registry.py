import pytest
import torch

from app.inference.errors import ArtifactCompatibilityError
from app.inference.qml import FrozenQMLModel, assert_checkpoint_compatible


def test_registry_matches_frozen_contract(registry):
    assert len(registry.feature_names) == 27
    assert registry.binary_xgb_threshold == 0.012
    assert registry.binary_qml_threshold == 0.390
    assert sum(parameter.numel() for parameter in registry.binary_qml.parameters()) == 51
    assert sum(parameter.numel() for parameter in registry.multiclass_qml.parameters()) == 93
    assert registry.qml_device in {"lightning.qubit", "default.qubit"}


def test_checkpoint_key_mismatch_fails_loudly():
    model = FrozenQMLModel(output_size=1, device_name="default.qubit")
    incompatible = {"wrong.key": torch.zeros(1)}
    with pytest.raises(ArtifactCompatibilityError, match="state-dict keys mismatch"):
        assert_checkpoint_compatible(
            model,
            incompatible,
            expected_parameter_count=51,
            checkpoint_name="test.pt",
        )


def test_checkpoint_shape_mismatch_fails_loudly():
    model = FrozenQMLModel(output_size=1, device_name="default.qubit")
    incompatible = {key: value.clone() for key, value in model.state_dict().items()}
    incompatible["classifier.weight"] = torch.zeros((1, 4))
    with pytest.raises(ArtifactCompatibilityError, match="tensor shape mismatch"):
        assert_checkpoint_compatible(
            model,
            incompatible,
            expected_parameter_count=51,
            checkpoint_name="test.pt",
        )

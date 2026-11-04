from collections.abc import Mapping
from functools import lru_cache
import subprocess
import sys

import pennylane as qml
import torch
from torch import nn

from .errors import ArtifactCompatibilityError


N_QUBITS = 5
N_LAYERS = 3
AMPLITUDE_DIMENSION = 32


def select_qml_device(preferred: str) -> tuple[object, str]:
    if preferred == "lightning.qubit" and not _lightning_preflight():
        preferred = "default.qubit"
    try:
        return qml.device(preferred, wires=N_QUBITS), preferred
    except Exception as exc:
        if preferred == "default.qubit":
            raise ArtifactCompatibilityError(f"Unable to initialize QML device {preferred}: {exc}") from exc
        try:
            return qml.device("default.qubit", wires=N_QUBITS), "default.qubit"
        except Exception as fallback_exc:
            raise ArtifactCompatibilityError(
                f"Unable to initialize QML devices {preferred} and default.qubit"
            ) from fallback_exc


@lru_cache(maxsize=1)
def _lightning_preflight() -> bool:
    """Keep an incompatible native Lightning extension from crashing the API process."""
    probe = (
        "import pennylane as qml; "
        "device=qml.device('lightning.qubit', wires=5); "
        "print(device.name)"
    )
    try:
        completed = subprocess.run(
            [sys.executable, "-B", "-c", probe],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


class FrozenQMLModel(nn.Module):
    def __init__(self, output_size: int, device_name: str = "lightning.qubit") -> None:
        super().__init__()
        device, self.device_name = select_qml_device(device_name)
        wires = tuple(range(N_QUBITS))

        @qml.qnode(device, interface="torch")
        def circuit(inputs: torch.Tensor, weights: torch.Tensor) -> list[object]:
            qml.AmplitudeEmbedding(inputs, wires=wires, normalize=False, pad_with=None)
            qml.StronglyEntanglingLayers(weights, wires=wires)
            return [qml.expval(qml.PauliZ(wire)) for wire in wires]

        self.quantum = qml.qnn.TorchLayer(
            circuit,
            weight_shapes={"weights": (N_LAYERS, N_QUBITS, 3)},
        )
        self.classifier = nn.Linear(N_QUBITS, output_size)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.quantum(inputs))


def assert_checkpoint_compatible(
    model: nn.Module,
    checkpoint: Mapping[str, torch.Tensor],
    *,
    expected_parameter_count: int,
    checkpoint_name: str,
) -> None:
    current = model.state_dict()
    expected_keys = set(current)
    actual_keys = set(checkpoint)
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)
        unexpected = sorted(actual_keys - expected_keys)
        raise ArtifactCompatibilityError(
            f"{checkpoint_name} state-dict keys mismatch; missing={missing}, unexpected={unexpected}"
        )

    mismatches = {
        key: (tuple(checkpoint[key].shape), tuple(current[key].shape))
        for key in current
        if tuple(checkpoint[key].shape) != tuple(current[key].shape)
    }
    if mismatches:
        raise ArtifactCompatibilityError(
            f"{checkpoint_name} tensor shape mismatch (checkpoint, expected): {mismatches}"
        )

    parameter_count = sum(parameter.numel() for parameter in model.parameters())
    if parameter_count != expected_parameter_count:
        raise ArtifactCompatibilityError(
            f"{checkpoint_name} architecture has {parameter_count} parameters; "
            f"expected {expected_parameter_count}"
        )


def load_frozen_qml_model(
    path: object,
    *,
    output_size: int,
    expected_parameter_count: int,
    device_name: str,
) -> FrozenQMLModel:
    model = FrozenQMLModel(output_size=output_size, device_name=device_name)
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(checkpoint, Mapping):
        raise ArtifactCompatibilityError(f"{path} does not contain a state dictionary")
    assert_checkpoint_compatible(
        model,
        checkpoint,
        expected_parameter_count=expected_parameter_count,
        checkpoint_name=str(path),
    )
    model.load_state_dict(checkpoint, strict=True)
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model

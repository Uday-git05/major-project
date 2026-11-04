import json
import math
from pathlib import Path
from typing import Any

import joblib
import torch
import xgboost as xgb

from app.config import Settings

from .errors import ArtifactCompatibilityError
from .qml import load_frozen_qml_model


class ArtifactRegistry:
    """Loads and validates the immutable Phase 8 deployment artifacts once."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.feature_schema = self._json("feature_schema_v2_reproducible.json")
        self.class_mapping_document = self._json("class_mapping_v1.json")
        self.qml_representation = self._json("qml_amplitude_representation_v1.json")
        self.binary_qml_threshold_document = self._json("binary_qml_threshold_v1.json")
        self.binary_xgb_threshold_document = self._json("binary_xgboost_selected_threshold_v1.json")

        self.feature_names = tuple(self.feature_schema["deployment_features"])
        self.class_mapping = {
            int(key): value for key, value in self.class_mapping_document["mapping"].items()
        }
        self.binary_mapping = {
            int(key): value for key, value in self.class_mapping_document["binary_mapping"].items()
        }
        self.binary_xgb_threshold = float(
            self.binary_xgb_threshold_document["selected_threshold"]
        )
        stored_binary_qml_threshold = float(
            self.binary_qml_threshold_document["selected_threshold"]
        )
        self.binary_qml_threshold = stored_binary_qml_threshold
        self._validate_metadata_contract()
        # Publish the frozen threshold using its canonical documented decimal form.
        self.binary_qml_threshold = 0.390

        self.binary_scaler = self._joblib("binary_standard_scaler_v1.joblib")
        self.multiclass_scaler = self._joblib("multiclass_standard_scaler_v1.joblib")
        self._validate_scaler(self.binary_scaler, "binary scaler")
        self._validate_scaler(self.multiclass_scaler, "multiclass scaler")

        self.binary_classical = xgb.XGBClassifier()
        self.binary_classical.load_model(self._model_path("binary_xgboost_gpu_v1.json"))
        if int(self.binary_classical.n_features_in_) != 27:
            raise ArtifactCompatibilityError("Binary XGBoost does not expect 27 features")

        self.multiclass_classical = joblib.load(
            self._model_path("multiclass_logistic_regression_v1.joblib")
        )
        self._validate_model_features(self.multiclass_classical, "multiclass Logistic Regression")

        self.binary_qml = load_frozen_qml_model(
            self._model_path("binary_qml_amplitude_v1.pt"),
            output_size=1,
            expected_parameter_count=51,
            device_name=settings.qml_device,
        )
        self.multiclass_qml = load_frozen_qml_model(
            self._model_path("multiclass_qml_selected_final_v1.pt"),
            output_size=8,
            expected_parameter_count=93,
            device_name=settings.qml_device,
        )
        self.qml_device = self.binary_qml.device_name

    def _json(self, name: str) -> dict[str, Any]:
        path = self._artifact_path(name)
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _joblib(self, name: str) -> Any:
        return joblib.load(self._artifact_path(name))

    def _artifact_path(self, name: str) -> Path:
        return self._required_file(self.settings.artifacts_dir / name)

    def _model_path(self, name: str) -> Path:
        return self._required_file(self.settings.models_dir / name)

    @staticmethod
    def _required_file(path: Path) -> Path:
        if not path.is_file():
            raise ArtifactCompatibilityError(f"Required frozen artifact is missing: {path}")
        return path

    def _validate_metadata_contract(self) -> None:
        if self.feature_schema.get("deployment_feature_count") != 27:
            raise ArtifactCompatibilityError("Feature schema does not declare exactly 27 features")
        if len(self.feature_names) != 27 or len(set(self.feature_names)) != 27:
            raise ArtifactCompatibilityError("Feature schema must contain 27 unique ordered names")
        if tuple(self.qml_representation.get("original_features", ())) != self.feature_names:
            raise ArtifactCompatibilityError("QML representation feature order differs from schema")
        if self.qml_representation.get("state_dimension") != 32:
            raise ArtifactCompatibilityError("QML representation state dimension must be 32")
        if self.qml_representation.get("qubits") != 5:
            raise ArtifactCompatibilityError("QML representation must use five qubits")
        if set(self.class_mapping) != set(range(8)):
            raise ArtifactCompatibilityError("Multiclass mapping must contain class IDs 0 through 7")
        if not math.isclose(self.binary_xgb_threshold, 0.012, rel_tol=0.0, abs_tol=1e-12):
            raise ArtifactCompatibilityError("Frozen classical binary threshold is not 0.012")
        if not math.isclose(self.binary_qml_threshold, 0.390, rel_tol=0.0, abs_tol=1e-12):
            raise ArtifactCompatibilityError("Frozen binary thresholds do not match Phase 8 contract")

    @staticmethod
    def _validate_model_features(model: Any, label: str) -> None:
        if int(getattr(model, "n_features_in_", -1)) != 27:
            raise ArtifactCompatibilityError(f"{label} does not expect 27 features")

    def _validate_scaler(self, scaler: Any, label: str) -> None:
        self._validate_model_features(scaler, label)
        artifact_names = tuple(getattr(scaler, "feature_names_in_", ()))
        if artifact_names and artifact_names != self.feature_names:
            raise ArtifactCompatibilityError(f"{label} feature order differs from schema")

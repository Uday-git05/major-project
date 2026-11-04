from time import perf_counter
from uuid import UUID

import numpy as np
import torch

from app.domain.schemas import ClassProbability, InferenceResponse

from .preprocessing import ordered_feature_array, qml_amplitude_preprocess, scale_features
from .registry import ArtifactRegistry


class InferenceService:
    def __init__(self, registry: ArtifactRegistry) -> None:
        self.registry = registry

    def predict_classical_binary(
        self, features: dict[str, float], correlation_id: UUID
    ) -> InferenceResponse:
        started = perf_counter()
        raw = ordered_feature_array(features, self.registry.feature_names)
        probability = float(self.registry.binary_classical.predict_proba(raw)[0, 1])
        predicted = int(probability >= self.registry.binary_xgb_threshold)
        return self._response(
            correlation_id=correlation_id,
            model_kind="classical_binary",
            model_name="binary_xgboost_gpu_v1.json",
            predicted=predicted,
            probabilities=np.asarray([1.0 - probability, probability]),
            mapping=self.registry.binary_mapping,
            threshold=self.registry.binary_xgb_threshold,
            started=started,
        )

    def predict_classical_multiclass(
        self, features: dict[str, float], correlation_id: UUID
    ) -> InferenceResponse:
        started = perf_counter()
        raw = ordered_feature_array(features, self.registry.feature_names)
        scaled = scale_features(raw, self.registry.multiclass_scaler)
        probabilities = np.asarray(
            self.registry.multiclass_classical.predict_proba(scaled)[0], dtype=float
        )
        predicted = int(self.registry.multiclass_classical.classes_[int(np.argmax(probabilities))])
        probability_by_class = np.zeros(8, dtype=float)
        for index, class_id in enumerate(self.registry.multiclass_classical.classes_):
            probability_by_class[int(class_id)] = probabilities[index]
        return self._response(
            correlation_id=correlation_id,
            model_kind="classical_multiclass",
            model_name="multiclass_logistic_regression_v1.joblib",
            predicted=predicted,
            probabilities=probability_by_class,
            mapping=self.registry.class_mapping,
            threshold=None,
            started=started,
        )

    def predict_qml_binary(
        self, features: dict[str, float], correlation_id: UUID
    ) -> InferenceResponse:
        started = perf_counter()
        raw = ordered_feature_array(features, self.registry.feature_names)
        amplitudes = qml_amplitude_preprocess(raw, self.registry.binary_scaler)
        with torch.inference_mode():
            logit = self.registry.binary_qml(torch.from_numpy(amplitudes))
            probability = float(torch.sigmoid(logit.reshape(-1)[0]).item())
        predicted = int(probability >= self.registry.binary_qml_threshold)
        return self._response(
            correlation_id=correlation_id,
            model_kind="qml_binary",
            model_name="binary_qml_amplitude_v1.pt",
            predicted=predicted,
            probabilities=np.asarray([1.0 - probability, probability]),
            mapping=self.registry.binary_mapping,
            threshold=self.registry.binary_qml_threshold,
            started=started,
        )

    def predict_qml_multiclass(
        self, features: dict[str, float], correlation_id: UUID
    ) -> InferenceResponse:
        started = perf_counter()
        raw = ordered_feature_array(features, self.registry.feature_names)
        amplitudes = qml_amplitude_preprocess(raw, self.registry.multiclass_scaler)
        with torch.inference_mode():
            logits = self.registry.multiclass_qml(torch.from_numpy(amplitudes))
            probabilities = torch.softmax(logits.reshape(-1), dim=0).cpu().numpy()
        predicted = int(np.argmax(probabilities))
        return self._response(
            correlation_id=correlation_id,
            model_kind="qml_multiclass",
            model_name="multiclass_qml_selected_final_v1.pt",
            predicted=predicted,
            probabilities=probabilities,
            mapping=self.registry.class_mapping,
            threshold=None,
            started=started,
        )

    @staticmethod
    def _response(
        *,
        correlation_id: UUID,
        model_kind: str,
        model_name: str,
        predicted: int,
        probabilities: np.ndarray,
        mapping: dict[int, str],
        threshold: float | None,
        started: float,
    ) -> InferenceResponse:
        items = [
            ClassProbability(
                class_id=class_id,
                class_name=mapping[class_id],
                probability=float(probabilities[class_id]),
            )
            for class_id in sorted(mapping)
        ]
        return InferenceResponse(
            correlation_id=correlation_id,
            model_kind=model_kind,
            model_name=model_name,
            predicted_class_id=predicted,
            predicted_class_name=mapping[predicted],
            confidence=float(probabilities[predicted]),
            probabilities=items,
            threshold=threshold,
            latency_ms=(perf_counter() - started) * 1000.0,
        )

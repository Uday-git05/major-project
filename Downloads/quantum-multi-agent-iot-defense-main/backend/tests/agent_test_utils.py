from datetime import datetime, timezone
from uuid import uuid4

from app.domain.schemas import ClassProbability, InferenceResponse
from app.simulation.events import FeatureVectorEvent, FeatureVectorPayload
from app.features.contract import EXTRACTOR_VERSION, feature_contract


class FakeInferenceService:
    def __init__(self, *, attack: bool = True, fail_classical: bool = False) -> None:
        self.attack = attack
        self.fail_classical = fail_classical
        self.calls: list[str] = []

    def predict_classical_binary(self, features, correlation_id):
        self.calls.append("classical_binary")
        if self.fail_classical:
            raise RuntimeError("simulated classical service failure")
        return self._binary("classical_binary", "classical-binary", correlation_id, 0.9)

    def predict_classical_multiclass(self, features, correlation_id):
        self.calls.append("classical_multiclass")
        return self._multiclass("classical_multiclass", "classical-multiclass", correlation_id)

    def predict_qml_binary(self, features, correlation_id):
        self.calls.append("qml_binary")
        return self._binary("qml_binary", "qml-binary", correlation_id, 0.82)

    def predict_qml_multiclass(self, features, correlation_id):
        self.calls.append("qml_multiclass")
        return self._multiclass("qml_multiclass", "qml-multiclass", correlation_id)

    def _binary(self, kind, model, correlation_id, attack_probability):
        probability = attack_probability if self.attack else 1.0 - attack_probability
        predicted = int(probability >= 0.5)
        values = [1.0 - probability, probability]
        return InferenceResponse(
            correlation_id=correlation_id,
            model_kind=kind,
            model_name=model,
            predicted_class_id=predicted,
            predicted_class_name="Attack" if predicted else "Normal",
            confidence=values[predicted],
            probabilities=[
                ClassProbability(class_id=0, class_name="Normal", probability=values[0]),
                ClassProbability(class_id=1, class_name="Attack", probability=values[1]),
            ],
            threshold=0.39 if kind == "qml_binary" else 0.012,
            latency_ms=1.0,
        )

    def _multiclass(self, kind, model, correlation_id):
        predicted = 1 if self.attack else 4
        names = [
            "Arp_Spoofing",
            "HTTP_Flood",
            "ICMP_Flood",
            "MQTT_Flood",
            "Normal",
            "Port_Scanning",
            "TCP_Flood",
            "UDP_Flood",
        ]
        values = [0.02] * 8
        values[predicted] = 0.86
        return InferenceResponse(
            correlation_id=correlation_id,
            model_kind=kind,
            model_name=model,
            predicted_class_id=predicted,
            predicted_class_name=names[predicted],
            confidence=values[predicted],
            probabilities=[
                ClassProbability(class_id=index, class_name=name, probability=values[index])
                for index, name in enumerate(names)
            ],
            threshold=None,
            latency_ms=2.0,
        )


def feature_event(correlation_id=None) -> FeatureVectorEvent:
    schema_version, names = feature_contract()
    now = datetime.now(timezone.utc)
    return FeatureVectorEvent(
        event_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        source="phase10-test",
        correlation_id=correlation_id or uuid4(),
        payload=FeatureVectorPayload(
            feature_schema_version=schema_version,
            extractor_version=EXTRACTOR_VERSION,
            flow_id="test-flow",
            flow_start=now,
            flow_end=now,
            packet_count=1,
            is_partial_window=True,
            source_device_id="soil_moisture-01",
            destination_device_id="gateway-01",
            source_event_ids=[uuid4()],
            features={name: 0.0 for name in names},
        ),
    )

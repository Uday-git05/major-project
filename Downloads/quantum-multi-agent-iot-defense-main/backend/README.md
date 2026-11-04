# FarmFlow Phase 8 inference service

This service packages the frozen classical ML and QML artifacts without training or
modifying them. Paths are resolved from configuration and the authoritative feature,
class, preprocessing, threshold, and model artifacts remain under the repository root.

## Run

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

## Test

```powershell
cd backend
python -m pytest
```

The combined `POST /v1/inference/all` endpoint runs all four frozen models against
one exact 27-feature mapping and preserves the request correlation ID. Individual
classical and QML binary/multiclass endpoints are also available.

## Phase 9 virtual IoT testbed

The deterministic testbed is controlled through `/v1/simulation/*`. It uses a logical
clock, seeded gradual telemetry, an internal async event bus, explicit device topology,
and structured low-level network activity. It creates no sockets or external traffic.
Start the simulation, advance it with one or more explicit ticks, and query the resulting
typed events. No attack, feature extraction, agent, defense, or frontend behavior is part
of this phase.

## Phase 10 multi-agent architecture

Six queue-backed agents share the Phase 9 event bus while retaining independent lifecycle,
health, state, subscriptions, and bounded audit histories. Classical and quantum model
agents call the Phase 8 `InferenceService`; they never load artifacts directly. Threat
assessments are provisional and rule-explained. Defense output is planning-only, and
recovery output remains an unexecuted state-machine interface.

Agent metadata and lifecycle are available under `/v1/agents`. The former Phase 10
placeholder feature envelope has been replaced by the validated live Phase 11 contract.

## Phase 11 live compatibility feature extraction

The live extractor is a deterministic compatibility layer for the project's virtual IoT
testbed. It uses the same 27-feature contract expected by the frozen models, but it is not
claimed to exactly reproduce the original dataset author's packet-to-flow implementation.

Phase 9 network events now include synthetic packet metadata. Phase 11 groups that metadata
by a directional five-tuple, calculates the 27 documented flow features without scaling,
and publishes validated `FeatureVectorEvent` messages to both model agents. Flow state,
extractor status, the authoritative order, formulas, and bounded recent vectors are exposed
under `/v1/features`.

## Phase 12 controlled synthetic attack simulation

Seven demo scenarios generate deterministic abnormal packet metadata entirely inside the
virtual testbed: `Arp_Spoofing`, `HTTP_Flood`, `ICMP_Flood`, `MQTT_Flood`, `Port_Scanning`,
`TCP_Flood`, and `UDP_Flood`. `BotNet_DDOS` remains excluded. No raw sockets, real packets,
external hosts, exploit payloads, credentials, or external attack tools are used.

The attack controller schedules scenarios against validated virtual topology targets and
emits lifecycle events. Attack network events travel through the existing Phase 11 extractor
and Phase 10 model agents; the controller never fabricates feature vectors or predictions.
Ground truth is held only in a private controller-side event-ID registry and is absent from
`NetworkActivityPayload`, `FeatureVectorEvent`, and all model-agent inputs. APIs are exposed
under `/v1/attacks`.

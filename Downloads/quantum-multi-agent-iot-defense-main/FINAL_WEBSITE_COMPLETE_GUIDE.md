# FarmFlow — Complete Website and Viva Guide

**Project:** “A Quantum-Enhanced Multi-Agent Framework for Intelligent Detection and Autonomous Defense in IoT Systems”  
**Scope:** The current FarmFlow website is a virtual IoT cybersecurity testbed and live security-operations dashboard. It is not connected to a physical farm or real network.

> **How to read values:** The interface combines several truth sources. Simulator state describes what the virtual environment did; model output describes what a frozen classifier predicted; agents correlate and act on evidence; UI-derived labels summarize records; research metrics are frozen offline evaluation results. These are not interchangeable.

## 1. Project in One Minute

FarmFlow is a local, in-memory demonstration of a security pipeline for a small virtual smart farm. Eight simulated devices generate sensor readings and network-activity metadata. A deterministic compatibility extractor groups communication into flows and creates the same frozen, ordered 27-feature representation expected by the models. A Classical ML worker and an independent asynchronous QML worker infer binary Normal/Attack and multiclass traffic labels. A Threat Analysis Agent correlates their evidence with monitoring observations. A Defense Agent can propose or apply reversible simulator-only policy changes, and a Recovery Agent tracks rollback and checks whether normal simulated activity resumes.

The browser presents this shared runtime through seven application routes. The dashboard and testbed emphasize the simulated environment; Detection exposes traffic, feature and model evidence; Threat Center groups assessments into cases; Defense & Recovery exposes safe response controls; AI Agents shows the six worker roles; Model Performance reports frozen experiment results. REST is used for snapshots and commands; a shared WebSocket supplies incremental events. The QML implementation runs on a local PennyLane simulator, not quantum hardware. No external attack packets, firewall changes, routes, or physical device commands are issued.

## 2. Website Architecture Map

| Route | Sidebar label / page title | Purpose | Main sections |
|---|---|---|---|
| `/` | Dashboard / Smart Irrigation IoT Cyber Defense System | High-level operational and evidence summary | Overview hero, virtual farm, retained predictions, threat state, process flow, expandable background and health details |
| `/iot-testbed` | Smart Farm / Virtual Smart Farm Testbed | Inspect the virtual devices and their communications | telemetry strip, Farm View, Topology View, Advanced 3D View, device inspector, retained telemetry |
| `/detection` | AI Detection / Detection Intelligence | Inspect network flows, feature extraction, model outputs | Network Activity, model evidence, recent prediction table, expandable feature and scenario details |
| `/incidents` | Threat Center / Threat Center | Investigate correlated threat assessments | summary cards, focused incident, model evidence, threat and response lifecycle, recent/background cases, timelines and technical details |
| `/attack-response` | Defense & Recovery / Attack Simulation & Response | Launch safe synthetic scenarios and review defense/recovery | scenario lifecycle, Synthetic Attack Control, Defense Actions, Recovery Verification tabs |
| `/multi-agent` | AI Agents / Multi-Agent Intelligence | Inspect six agents, queues, health and event history | agent architecture, selected-agent inspector, Important Events, Technical Audit |
| `/research-results` | Model Performance / Model Performance | Explain frozen offline evaluation and selected runtime models | production model cards, evaluated candidates, comparisons, latency, architecture, experiment context and limitations |

The root layout wraps the application in one `LiveRuntimeProvider`. That provider owns the shared snapshot, WebSocket-backed updates, focus selection and common shell. Changing pages does not create another runtime subscriber. The common shell contains the header, simulation control bar, left navigation, scenario context strip, current page workspace and safety/API footer. If the initial snapshot is unavailable, a loading or error/retry screen is shown; after a later refresh failure the last verified snapshot stays visible with a stale-data warning.

## 3. Global Interface

### Branding and sidebar

- **FarmFlow Security / Operations Command** identifies the product as a virtual security-operations view. **FarmFlow** combines the farm/testbed domain with the movement of data and evidence through the system; it is a product name, not a deployed agricultural service.
- Sidebar **Dashboard** (overview icon) is the opening summary. Use it to introduce the system.
- **Smart Farm** (network icon) opens the IoT testbed. Use it to explain devices and simulator telemetry.
- **AI Detection** (activity icon) opens traffic and inference evidence. Use it to show the fixed feature contract and independent model results.
- **Threat Center** (alert-shield icon) opens assessment cases. Use it to explain why assessment is not ground truth.
- **Defense & Recovery** (shield icon) opens attack simulation and response. Use it for the controlled scenario demonstration and human approval.
- **AI Agents** (bot icon) shows the six agents and their live queue/health statistics.
- Secondary **Model Performance** (flask icon) opens the frozen research/evaluation view. It is not a live prediction screen.

The sidebar connection badge is shared runtime state: **System Online · Live**, **System Online · Paused**, **System Offline**, **System Degraded**, or **Connecting**. “Online” concerns the local backend/runtime connection; it does not mean a physical farm is online.

### Header and status meanings

- **Operational health:** `Inactive` means the coordinator is not active; `Operational` means it is active and no degraded health was detected; `Degraded` means runtime/agent health reports degradation. It is a service summary, not a model verdict.
- **Simulation:** `stopped`, `running`, or `paused` is the simulation clock state. Pausing stops logical ticks; it does not reset retained records. Deactivate additionally shuts down runtime workers/runner while preserving the current process snapshot until reset/restart.
- **Synthetic scenarios:** the header separates active user-launched scenarios from retained background positive cases. `N active` is the number of currently active attack scenario records, not a count of real attacks. `N background cases retained` is the number of bounded, grouped threat-assessment incident cases whose latest `detected` value is true. Such cases may arise from compatibility-layer traffic and are not proof that an attack occurred.
- **Connection:** `Live` means the WebSocket is connected; `Syncing` means a snapshot refresh is underway; `Connecting`, `Degraded`, and `Offline` describe connection/reconnect state. A live socket may coexist with a paused simulation.
- **Tick/time:** tick is the simulator's logical counter; time is the simulation clock's UTC timestamp. It is not necessarily wall-clock time. Reset returns the logical clock to its initial state.

### Global simulation controls

Buttons call the API and then refresh the authoritative snapshot:

| Control | What it does |
|---|---|
| **Activate system** | Calls `POST /v1/system/activate`. Starts the feature manager, attack controller, six agents, starts or resumes the simulation clock, and starts the automatic logical-tick runner. Repeated activation is effectively idempotent while active. |
| **Deactivate** | Calls `POST /v1/system/deactivate`. Stops the automatic runner, pauses a running simulation, stops agents/attack controller/feature manager, and marks the coordinator inactive. It is not a full reset. |
| **Start** | Available if the coordinator is active while the clock is stopped; starts simulation time. |
| **Pause** | Pauses the simulation clock while the activated runtime can remain online. |
| **Resume** | Resumes a paused simulation. |
| **Advance tick** | Calls the tick endpoint for one logical tick; the control is disabled unless simulation state is running. It is useful for a controlled step, but the background runner also advances ticks while active. |
| **Full reset** | Calls `POST /v1/system/reset`. Clears attacks, feature/event histories managed by runtime, threat/defense/recovery records, policy controls, agent operational state and telemetry; resets devices and clock to the configured deterministic demo seed; increments the WebSocket epoch and resets sequence/history. If the system had been active, runtime restarts active at tick zero. |

Reset is broader than pause/deactivate. It intentionally begins a new runtime epoch so the browser discards old state instead of mixing it with new events. Runtime state is in process memory; it is not a durable database.

### Scenario focus

The shared **Scenario focus** dropdown has a `Monitoring — no focused scenario` option and retained scheduled/active/completed/cancelled synthetic scenarios. A launched scenario is focused after the schedule call succeeds. Choosing another option scopes cross-page panels to that scenario's correlation/attack identity. Selecting Monitoring or **Clear focus / Return to monitoring** removes the scenario emphasis; it does not stop or cancel an attack. **Follow scenario response** navigates to Defense & Recovery. Scenario technical identity expands to show attack ID, correlation ID and epoch/start tick.

Focus is a presentation/filtering choice, not a claim about model correctness. A reset/new epoch clears it. The same focus changes the scenario evidence shown in Detection, incident detail, farm/topology path highlighting, response tabs and event stream. Background activity remains retained separately and is not converted into additional user-launched attacks.

## 4. Overview/Dashboard

### Purpose

Give an at-a-glance summary, then show a farm preview, model evidence, security state and the pipeline. It is an index into more detailed pages, not a replacement for them.

### What the page shows / every block explained

1. **Overview hero:** project title and “AI + Quantum ML for cybersecurity in a virtual smart farm.” Its summary cards show online devices (`online / configured`), active synthetic scenarios, retained incident cases, agent count/health, and overall system status. The incident count is grouped retained cases; it is not confirmed real attacks. The status badge derives from runtime connection/health.
2. **Virtual smart farm:** the same illustrated SmartFarmView component used by the Farm View, bound to snapshot devices, topology, attacks and policy. Its **Open testbed** link navigates to `/iot-testbed`. Clicking a marker selects it locally for inspection; the overview does not create another simulator.
3. **Retained ML + QML Predictions:** uses correlated retained model evidence. Each column shows binary prediction, confidence, and, when present, separate multiclass attribution. Agreement is only rendered when binary outputs match on the same feature vector. Missing QML displays Awaiting; there is no confidence fusion.
4. **Retained Threat Assessment:** displays a retained positive assessment, its tentative family, affected devices, evidence strength/disagreement and linked defense/recovery states. With no positive case it explicitly says this is not a verdict that the environment is attack-free.
5. **Current threat card:** names the selected focused scenario when one exists; otherwise says no active focused threat. It explicitly distinguishes simulator activity and model prediction. **View related incident** selects the corresponding incident context.
6. **Micro-summary:** configured device count, currently active user-launched scenario count, correlated cases in retained snapshot, and runtime agent count.
7. **End-to-End System Flow:** clickable stages navigate to testbed, detection, incidents and response. Arrows describe conceptual evidence handoff, not a single numeric score: network metadata is grouped into a flow, features are routed independently to classifiers, their correlated outputs feed Threat Analysis, and the resulting assessment can drive defense/recovery.
8. **Background activity and retained security records** disclosure contains the response summary and agent health. These details can be expanded without crowding the first view.

### Every metric / states / data source

Device and active-attack counts come from simulator/runtime records. The retained case count is UI-derived from grouped threat-assessment events. Model results are model outputs. Agent health/counts are backend worker records. The overall badge is UI-derived from runtime health and connection. “No positive assessment retained” means no positive case in this bounded snapshot, not “safe” or “no traffic.”

### Every button / live changes / connection to other pages

The page links to the Testbed, Detection, Threat Center and AI Agents. Clicking a farm marker selects a device in the local preview; it does not modify runtime state. Scenario focus may be set from the global strip. Runtime updates propagate through the shared snapshot/WebSocket, so the cards refresh without each page opening its own socket.

### What to say during viva

“The overview brings simulator status, independent model output and agent assessments together, but it keeps their meanings separate. Counts are explicitly scoped to active scenarios or retained assessments, not real-world incidents.”

## 5. IoT Testbed / Smart Farm

### Purpose

This is a **virtual IoT cybersecurity testbed**: deterministic software devices, generated telemetry, and metadata-only network activity provide a safe environment to exercise the detection and response pipeline. It is digital-twin-style visualization of the same simulator state. It is not connected to sensors, a real irrigation installation, a farm control network or physical equipment.

### Registered devices

The default simulator registry constructs eight devices. The address assignment begins at `10.42.0.1` and increments in registry order; these are virtual addresses only.

| ID | Name / type | Purpose and telemetry | Network role / target and selection |
|---|---|---|---|
| `gateway-01` | Farm Gateway / gateway | Virtual hub; reports `connected_devices` (7 in the default eight-device registry). | Central telemetry endpoint; all device telemetry links point to it. Attack presets accept all virtual device types, so it can be selected if present in targets. Select its marker for details. |
| `soil_moisture-01` | Soil Moisture Sensor 1 / soil moisture sensor | Reports `moisture_percent`; default starts at 44%. | Sends virtual MQTT/TCP telemetry to gateway. Can be a scenario target. |
| `soil_moisture-02` | Soil Moisture Sensor 2 / soil moisture sensor | Reports `moisture_percent`; default starts at 46%. | Same virtual MQTT/TCP telemetry role; can be targeted. |
| `temperature-01` | Temperature Sensor 1 / temperature sensor | Reports `temperature_c`; default starts at 22°C. | Virtual CoAP/UDP flow to gateway; can be targeted. |
| `humidity-01` | Humidity Sensor 1 / humidity sensor | Reports `humidity_percent`; default starts at 60%. | Virtual CoAP/UDP flow to gateway; can be targeted. |
| `water_flow-01` | Irrigation Flow Sensor / water flow sensor | Reports `flow_liters_per_minute` and boolean `pump_active`; default is 0.15 L/min and false. | Virtual Modbus TCP telemetry; can be targeted. |
| `pump_controller-01` | Main Pump Controller / pump controller | Reports boolean `pump_on` and `power_watts`; defaults off / 0 W. | Virtual MQTT/TCP control exchange from gateway is emitted periodically; can be targeted. |
| `weather-01` | Field Weather Node / weather node | Reports `air_temperature_c`, `wind_speed_mps`, `rainfall_mm`. | Virtual HTTPS/TCP telemetry to gateway; can be targeted. |

Names/IDs come from `create_default_devices`; target compatibility is taken from attack presets. Every supported preset currently accepts the virtual `DeviceType` set, but the UI still derives its list from the preset's declared target types. Clicking a farm marker, topology node, or 3D marker selects the actual runtime device and reveals its live state; it does not create a device. “Online,” health and telemetry are simulator state.

### Page heading, telemetry strip and view tabs

The heading says **Virtual Smart Farm Testbed** and describes simulated devices. The telemetry strip summarizes registered device status and simulation state. The three tabs are **Farm View**, **Topology View**, and **Advanced 3D View**. Switching tabs changes only the renderer; device selection is held in the page so it persists among views. All three read the same runtime `devices`, `topology`, `attacks`, `policy`, selected-device and focus values.

### Farm View: illustration, readings and paths

The SVG farm illustration depicts a shed, weather point, water reservoir, irrigation zone, crop rows and route. The physical-looking artwork is illustrative; the device markers and telemetry values are overlaid from the configured simulator registry. Each marker is selectable by click or keyboard Enter/Space. Its card label shows device name, one reading (where available) and status/security context. The gateway is identified as the gateway.

Topology links are derived from runtime topology: each non-gateway device has a telemetry edge to the gateway; the pump additionally has a gateway-to-pump control edge. In the Farm View, configured links are green/teal when active (the class is animated while active), and neutral when stopped. The focused synthetic route is coral/red while active, dashed/scheduled before start, and amber/orange when a simulated policy blocks it. A blocked normal topology edge is amber. The caption clarifies configured paths while stopped and that synthetic paths appear only for a retained focused scenario. These colors describe simulator metadata/policy, not physical packet capture.

The selected device panel reports type, device health, virtual address, configured protocol/service, whether it is targeted by the focused scenario, readings and, when provided, **Simulate Attack** and **Clear selection** actions. The attack button opens a scoped modal preselected to that device. Clearing selection is presentation-only. The last-focused-scenario message remains after completion as retained scenario history.

### Topology View

Nodes represent the same virtual devices, positioned for a readable network diagram; edges represent telemetry/control relationships. The gateway sits at the center of the graph. The legend is Normal, Attack and Blocked. Edge state comes from current simulator scenario and virtual policy. Hovering a node emphasizes connected edges; clicking selects it and opens the inspector with type, address, health, status and whether the source is simulator truth or configured virtual topology. It is more network-oriented than Farm View; it does not define a different topology.

### Advanced 3D View

The current implementation uses Three.js through React Three Fiber (`Canvas`), with Drei (`OrbitControls`, `Billboard`, `Line`, `Text`) for scene controls, labels and paths. Procedural scene geometry includes ground/fields, crop rows, trees, shed, water basin/pipes and fence. Device markers are generated from the runtime device list; labels display device identity/readings; selected/hovered/focused markers receive visual emphasis. The gateway and weather node have distinctive shapes. A device picker in the inspector rail mirrors selection.

Drag orbits; scroll zooms; **Reset View** remounts the canvas/camera. A scene legend shows Normal, Attack and Blocked. Normal paths use teal; focused attack paths coral/red; blocked paths amber/dashed with a marker. An attack route appears only for the focused scheduled/active scenario, and blocked status derives from the backend policy state. No real-world physical effect is implied. The scene consumes the same snapshot as Farm/Topology views and has no independent simulation or runtime subscription.

The page checks WebGL support and has an error boundary. If WebGL cannot initialize or rendering throws, a status fallback explains that 3D is unavailable and offers **Open Network Topology**. A reduced-motion preference changes the canvas from always-rendered to demand-driven. The legend and live values remain a visualization of the shared runtime.

### Telemetry history and irrigation cycle

The **Telemetry history — retained readings** disclosure expands charts/rows for device readings. The hook retains up to 40 telemetry points per device in browser state; only numeric reading fields become chart points. Sensor telemetry is simulator state, not an input to the IDS model.

There is an actual deterministic simulator-only irrigation cycle. Each tick, if the pump/flow/soil devices are not blocked by virtual device-isolation policy, the simulator averages soil moisture. If the pump is off and the average is at or below 40%, it turns on; if on and average reaches at least 58%, it turns off. Soil readings then gradually approach 64% with irrigation and 34% without it. Flow gradually approaches 12.5 L/min while the pump is active and 0.15 L/min otherwise. Pump power is 420 W on / 0 W off; `pump_active` mirrors the pump. Small random jitter makes readings less static. This is code-level virtual behavior only; it does not command an actual pump.

### Simulate Attack modal and options

The modal opens from a selected Farm View device. It explains the selected target, presents scenario cards, a scenario-specific description, target/intensity/duration controls, a launch action and lifecycle rows for scheduled/active records. Unsupported target/scenario combinations would be disabled by preset target types; in current presets the virtual device types are permitted. Errors appear inline. Clicking outside the modal or its close button dismisses it; launch completes asynchronously and then closes/refreshes.

| UI option | Simulator meaning |
|---|---|
| **ARP Spoofing** | “Synthetic address identity conflict”: virtual address-resolution metadata; no ARP frames are sent. |
| **HTTP Flood** | Synthetic high-volume HTTP-service request metadata; no requests leave the simulator. |
| **ICMP Flood** | ICMP-style metadata only; no ICMP packets are emitted. |
| **MQTT Flood** | Synthetic repeated MQTT publish metadata toward a virtual broker. |
| **Port Scanning** | Low-volume metadata spread across virtual destination ports; no real sockets/scanning. |
| **TCP Flood** | Synthetic TCP-style connection metadata. |
| **UDP Flood** | Synthetic UDP-style metadata. |

**Virtual target** chooses one configured simulator device. **Intensity** is a preset multiplier (low 1×, medium 2×, high 4×) affecting generated event/packet volume, not an external attack strength. **Duration** is the requested number of logical ticks, constrained to 1–100 by the backend request schema. Presets have defaults, but the UI's initial duration is 4 ticks and intensity medium. **Launch Scenario / Schedule scenario** calls `/v1/attacks/schedule` with the type, target, intensity, duration and fixed demo seed 42; on success the created attack is focused and snapshot refresh follows. The scenario controller emits synthetic activity into the same event bus used by flow extraction and agents. It is safe to demonstrate because this system only creates in-memory simulator metadata and has no raw sockets, packet sender or physical-device interface.

### What to say during viva

“This is a virtual testbed with a digital-twin-style view, not a farm digital twin connected to physical equipment. Sensor values, network events and policy effects are generated in memory. The attack scenarios are safe metadata fixtures so I can trace model and response behavior without touching a real network.”

## 6. AI Detection

### Purpose and page order

Detection Intelligence is the model-evidence workspace. From top to bottom it shows the page heading, **Network Activity**, **Focused Scenario · Model Evidence** (or background model signals), **Recent Detection Results**, then **Technical details · feature contract and scenario evidence**.

### Network Activity and flow metrics

The Network Activity panel labels each metric by scope. It has retained network-activity events, current flow windows, cumulative extracted vectors/feature status and retained synthetic-to-target events (the exact metric labels and values are computed from snapshot arrays/status, not a shared counter). Their counts differ by design:

- Retained events are a bounded event-history slice, not lifetime packet totals.
- Current flows are active aggregation windows held by the extractor and may close/expire; this is not the number of events ever seen.
- Feature vectors are cumulative extraction counters/status or retained recent vectors, depending on the displayed field; successful flow windows emit vectors.
- Synthetic events count only retained `network_activity` where direction is `synthetic_to_target`; it is not active-attack count, incident count, or model-positive count.

The flow list shows source/destination device IDs and addresses/ports, service, protocol, packet count and flow status for up to 12 current windows. Click a flow row to open its detail panel (full flow ID, protocol/service, packets/source-event count); **Close** dismisses that detail. Top services count retained network events. Protocol mix counts current flow windows. Both are snapshot counts, not throughput rates or trends. Empty states explicitly say when no event/flow activity is retained.

A flow is a simulator aggregation of related network activity (addresses, ports, protocol/service and direction/time context). It is not a captured Internet connection. Network events contain packet samples/metadata; the feature manager combines them into a numerical flow representation. Background simulator activity can produce vectors continuously while the runtime is active.

### Feature extraction: exact contract

The pipeline is: virtual network events → flow aggregation/window → deterministic compatibility feature extraction → exact ordered 27-feature vector → parallel model workers. The extractor identifies itself as `synthetic-farm-flow-compat-v1`. Backend disclosure explicitly says it is a compatibility layer for the virtual testbed, not an exact reproduction of the dataset authors’ packet-to-flow implementation.

The exact frozen order, grouped for explanation (grouping does not change order):

1. **Byte/packet totals:** `missed_bytes`, `orig_pkts`, `orig_ip_bytes`, `resp_pkts`, `resp_ip_bytes`.
2. **Rates and ratio:** `fwd_pkts_per_sec`, `bwd_pkts_per_sec`, `flow_pkts_per_sec`, `down_up_ratio`.
3. **Forward/backward header sizes:** `fwd_header_size_tot`, `fwd_header_size_min`, `fwd_header_size_max`, `bwd_header_size_tot`, `bwd_header_size_min`, `bwd_header_size_max`.
4. **Payload totals/averages:** `fwd_pkts_payload.tot`, `fwd_pkts_payload.avg`, `bwd_pkts_payload.tot`, `bwd_pkts_payload.avg`, `flow_pkts_payload.tot`, `flow_pkts_payload.avg`.
5. **Inter-arrival times:** `fwd_iat.tot`, `fwd_iat.avg`, `bwd_iat.tot`, `bwd_iat.avg`, `flow_iat.tot`, `flow_iat.avg`.

`orig`/`fwd` mean forward direction; `resp`/`bwd` mean backward response direction. Counts, byte totals, packet rates, direction ratio, header/payload statistics and timing summarize communication shape. The names/order are enforced against the frozen schema. Temperature, humidity, soil moisture and weather are not among these 27 features: telemetry is used by the virtual farm and as event context, while the IDS input describes network flow behavior.

### Classical and QML evidence

**Classical ML:** the selected runtime binary model is XGBoost with frozen binary threshold `0.012`; it outputs Normal (0) or Attack (1), with a confidence/probability-related score. The selected multiclass attribution model is Logistic Regression with argmax across eight classes. Binary detection and multiclass family attribution are two separate outputs. A model confidence is its output score for that inference, not incident severity or correctness.

**QML:** binary and multiclass each have a frozen five-qubit model. Their preprocessing is ordered 27 features → corresponding TRAIN-fitted StandardScaler → L2 normalization → append five zeros (27 values become 32) → AmplitudeEmbedding. Five qubits represent a state space of `2^5 = 32` amplitudes. The circuit uses three StronglyEntanglingLayers and measures five Pauli-Z expectation values, then a classical linear output layer. Binary ends in `nn.Linear(5, 1)` with 51 trainable parameters and uses frozen threshold `0.390`; multiclass ends in `nn.Linear(5, 8)` with 93 trainable parameters and argmax. Checkpoint compatibility is validated at load time. `lightning.qubit` is preferred, but validation recorded `default.qubit` because lightning was unavailable. No quantum hardware is used.

### Asynchronous QML and focused priority

Classical and QML are independent workers receiving feature-vector events. They do not share/copy predictions. Classical inference typically returns first; QML simulator computation runs asynchronously (in a thread from the agent worker) and can therefore display **Queued / analyzing**, **Analyzing…**, **Awaiting**, or **No matching QML result retained** before its independent result arrives. A queue count is pending work, not a model answer. The QML queue is bounded (default 256); focused synthetic-source vectors are placed ahead of background items. When focused work arrives, queued background vectors are coalesced out and counted truthfully as `coalesced_background_events`; background items may be coalesced when a full queue must make room. Focused evidence is protected from background eviction, though the implementation counts/drops if focused traffic itself exhausts capacity. This affects scheduling only, not model inference, features, weights, threshold or result.

The recent result table prioritizes the focused scenario correlation when one exists, so a demonstration is not buried under background rows. Eight correlation rows maximum are shown from retained events. This is display ordering, not a change to prediction history.

### Agreement: binary and same-vector only

Agreement compares the **binary** output only, and only for matching correlation plus `feature_vector_event_id` (the same flow vector). It does not compare multiclass attack families and does not average probabilities.

| Classical binary | QML binary | Display |
|---|---|---|
| Attack | Attack | Agree |
| Normal | Normal | Agree |
| Attack | Normal | Disagree |
| Normal | Attack | Disagree |
| Available | Missing/pending/unmatched | Awaiting QML |

Different multiclass labels can coexist with binary **Agree**: both can say an attack exists while tentatively assigning different families. Attribution stays visible in its own row. No fused confidence is used because that would hide distinct model outputs and would require a separately validated fusion rule.

### Recent Detection Results columns and states

- **Time:** timestamp of the last matched model output in the row.
- **Flow / Correlation:** abbreviated correlation ID; the full ID joins records from the same simulator flow/scenario context.
- **Classical ML:** binary predicted name or Awaiting.
- **QML:** the QML binary result matched by the classical vector ID, or Awaiting.
- **Agreement:** Agree, Disagree, or Awaiting QML.
- **Confidence:** Classical binary confidence in this table, displayed as a percentage; not a fused score.

The bounded retained snapshot prevents unbounded client memory and does not represent all historical inference events. “Technical details” expands the detection pipeline, lifecycle, scenario evidence and exact feature names. The agreement state is UI-derived from retained model payloads; the predictions themselves are backend model output.

### What to say during viva

“The detectors see network-flow features, not crop sensor readings. Classical ML and QML independently classify the same vector. Agreement is a strict binary comparison keyed to the exact feature-vector event; family attribution is separate, and QML may legitimately be pending because simulator inference is slower.”

## 7. Threat Center / Incidents

### Purpose / what an incident means

An incident is a correlated series of **Threat Analysis Agent assessment events** grouped under an incident/correlation identity. It is not one confirmed real attack. A simulator scenario is ground truth that a synthetic scenario was scheduled/generated. A model detection is a prediction. A threat assessment is an agent’s rule-based interpretation of available evidence. An incident/case groups those assessment revisions. Multiple model/monitoring events can revise one case as asynchronous evidence arrives.

### Top summary and focused incident

The page begins with **Focused Incident**, **Severity**, **Affected Device** and **Response Status** cards. With no focused scenario it shows Monitoring/no focus rather than inventing a specific event. Focused threat is the selected synthetic scenario’s type/name. Severity comes from the latest correlated threat payload, or **Not assessed** until one exists. Affected Device resolves target ID to the configured device name. Response Status can be Monitoring, a defense action state, recovery lifecycle label, **Manual Review Required**, or **Not Active** when no recovery record exists.

The **Focused Incident** block shows the focused attack name, retained/scheduled/active status and target; Classical and QML binary summaries; same-vector binary Agreement; Threat Analysis; Defense; and Recovery. QML can show **Analyzing…** or unavailable when pending/degraded. **Not Assessed** means no correlated assessment payload is retained, not a zero severity finding. **Monitoring** means no selected focused assessment/response is presently available. **Planned** is a defense proposal state, not an applied control. **Human Decision Required** means a planned proposal has a pending override. **Not Started** means recovery has no record yet. A selected scenario may have no incident if the asynchronous evidence has not produced an assessment.

### How severity is assigned

Severity is output by Threat Analysis Agent rules; the model does not emit severity. Before a Classical prediction exists, monitoring-only context yields `low` if a structural anomaly is seen, otherwise `informational` (with evidence-strength context-only/insufficient). After binary evidence:

- Classical Attack plus matched QML Attack is corroborated and becomes `high` in the current rule logic.
- Classical Attack with QML absent or disagreeing is `medium` and remains primary rather than corroborated evidence.
- Classical Normal yields `low` when a monitoring anomaly or model disagreement exists; otherwise `informational` (a matched QML Normal is corroborating).
- Family attribution comes from multiclass output and remains tentative; disagreement between families adds an explanatory reason but does not define binary agreement.
- The current rule code does not assign `critical` in this assessment logic. Other schema/policy levels support the label, but do not claim that the current rules regularly produce it.

These are implementation rules, not a calibrated probability-to-severity scale. Severity changes as correlated events arrive, so several revisions may appear.

### Recent/background cases and state labels

Recent incidents are grouped by incident ID; the displayed latest assessment is ranked by severity/recency. Clicking a case selects it and can expand its full incident ID, decision reason and evidence updates. Severity filters limit visible cases; **All Retained Cases** and pagination disclose more. Empty state means there are no retained assessment events.

Case family can be **Pending attribution** if no family has been determined. “Provisional” describes an assessment that may be revised as evidence arrives; “corroborated” refers to matching binary evidence recorded by the agent. “Model disagreement” is the binary comparison state. Background model-generated assessments are not separate launched attacks: ordinary compatibility-layer simulator flows can trigger model outputs and assessments. The UI explicitly separates this background case history from focused user-launched scenario count.

### Buttons, data and cross-page behavior

Severity filter buttons change list presentation; case rows select the correlation and expand details; disclosures reveal assessment revisions/raw evidence. Focused incident model evidence links to Detection for technical detail, while response details link to Defense & Recovery. These actions do not modify runtime security state. Data comes from retained backend event envelopes plus UI grouping/selection.

### What to say during viva

“An incident is an evidence group, not ground truth. I can show the original simulator scenario, the independent model results and the Threat Analysis Agent’s revision separately, which is important because this compatibility layer can produce false-positive-style assessments.”

## 8. Defense & Recovery

### Purpose and page organization

The page starts with **Attack Simulation & Response**, current **Response State** and three tabs: **Synthetic Attack Control**, **Defense Actions**, and **Recovery Verification**. A tab only changes which workflow panel is visible. The scenario tab combines lifecycle context and the safe Attack Control panel. Defense tab presents the focused human decision, focused defense action records, optional background history and policy explanation. Recovery tab shows recovery lifecycle and retained response timeline.

### Scenario cards and controls

The seven supported scenario cards are the same safe presets documented in Section 5. Scenario selection changes the synthetic event preset and may change compatible target list. Target is a configured virtual device, intensity is the 1×/2×/4× event-volume multiplier, and duration is logical ticks. **Schedule scenario / Launch Scenario** creates the record; **Start now** starts a scheduled record; **Cancel** cancels a scheduled/active run where the controller permits it. Active/scheduled rows show type, target, intensity, start/end ticks and elapsed/total ticks. A safety note states no external traffic is emitted.

### Defense counters and records

The Defense Decision & Action panel distinguishes counts that are often confused:

- **Pending Approval:** retained planned proposals with `human_override_state=pending`.
- **Applied Controls:** currently active policy entries—isolated devices + quarantined sources + rate-limited services + restricted ports + gateway-protection boolean. It counts effective current entries, not every action ever taken.
- **Executing Actions:** records whose status is `running` at snapshot time.
- **Completed Actions:** retained action records with status completed; this does not mean the control is still active forever or recovery is verified.
- **Recorded Policy Actions:** count of active policy-store action snapshots/operations tracked for reversibility. It is not equivalent to completed-history count or number of distinct mitigations over the system lifetime.

Thus **Applied Controls = 1** can mean one currently active policy entry even when many actions were requested/completed/rolled back over time. The backend policy state, action history and pending queue are intentionally separate.

The review queue is built from proposals with planned/pending status. It can be empty if there is no actionable detected assessment, severity is observed only, a proposal was approved/rejected/cancelled, or no focused scenario is selected for the focused panel. Items are ordered by assessment severity, recency, then scenario relevance; the first five are visible with a disclosure/pagination path to all. Selecting a record opens its target, operation, approval state and trigger reason. Response History contains terminal outcomes; nonterminal actions and technical records are separately expandable.

### Current policy and supported virtual controls

The backend manager’s defaults are autonomous defense enabled, minimum automatic severity `high`, and maximum four concurrent actions. Low/informational or undetected findings do not create defense proposals. Detected medium/high/critical findings create or update proposals. Automatic execution requires all of: defense enabled, no binary disagreement, corroborated evidence, and severity at/above configured minimum. Under the default settings, a high-or-critical corroborated assessment can run automatically; medium or evidence with disagreement/absence remains a human proposal. The current Threat Analysis Agent commonly produces medium for positive but uncorroborated cases and high for corroborated attack, so the exact outcome depends on actual runtime evidence. Do not promise every synthetic scenario will auto-defend.

Supported simulator-only policy effects are:

| Action | Virtual effect |
|---|---|
| `isolate_virtual_device` | Suppresses allowed normal telemetry/network generation for the virtual device; topology/farm can show isolated/blocked state. |
| `quarantine_synthetic_source` | Filters generated synthetic attack activity from that virtual source. |
| `rate_limit_virtual_service` | Admits only a fraction of matching synthetic service activity (policy default 0.25). |
| `restrict_virtual_port` | Suppresses synthetic activity to the selected virtual destination port. |
| `protect_gateway_mode` | Filters synthetic-to-target attack direction under gateway protection. |
| `restore_normal_policy` | Clears active virtual isolation, quarantine, rate, port and gateway controls. |

These controls never modify OS firewalls/routes or real devices. Farm/topology/3D paths are amber/blocked when their derived state sees a relevant virtual policy effect; path rendering is a view of backend policy plus focused scenario, not a physical packet observation.

### Human-in-the-loop buttons

- **Approve & apply virtual defense / Approve:** appears only for focused planned/pending proposal. Calls `POST /v1/defense/actions/{id}/approve`, records actor/reason, transitions through approved/running to completed, and applies the virtual control.
- **Reject proposal / Reject:** only while proposal is pending. Calls the reject endpoint and records a rejected human override; no policy is applied.
- **Cancel proposal / Cancel:** only for a cancellable pending proposal. Calls cancel and marks cancelled; it is not a rollback of a completed action.
- **Rollback active defense / Rollback defense:** appears only when the action is completed, reversible and its policy effect remains active. Calls rollback, restores its saved prior virtual policy and records `rolled_back`. Rollback changes policy, but does not itself prove recovery; the Recovery Agent separately verifies stable activity.

Defense-panel record controls are constrained by action lifecycle; the page handles expected state conflicts by resnapshotting and showing the current status. Buttons are disabled while a request is in flight. There is no manual approval control when no focused proposal is available.

### Recovery lifecycle and recovery panel

When a defense action completes, RecoveryManager creates a `pending` record, then tick transitions it to `monitoring`. It waits for attack completion/cancellation and acceptable target health; then transitions to `eligible`, `recovering`, and rollback/`verifying`. It needs at least two verification ticks by default and observed normal telemetry/network activity; a new high assessment during verification diverts to manual review. A bounded timeout while the attack does not become inactive can also become `manual_review`. Rollback failure becomes `failed`. The exact UI labels are derived from these stored states.

`recovered` is not sufficient by itself: UI success requires `state === recovered && verified === true`. It shows verified recoveries, in-progress records, manual review and failures distinctly. **Manual Review Required** is explicitly not recovery success. **Not Active** means no record exists. Verification activity events are counts observed by the recovery manager, not a model-accuracy verdict. The panel offers a rollback button only for a completed, reversible action whose effect is still active; recovery rollback remains a distinct operation from the success check.

### What to say during viva

“Autonomous response is conditional and simulator-only. The backend requires corroboration, severity and policy gates before automatic action; otherwise an operator approves or rejects a proposal. Recovery is not inferred from defense completion—it must observe the runtime conditions, rollback and pass verification.”

## 9. AI Agents / Logs

### Purpose and six-agent architecture

The page shows exactly six canonical agents. Classical ML and QML are parallel evidence producers; the system does not average them. Each agent is a queue-backed asynchronous worker with health, processed count, errors, last activity and bounded audit records. Clicking an agent card selects it and updates the Inspector (input, processing, output, live metrics and recent audit). Inactive runtime metrics are shown as unavailable/dashes rather than implying workers are processing.

| Agent | Purpose, input and work | Output and receiver |
|---|---|---|
| **Monitoring Agent** | Observes simulator telemetry and network-activity metadata; flags structural failure/zero-packet anomalies, not ML attacks. | Observation events with devices/context → Threat Analysis Agent. |
| **Classical ML Agent** | Receives feature vectors; performs binary XGBoost and multiclass Logistic Regression inference asynchronously outside event-loop blocking. | Classical prediction event with vector ID, labels, confidence and timing → Threat Analysis Agent and UI. |
| **Quantum ML Agent** | Independently receives feature vectors; performs frozen binary and multiclass simulator-based QML inference. Has a bounded prioritized queue. | Quantum prediction event with same vector identity → Threat Analysis Agent and UI. |
| **Threat Analysis Agent** | Consumes monitoring observations plus Classical/QML outputs; maintains per-correlation state and rule-based provisional assessment revisions. | Threat assessment events with severity, evidence strength, affected devices, tentative family and response eligibility → Defense Agent and incident UI. |
| **Defense Agent** | Consumes threat assessments and asks DefenseManager to create proposal or execute according to policy gates. | Defense action request/start/completion/rejection/rollback lifecycle → policy store and RecoveryManager/UI. |
| **Recovery Agent** | Tracks completed defense, attack lifecycle, normal activity, threat evidence and ticks; coordinates eligible rollback and bounded verification. | Recovery lifecycle event/record, verified result, failure or manual review → UI and retained event history. |

**Processed** is the count of events a worker completed, not attacks detected. **Queue** is pending event count at snapshot time; `Queue 0` means no pending items then, not that the worker did nothing. **Healthy** is agent runtime health, not prediction accuracy. **Errors** counts handler errors. A high QML queue means feature vectors arrive faster than this simulator worker can finish inference; it is not evidence of an attack or a different prediction. Focused scenario prioritization/coalescing lets demonstration evidence move ahead of stale background-only queue items and exposes the coalesced count. QML remains independent and may still be delayed if its own active inference or focused workload is long.

### Supporting components (not agents)

- **Virtual IoT Testbed / Simulation Engine:** owns device readings, clock, topology and synthetic network event production.
- **Attack Controller:** schedules safe synthetic presets and emits simulator metadata.
- **Feature Extraction Manager:** groups network events and creates/validates the fixed 27-feature input.

These components provide inputs/services but are not among the six agents. The interface explicitly labels them “Supporting Components — Not agents.”

### Internal event communication and counts

The agents subscribe to event types on an in-process asynchronous event bus; each has a bounded `asyncio.Queue` and its own worker task. Typed event records carry event ID, timestamp, source, correlation ID and typed payload. Agent-to-agent coordination happens by publishing/subscribing to these events, not by each agent making REST requests. REST is the browser/backend boundary for snapshots and commands. This is a single-process architecture, not distributed microservices or a Kafka/Redis pipeline.

### Important Events and Technical Audit

**Recent Important Events** groups recent meaningful events for readability, prioritizes focused scenario context and describes scenario/runtime events. Event groups can expand into their constituent raw records. **Advanced — Technical Audit** offers event-category filters (All, Agents, Detection, Defense, Recovery), grouped results and pagination; individual entries reveal full event JSON. Agent cards have a separate per-agent technical audit disclosure of recent worker actions. These histories are bounded; the UI does not render every raw event as a top-level row because repeated telemetry/model events would obscure decisions and could grow without bound. Counts refer to retained records/groups, not attack totals.

### What to say during viva

“The six agents are independent queue-backed workers coordinated by typed events in one Python process. Monitoring, extraction and scenario generation are supporting components, not extra agents. Parallel model evidence is correlated downstream, and the visible queue/processed metrics are operational counters rather than accuracy metrics.”

## 10. Model Performance / Research Results

### Purpose and interpretation boundary

Everything on this page is loaded from frozen JSON/CSV evaluation records and final validation artifacts. It does not show current live model outputs. Conversely, Detection shows current retained runtime predictions, not benchmark metrics. Production test results and matched-subset comparison results answer different questions and must not be compared as if they shared the same test population.

### Selected runtime models and offline test metrics

The page displays four selected runtime models/artifacts:

| Task | Model/artifact | Output/threshold | Frozen test values displayed |
|---|---|---|---|
| Classical binary | XGBoost — `binary_xgboost_gpu_v1.json` | Normal/Attack; threshold 0.012 | Accuracy 99.5964%; Balanced Accuracy 98.1922%; Macro F1 95.3762%; Normal Recall 96.7265%; Attack Recall 99.6579%; ROC-AUC 0.999586. |
| Classical multiclass | Logistic Regression — `multiclass_logistic_regression_v1.joblib` | Eight-class argmax | Accuracy 63.1499%; Balanced Accuracy 58.9565%; Macro F1 48.8496%; Weighted F1 60.3042%. |
| Binary QML · matched | 5-Qubit Amplitude QML — `binary_qml_amplitude_v1.pt` | Normal/Attack; threshold 0.390; 51 trainable parameters | Matched balanced test accuracy and Macro F1 both 96.0962% (1000 test rows). |
| Multiclass QML · matched | 5-Qubit Amplitude QML — `multiclass_qml_selected_final_v1.pt` | Eight classes by argmax; 93 parameters | Matched balanced test accuracy 38.1667%; Macro F1 35.0461% (1200 test rows). |

The classical binary production card uses the full untouched test set (196,473 rows; the stored confusion counts sum to this). Its false-positive count is 135 and normal recall 96.73%. The QML cards use controlled matched subsets; do not treat their sample counts as production test totals. A threshold converts binary score to a class; it is not the probability that an attack truly happened. Multiclass predicts one of eight labels, with output confidence not equivalent to certainty.

**Accuracy** is total correct fraction. **Balanced accuracy** averages recall across classes, helping reveal class imbalance. **Macro F1** computes F1 per class then treats classes equally. **Weighted F1** weights class F1 by sample frequency. **Normal/Attack recall** is the fraction of true examples of that class correctly identified. **ROC-AUC** summarizes ranking discrimination across thresholds; it is not the accuracy at the frozen threshold.

The multiclass score is weaker because identifying a specific family is harder than separating Normal from any attack, and classes can overlap in the same 27-feature space. The multiclass experiment record explicitly notes that exact feature vectors can map to multiple traffic labels and estimates an approximately 89.49% empirical feature-only ceiling on the complete raw dataset; that ceiling is an ambiguity analysis, not achieved model accuracy. Per-class test scores vary sharply (e.g. HTTP Flood F1 is high while ICMP Flood F1 is very low), so aggregate results hide uneven class performance.

### Evaluated candidates and matched comparison

The experiment evaluated Logistic Regression, Random Forest, Classical MLP and 5-Qubit QML. Runtime selection is XGBoost binary + Logistic Regression multiclass + binary/multiclass QML. The matched comparison exists to compare Classical controls and QML on the same train subset, balanced test subset and quantum-ready input representation. It is not the full production test evaluation.

**Matched binary subset (3000 train / 1000 test):** Logistic Regression accuracy/Macro F1 88.3%/88.1376%; Random Forest 99.3%/99.3000%; Classical MLP 93.4%/93.3711%; QML 96.1%/96.0962%. QML exceeds Logistic Regression and MLP on this sample, but not Random Forest.

**Matched multiclass subset (3200 train / 1200 test):** Logistic Regression 42.75% accuracy / 45.6950% Macro F1; Random Forest 42.50% / 31.7297%; Classical MLP 35.00% / 33.7400%; QML 38.1667% / 35.0461%. Logistic Regression has the strongest Macro F1 in that comparison.

These values do not establish quantum advantage: they are small controlled subsets, simulator execution is slower, results are task-dependent, and one candidate may win only on one metric. The page itself says no quantum advantage is claimed.

### Runtime latency chart

The runtime benchmark chart uses Phase 16 local measurements, not the much longer end-to-end dataset experiment timings in matched CSVs. Values shown (mean milliseconds) are: feature extraction **0.7276 ms**, Classical binary **0.9717 ms**, Classical multiclass **0.5461 ms**, QML binary **18.8087 ms**, QML multiclass **13.2383 ms**. Sample counts were 30 for feature extraction and 8 for each inference measurement. QML is slower locally because circuit simulation and repeated expectation evaluation are computationally heavier than conventional classifiers. Hardware, batch size, software and simulator change latency; do not extrapolate these as universal benchmarks.

### Architecture, class map, reproducibility and limitations

The architecture flow is: ordered 27 network features → task-specific TRAIN-fitted scaler → L2 normalization → append five zeros → 32 amplitudes → five-qubit AmplitudeEmbedding → three StronglyEntanglingLayers → five Pauli-Z expectations → task-specific linear head (5→1 binary / 5→8 multiclass). A five-qubit state has 32 basis amplitudes. The map is IDs 0–7: Arp_Spoofing, HTTP_Flood, ICMP_Flood, MQTT_Flood, Normal, Port_Scanning, TCP_Flood, UDP_Flood. `BotNet_DDOS` is explicitly excluded from the frozen class map.

The final manifest records artifact paths and SHA-256 hashes; final validation reports ten frozen files passed integrity validation and checkpoint compatibility. The schema, feature order, thresholds, class map, model files, scalers and experiment split metadata are frozen. Binary QML balanced test sampling uses 500 samples per class (1000 total, seed 42); multiclass QML uses 150 per class (1200 total, seed 42). Classical production evaluation uses untouched test sets. No post-test tuning is claimed.

Professional limitation statements:

- **Compatibility layer false positives:** virtual flow construction is deterministic but not an exact reproduction of the source dataset’s capture/extractor. In Phase 16's 50-tick normal soak, 320 false-positive-style incident correlations were observed. Say the deployment extractor mismatch can shift learned feature distributions; do not claim real-world IDS performance from synthetic traffic.
- **Six disagreements / one corroborated scenario:** in controlled validation, Classical Attack/QML Normal occurred for ARP Spoofing, HTTP Flood, ICMP Flood, MQTT Flood, TCP Flood and UDP Flood. Port Scanning was the sole scenario with corroborated Attack binary predictions in that run. These are observed results, not universal guaranteed outputs.
- **Simulator/device:** validation used `default.qubit` because `lightning.qubit` was unavailable. No quantum hardware or speedup/advantage claim.
- **Attribution:** multiclass can differ from simulator scenario ground truth; family labels are tentative supporting evidence.
- **Recovery:** not all runs recover automatically; manual review or failure are valid outputs and must not be described as success.
- **Runtime storage:** event, incident and policy state is in-memory and process-local, so a backend restart loses it.
- **Scope:** the validation manifest describes a virtual demonstration, not a production IDS or formal security certification.

## 11. Complete End-to-End Scenario

Use Port Scanning as an example, while stating that observed model outcomes are not guaranteed on every run.

| Step | What happens / where to see it |
|---|---|
| 1. Activate system | Click **Activate system** in the global control bar. Coordinator starts feature manager, attack controller, six agents, simulation and automatic runner. See header, Dashboard and AI Agents. |
| 2. Generate virtual activity | Simulator advances logical ticks, updates eight device states and emits telemetry/network metadata. See Smart Farm and Testbed telemetry. |
| 3. Observe | Monitoring Agent consumes telemetry/network events and publishes observations. See AI Agents → Monitoring Agent inspector and Important Events. |
| 4. Extract | Feature manager aggregates virtual communication and emits an ordered 27-value vector. See Detection → Network Activity / feature disclosure. |
| 5. Dispatch in parallel | Classical and QML agents receive the same feature-vector event independently. See AI Agents queue/processed counts. |
| 6. Classical inference | XGBoost binary and Logistic Regression multiclass results are published. See Detection → Classical column. |
| 7. QML inference | QML independently processes binary and multiclass models; it may be queued/analyzing first. See Detection → QML and AI Agents queue. |
| 8. Correlate binary outcomes | Detection compares binary labels only for same correlation and feature-vector ID. Agree/Disagree/Awaiting is shown in Intelligence and Recent Results. |
| 9. Correlate family attribution | Multiclass labels remain separate and tentative; see each model card's Attribution row. |
| 10. Assess | Threat Analysis combines observation and model evidence; asynchronous arrival can produce revisions. See Threat Center focused incident and audit. |
| 11. Assign severity/eligibility | Agent rules assign informational/low/medium/high and evidence strength; DefenseManager gates automatic action. See incident and Defense Policy. |
| 12. Propose or execute | A proposal appears in Defense & Recovery if assessment is positive/actionable. Medium, absent/disagreeing QML generally remains human pending; corroborated high can auto-execute by default. Actual evidence controls this. |
| 13. Human decision if required | On Defense Actions, inspect target/reason/evidence. Approve applies virtual policy; reject/cancel does not. See Human Approval panel and event stream. |
| 14. Virtual effect | Backend policy filters/suppresses synthetic or normal simulator activity according to action. See Current Applied Controls, device state and amber blocked route on testbed. |
| 15. Recovery tracking | Completed defense creates a recovery record. Recovery Agent tracks attack completion/cancellation and target health. See Recovery Verification tab. |
| 16. Rollback and verify | If eligible, policy is rolled back; normal virtual events must be observed over verification ticks. See lifecycle and verification counts. |
| 17. Final outcome | `recovered` plus `verified=true` is success; otherwise the truthful outcome may remain tracking, manual review, failed or not active. Never promise automatic recovery. |

Phase 16 validation recorded one Port Scanning corroboration (`Classical Attack`, `QML Attack`, high threat severity), a quarantine proposal/action that was rolled back, and `recovered: verified=True`. Six other tested types disagreed in that specific run and left proposals. This is the observed validation result, not a prediction guarantee.

## 12. Data Sources and Truth Boundaries

| Data | Producer | Consumer / visible location | Runtime or frozen? | Truth type |
|---|---|---|---|---|
| Virtual device states/topology | Simulation Engine and device registry | Farm, topology, 3D, status | Runtime | Simulator ground truth (virtual only) |
| Sensor telemetry | VirtualDevice tick updates | Farm labels, telemetry history, pump cycle | Runtime | Simulator-generated measurements, not physical sensor truth |
| Network activity | Simulation/Attack Controller metadata generator | Flow manager, monitoring agent, detection traffic view | Runtime | Simulator network ground truth (metadata only) |
| 27-feature vector | Feature Extraction Manager compatibility layer | Classical and QML workers, scenario evidence | Runtime | Derived model input; not raw truth |
| Classical prediction | Frozen XGBoost and Logistic Regression | Detection, Threat Analysis | Runtime model output | Prediction, not truth |
| QML prediction | Frozen QML models on local simulator | Detection, Threat Analysis | Runtime model output | Independent prediction, not truth |
| Threat assessment | Threat Analysis Agent rules | Incidents, Defense Agent | Runtime agent output | Interpretation/decision evidence; revisable |
| Incident/case grouping | Threat assessment events + frontend grouping | Threat Center and overview | Runtime/UI-derived | Correlated assessment history; not necessarily real attack |
| Defense action/policy | DefenseManager and virtual policy store | Response controls, testbed path state | Runtime | Agent decision and simulated effect |
| Recovery state | RecoveryManager/Recovery Agent | Recovery panel and status summaries | Runtime | Verified only when recovered and `verified=true` |
| Research metrics | Evaluation JSON/CSV/notebook artifacts | Model Performance | Frozen/offline | Historical measured evaluation result, not current runtime output |

Keep the chain clear: telemetry is not IDS input; model prediction is not an incident verdict; severity is not model confidence; a defense proposal is not an applied control; completed defense is not verified recovery; offline metrics are not live accuracy.

## 13. Frontend/Backend Technology Stack

### Frontend

- **Next.js / React:** route pages and shared React component tree; one live provider sits around all routes.
- **TypeScript:** API and view data types, control states and page-level logic.
- **CSS:** project-specific global styles provide layout, light visual system, responsive panels and charts; no separate UI framework is listed as a dependency.
- **Recharts:** charting dependency for analytical/telemetry visuals where used.
- **Lucide React:** consistent inline icons for navigation, status and controls.
- **Three.js + React Three Fiber + Drei:** actual 3D digital-twin-style farm renderer, camera controls, labels and paths.
- **Vitest / Testing Library / jsdom:** frontend tests and component interaction checks.

### Backend and model libraries

- **Python / FastAPI:** in-process application, REST routers and WebSocket endpoint.
- **Pydantic:** validation and typed event/API schemas.
- **asyncio:** event bus, worker queues, runtime lifecycle, broadcaster and automatic tick runner.
- **scikit-learn:** scalers and Logistic Regression artifact/inference support.
- **XGBoost:** frozen binary classifier.
- **PyTorch:** frozen QML output heads/checkpoint loading.
- **PennyLane:** QML circuit, device and expectation-value execution.

The manifest names Python, FastAPI, Pydantic, asyncio, PennyLane, PyTorch, XGBoost, scikit-learn, Next.js, React, TypeScript, Vitest and Recharts. There is no persistent database or message broker in the current architecture; current runtime data is in-memory.

## 14. REST/WebSocket Architecture

### Why both exist

REST is appropriate for an authoritative snapshot and explicit commands with request/response success or conflict behavior. WebSocket carries incremental typed events without every page polling independently. The frontend uses one shared WebSocket and merges events into the shared dashboard snapshot.

### Important current routes

| Route | Purpose |
|---|---|
| `GET /v1/system/status` | coordinator/component status |
| `GET /v1/system/snapshot` | authoritative combined runtime snapshot |
| `POST /v1/system/activate`, `/deactivate`, `/reset` | runtime lifecycle |
| `GET /v1/simulation/status`, `/devices`, `/topology`, `/events` | simulation state and read-only data |
| `POST /v1/simulation/start`, `/pause`, `/resume`, `/reset`, `/tick` | clock actions |
| `GET /v1/attacks/types`, `/`, `/active`, `/history` | presets and scenario records |
| `POST /v1/attacks/schedule`, `/{attack_id}/start`, `/{attack_id}/cancel` | safe synthetic scenario commands |
| `GET /v1/agents`, `/health`, `/audit` | worker and health data; `POST /v1/agents/start` and `/stop` are lifecycle routes |
| `GET /v1/features/schema`, `/status`, `/flows`, `/vectors` | feature contract and extractor state |
| `GET /v1/defense/actions`, `/policy-state` | defense history/policy state |
| `POST /v1/defense/actions/{id}/approve`, `/reject`, `/cancel`, `/rollback` | human decisions and rollback |
| `GET /v1/recovery`, `/{recovery_id}` | recovery records |
| `WS /ws/live` | connection-ready frame plus incremental live event envelopes |

The frontend's Next API client calls the same-origin `/api/backend` proxy for REST. WebSocket defaults to `ws(s)://<current-host>:8000/ws/live`, unless `NEXT_PUBLIC_WS_URL` is set.

### Snapshot, event, reconnect, epoch and sequence

On mount the provider fetches a snapshot and opens `/ws/live`. `connection_ready` reports current epoch and sequence; a reconciliation snapshot closes the narrow snapshot/stream race. Each accepted event is ordered by monotonically increasing sequence within an epoch. Duplicates/old sequence and stale epochs are rejected; gaps trigger a fresh snapshot. Snapshot refresh also runs periodically (default 15 seconds, configurable with a minimum accepted 5 seconds) and after relevant lifecycle events.

If the socket closes, UI becomes degraded/offline by retry count, continues to keep the last verified snapshot, and reconnects with bounded exponential backoff. It refreshes the snapshot before reopening/reconciling. A **new epoch** indicates reset/reinitialized runtime; old telemetry/focus/event sequence is cleared and the client waits for the fresh snapshot. This prevents stale old-run data from resurfacing after reset. Event histories and per-client broadcaster queues are bounded; slow clients can lose queued messages, and sequence gap detection prompts resynchronization rather than silently pretending the stream is complete.

All pages stay synchronized because they read this same provider. The snapshot contains status, devices, topology, events, models, flows, features, agents, attacks, defense policy/actions and recoveries. Actions trigger a snapshot refresh; streams incrementally update runtime values. This is process-local and not durable across backend restart.

## 15. Complete Glossary

| Term | Simple project-specific meaning |
|---|---|
| IoT | Networked devices that sense or control something; here they are simulated devices. |
| Virtual IoT testbed | Safe software environment that generates device/traffic behavior without real devices. |
| Digital-twin-style visualization | A visual representation bound to simulator state; not a validated physical twin. |
| Network flow | Related communication metadata aggregated by endpoints/protocol/service/time. |
| Feature vector | Ordered 27-number summary of a flow supplied to a classifier. |
| Binary classification | Decide between Normal and Attack. |
| Multiclass attribution | Choose among eight traffic labels; the family is tentative. |
| Classical ML | Conventional learned models here: XGBoost and Logistic Regression. |
| QML | Quantum-circuit-based model simulation combined with a classical output layer. |
| Qubit | A two-level quantum model unit; five qubits encode 32 amplitudes. |
| AmplitudeEmbedding | PennyLane encoding of a normalized 32-value vector into the simulated state. |
| Correlation ID | Identifier joining events/predictions that belong to one flow/scenario evidence thread. |
| Incident | Group of correlated threat-assessment revisions, not necessarily a real attack. |
| Assessment | Threat Analysis Agent interpretation of available evidence. |
| Severity | Rule-based incident priority label, not classifier confidence. |
| Agreement | Same binary class from Classical and QML for the same correlated feature vector. |
| Disagreement | Different binary classes for matched evidence. |
| Human-in-the-loop | Operator can approve/reject/cancel certain proposed defenses. |
| Defense proposal | Planned action awaiting policy execution or human decision. |
| Applied control | Currently effective entry in the virtual security policy store. |
| Rollback | Reversal of a reversible simulator-only policy effect. |
| Recovery verification | Checking that virtual activity is stable after rollback; requires explicit verified state. |
| Manual review | Runtime could not establish safe verified recovery automatically. |
| Async worker | Independent event-processing task that can work without blocking the event loop. |
| Queue | Bounded list of events waiting for a worker. |
| WebSocket | Persistent connection for incremental server-to-browser event updates. |
| REST API | Request/response interface for snapshots and commands. |
| Epoch | Runtime generation ID; reset creates a new epoch to separate old and new data. |
| Sequence | Increasing event number within an epoch used to order and deduplicate stream updates. |
| Bounded retention | Keep only a defined recent history to cap memory and UI work. |
| Simulator ground truth | What the software simulator actually generated/did, not proof about a real farm. |
| Confidence | Model output score for its own prediction; not severity, truth, or a fused score. |
| Corroborated | In this runtime policy, matching binary evidence from Classical and QML for the vector. |

## 16. Viva Questions and Answers

### Dashboard

1. **What does the dashboard summarize?** It combines simulator status, active synthetic scenarios, retained cases, agent health and correlated model evidence. **Why separate counts?** Because a scenario, assessment and actual model result are different objects.
2. **Does no positive case mean the system is safe?** No. It means none is retained as positive in this bounded snapshot. **Why?** The runtime is not a complete real-world security monitor.
3. **What does Operational mean?** The runtime is active without reported degradation. **Is that detector accuracy?** No, it is service/worker health.
4. **Why keep a focused scenario?** It follows one launched run across pages without hiding background history. **Does it change simulation?** No, focus is a UI selection.
5. **Why show a workflow?** It communicates evidence handoff. **Is it a single fused model?** No, Classical and QML remain independent until rule-based assessment.

### Smart Farm / Testbed

1. **Is this a real farm?** No, it is an in-memory virtual testbed. **Why show farm imagery?** To make simulated devices and irrigation context understandable.
2. **How many devices are configured?** Eight in the default registry. **Can I control a real pump?** No; the pump controller is virtual.
3. **How does irrigation work?** Average moisture thresholds switch a virtual pump at ≤40% and ≥58%; soil/flow approach targets gradually. **Is that physical calibration?** No, it is a deterministic demonstration rule with jitter.
4. **What does a red path mean?** Focused synthetic scenario activity. **Does it mean packets were sent?** No, only metadata events in the simulator.
5. **What happens if WebGL is missing?** 3D falls back to Network Topology. **Does telemetry stop?** No, the same runtime data remains available.

### Detection

1. **What do models consume?** Network-flow features, exactly 27 ordered values. **Why not humidity or moisture?** Those are application telemetry, not part of frozen network feature schema.
2. **Which classical models run?** XGBoost binary at 0.012 and Logistic Regression multiclass argmax. **What do outputs mean?** Predictions over binary class and eight attribution labels.
3. **Why QML?** It evaluates a quantum-inspired/simulator model pipeline for research comparison. **Does it outperform classical?** Not consistently; matched Random Forest is better on binary, Logistic Regression on multiclass.
4. **Why is QML slow/asynchronous?** State-vector circuit simulation and expectation evaluation cost more locally; independent queue processing keeps other work responsive.
5. **What does Agreement compare?** Binary results on the same correlation and exact feature vector. **Why not average confidence?** No validated fusion rule; separate evidence is more transparent.

### Threat Center

1. **What is an incident?** A group of correlated threat-assessment updates. **Is it confirmed attack ground truth?** No, it may be model-generated false-positive-style evidence.
2. **Who assigns severity?** Threat Analysis Agent rules. **Does confidence set severity?** No, severity depends on binary evidence, corroboration and monitoring context.
3. **Why do cases have revisions?** Asynchronous model evidence can arrive after monitoring or Classical prediction. **Does that create new attacks?** No; it updates the same evidence case.
4. **What is pending attribution?** No reliable/tentative family label is retained. **Can binary still be Attack?** Yes, binary detection and multiclass attribution are separate outputs.
5. **Why can background cases appear without launching?** Normal virtual compatibility traffic also produces flows and model outputs. **Should I call them attacks?** No.

### Defense & Recovery

1. **When is defense automatic?** Default requires enabled policy, matched corroboration, no disagreement, and severity at least high. **What else?** Otherwise proposals may require operator approval.
2. **What does approve do?** Records human decision and applies a simulator-only policy action. **Does it affect a real network?** No.
3. **Applied Controls vs Completed Actions?** Applied Controls counts current policy entries; completed actions counts records. **Can controls be rolled back?** Reversible actions have saved prior state.
4. **Why isn’t defense completion recovery?** A policy action can finish while attack/normal behavior remains unresolved. **What proves recovery?** The manager's recovered state plus `verified=true` after the required observation window.
5. **Why Manual Review?** Bounded automated conditions did not establish recovery or a high assessment appeared during verification. **Is that success?** No; it is truthful escalation.

### AI Agents / Logs

1. **Why six agents?** Responsibilities are separated into monitoring, two parallel model workers, threat analysis, defense and recovery. **Are they separate machines?** No, asynchronous workers in one process.
2. **How do they communicate?** Typed events through an asyncio event bus. **Why not REST internally?** REST is the browser/API boundary; in-process event pub/sub better represents event-driven coordination here.
3. **What does Queue 252 mean?** Pending events at that snapshot. **Does it mean 252 detected threats?** No.
4. **Why can QML queue grow?** Its simulator worker is slower than incoming feature vector rate. **What changed for focus?** Focused synthetic vectors are prioritized and stale background queue work is coalesced, with a visible count.
5. **Why group logs?** Repeated raw events would overwhelm the main UI; expandable audit preserves detail within bounded retention.

### Model Performance / Research

1. **Are these live metrics?** No, frozen offline evaluation results. **Where are live outputs?** Detection Intelligence.
2. **Why use QML when conventional models are faster?** To study a constrained QML pipeline and compare it fairly; it is not claimed as the operationally superior model.
3. **Why no quantum advantage claim?** Local simulator only, slower QML and mixed matched results; no quantum hardware comparison exists.
4. **Why multiclass weaker?** Family classes overlap and feature-only collisions exist; binary classification is a simpler task. **Does exact family output become ground truth?** No.
5. **How reproducible?** Frozen artifacts, hashes, feature order, thresholds, mappings and recorded split metadata. **Does that guarantee real-world generalization?** No; extractor compatibility is a known limitation.

### Difficult cross-cutting questions

- **Why might Classical and QML disagree?** Different learned decision functions and calibration/representation effects; they are intentionally independent.
- **Why not average their probabilities?** A fusion method would need separate validation and obscure model disagreement; the system preserves each score.
- **Why can normal traffic generate alerts?** The compatibility extractor is not identical to source dataset collection/extraction, causing feature-distribution mismatch. The 50-tick soak observed substantial false-positive-style behavior.
- **How could this adapt to a hospital/factory/smart city?** Replace the virtual device/network profiles, telemetry and validated feature extraction with domain-specific schemas, then revalidate models and policies; do not simply reuse farm thresholds blindly.
- **What is autonomous?** Agents can correlate evidence and, under strict backend policy gates, apply reversible virtual mitigation and initiate verification. It does not mean unrestricted real-world control.
- **Where is the human in the loop?** Medium/disagreement/uncorroborated proposals appear for approve/reject/cancel; rollback is offered only when a completed reversible effect remains active.
- **What is the main contribution?** An end-to-end, inspectable virtual framework that connects fixed-feature ML/QML comparison to event-driven agents and policy-gated response with honest recovery verification.

## 17. Five-Minute Demo Script

Use a fresh reset first if you need a clean story. The runtime result varies; do not promise model agreement or recovery.

| Time | Click / point / say / wait |
|---|---|
| **0:00–0:30 — Overview** | Point to the Dashboard status and five summary fields. Say: “This is a virtual smart-farm security testbed. Device, model, assessment and response counts are separated; none is a real-world attack count.” |
| **0:30–1:05 — Smart Farm** | Open **Smart Farm**, show the eight device markers, telemetry, gateway and Farm/Topology/3D tabs. Select a soil or pump device; point out address/state and irrigation. Say: “These values come from the virtual simulator, not physical sensors.” |
| **1:05–1:35 — Scenario launch** | Open **Defense & Recovery → Synthetic Attack Control** (or use the selected device's Simulate Attack). Choose **Port Scanning**, compatible virtual target (gateway is the Phase 16 validation target), medium/high only if you intend to reproduce test setup; keep a short duration. Click **Schedule scenario**. Say: “This schedules multi-port metadata inside the simulator; it sends no real packets.” Wait for schedule acknowledgement/focus. |
| **1:35–2:20 — Detection** | Open **AI Detection**. Point to flow/event scope, the 27-feature pipeline, Classical and QML cards. Wait for QML while it says queued/analyzing. Say: “Classical and QML process the same vector independently; QML can arrive later because it is simulator-backed.” If still pending: “No matched QML result has been retained yet; we do not substitute Classical output.” If Disagree: “That is a valid independent result, not a fused verdict.” |
| **2:20–2:55 — Threat Center** | Open **Threat Center**, inspect focused case, severity/evidence, family attribution and assessment revisions. Say: “This is the agent’s correlated assessment, not ground truth. A family prediction remains tentative.” |
| **2:55–3:55 — Defense & Recovery** | Open **Defense & Recovery → Defense Actions**. If proposal is pending, inspect evidence/target and click **Approve & apply virtual defense** or Reject if demonstrating human review. If policy auto-applied, point to current applied control and action record. Return to testbed to show a blocked/filtered path if one is actually reflected. Then open Recovery Verification. Say: “A completed defense is not recovery; recovery must pass a separate observed verification.” |
| **3:55–4:20 — Outcome** | Wait only as long as demo allows. If **Recovered · verified**, point out verified flag/ticks. If **Manual Review Required**, say: “The automation could not prove stable recovery, so it escalated; we do not label that success.” If still monitoring, state that the check is in progress. |
| **4:20–4:40 — AI Agents** | Open **AI Agents**. Click QML and Threat Analysis cards; point to processed, queue, coalesced work, health/errors and event audit. Say: “These are six in-process workers; counters are operational, not accuracy.” |
| **4:40–5:00 — Model Performance** | Open **Model Performance**; point out binary vs multiclass and matched comparison. Say: “These are frozen offline values. QML is slower locally, results are mixed, and I make no quantum advantage claim.” |

### Demo contingencies

- If QML is still Awaiting: keep the UI open briefly; explain asynchronous simulator latency and say no result is available yet. Never copy or infer its result.
- If models Disagree: show both outputs and the binary mismatch; explain that the policy withholds automatic corroborated action and may require human review.
- If no incident is created: show retained flow/model evidence and explain the agent only creates/updates assessments from its evidence rules.
- If defense does not block a visible line: explain that visualization only marks a path when a corresponding focused path/policy state exists; do not fabricate a blocked state.
- If recovery ends in Manual Review: call it an honest unresolved outcome, not a failure of truthfulness or a verified success.

## 18. Final Project Architecture Summary

```text
Virtual devices + deterministic logical clock
                  │ telemetry + network metadata
                  ▼
     Async event bus ────────► WebSocket broadcaster ───────► Shared browser provider
          │                                                        │
          ├──► Monitoring Agent ─► Observations                    ├─ Dashboard
          ├──► Feature Extraction Manager                           ├─ Smart Farm
          │        └──► exact ordered 27-feature vector              ├─ Detection
          │                   ├──► Classical ML Agent                ├─ Threat Center
          │                   └──► QML Agent (async simulator)       ├─ Defense/Recovery
          │                                  │                       └─ Agents/Logs
          └──────────────────► Threat Analysis Agent ◄──────────────┘
                                      │ correlated assessment
                                      ▼
                    Defense Agent + policy-gated DefenseManager
                                      │ simulator-only effect
                                      ▼
                          Recovery Agent / verification
```

The architecture's central strength is traceability: event correlation and feature-vector IDs connect model evidence to an assessment and response record. Its central limitation is also explicit: a synthetic compatibility-layer IDS demonstration does not establish production detection performance. Models/thresholds/features are frozen; current UI state is process-local; QML is asynchronous and simulator-based; outcomes can disagree or require manual review. The strongest viva presentation is therefore precise about safety, truth boundaries, evaluation scope and remaining limitations.

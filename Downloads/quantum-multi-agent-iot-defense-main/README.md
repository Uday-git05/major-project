# FarmFlow Live SOC

FarmFlow is a local, simulator-only IoT security operations demonstration. It connects a
deterministic virtual farm network to a frozen 27-feature ML/QML inference pipeline, six
event-driven agents, reversible virtual defenses, recovery verification, WebSocket live
delivery, and a responsive SOC dashboard.

The application does **not** send attack packets, control physical devices, modify the host
firewall, or claim quantum advantage.

## Architecture

```text
Virtual IoT devices and logical clock
  -> typed telemetry and NetworkActivityEvent metadata
  -> deterministic 27-feature compatibility extractor
  -> frozen classical ML + asynchronous frozen QML
  -> monitoring, inference, threat-analysis, defense, and recovery agents
  -> in-memory reversible simulator policy
  -> bounded WebSocket event delivery + reconciliation snapshot
  -> Next.js SOC dashboard
```

The classical binary model is the primary detector. QML is asynchronous corroborating
evidence; probabilities are never averaged. Multiclass outputs are tentative attribution,
not attack ground truth.

## Requirements and installation

- Python 3.11 or a compatible environment
- Node.js and npm
- The frozen `models/` and `artifacts/` directories supplied with the project

```powershell
cd backend
python -m pip install -r requirements.txt

cd ..\frontend
npm install
```

PennyLane uses `lightning.qubit` when installed and compatible. It safely falls back to
`default.qubit`; both are local simulators. CUDA or quantum hardware is not required.

## Start the application

Terminal 1:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:3000`. Select **Activate system**; the logical clock, virtual
devices, feature pipeline, six agents, and live stream then run automatically. No internal
API calls are required for the normal demonstration.

On Windows, `scripts/start_demo.ps1` is an optional convenience launcher:

```powershell
.\scripts\start_demo.ps1
```

Environment settings, including cadence, seed, bounded histories, WebSocket queue size,
autonomous-defense policy, and CORS origins, are documented in `backend/.env.example`.

## Safe synthetic scenarios

The dashboard can schedule seven deterministic, metadata-only scenarios:

- `Arp_Spoofing`
- `HTTP_Flood`
- `ICMP_Flood`
- `MQTT_Flood`
- `Port_Scanning`
- `TCP_Flood`
- `UDP_Flood`

They operate only on in-memory virtual targets. The controller does not use Scapy, Nmap,
raw sockets, real ARP, packet flooding, external hosts, credentials, or exploit payloads.
Private simulator ground truth never enters feature vectors or model inference.

## Controls, reset, and shutdown

- **Pause/Resume** stops or resumes logical ticks without destroying state.
- **Full reset** clears attacks, flows, incidents, defenses, recovery records, policies,
  histories, and queues, then advances the WebSocket epoch.
- **Deactivate** stops the automatic runner and all agents while leaving the API available.
- Stop the frontend and backend with `Ctrl+C` in their respective terminals.

Defense actions alter only the in-memory simulator policy. Human approve, reject, cancel,
manual-action, and rollback controls are reversible and cannot affect the operating system
or a real network.

## Validation

```powershell
cd backend
python -m pytest
python -m compileall -q app tests scripts
python scripts/validate_phase16.py

cd ..\frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

The final integrity hashes, real-model soak/attack observations, lifecycle/reset checks,
and representative local timings are recorded in
`artifacts/phase16_validation_results_v1.json`. The application freeze manifest is
`artifacts/farmflow_application_final_manifest_v1.json`.

## Important limitations

- QML executes on a local state-vector simulator. No quantum hardware, speedup, or quantum
  advantage is claimed.
- The live extractor preserves the exact ordered 27-feature model contract, but it is a
  compatibility layer for synthetic metadata and is not claimed to reproduce the original
  dataset author's packet-to-flow implementation exactly.
- Final validation observed substantial false-positive-style classical detections on normal
  compatibility-layer traffic. This is reported behavior of the frozen models and thresholds,
  not a formal accuracy estimate; operators must review evidence before interpreting alerts.
- Multiclass attribution can disagree with the selected synthetic scenario and must remain
  tentative.
- Runtime state is in memory and intentionally resets when the backend process exits.
- The system is a controlled educational/research demonstration, not a production IDS or
  physical farm control system.
# Shared-network Attack Lab

For an authorized phone-and-laptop test on the same private network:

1. From `backend`, start the one shared API (Windows):

   ```powershell
   .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   Use the matching Python executable on other platforms.
2. In a second terminal, from `frontend`, start the Defender Dashboard:

   ```powershell
   npm run dev:defend
   ```

3. In a third terminal, from `frontend`, start the separate Attack Lab:

   ```powershell
   npm run dev:attack
   ```

4. On the phone, open `http://<laptop-LAN-address>:3001/`. On the laptop, open
   `http://<laptop-LAN-address>:3000/` for the Defender Dashboard.

The two frontends run as separate Next.js apps on ports 3000 and 3001. Both API
rewrites and both WebSocket clients connect to the same backend process on port
8000. Allow inbound TCP ports 3000, 3001, and 8000 through the laptop firewall
for the authorized private network profile. `/attack-lab` on the Defender app
redirects to the separate Attack Lab on port 3001.

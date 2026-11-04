"use client";

import Link from "next/link";
import type { Attack, DashboardSnapshot } from "@/types/api";
import { scenarioAttacks, scenarioRecords, type ScenarioFocus } from "@/features/scenario-focus";
import { titleCase } from "@/lib/format";

export function ScenarioContextBar({ data, focus, onFocus, onClear, resynchronizing = false }: {
  data: DashboardSnapshot; focus: ScenarioFocus | null; onFocus: (attack: Attack) => void; onClear: () => void; resynchronizing?: boolean;
}) {
  const scope = scenarioRecords(data, focus);
  const attacks = scenarioAttacks(data);
  return <section className="scenario-context" aria-label="Scenario focus">
    <div><b>{focus ? "Focused Scenario" : "Monitoring"}</b><p>{focus ? `${titleCase(focus.attackType)} · Target: ${focus.target} · ${scope.attack ? titleCase(scope.attack.status) : "Scenario status not retained"}` : "Monitoring IoT traffic. Background security signals are being analyzed; this is not a claim that models predict Normal."}</p>
      <small>Background assessments: {scope.backgroundAssessments} retained updates</small>
    </div>
    {resynchronizing && <p role="status">New runtime epoch observed. Waiting for a fresh scenario snapshot.</p>}
    <div className="scenario-focus-controls"><label>Scenario focus<select aria-label="Scenario focus" disabled={resynchronizing} value={focus?.attackId ?? ""} onChange={(event) => {
      if (!event.target.value) onClear(); else { const attack = attacks.find((item) => item.attack_id === event.target.value); if (attack) onFocus(attack); }
    }}><option value="">Monitoring — no focused scenario</option>{focus && !attacks.some((attack) => attack.attack_id === focus.attackId) && <option value={focus.attackId}>{titleCase(focus.attackType)} · retained identity</option>}{attacks.map((attack) => <option value={attack.attack_id} key={attack.attack_id}>{titleCase(attack.attack_type)} · {attack.target_device_id} · tick {attack.start_tick} · {titleCase(attack.status)}</option>)}</select></label>
    {focus && <button onClick={onClear}>Clear focus / Return to monitoring</button>}
    {focus && <Link href="/attack-response">Follow scenario response</Link>}</div>
    {focus && <details><summary>Scenario technical identity</summary><dl><dt>Attack ID</dt><dd>{focus.attackId}</dd><dt>Correlation ID</dt><dd>{focus.correlationId}</dd><dt>Epoch / start tick</dt><dd>{focus.epoch} / {focus.startTick}</dd></dl></details>}
  </section>;
}

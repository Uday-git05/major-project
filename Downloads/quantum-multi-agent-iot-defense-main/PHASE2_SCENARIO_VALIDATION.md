# Final Simplification — Phase 2: Scenario-focused workflow

Validation completed on 2026-10-09 (Asia/Calcutta). This phase is frontend-only. Phases 3–5 were not started.

## 1. Existing identity and original selection problem

The Attack Controller already assigns an `attack_id` and a `correlation_id`. Attack lifecycle and synthetic network events carry that correlation. Feature extraction propagates the flow correlation into feature-vector events; Classical ML, QML and Threat Analysis preserve it. Assessments expose `incident_id`; defense records carry incident/correlation identity; recovery records carry correlation and `defense_action_id`. Runtime envelopes provide epoch and sequence. No second correlation system was introduced.

Previously, the response helper independently ranked global defense/recovery/incident records and selected a globally live/recent attack. Combining those selections could display attack A alongside response records belonging to B. The primary workspace now anchors every selection to one explicit scenario correlation.

## 2. Shared Scenario Focus

`ScenarioFocus` stores `{ epoch, attackId, correlationId, attackType, target, startTick }`. It stores identity, not a cached model verdict or lifecycle status. Current status is read from the shared runtime snapshot; when bounded history evicts the attack, the UI says its status is not retained.

The existing persistent `LiveRuntimeProvider` owns focus and incident selection. No page-local scenario copies, backend endpoints, additional subscriptions or sockets were added. The provider retains focus across page-component navigation, streamed updates and same-epoch reconnect snapshots.

Successful schedule/start requests establish focus using the returned attack identity. Intent tokens prevent an older asynchronous request from stealing focus after an explicit switch, clear or epoch reset. Failed requests do not establish a new focus. The retained-scenario selector supports explicit switching; clearing focus does not cancel an attack or delete evidence.

## 3. Evidence and response selection

- Models: latest retained Classical and QML events within the focused correlation, selected independently. No global prediction fallback. Missing QML is labelled Awaiting QML with pending/unavailable/retention uncertainty.
- Incident: retained assessments within the same correlation are grouped using existing incident identity. The Incidents page marks the focused case and provides View focused scenario. Explicit inspection of a background case does not change scenario focus.
- Defense: primary actions must have the focused correlation. Existing ranking is applied only inside that correlation.
- Recovery: must have the focused correlation and, when a defense is retained/selected, its exact `defense_action_id`. A recovery pointing to a known foreign-correlated defense is rejected. A same-correlation recovery can remain visible if its defense record has fallen outside retention.
- Flow/features: features must have the exact correlation. Current flows are linked only through a matching feature `flow_id` whose timestamp falls in that flow's current window. No match by target, family, severity or recency alone.
- Timeline: contains only events for the selected correlation. Missing stages remain waiting/not established; they are not fabricated.

All application primary-story callers pass explicit focus or `null`. The response helper's omitted-argument compatibility path remains for record-inspection callers, but also anchors records to a single correlation instead of merging global selections.

## 4. Monitoring, background evidence and semantic truth

Without an explicit focus, Overview and Attack & Response show Monitoring, even if background detectors report positive results. This is an operator workflow mode, not a claim that the model predicts Normal.

Background events remain in the shared snapshot. Detection retains all previous global panels below the focused evidence section. Incident, defense and recovery histories remain available. Overview's pre-existing global summaries are in a labelled background disclosure; the full Phase 3 redesign is deferred. Background counts explicitly mean retained assessment updates, not unique cases or a time-window total.

Synthetic scenario type and model attribution are displayed independently. Port Scanning may have HTTP Flood attribution; agreement does not establish correct attribution. Completed attacks do not imply recovery success. Phase 1 Pending Approval, Applied Controls, Executing Actions, bounded-history terminology, manual-review separation and verified recovery checks are preserved.

## 5. Reset, epochs and reconnect

Successful Full reset clears focus immediately. The dashboard hook exposes the observed runtime epoch to the provider so a newer epoch clears old focus before a delayed replacement snapshot arrives. Scenario selection is disabled while waiting for the matching-epoch snapshot. Epoch and intent checks reject obsolete commits, including when deterministic attack IDs repeat after reset.

The existing snapshot/stream/reconciliation/reconnect and sequence-filtering architecture remains in place. The epoch exposure is local frontend state, not a runtime contract change. Reconnect in the same epoch preserves focus and creates only the replacement socket.

## 6. Tests and static validation

Final regression: **127/127 tests passed across 20 files**. Baseline was 98 tests; 29 focused tests were added. Existing Phase 1 semantic tests are included.

Required categories covered: Monitoring; launch establishes focus; cross-page persistence; streamed update persistence; unrelated assessment/defense/recovery isolation; missing QML; disagreement; different simulator/model attribution; manual review; verified recovery fixtures; reset; epoch invalidation; explicit switching; one shared socket. Additional cases cover retention eviction, contradictory recovery links, flow provenance, late launch responses and same-epoch reconnect.

Commands (frontend working directory):

```powershell
npm test -- --pool=threads --maxWorkers=1 --testTimeout=15000
npm run typecheck
npm run lint
npm run build -- --webpack
```

- Frontend tests: PASS, 127/127, final run 125.72 seconds.
- TypeScript: PASS (`tsc --noEmit`).
- ESLint: PASS.
- Production build: PASS (`next build --webpack`, exit 0) after the approved output-permission retry; all application routes prerendered successfully.
- Backend tests: not rerun; no backend source or contract changed.

Earlier validation found stale test expectations for the former global response selection, one ambiguous incident selector, and a fixture-harness lint error. These were corrected before the final passing regression. The first build compiled and typechecked, then hit Windows `EPERM` creating a `.next` prerender output directory. It was retried with approved output permissions; no source workaround or dependency change was made.

## 7. Browser acceptance evidence

Browser acceptance used `frontend/tests/scenario-preview.tsx`: the actual page components and shared provider with clearly labelled local fixtures and an in-memory socket. No backend was started, no real network attack occurred, and fixture outcomes are not presented as measured model results.

Verified interactively:

1. Monitoring remains selected after unrelated positive assessment B.
2. Scheduling and starting Port Scanning establishes the returned scenario identity.
3. Background B defense/recovery remain in history and do not appear as the focused scenario's primary response.
4. Classical Attack / HTTP Flood attribution appears for focused Port Scanning while QML is explicitly awaited.
5. QML Normal produces Disagreement without rewriting the synthetic scenario or either attribution.
6. Focus survives Overview → Attack & Response → Detection → Incidents → Multi-Agent → Overview with one in-memory socket.
7. Incidents marks the focused case; inspecting B preserves focus; View focused scenario returns to the linked case.
8. Matching defense becomes primary; matching manual review remains unverified even after the attack completes. B's verified recovery does not replace it.
9. Clear focus returns to Monitoring and retains histories. Re-selecting and Full reset clears the focus and records in the fixture.
10. At the inspected desktop viewport, document `scrollWidth` and `clientWidth` both measured 1265 pixels. The context bar and primary story rendered without document-level horizontal overflow.

The browser's initial Vite harness setup lacked Next's pathname context and logged an AppNavigation error. A preview-only navigation stub resolved this; subsequent completed interactions produced no new console errors/warnings. Production navigation code was not modified. Browser navigation used the harness page buttons under the persistent provider, not a live Next router/backend deployment; automated provider/navigation tests and the production build cover the complementary application structure. A fresh real-backend end-to-end demo was not rerun in this frontend-only phase. The temporary QA tab was closed and its localhost preview server stopped after validation; existing user services were left alone.

Screenshot: [labelled fixture acceptance state](phase2-scenario-browser.jpg).

## 8. Frozen-area verification

SHA-256 comparison against the pre-Phase-2 baseline checked 169 existing files. All 68 backend application files and all 34 artifact files in that baseline are unchanged. Changes are limited to the 15 existing frontend files listed below. All four deployed model files match the SHA-256 values in the unchanged frozen application manifest.

No changes to 27-feature order, thresholds 0.012/0.390, QML architecture/parameter counts, inference, attack generation, severity mapping, defense policy, recovery verification, six-agent roster or research metrics. No dependencies were added.

## 9. Created files

- `frontend/features/scenario-focus.ts`
- `frontend/components/scenario-context.tsx`
- `frontend/components/scenario-evidence.tsx`
- `frontend/components/scenario-story.tsx`
- `frontend/tests/scenario-fixtures.ts`
- `frontend/tests/scenario-focus.test.tsx`
- `frontend/tests/scenario-provider.test.tsx`
- `frontend/tests/scenario-preview.tsx`
- `PHASE2_SCENARIO_VALIDATION.md`
- `phase2-scenario-browser.jpg`

## 10. Modified files

- `frontend/app/page.tsx`
- `frontend/app/attack-response/page.tsx`
- `frontend/app/detection/page.tsx`
- `frontend/app/incidents/page.tsx`
- `frontend/components/attack-control.tsx`
- `frontend/components/incident-panel.tsx`
- `frontend/components/live-runtime-provider.tsx`
- `frontend/components/response-state.tsx`
- `frontend/components/simulation-controls.tsx`
- `frontend/features/incidents.ts`
- `frontend/features/response.ts`
- `frontend/hooks/use-live-dashboard.ts`
- `frontend/styles/globals.css`
- `frontend/tests/page-structure.test.tsx`
- `frontend/tests/response-workspace.test.tsx`

Generated `.next` output and TypeScript incremental cache are validation outputs, not application source changes. The workspace has no Git metadata; the source change inventory uses the captured baseline hashes.

## 11. Remaining limitations and deferred work

- ActiveFlow read models do not expose correlation; feature provenance supports a conservative link but cannot prove exclusive scenario ownership of an aggregated flow.
- Prediction payloads lack a source feature-vector identifier. The display compares the latest retained results within the same scenario correlation, not necessarily the identical feature window.
- Retention can remove evidence and attack status. Missing evidence is never filled from unrelated records.
- Focus is in-memory session state: it survives client page navigation and reconnect, not a hard browser reload.
- Fixture QA proves presentation/selection behavior, not new inference accuracy, latency or real recovery outcomes. Previous measured model limitations remain unchanged.
- Phase 3 incident/defense/event-stream simplification, and later 3D/Detection/Multi-Agent design, colors, animation and final polish are deliberately not implemented.

Phase 2 stops at scenario-focused workflow. No report/PPT/viva work or later simplification phase was started.

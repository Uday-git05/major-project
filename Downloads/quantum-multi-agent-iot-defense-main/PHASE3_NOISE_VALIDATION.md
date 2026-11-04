# Final Simplification — Phase 3: Evidence hierarchy and noise reduction

Date: 2026-10-09 (Asia/Calcutta). Scope: frontend presentation only. Phase 1 semantics and Phase 2 scenario focus remain authoritative. Phases 4–5 are not started.

## Incident hierarchy (deliverables 1–5)

Before: all retained cases were rendered in the default queue, with expanded record/revision content available on each row. After: a prominent Focused Scenario Case summarizes synthetic scenario, actual assessment severity, model comparison, matching defense/recovery, and retained evidence-update count. It never borrows a background response.

The default is **Focused + Priority**: the matching case followed by at most five other priority cases. Ordering is Critical, High, proposals requiring human action, unresolved manual-review/failure cases, then other recent cases. This is display ordering only, not a security-policy decision. Severity filters remain available.

Background Assessment Summary counts unfocused retained cases and assessment updates separately and explicitly discloses bounded history and possible false-positive-style compatibility-layer activity. All Cases includes every retained grouped case, ten per page. View All Background Cases opens that view and clears the severity filter; its explanatory text states that the focused case is also included.

Existing incident-ID grouping is preserved; repeated assessments remain revisions within one case. The accumulator now appends to its own per-case array rather than repeatedly copying it. View Evidence Updates and selected-investigation evidence details provide paginated revisions with full raw JSON. No events are removed from the runtime snapshot.

## Defense and recovery (deliverables 6–11)

Before: up to 50 detailed defense records and 50 recovery records were rendered with many action buttons. After:

- The Phase 2 focused lifecycle remains primary.
- Review Queue shows at most five pending-human-approval proposals; all pending proposals remain available through a paginated disclosure. Sorting uses retained assessment severity, recency, then scenario relevance. Unknown severity is not inferred from confidence.
- Only a selected defense record exposes its lifecycle-permitted Approve/Reject/Cancel/Rollback controls. Requests still use the existing API and per-action in-flight lock. Lifecycle-conflict refresh/error handling is preserved. Non-conflict request failures now remain inline instead of becoming unhandled rejections. There is no bulk approval or automatic approval.
- Defense grouping requires the exact action ID, correlation, action type and target. Different action IDs are not merged merely because the target/class matches. Repeated retained records for the same identity expose their revisions; backend snapshots normally contain one current record per action.
- Current Applied Controls comes only from current policy entries: virtual isolation, quarantine, service rate limits, restricted ports and gateway protection. Completed actions do not imply active controls. Recorded policy-action counts remain separate from control counts.
- Response History is collapsed and paginated ten records at a time. Executing/other nonterminal actions have their own disclosure. Retained Defense Technical Records exposes all original records.
- Focused recovery details appear before background recovery items. Other unresolved/manual-review records show at most five rows, with all remaining items reachable. Manual review and failure are prioritized; recovered-but-unverified records remain unresolved. Only `state=recovered` and `verified=true` qualify as verified recovery history. Full recovery records remain available as JSON.

## Important Events and Technical Audit (deliverables 12–15)

Important Events is the default on Multi-Agent Intelligence. It includes existing attack lifecycle, defense/human-override lifecycle, recovery state/verification transitions, device/agent status changes, first retained model verdicts and verdict/attribution changes, and meaningful assessment changes (severity, detected result, attribution, status, disagreement, evidence strength).

Confidence/latency/evidence-count-only changes are not new meaningful verdicts. Repeated equal semantic states are grouped within the exact correlation/type/entity; A → B → A transitions remain distinct. Unrelated correlations are never merged into one event group. Each group retains event count, event type, correlation, first/latest timestamp and original events. Important Events renders at most twelve groups, focused correlation first, with all important groups available via disclosure.

Technical Audit retains All, Simulation, Features, Agents, Attacks, Defense and Recovery filters. Groups use exact event type plus correlation; group pages contain ten entries and raw-event pages contain twenty. Raw IDs, source, timestamps and complete payloads are accessible. Unknown event types remain accessible through All.

The UI says **retained**, **bounded**, **no fixed time window**, and **not a complete permanent audit**. Runtime reset replaces the history. The backend does not retain activation/deactivation/reset as event rows in the snapshot: `runtime_reset` is a transport epoch marker, not a retained domain event. The panel displays actual current runtime active/state/epoch and explicitly explains this limitation. It does not manufacture lifecycle history or modify the WebSocket architecture to add it.

## Overview and other pages (deliverable 16)

Overview keeps the scenario story primary, avoids repeating the large retained-case total in its hero security tile, and adds compact pending-background-proposal links to analysis/review/audit. Truthful counts remain in the shared header, context and secondary background views. Incident and response technical timelines are collapsed by default to avoid repeated processing rows dominating an investigation. Detection already limits its flow list and presents current model evidence; no Detection layout redesign was performed. Six-agent architecture and digital twin are unchanged.

## Files (deliverables 17–18)

Created application files:

- `frontend/features/presentation.ts`
- `frontend/components/evidence-disclosure.tsx`

Created validation files:

- `frontend/tests/disclosure-helper.ts`
- `frontend/tests/noise-fixtures.ts`
- `frontend/tests/noise-presentation.test.tsx`
- `frontend/tests/noise-preview.tsx`
- `frontend/tests/noise-preview-server.mjs`
- `PHASE3_NOISE_VALIDATION.md`
- `phase3-important-events.jpg`

Modified application files:

- `frontend/app/page.tsx`
- `frontend/app/incidents/page.tsx`
- `frontend/app/attack-response/page.tsx`
- `frontend/app/multi-agent/page.tsx`
- `frontend/components/incident-panel.tsx`
- `frontend/components/incident-detail.tsx`
- `frontend/components/defense-panel.tsx`
- `frontend/components/recovery-panel.tsx`
- `frontend/components/event-stream.tsx`
- `frontend/components/overview-panels.tsx`
- `frontend/features/incidents.ts`
- `frontend/styles/globals.css`

Modified tests:

- `frontend/tests/acceptance-history-panels.test.tsx`
- `frontend/tests/controls.test.tsx`
- `frontend/tests/incident-investigation.test.tsx`
- `frontend/tests/page-structure.test.tsx`
- `frontend/tests/response-workspace.test.tsx`
- `frontend/tests/runtime-semantics.test.tsx`

Generated Next.js output and TypeScript incremental cache are build products. No dependency or package-manifest changes were required. The workspace has no Git metadata; this inventory records the edits made in this phase, not earlier approved changes.

## Tests, commands and results (deliverables 19–24)

Twelve new tests exercise high-noise defaults, focused-case priority, revision counts/raw evidence, priority sorting, exact defense identity grouping, selected-only controls, policy-only controls, collapsed histories, manual review, Important Events, audit correlation/count preservation, meaningful transitions, lifecycle events and reset/epoch disclosure. Earlier UI tests were updated to deliberately select/open evidence instead of expecting 50–105 rows or all approval buttons by default. Semantic assertions and backend command behavior remain tested.

Commands run from `frontend`:

```powershell
npm test -- --pool=threads --maxWorkers=1 --testTimeout=15000 tests/noise-presentation.test.tsx tests/controls.test.tsx tests/runtime-semantics.test.tsx tests/acceptance-history-panels.test.tsx tests/incident-investigation.test.tsx tests/response-workspace.test.tsx
npm test -- --pool=threads --maxWorkers=1 --testTimeout=15000
npm run typecheck
npm run lint
npm run build -- --webpack
node tests/noise-preview-server.mjs
```

- Focused regression: **69/69 passed** across six files.
- Full regression before the final small browser-QA refinements: **139/139 passed**, 21 files, 327.63 seconds.
- Final post-refinement regression: **139/139 passed**, 21 files, 250.87 seconds, exit code 0.
- TypeScript (`tsc --noEmit`): **passed**. ESLint (`eslint .`): **passed**. Both ran after the final regression, with exit code 0.
- Production build (`next build --webpack`): **passed**, exit code 0; all application routes prerendered successfully.
- Backend tests: not rerun; backend was not changed or started.
- The first sandbox build failed with Windows `EPERM` creating `.next/static/chunks/app`. The approved output-permission retry passed; no source workaround or dependency change was made.
- Existing test-environment notices include Three.js CommonJS deprecation and jsdom document-navigation limitations. These are not browser errors or failed assertions.

## Representative browser acceptance and performance (deliverable 25)

The localhost-only preview drives actual page components and the persistent provider using explicitly labelled fixtures: **82 cases, 242 assessment updates, 82 defense records (60 pending), 32 recovery records, and 1,505 retained events including 1,200 feature events**. This is not live model inference or a new measured security outcome. Page switching uses fixture navigation buttons under the same provider; the Next router is stubbed only in this harness, so the sidebar highlight stays Overview. Production navigation/subscription tests cover the real shared application structure.

Observed:

- No focused scenario: Monitoring remains primary despite positive background assessments and many proposals; no synthetic attack is active in the acceptance fixture.
- Focus A: prominent Medium / Disagreement / Completed defense / Manual Review case remains selected while Critical B and many background cases remain accessible. Default list is six rows; All Cases paginates all 82.
- Sixty proposals render five compact queue entries and no approval buttons before selection. Selecting one exposes one action set without replacing the focused lifecycle. No proposal was approved during browser QA.
- Important Events renders twelve groups, including a single group for 61 equal Classical verdicts. Raw feature rows are absent from this default.
- Technical Audit Features shows four correlation-specific groups totaling 1,200 events. Expanded group pagination moved from rows 1–20 to 21–40, and full `feature-80` JSON retained its event ID, `flow-0` correlation and payload.
- Reset clears focus and summaries, returns to Monitoring and shows the new epoch and zero retained events.
- One in-memory runtime socket during page-component navigation; no extra production subscription was added.
- Browser error/warning log was empty. At the inspected desktop viewport, document `clientWidth` and `scrollWidth` were both 1265px. No observed interaction freeze. No FPS/CPU benchmark or live-backend latency claim is made.
- The temporary fixture preview was stopped after QA. No backend was started for this phase.

Grouping is memoized against retained arrays. Collapsed disclosure bodies are not mounted, and pagination bounds rendered rows. No virtualization dependency was necessary. The application still legitimately receives all runtime data; this phase reduces presentation work, not inference frequency or retention volume.

Screenshot: [Important Events fixture view](phase3-important-events.jpg).

## Frozen behavior and limitations (deliverables 26–27)

No backend source, runtime contract, subscription architecture, feature extraction/order, thresholds, model logic/architecture, attack semantics, severity mapping, defense/recovery policy, agent roster, or research metrics were modified. All four deployed model SHA-256 hashes were checked against the frozen application manifest and matched.

Existing bounded-retention and Phase 2 correlation limitations still apply. Priority is a display heuristic over retained evidence, not an authoritative unresolved-incident policy; no global durable case status exists. Different action IDs remain separate even if visually similar. Historical activation/stop/reset events cannot be reconstructed from the existing read model. Real-backend inference/performance was not rerun for this frontend-only work.

Phase 4 remains: 3D/Testbed, Detection and Multi-Agent visual improvements, colors and animations. Phase 5 remains: final polish/acceptance. Neither phase nor report/PPT/viva work was started.

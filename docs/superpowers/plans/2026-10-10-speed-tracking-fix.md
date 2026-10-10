# Speed tracking reliability implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user approved the six scoped fixes and staged verification in this chat. Do not commit or push as part of this request.

**Goal:** Count the first movement reliably and isolate movement state across scene and combat resets.

**Architecture:** Keep the existing History watcher, movement queue and metadata contracts. Patch initialization, cache recovery and lifecycle guards in place. Existing combat reloads retain their movement totals.

**Tech Stack:** JavaScript ES modules, Owlbear SDK, node:test module mocks, Vite.

**Spec:** Approved in-chat proposal; investigation in ../../INVESTIGAZIONE_SPEED_TRACKER_2026-10-10.md.

## Constraints and risks

- Preserve HP, active-turn navigation, initiative order, attachments and unrelated metadata.
- Production files: src/history.js, src/speedCheck.js; only the clear-button callback in src/initiativeList.js if combat reset requires wiring.
- Keep function names and metadata keys. All token writes merge metadata.
- Baseline capture must precede persistence; do not overwrite valid persisted turn baselines.
- Scene/toggle/combat generations must reject obsolete asynchronous loads and writes.
- Preserve Undo, movement limits, climbing, condition costs and outgoing-turn movement semantics.
- Work in the existing authorized checkout; carry forward the investigation artifacts.

## Step 1: First movement

- [x] Add real runtime regression tests for late token read, multiple queued segments, warning/limit, reset origin, persisted reload, Undo and non-active actors.
- [x] Extend History integration tests for the first movement after scene unload/readiness and metadata-only events.
- [x] Run tests and confirm failures before patching.
- [x] Patch History baseline positions with event-before fallback and no overwrite of more recent cache values.
- [x] Capture the first pending active-actor movement origin before new-state baseline persistence.
- [x] Run targeted regressions and build.

## Step 2: Recovery and profile refresh

- [x] Add failing regressions for transient read failure, disabled-to-valid profile and speed edits preserving used distance.
- [x] Clear only the failed initialization Promise; refresh speed profiles with stale-read guards and without metadata loops.
- [x] Verify conditions, standing cost, Undo, normal initialization and build.

## Step 3: Scene and combat boundaries

- [x] Add failing tests for identical IDs after unload, delayed old reads/queued writes, stale scene events and explicit combat clear/rebuild versus reload.
- [x] Subscribe speed runtime to existing scene epoch; invalidate pending work while preserving room preferences.
- [x] Clear only movement data on explicit initiative clear; guard queued writes and preserve metadata/positions.
- [x] Run targeted regressions, full suite, build and verify:dist.

## Step 4: Smoke and review

- [x] Exercise SDK-boundary smoke sequences: enabled GM tracker, start turn, move, limit, Undo, speed edit, scene change, combat clear and reload.
- [x] Run existing performance/UI smoke harness if available; inspect available browser for a usable Owlbear room before claiming live UI validation.
- [x] Request one independent review of final changes; resolve material findings with regressions.
- [x] Update investigation runner/report to point to regression coverage and record exact verification/limitations.

## Progress ledger

- Planning complete. User authorization includes implementation and staged checks; no new approvals are needed for the scoped patches.
- Baseline: HEAD 1131674, only the two investigation artifacts are untracked. Previous full baseline 2,958 tests green; fresh per-step tests follow below.

- Step 1: four initial regressions failed before the patch, then the runtime/History checks and build passed. First movement, reset origin, limit/warning and persisted reload are covered.
- Step 2: failed-read recovery and two profile refresh cases first failed, then passed with speed/condition controls and build.
- Step 3: five scene/combat boundary regressions first failed. Additional clear-button, prewarm and queued-reset failures were fixed without altering ordinary outgoing-turn semantics.
- Independent review: resolved delayed History delivery, disabled refresh with real records, previously removed tokens on combat clear and overlapping profile refresh/movement. Added failing regressions before each correction; final review has no material findings.
- Final checks: 26 Speed Check runtime tests plus 5 History integration tests passed; full suite 2,986 passed, zero failed; build and verify:dist passed, version 1.3.0.
- SDK smoke harness: correctness.ok=true, HP/initiative/History/scene isolation assertions passed. Browser inventory contained no Owlbear room; live smoke was not performed. The investigation report includes the six-step live checklist.
- The investigation runner now executes the regression tests. No commit, push or deploy performed.
# Tasks: SQLite Write Queue

## Phase 1: Foundation & dependency decision (prerequisite for all)

- [x] 1.1 **Decision task**: confirm `sqlite3` as MVP package in `package.json` and record adapter seam requirement in `openspec/changes/sqlite-write-queue/design.md` notes (future swap to `better-sqlite3`/`node:sqlite`).
- [x] 1.2 RED: add `tests/queue-store.test.js` migration-path test for default DB path (`~/.figma-ds-cli/write-queue/queue.sqlite`) and `FIGMA_WRITE_QUEUE_DB` override.
- [x] 1.3 GREEN: create `src/queue-store.js` bootstrap/migration for `operations` + `events` schema; satisfy path/override tests.
- [x] 1.4 REFACTOR: extract shared DB helpers in `src/queue-store.js` (timestamps, JSON encode/decode, error mapping) without changing behavior.

## Phase 2: Core queue primitives (depends on Phase 1)

- [x] 2.1 RED: add classification contract tests in `tests/exec-classifier.test.js` for `render`, `render-batch`, `eval` default-write, and `eval intent=read` bypass.
- [x] 2.2 GREEN: create `src/exec-classifier.js` validating `intent`, `queue`, `wait`, `target.page`, `operationId`, `idempotencyKey`.
- [x] 2.3 REFACTOR: centralize request normalization in `src/exec-classifier.js` to keep daemon parsing deterministic.
- [x] 2.4 RED: add `tests/target-resolver.test.js` for page-id priority, exact-name fallback, and duplicate-name fail-closed.
- [x] 2.5 GREEN: create `src/target-resolver.js` prelude generator + deterministic ambiguity/missing-page errors.
- [x] 2.6 REFACTOR: isolate resolver snapshot payload builder (`pageId/pageName/childCount/nodeIds`) for reuse by verification.
- [x] 2.7 RED: extend `tests/queue-store.test.js` for enqueue/idempotency, single lease, lease expiry retry-to-queued, and retry limit to `failed`.
- [x] 2.8 GREEN: implement QueueStore operations/events APIs in `src/queue-store.js` for state machine `queued -> running -> success|failed`.

## Phase 3: Gateway integration & compatibility (depends on Phase 2)

- [x] 3.1 RED: add `tests/write-gateway.test.js` for write routing, lease serialization, and “direct non-queued write rejected”.
- [x] 3.2 GREEN: create `src/write-gateway.js` coordinating classifier output, QueueStore lease/worker flow, and execution boundary.
- [x] 3.3 REFACTOR: split gateway into enqueue, inline wait, and finalize helpers for simpler reasoning and testability.
- [x] 3.4 RED: add `tests/daemon-queue-compat.test.js` asserting default `queue=inline` blocking result shape is unchanged for `daemonExec()` callers.
- [x] 3.5 GREEN: modify `src/daemon.js` to route all write-capable `/exec` through gateway; keep read intent on existing direct path.
- [x] 3.6 GREEN: modify `src/index.js` + `src/figma-client.js` to forward metadata (`intent`, `queue`, `target.page`, `verify`) without breaking normal `node src/index.js ...` UX.
- [x] 3.7 RED: add `tests/daemon-enqueue-contract.test.js` for `queue=enqueue` acceptance envelope (`accepted`, `operationId`, `status`).
- [x] 3.8 GREEN: implement enqueue response path in `src/write-gateway.js`/`src/daemon.js` with HTTP 202-style contract.

## Phase 4: Verification, guards, migration/back-compat, docs & validation

- [x] 4.1 RED: add `tests/verification.test.js` for structural verification pass/fail gating and optional visual hook no-op behavior.
- [x] 4.2 GREEN: create `src/verification.js` and integrate into gateway success criteria before marking operation `success`.
- [x] 4.3 GREEN: add bypass-guard behavior (`queue=bypass` daemon-internal only, emit `queue_bypassed`, optional env guard) in `src/exec-classifier.js` + `src/write-gateway.js` with tests.
- [x] 4.4 GREEN: update `tests/safe-mode.test.js` and/or `tests/project-isolation.test.js` for safe-mode contract preservation (`intent/queue/target.page` forwarding).
- [x] 4.5 GREEN: add migration/backward-compat notes in `README.md` and `REFERENCE.md` (inline default, enqueue optional, no build step).
- [x] 4.6 Validation: run only `node --test tests/*.test.js`; fix failures; do not run build.

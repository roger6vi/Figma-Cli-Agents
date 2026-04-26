## Exploration: sqlite-write-queue

### Current State
- Runtime writes are executed immediately at daemon boundary in `src/daemon.js` (`POST /exec`), where actions `eval`, `render`, and `render-batch` are parsed and executed directly against Figma (CDP/plugin).
- CLI-side helpers in `src/index.js` (`daemonExec`, `fastEval`, `fastRender`) are thin request wrappers with fallback to direct client calls, which means there is currently no centralized write serialization policy.
- Most generated Figma code and JSX parser output assumes `figma.currentPage` unless the code itself changes page; there is no first-class `target.page` contract in daemon requests.
- Existing tests are mostly static/source assertions and parser behavior checks under `node:test`; there is no queue/storage module yet.

### Affected Areas
- `src/daemon.js` — this is the live write boundary and the best insertion point for classification, queueing, leasing, and execution.
- `src/index.js` — request envelope (`daemonExec`) and command UX must stay compatible while adding optional async/enqueue semantics and page targeting metadata.
- `src/figma-client.js` — JSX/batch code generation currently anchors to `figma.currentPage`; target-page prelude hooks will be needed for deterministic page writes.
- `tests/daemon-eval-timeout.test.js` — existing static pattern for daemon request-body behavior can be extended for queue metadata assertions.
- `tests/jsx-parser.test.js` — parser-related tests can protect page-target prelude generation and no-regression behavior.
- `tests/command-smoke.test.js` — if new queue commands/options are introduced, help output must remain stable and validated.

### Approaches
1. **Inline Queue Gateway in Daemon (`/exec`) with SQLite persistence** — add a daemon-local `WriteGateway` that classifies requests, enqueues writes, and executes via a single worker before calling Figma.
   - Pros: single choke point, safe cross-session serialization, preserves current CLI command surface, aligns with "queue just before Figma write" constraint.
   - Cons: requires new storage/runtime module and migration path for existing direct/fallback flows.
   - Effort: Medium

2. **CLI-side Queue First, Daemon Second** — enqueue in `src/index.js` before calling daemon.
   - Pros: easier incremental rollout for selected commands.
   - Cons: weak guarantee (direct daemon callers bypass), multi-agent safety not centralized, duplicates policy in multiple clients.
   - Effort: Medium

3. **File-backed MVP first (JSONL/lockfile), SQLite later**
   - Pros: zero native deps, fast bootstrap on Node >=18.
   - Cons: weaker concurrency semantics and recovery tooling vs SQLite; likely short-lived throwaway implementation.
   - Effort: Low

### Recommendation
Adopt **Approach 1** with a **storage adapter seam**, but target SQLite as the default durable backend at the daemon boundary.

Recommended execution shape:
1. Add `WriteGateway` in daemon `/exec` path, before `switch(action)` execution.
2. Classify operation type:
   - `render`, `render-batch` => always `write`
   - `eval` => default `write` unless explicit `intent: "read"`
3. Add request metadata envelope (non-breaking):
   - `intent`, `queue` (`inline|enqueue|auto`), `target.page` (id/name), `idempotencyKey`, `verify` mode
4. For `write` ops, enqueue then execute through one worker lease; for `read` ops, execute direct path.
5. Preserve existing UX by defaulting to `queue=inline` (caller waits; output shape unchanged), with opt-in async enqueue mode later.

### Minimum Schema / Entities
MVP tables:
- `operations`
  - `id`, `created_at`, `action`, `intent`, `queue_mode`, `target_page_id`, `target_page_name`, `payload_json`, `status`, `attempt_count`, `started_at`, `finished_at`, `result_json`, `error_text`, `idempotency_key`
- `events`
  - `id`, `op_id`, `ts`, `event_type`, `detail_json`

Nice-to-have (later):
- `snapshots` (pre/post structural state and optional verify image refs)
- dedicated `leases/locks` table (not required for single-daemon worker; row-level lease fields on `operations` are sufficient for MVP)

### MVP vs Later
**MVP (proposal/spec ready):**
- Daemon-side queue gateway in front of live write execution
- SQLite-backed `operations + events`
- `eval` default write classification with explicit read override
- `target.page` prelude resolution (by page id or exact name) before executing write payload
- Blocking compatibility mode (`inline`) + optional async enqueue response (`accepted`, `operationId`)
- Fast verification mode: structural checks (page id/name match, node count delta, created IDs present)

**Later phases:**
- richer retries/backoff and dead-letter handling
- visual verification integration (`verify` screenshot sampling)
- queue inspection/cancel/replay CLI commands
- snapshot/versioning and conflict heuristics for overlapping target areas

### CLI Behavior Compatibility Plan
- Keep existing commands and outputs unchanged by default (`queue=inline`).
- Add opt-in flags/env (example): `--enqueue`, `--queue-mode`, `--target-page <name|id>`, `--intent read|write`.
- Continue supporting fast direct daemon path; queue worker should execute quickly in warm daemon conditions.
- Ensure fallback paths are explicit: write-capable commands should avoid bypassing daemon when queue policy is active.

### Test Strategy (`node --test tests/*.test.js`)
Add tests in phases:
1. **Static contract tests** (style aligned with current suite)
   - daemon parses `intent`, `queue`, `target`, `idempotencyKey` from `/exec` body
   - eval defaults to write unless explicit read
2. **Unit tests for queue/store module**
   - enqueue/dequeue ordering
   - status transitions (`queued -> running -> success|failed`)
   - idempotency key de-dup semantics
3. **Target page behavior tests**
   - generated prelude includes deterministic page resolution
   - failure envelope when target page missing
4. **CLI compatibility tests**
   - help/smoke assertions for new options
   - default mode returns same response shape as current behavior

### SQLite Compatibility / Tradeoff (Node >=18)
- `node:sqlite` is not a safe baseline for this project because `engines.node >=18` includes environments where `node:sqlite` is unavailable.
- Recommendation: use an explicit SQLite dependency for compatibility across Node 18+.
  - `better-sqlite3`: fastest/simple transactional API, but native build friction in some environments.
  - `sqlite3`: broader prebuilt availability, async API, somewhat heavier ergonomics.
- Practical recommendation for this repo: prefer **`sqlite3` for compatibility-first MVP**, or use **`better-sqlite3` with documented install constraints** if performance/atomic simplicity is prioritized.
- Keep a storage adapter so a future Node baseline bump can switch to `node:sqlite` without queue API churn.

### Risks
- Existing direct eval/render fallbacks may bypass queue unless write paths are normalized through daemon gateway.
- Page targeting ambiguity (duplicate page names) can cause wrong-page writes if matching strategy is weak.
- Async enqueue mode can confuse users if command success means "accepted" vs "applied" without clear UX messaging.
- Native SQLite dependency choice can impact install reliability across developer machines/CI.

### Ready for Proposal
Yes — enough evidence exists to draft proposal/spec/design with a daemon-boundary queue gateway and compatibility-first SQLite strategy.

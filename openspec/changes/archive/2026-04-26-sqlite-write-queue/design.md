# Design: SQLite Write Queue

## Technical Approach

Add a daemon-local write gateway immediately before `/exec` reaches Figma. Existing CLI calls keep `queue=inline` implicitly, so `daemonExec()` still returns `result` only. New metadata lets multi-agent callers enqueue writes, target pages deterministically, and observe durable operation state. Reads (`intent=read`) bypass the queue; writes (`render`, `render-batch`, `eval` default) serialize through SQLite and one worker lease.

## Architecture Decisions

| Decision | Options / tradeoff | Choice and rationale |
|---|---|---|
| SQLite dependency | `node:sqlite` is unavailable across Node >=18; `better-sqlite3` is simpler but native install can hurt; `sqlite3` is async and broadly prebuilt. | MVP uses `sqlite3` behind `QueueStore`; compatibility beats ergonomics, and adapter keeps future swaps cheap. |
| Storage path | Repo-local is visible but not daemon-user scoped; global config matches token/tmp conventions. | `~/.figma-ds-cli/write-queue/queue.sqlite`, overridable by `FIGMA_WRITE_QUEUE_DB`, because daemon state belongs to the local Figma runtime. |
| Queue boundary | CLI-side queue is bypassable; daemon gateway centralizes policy. | `src/write-gateway.js` wraps all write-capable `/exec` actions before current switch execution. |
| Targeting | Name fallback is user-friendly but ambiguous. | Prefer `target.page.id`; exact `name` only if one match; duplicate/missing pages fail closed. |
| Verification | Visual screenshots are expensive/runtime-dependent. | Fast structural verification by default; optional visual hook only when `verify: "visual"`. |

## Data Flow

```text
CLI/agent ──POST /exec──> daemon classifier ──read──> existing executor
                         │
                         └─write──> QueueStore ──lease──> WriteWorker
                                      │                   │
                                      events/snapshots     target prelude → Figma → verify
```

Inline mode waits for the worker and returns the existing `{ result, mode }` daemon envelope, so `daemonExec()` still returns only `result`. Enqueue mode returns HTTP 202 `{ accepted:true, operationId, status:"queued" }`; callers poll later via future queue APIs, not part of MVP CLI UX.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/queue-store.js` | Create | SQLite init, migrations, enqueue/idempotency, event append, lease/status updates. |
| `src/exec-classifier.js` | Create | Classifies `action + intent`, validates `queue`, `wait`, `target`, `operationId`, `idempotencyKey`. |
| `src/target-resolver.js` | Create | Generates page-resolution/selection prelude and ambiguity errors. |
| `src/write-gateway.js` | Create | Coordinates enqueue, inline wait, worker lease, retries, verification, response compatibility. |
| `src/verification.js` | Create | Captures pre/post structural snapshots and optional visual verification hook. |
| `src/daemon.js` | Modify | Move current switch body into reusable executor and route writes through gateway. |
| `src/index.js` | Modify | Extend `daemonExec` payload pass-through; add optional flags later without changing defaults. |
| `src/figma-client.js` | Modify | Accept target prelude for `parseJSX`/`parseJSXBatch` generated code. |

## Interfaces / Contracts

`POST /exec` additions: `{ action, code|jsx|jsxArray, intent:"read"|"write", target:{page:{id?,name?}}, queue:"inline"|"enqueue"|"bypass", wait:true|false, operationId?, idempotencyKey?, verify:"structural"|"visual"|"none" }`. `bypass` is daemon-internal/debug only and logs `queue_bypassed`; it cannot protect concurrent writers.

Schema: `operations(id TEXT PK, idempotency_key TEXT UNIQUE, action TEXT, intent TEXT, queue_mode TEXT, target_page_id TEXT, target_page_name TEXT, payload_json TEXT, status TEXT, attempt_count INT, lease_owner TEXT, lease_expires_at INT, created_at INT, started_at INT, finished_at INT, result_json TEXT, error_text TEXT, pre_snapshot_json TEXT, post_snapshot_json TEXT)`. `events(id INTEGER PK, op_id TEXT, ts INT, event_type TEXT, detail_json TEXT)`.

State machine: `queued -> running -> success|failed`; stale `running` rows with expired lease return to `queued` until `attempt_count >= 2`, then `failed`. Retries are immediate MVP retries only; no backoff/dead-letter UX.

Page resolver prelude: list `figma.root.children`, select by id first, else exact name count === 1, set `figma.currentPage`, capture `{pageId,pageName,childCount,nodeIds}`. Verification checks page match plus child-count/node-id changes when result includes ids; visual verification may call existing export/screenshot paths later.

Snapshots/events: emit ordered lifecycle records including `created`, `leased`, `target_resolved`, `executed`, `verified`, `success`, `failed`, `retry_scheduled`, `queue_bypassed` (guarded daemon-internal bypass). Snapshots are JSON structural summaries, not image history.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | classifier, schema migration, idempotency, lease expiry, target ambiguity, verifier diffs | `node:test` pure/module tests with temp DB under `os.tmpdir()`. |
| Static contract | `/exec` parses metadata and preserves legacy response | Source assertions like `daemon-eval-timeout.test.js`. |
| CLI smoke | Existing help/output unchanged; future flags visible when added | Extend `command-smoke.test.js`; do not require live Figma. |

## Migration / Rollout

No user data migration required. On daemon start, create SQLite tables if absent. Roll out with `queue=inline` defaults first, then expose async flags once queue inspection exists.

## Open Questions

- [ ] Should `bypass` require an env guard such as `FIGMA_WRITE_QUEUE_ALLOW_BYPASS=1`?

## Implementation Notes

- MVP dependency decision confirmed: `sqlite3` in `package.json` for Node >=18 compatibility.
- Adapter seam requirement: `QueueStore` keeps SQLite access behind helper methods and injectable DB handle so future swap to `better-sqlite3` or `node:sqlite` does not change daemon/gateway contracts.

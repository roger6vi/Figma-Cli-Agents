# Proposal: SQLite Write Queue

## Intent

Add a daemon-side SQLite write queue immediately before Figma execution so concurrent agents/sessions serialize canvas writes safely. Git worktrees isolate files, not the live Figma document, so they do not prevent two sessions from mutating the same canvas at once.

## Scope

### In Scope
- Add a daemon-side write gateway in `src/daemon.js` that classifies `/exec` requests and serializes writes.
- Persist queue state in SQLite (`operations`, `events`) with locking/lease semantics, target-page resolution, inline verification, and request metadata.
- Preserve current blocking CLI behavior while defining an opt-in async enqueue contract for later commands/flags.

### Out of Scope
- Full conflict resolution across overlapping node regions.
- Rich retry/backoff, cancel/replay tooling, visual diffing, or snapshot history UI.

## Capabilities

### New Capabilities
- `write-queue-execution`: Durable daemon-boundary queueing, leasing, page targeting, verification, and event history for Figma writes.

### Modified Capabilities
- `safe-mode-execution`: Extend daemon/runtime execution contract so queued writes preserve current command UX while adding intent, queue mode, and target-page metadata.

## Approach

Insert a `WriteGateway` ahead of live write execution in `src/daemon.js`. `render` and `render-batch` are always writes; `eval` defaults to write unless `intent=read`. Write requests enter SQLite, resolve `target.page` by id or exact name, run under a single active lease, verify structural outcomes, and emit events/snapshots hooks. Default mode stays `queue=inline`; future `enqueue` mode returns acceptance metadata without breaking existing commands.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/daemon.js` | Modified | Add write gateway, classification, leasing, execution boundary |
| `src/index.js` | Modified | Add non-breaking metadata envelope and future enqueue flags |
| `src/figma-client.js` | Modified | Add deterministic target-page prelude/resolution support |
| `tests/*.test.js` | Modified/New | Cover queue contract, page targeting, compatibility |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Direct paths bypass queue | Med | Normalize all write-capable daemon execution through gateway |
| Duplicate page names misroute writes | Med | Prefer page id, require exact-name fallback, fail closed on ambiguity |
| SQLite package install friction | Med | Use adapter seam; prefer `sqlite3` for Node 18+ compatibility |

## Rollback Plan

Disable gateway routing, remove queue metadata usage, and restore direct daemon execution while leaving CLI command surface unchanged.

## Dependencies

- Recommended MVP dependency: `sqlite3` for compatibility-first Node >=18 support; keep storage adapter to allow future `better-sqlite3` or `node:sqlite` swap.

## Success Criteria

- [ ] Concurrent write requests are serialized at the daemon boundary and no longer race on the same Figma canvas.
- [ ] Existing blocking CLI commands keep their current response shape by default.
- [ ] Targeted writes can resolve the intended page deterministically and fail safely when resolution is ambiguous.
- [ ] Proposal scope clearly separates MVP queueing from later retries, snapshots, and queue-management UX.

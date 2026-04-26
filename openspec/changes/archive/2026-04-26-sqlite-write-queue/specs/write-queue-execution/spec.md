# write-queue-execution Specification

## Purpose

Serialize daemon-side Figma writes with durable queue state while preserving today’s blocking CLI behavior.

## Requirements

### Requirement: Queue Gateway Routing and Operation Classification

The daemon MUST route all write-capable `/exec` requests through a write gateway. `render` and `render-batch` MUST classify as `write`. `eval` MUST classify as `write` unless `intent=read` is explicit. Active queue policy MUST NOT be bypassed by fallback write paths.

#### Scenario: Write operations are normalized through gateway

- GIVEN `/exec` receives `render`, `render-batch`, or `eval` without `intent=read`
- WHEN classification occurs
- THEN the daemon records a queued operation and executes through the gateway
- AND direct non-queued write execution is rejected.

### Requirement: Blocking Compatibility and Async Enqueue

`queue=inline` MUST remain default and SHALL preserve synchronous/blocking CLI completion semantics and compatible result shape. `queue=enqueue` MAY return acceptance metadata (`accepted`, `operationId`) for multi-agent async callers.

#### Scenario: Inline mode remains backward-compatible

- GIVEN a write request omits queue mode
- WHEN the operation succeeds
- THEN the caller receives completion in the same blocking interaction
- AND no enqueue-only response shape replaces the current default.

#### Scenario: Enqueue mode supports async workflows

- GIVEN a write request sets `queue=enqueue`
- WHEN accepted by the gateway
- THEN the response returns acceptance metadata
- AND final status is read from persisted operation/events history.

### Requirement: Deterministic Target Page Resolution

The gateway MUST resolve `target.page` by id first, then exact page name. It SHALL fail closed if target is missing or ambiguous.

#### Scenario: Ambiguous page name fails closed

- GIVEN multiple pages share the requested target name
- WHEN a write operation resolves target page
- THEN the operation fails with deterministic ambiguity error
- AND no write payload runs.

### Requirement: Lease, Retry, and Serialization Safety

The queue MUST enforce a single active write lease. Lease acquisition SHOULD retry with bounded attempts for transient lock contention.

#### Scenario: Concurrent writers are serialized

- GIVEN multiple queued writes from concurrent callers
- WHEN workers compete for execution
- THEN only one operation is `running` under lease
- AND others remain queued until lease release or bounded retry exhaustion.

### Requirement: Verification, Persistence, and Performance Awareness

The system MUST persist operation state transitions, events, and result envelopes; it SHOULD persist optional snapshot references. Structural verification MUST gate write success; visual verification MAY be optional evidence. Warm/idle daemon state SHALL be treated as a performance concern, and warm-path execution SHOULD prefer direct daemon `/exec` with explicit `target.page` over chained page-switch+render flows known to hang.

#### Scenario: Post-write verification and history are durable

- GIVEN a queued write finishes execution
- WHEN verification completes
- THEN structural pass/fail determines success state
- AND operation/events/result (and optional visual snapshot metadata) are persisted.

### Requirement: Testing Expectations

Queue behavior MUST be validated with `node --test tests/*.test.js`, covering classification, queue routing, target fail-closed rules, lease serialization/retry boundaries, compatibility defaults, enqueue contract, and persistence records.

#### Scenario: Test suite enforces queue contract

- GIVEN the project test command runs
- WHEN queue-related tests execute
- THEN required queue and verification contracts are asserted
- AND regressions in blocking compatibility are detected.

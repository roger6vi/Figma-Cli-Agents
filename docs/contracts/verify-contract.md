# Verify Contract

## Purpose

Define the post-write verification surface this runtime exposes and what downstream tools may rely on.

## Current Verify Surface

Documented command:

- `node src/index.js verify [nodeId]`

Documented behavior in this fork:

- exports a PNG snapshot of the selected node or an explicit node ID
- returns JSON
- can emit base64 image data to stdout
- can save a PNG file when `--save` is used
- scales output down by default and caps maximum dimensions

## Success Conditions

A verify operation counts as successful when:

- the target node is found or a valid selection exists
- the node is exportable
- the runtime returns JSON with node identity and image output metadata
- image output is either present as base64 or successfully written to disk

## Failure Conditions

A verify operation counts as failed when any of the following occur:

- no node is selected and no valid node ID was provided
- the requested node cannot be found
- the target node cannot be exported
- the runtime is not connected
- export or file-save steps fail

## When Verify Is Required

This fork explicitly documents one strong rule:

- after creating components, run `verify`

For Maya as a downstream consumer, verify should also be treated as required whenever:

- a write changes visible structure or layout in a way that matters to the task
- a visual claim will be persisted, audited, or handed off
- a lower-level or custom `eval` path was used for mutation

## When Verify May Be Optional

Verify may be optional for downstream orchestration when the operation is non-visual and Maya only needs runtime success, such as:

- connection setup
- some metadata-only reads
- preparatory actions that do not claim final visual correctness

Optional does not mean guaranteed safe. It only means the runtime itself does not define a mandatory visual check for every command.

## Verify Non-Guarantees

This contract does not guarantee:

- semantic correctness of the design
- accessibility correctness by screenshot alone
- that a successful verify proves the full page or system is correct
- that verification replaces task-specific checks such as bindings, naming, hierarchy, or token policy

## Consumer Guidance

Maya should treat `verify` as the runtime's visual evidence primitive, not as complete quality assurance.

Use it together with task-specific checks.

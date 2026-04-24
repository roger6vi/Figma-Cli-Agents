# Write Contract

## Purpose

Define what downstream consumers may assume about write operations in this runtime and where those assumptions must stop.

## Write Scope

This fork documents write capability across multiple command groups, including:

- node and canvas mutation
- render and render-batch creation flows
- component conversion
- variables/tokens
- styles
- slots
- sections
- boolean operations
- library imports
- annotations
- page and viewport operations
- project and skill sidecar management related to the local runtime workflow
- plugin lifecycle management (`plugins list|install|uninstall|setup`) and bundled `voice` command registration

## What Maya May Assume

Maya may assume the following at dependency level:

- this runtime is intended to perform live mutations against Figma Desktop
- write commands require a valid runtime connection before execution
- this fork exposes both higher-level commands and raw `eval` execution for cases where higher-level commands are insufficient
- some write paths prefer the daemon first and may fall back to direct execution

## What Must Be Verified Separately

Maya must not treat write invocation as proof of correct design output.

After a write, Maya should separately verify:

- the expected node exists
- the expected node identity or selection is correct
- critical geometry or hierarchy assumptions still hold
- visual output matches the intended result when appearance matters
- required variable bindings or metadata are actually present when those details matter to the task

## Runtime Non-Guarantees

This runtime does not guarantee:

- that every successful command means the final canvas matches Maya's design intent
- that higher-level commands preserve all downstream product invariants
- that a write is reversible unless a separate undo/version workflow is used
- that all command outputs are normalized into a single write result schema
- that upstream `figma-cli` write semantics are identical to this fork

## Raw Execution Boundary

`eval` is part of the runtime surface and is useful for advanced mutations, but it is intentionally less constrained than purpose-built commands.

Downstream implication:

- Maya may depend on `eval` existing as an escape hatch
- Maya should not assign stronger guarantees to `eval` than to the exact script it sends

## Consumer Guidance

Use the highest-level command that satisfies the task.

Escalate to `eval` only when:

- the required behavior is not covered by a stable command group
- Maya can verify the result afterward
- the operation is specific enough that custom script risk is acceptable

# safe-mode-execution Specification

## Purpose

Define Safe Mode plugin eval behavior that removes dynamic `AsyncFunction` usage while preserving the fork runtime contract.

## Requirements

### Requirement: Safe Mode Evaluation Hardening

The system MUST execute Safe Mode eval requests through a hardened path that SHALL NOT require `new AsyncFunction(...)` in `plugin/code.js`.

#### Scenario: Safe eval succeeds without dynamic function constructors

- GIVEN the CLI is connected in Safe Mode
- WHEN an eval command is executed through the plugin bridge
- THEN the plugin evaluates using the hardened execution path
- AND no `AsyncFunction` constructor dependency is invoked

#### Scenario: Invalid eval payload is rejected safely

- GIVEN a malformed or unsupported eval payload
- WHEN the Safe Mode execution path receives the request
- THEN execution is rejected with a bounded error response
- AND the plugin process remains available for subsequent commands

### Requirement: Fork Runtime Contract Preservation

The system MUST preserve existing fork behavior for multi-agent launcher flow, project isolation semantics, and daemon/runtime command contracts while applying Safe Mode queue-contract changes, including forwarding `intent`, `queue`, and `target.page`, with default blocking compatibility.

#### Scenario: Existing launcher and project context remain intact

- GIVEN an active project-isolated session launched by current fork workflows
- WHEN Safe Mode eval is performed after the hardening change
- THEN launcher-mediated execution behavior matches current fork expectations
- AND project-scoped state and command routing remain unchanged

# Delta for safe-mode-execution

## MODIFIED Requirements

### Requirement: Fork Runtime Contract Preservation

The system MUST preserve existing fork behavior for multi-agent launcher flow, project isolation semantics, and daemon/runtime command contracts while applying Safe Mode queue-contract changes, including forwarding `intent`, `queue`, and `target.page`, with default blocking compatibility.
(Previously: Preserved launcher/project/daemon contracts for Safe Mode hardening only, without queue-contract metadata.)

#### Scenario: Existing launcher and project context remain intact

- GIVEN an active project-isolated session launched by current fork workflows
- WHEN Safe Mode eval is performed after queue-contract changes
- THEN launcher-mediated execution behavior matches current fork expectations
- AND project-scoped state and command routing remain unchanged.

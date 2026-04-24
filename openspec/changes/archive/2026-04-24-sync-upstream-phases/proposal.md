# Proposal: Sync Upstream Phases

## Intent

Safely backport three upstream superpowers into the fork using fork-native integration, not a blind merge. This addresses a real Safe Mode runtime risk already present in `plugin/code.js` (`new AsyncFunction(...)`) while preserving custom fork behavior around multi-agent launch, project isolation, runtime contracts, and daemon auth.

## Scope

### In Scope
- Backport `8701e16` to harden Safe Mode plugin eval in `plugin/code.js`.
- Adapt `20f707c` into fork-compatible plugin management and credentials flows.
- Adapt `e0ac095` into bundled voice plugin support, packaging, tests, and contract/docs updates.

### Out of Scope
- Blind cherry-pick/merge of upstream branch history.
- Optional docs-only cleanup from `2a187cb` unless required by the runtime changes.

## Capabilities

### New Capabilities
- `safe-mode-execution`: Safe Mode plugin eval uses the upstream-safe execution path instead of `AsyncFunction`.
- `plugin-management`: CLI-managed plugin registry/install/load behavior aligned to fork config and security conventions.
- `bundled-voice-plugin`: Bundled voice plugin ships with the CLI and loads through the adapted plugin system.

### Modified Capabilities
- None.

## Approach

Use a phased targeted backport. Phase 1 adopts `8701e16` with minimal drift. Phase 2 ports the plugin framework from `20f707c` but rewires storage, credentials, and command registration to `.figma-ds-cli`, existing security helpers, and the fork’s command topology. Phase 3 ports `e0ac095` only after the framework is stable, adding packaging coverage and runtime-contract updates. Automatic mode remains the operating context, but integration must be safe for the fork’s existing launcher/runtime model.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `plugin/code.js` | Modified | Safe Mode eval fix from `8701e16` |
| `src/index.js` | Modified | Add/adapt `plugins` command surface |
| `src/plugins.js`, `src/credentials.js` | New | Fork-native plugin lifecycle + secure credentials |
| `plugins/voice/**`, `package.json` | New/Modified | Bundle voice plugin and ensure publishable assets |
| `tests/*.test.js`, `docs/contracts/*` | Modified | Add regression/packaging coverage and contract updates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Security/path regressions from verbatim upstream port | High | Reuse fork config roots and hardened utilities |
| Command/package drift breaks CLI behavior | Med | Phase rollout with targeted tests and packaging checks |
| Contract drift for Maya/runtime docs | Med | Update docs/contracts in same phase as behavior |

## Rollback Plan

Revert by phase: first undo voice/plugin packaging changes, then plugin framework changes, while keeping or separately reverting the isolated Safe Mode fix if needed.

## Dependencies

- Exploration artifact `sdd/sync-upstream-phases/explore`
- Upstream commits `8701e16`, `20f707c`, `e0ac095`; optional `2a187cb`

## Success Criteria

- [ ] `plugin/code.js` no longer depends on `new AsyncFunction(...)` for Safe Mode execution.
- [ ] Plugin management uses fork conventions (`.figma-ds-cli`, hardened credential handling, compatible command wiring).
- [ ] Bundled voice plugin is packaged, test-covered, and reflected in runtime contracts/docs.

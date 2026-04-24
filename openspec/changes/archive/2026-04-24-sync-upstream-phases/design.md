# Design: Sync Upstream Phases

## Technical Approach

Use a phased fork-native backport. Phase 1 is a safe direct backport of upstream `8701e16` in `plugin/code.js`. Phases 2-3 reuse upstream concepts from `20f707c` and `e0ac095`, but adapt storage roots, credential handling, command wiring, packaging, and docs to this fork’s `figma-ds-cli` runtime and project-isolation model. No blind merge.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Safe Mode eval | Keep `AsyncFunction`; direct backport; redesign transport | Direct backport `8701e16` | Verified clean apply; fixes real QuickJS break with minimal drift. |
| Plugin storage/auth | Upstream `~/.figma-cli` + shell commands; fork-native secure paths | Fork-native adaptation | Existing repo already standardizes `~/.figma-ds-cli` and `src/security.js`; upstream shell interpolation would regress security/conventions. |
| Voice delivery | External git clone; bundled assets | Bundled plugin with adapted installer | Matches upstream phase 3 intent while preserving offline install, publish-time guarantees, and fork package structure. |
| Command registration | Static only; dynamic load at end of file | Add `plugins` group near `project`/`skills`, then dynamic `loadPlugins()` before `program.parse()` | Preserves current command topology and help surfaces while keeping plugin commands first-class. |

## Data Flow

```text
plugins command -> src/plugins.js -> plugin registry/install/setup/load
                                 -> src/credentials.js -> OS store / secure file fallback
dynamic plugin cmd -> bundled plugin entry -> daemonExec/checkConnection -> Figma runtime
safe eval -> daemon plugin bridge -> plugin/code.js -> eval() in QuickJS-safe scope
```

## File Changes

| File | Action | Description |
|---|---|---|
| `plugin/code.js` | Modify | Replace `AsyncFunction` path with upstream-safe `eval()` execution only. |
| `src/plugins.js` | Create | Fork-adapted plugin registry/install/list/load lifecycle rooted in `~/.figma-ds-cli`. |
| `src/credentials.js` | Create | Secure key storage adapted to fork paths and hardened process execution. |
| `src/index.js` | Modify | Register `plugins` command group and load installed plugin commands without disturbing project/skills flows. |
| `plugins/voice/**` | Create | Bundled voice plugin assets from upstream, adapted only where runtime assumptions differ. |
| `package.json` | Modify | Add `plugins` to published files. |
| `tests/safe-mode.test.js` | Modify | Guard QuickJS-safe eval contract. |
| `tests/command-smoke.test.js` | Modify | Add `plugins --help` coverage and, later, loaded command expectations. |
| `tests/package.test.js` | Modify | Assert `plugins/voice/**` ships in npm pack. |
| `tests/security.test.js` | Modify/Create | Cover credential/path helpers without shell-string regressions. |
| `docs/contracts/runtime-manifest.json` | Modify | Declare plugin-management / bundled-plugin capability. |
| `docs/contracts/*.md` | Modify | Document plugin command surface and fork deltas; update consumer expectations. |

## Interfaces / Contracts

```js
// src/plugins.js
installPlugin(name) -> Promise<boolean>
uninstallPlugin(name) -> void
setupPlugin(name) -> Promise<void>
loadPlugins(program, runtimeDeps) -> void

// runtimeDeps
{ daemonExec, checkConnection, getDaemonToken }
```

Registry entries MUST use fork paths and metadata shape compatible with bundled plugins:
`{ name, description, commands, requiredKeys, platformNote, requirements }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | QuickJS fix, credentials/path helpers, plugin registry rules | Add/extend `node:test` assertions before implementation changes (strict TDD). |
| Integration | `plugins --help`, install/setup/load behavior, packaged asset discovery | CLI smoke tests plus filesystem-oriented tests using temp dirs/mocked env. |
| E2E | Voice plugin command availability after load | Keep conceptual only unless existing Playwright/runtime harness is explicitly extended later. |

## Migration / Rollout

No data migration required. Existing fork state remains canonical under `~/.figma-ds-cli`. If upstream code references `~/.figma-cli`, adaptation MUST rewrite it rather than supporting dual roots.

## Open Questions

- [ ] Should `src/credentials.js` Linux fallback live under `~/.figma-ds-cli` instead of upstream `~/.config/figma-cli` for full convention consistency? Design assumes yes.
- [ ] Which contract doc should own plugin command semantics beyond manifest/fork-deltas: new plugin contract doc or updates to existing runtime/write docs?

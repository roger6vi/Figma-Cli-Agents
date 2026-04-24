# Tasks: Sync Upstream Phases

## Phase 1: Safe Mode Execution Hardening

- [x] 1.1 **RED**: Extend `tests/safe-mode.test.js` with failing cases for QuickJS-safe eval (no `AsyncFunction`) and malformed payload bounded-error handling.
- [x] 1.2 **GREEN**: Update `plugin/code.js` to remove `new AsyncFunction(...)` usage and execute eval through the hardened upstream-safe path.
- [x] 1.3 **REFACTOR**: Simplify eval helper flow in `plugin/code.js` while preserving daemon/plugin bridge contracts and error envelope shape.
- [x] 1.4 **RED**: Add regression assertions in `tests/command-smoke.test.js` proving launcher/project-isolation command routing remains unchanged after Safe Mode patch.
- [x] 1.5 **GREEN**: Apply minimal command-path adjustments in `src/index.js` only if required by new Safe Mode behavior; keep non-plugin commands stable.

## Phase 2: Plugin Management + Secure Credentials

- [x] 2.1 **RED**: Add failing credential-policy tests in `tests/security.test.js` for `.figma-ds-cli` storage roots, secure read/write, and fail-closed missing key behavior.
- [x] 2.2 **GREEN**: Create `src/credentials.js` with fork-native secure storage helpers (no shell interpolation) and actionable missing-key errors.
- [x] 2.3 **REFACTOR**: Consolidate credential path/OS fallback logic in `src/credentials.js` to avoid duplicated root resolution.
- [x] 2.4 **RED**: Add failing plugin lifecycle tests in `tests/command-smoke.test.js` (or `tests/plugins.test.js`) for `plugins --help`, unknown operation deterministic error, and zero unintended registry mutations.
- [x] 2.5 **GREEN**: Create `src/plugins.js` implementing `installPlugin`, `uninstallPlugin`, `setupPlugin`, `loadPlugins` with fork-compatible registry metadata.
- [x] 2.6 **GREEN**: Modify `src/index.js` to register a first-class `plugins` command group and call `loadPlugins(program, { daemonExec, checkConnection, getDaemonToken })` before `program.parse()`.
- [x] 2.7 **REFACTOR**: Normalize plugin registry validation and shared error messaging in `src/plugins.js` + `src/index.js`.

## Phase 3: Bundled Voice Plugin, Packaging, and Contracts

- [x] 3.1 **RED**: Extend `tests/package.test.js` to fail if `plugins/voice/**` is missing from packed artifacts or install layout.
- [x] 3.2 **RED**: Extend `tests/command-smoke.test.js` with failing scenarios for bundled voice plugin discoverability and deterministic missing-asset errors.
- [x] 3.3 **GREEN**: Add/adapt `plugins/voice/**` assets and runtime wiring so bundled voice plugin is inventory-visible and loadable without external clone/install.
- [x] 3.4 **GREEN**: Update `package.json` published-files configuration to include the `plugins` directory for distribution.
- [x] 3.5 **GREEN**: Update `docs/contracts/runtime-manifest.json` to declare plugin-management and bundled-voice capabilities.
- [x] 3.6 **GREEN**: Update only relevant `docs/contracts/*.md` sections to document plugin command surface, bundled voice behavior, and fork deltas.
- [x] 3.7 **REFACTOR/VERIFY**: Run targeted `node --test` suites for touched files, then full `node --test tests/*.test.js`; fix regressions and keep docs scope minimal.

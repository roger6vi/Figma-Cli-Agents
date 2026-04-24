## Exploration: sync-upstream-phases

### Current State
The fork branch `sync/upstream-v2` is currently **ahead 30 / behind 4** against `upstream/main`, and the 4 missing commits are exactly the upstream changes under review (`2a187cb`, `20f707c`, `e0ac095`, `8701e16`).

Key observations from code and patch-apply checks:
- `8701e16` (QuickJS safe-mode eval fix) applies cleanly to `plugin/code.js` and is currently missing in the fork.
- `20f707c` (plugin framework + credentials) does **not** apply cleanly due to conflicts in `src/index.js` and `CLAUDE.md`.
- `e0ac095` (bundle voice plugin) depends on `src/plugins.js` introduced by `20f707c`, so it cannot apply first.
- `2a187cb` (docs streamlining) conflicts with fork docs and is low-priority relative to runtime correctness.

The fork already has substantial custom behavior in core surfaces (multi-agent launcher, project isolation, tokenized daemon auth, contracts docs, strict TDD workflow), so upstream features must be merged with adaptation rather than blind cherry-pick.

### Affected Areas
- `plugin/code.js` — Safe Mode plugin eval execution path; directly affected by `8701e16`.
- `src/index.js` — command surface integration point for `plugins` command group and dynamic plugin command loading.
- `src/plugins.js` (new) — upstream plugin registry/install/load lifecycle.
- `src/credentials.js` (new) — secure key storage implementation for plugin API keys.
- `plugins/voice/**` (new) — bundled voice plugin runtime (`index.js`, prompt builder, tool schema, metadata).
- `package.json` (+ lockfile/tests likely) — must include `plugins/` in publishable files if bundling is adopted.
- `tests/safe-mode.test.js` and/or new targeted tests — regression guard for QuickJS-safe eval path.
- `tests/command-smoke.test.js` — add `plugins` command coverage.
- `tests/package.test.js` — verify bundled plugin assets are included in npm pack output.
- `docs/contracts/runtime-manifest.json` + contract docs — update runtime contract if plugin management becomes first-class.
- `CLAUDE.md`, `REFERENCE.md`, `AGENTS.md` — docs alignment only (optional and lower priority than runtime behavior).

### Approaches
1. **Direct cherry-pick sequence** — Apply upstream commits as close to original as possible (`2a187cb` → `20f707c` → `e0ac095` → `8701e16`).
   - Pros: Keeps maximum upstream parity and commit lineage.
   - Cons: Conflicts already confirmed in `CLAUDE.md` and `src/index.js`; high chance of silently regressing fork-specific behavior (project isolation/security conventions).
   - Effort: High.

2. **Targeted backport by capability (recommended)** — Integrate each upstream “superpower” as a fork-native patch set with explicit adaptation.
   - Pros: Safer for fork deltas; easier to preserve custom runtime contracts and strict TDD; enables phased rollback.
   - Cons: Lower raw cherry-pick parity; requires deliberate design decisions (paths, auth model, docs).
   - Effort: Medium.

3. **Minimal safety-only sync now** — Merge only `8701e16`; postpone plugin system and voice bundling.
   - Pros: Immediate Safe Mode reliability gain with minimal risk.
   - Cons: Defers strategic upstream capabilities (plugin platform/voice).
   - Effort: Low.

### Recommendation
Use **Approach 2 (targeted backport)** with this sequence:

1) **Adopt as-is now:** `8701e16` (QuickJS safe-mode eval fix in `plugin/code.js`).
2) **Adapt next:** `20f707c` plugin framework, but align to fork conventions:
   - prefer fork config roots (`.figma-ds-cli`) over upstream `.figma-cli` drift,
   - avoid raw shell interpolation patterns where fork already provides hardened utilities (`src/security.js`),
   - integrate `plugins` command without breaking existing command topology (project/skills/daemon flows).
3) **Adapt after framework stabilizes:** `e0ac095` bundled voice plugin, including packaging + tests + contract updates.
4) **Postpone:** `2a187cb` docs streamlining unless needed for consistency after runtime integration.

Adoption decision summary:
- **Adopt as-is:** `8701e16`
- **Adopt with adaptation:** `20f707c`, `e0ac095`
- **Postpone/optional:** `2a187cb`

### Risks
- **Security regression risk** if `20f707c` is ported verbatim (raw shell command interpolation in credential storage paths) instead of using hardened fork patterns.
- **Path/config divergence risk** (`~/.figma-cli` vs `~/.figma-ds-cli`) causing confusing split state for users and agents.
- **Packaging risk** if bundled `plugins/voice` is added but not included in npm `files` (installed CLI cannot find bundled plugin).
- **Command-surface conflict risk** in `src/index.js` due fork-specific command additions near program tail.
- **Contract drift risk for Maya** if plugin capabilities are shipped without updating `docs/contracts/*` manifest surfaces.

### Ready for Proposal
Yes — ready for `sdd-propose` with a phased integration plan and explicit acceptance criteria per phase (safe-mode fix, plugin framework, voice bundling, contract updates).

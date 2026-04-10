# Changelog

All notable changes to Figma-Cli-Agents are documented here.

## [2.2.0] - 2026-04-10

### Added

- Synced with upstream silships/figma-cli (208 commits integrated)
- Accessibility suite (a11y commands: contrast, vision, touch, text, focus, audit) from upstream
- Blocks system (dashboard-01 pre-built UI layout) from upstream
- Verify command for AI screenshot validation from upstream
- Modular shadcn generator from upstream
- Windows support improvements from upstream
- `src/platform.js` with Figma Beta detection (cross-platform module)
- `node inspect` subcommand for structured node snapshots
- `find --exact` and `find --coords` options for precise node lookup
- `node tree --coords`, `node tree --json`, `node tree --shared` options

### Changed

- Refactored figma-patch.js to focus only on Yolo Mode patching
- `src/platform.js` is now the single source of truth for Figma Beta detection
- Integrated fork's multi-agent launcher (Claude/Codex/Gemini/Crush/OpenCode) on upstream base
- AGENTS.md enriched with upstream command documentation (verify, blocks, a11y)
- README.md updated with shadcn/ui component package section and new features
- REFERENCE.md updated with all 10 fork command groups plus upstream additions

### Fixed

- bash 3.2 compatibility in bin/fig-start (`${1,,}` replaced with `printf|tr`)
- Figma Beta detection now works correctly across all platform functions
- npm package bins for `figma-cli` and `figma-ds-cli` now point directly to `src/index.js`, removing the stale `bin/figma-cli` wrapper dependency.
- `package-lock.json` root metadata now matches `package.json` v2.2.0 and the current bin map.
- Package tests now validate declared bin targets, shebangs, POSIX executable bits, pack inclusion, and lockfile sync.

## [2.1.0] - 2026-04-10

### Added

- Multi-agent launcher (Claude, Codex, Gemini, Crush, OpenCode) in `bin/fig-start`
- `CRUSH.md` and `OPENCODE.md` agent adapter files
- Project isolation system (`project list/info/resolve` commands)
- Skills system (`skills list/show` commands)
- Style management commands (style list/create-paint/create-text/create-effect/apply/delete)
- Undo and version history commands (undo/undo commit/undo save)
- Boolean operations (bool union/subtract/intersect/exclude)
- Section management (section create/list)
- Team library commands (library list/variables/import-var/import-component/import-style)
- Variable advanced operations (var alias/bind-prop/extend/modes/add-mode)
- Annotation management (annotate list/add-category/set/get)
- Page management (page list/switch/create)
- Viewport control (viewport zoom/center)
- `src/node-inspect.js` module for structured node inspection

### Changed

- `CLAUDE.md` kept minimalist (3 lines) pointing to AGENTS.md
- `AGENTS.md` as primary command reference for all agents

## [2.0.0] - 2026-04-10

### Added

- Initial fork from silships/figma-cli with agent-friendly variant
- `AGENTS.md` as the primary command reference (replaces inline CLAUDE.md)
- `GEMINI.md` adapter file for Gemini agent support
- `figma-cli` and `figma-ds-cli` npm commands
- `fig-start --safe` for Safe Mode exclusive operation

### Changed

- Clone URL points to roger6vi/Figma-Cli-Agents
- Package repository metadata updated to fork

## [1.0.0] - Initial Release

- Original figma-ds-cli by Sil Bormüller

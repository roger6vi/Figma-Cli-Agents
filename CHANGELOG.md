# Changelog

All notable changes to this repository are documented here.

## [1.1.0] - 2026-03-08

### Added

- Gemini as a supported `fig-start` launch target alongside Claude Code and Codex.
- `GEMINI.md` so Gemini can import the same workflow context as `AGENTS.md`.
- `src/node-inspect.js`, which builds structured node snapshots and readable tree output for the CLI.
- Richer node-reading commands:
  `get [nodeId]` now supports child depth and shared plugin-data namespaces.
  `find <name>` now supports `--exact` and `--coords`.
  `node tree` now supports `--coords`, `--json`, and shared plugin-data reads.
  `node inspect [nodeId]` was added for raw structured inspection.
- Test coverage for the launcher flow, package contents, node inspection helpers, and the expanded command surface.
- `CHANGELOG.md` to keep signed releases and feature history visible in-repo.

### Changed

- Renamed the GitHub repository to `Figma-Cli-Agents`.
- Updated the README header to show the current signed release, the initial snapshot tag, and a visible link to release history.
- Updated package metadata and plugin handshake versioning to `1.1.0`.
- Started publishing signed Git tags and GitHub releases as the canonical release history for this fork.

### Safe Mode / Plugin Bridge

- The new inspection commands are routed through the same fast eval path used by the daemon, so they work in both Yolo Mode and Safe Mode through the local plugin bridge.

## [1.0.0] - 2026-03-07

### Added

- First imported snapshot of this fork based on the original [`roger6vi/figma-cli`](https://github.com/roger6vi/figma-cli) codebase.
- Codex support across the launcher flow, package description, and documentation.
- `AGENTS.md` as the shared agent runtime contract for the repo instead of a Claude-only workflow document.
- The `figma-cli` wrapper/bin alias alongside `figma-ds-cli`.
- Packaging of the Safe Mode plugin assets with the CLI distribution, plus package tests that verify those assets ship correctly.
- Repo-aware shell setup that installs both `fig-start` and `figma-cli` aliases.
- Portable launcher/daemon paths:
  config stored in `~/.figma-cli/config.json`.
  daemon session token stored in the OS temp directory for consistent launcher/plugin handoff.

### Changed

- `fig-start` became an AI-agent launcher instead of a Claude-only launcher.
- README, setup instructions, and package metadata were rewritten around a live Figma Desktop session controlled by an agent, while keeping the underlying CLI commands compatible with the original project.

### Notes

- `v1.0.0` is the signed tag for the first imported snapshot in this repository history.

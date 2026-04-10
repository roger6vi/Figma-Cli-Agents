# Test Suite Taxonomy

Current test count: **136** (as of v2.2.0 + SDD 6)

Audit reference: [v2.2.0 quality audit](../openspec/) — Testing Gaps section  
SDDs that added coverage: SDD 1 (release blockers), SDD 2 (daemon auth), SDD 3 (safe mode / isolation), SDD 4 (JSX parser), SDD 5 (runtime stability), SDD 6 (expand coverage)

---

## Test Files

| File | What it covers |
|---|---|
| `package.test.js` | npm pack contents, bin targets, shebang validity, executable bits, bin shape, package-lock sync |
| `figma-client.test.js` | URL pattern matching via `FIGMA_DESIGN_PAGE_RE` (imported from `src/figma-client.js`), file type detection, `FigmaClient` property initialization |
| `command-smoke.test.js` | `--help` smoke tests for 11 fork-specific command groups: `style`, `undo`, `bool`, `section`, `library`, `annotate`, `page`, `viewport`, `variables`, `project`, `skills` |
| `node-commands.test.js` | Core node manipulation commands: rect, ellipse, text, line, component, group, autolayout |
| `node-inspect.test.js` | Node inspection and selection commands |
| `url-commands.test.js` | URL command hardening — rejects `javascript:`, `file:`, `ftp:`, and malformed URLs before any network I/O |
| `security.test.js` | Config file permissions (0600/0700), secret redaction |
| `daemon-eval-timeout.test.js` | Daemon eval timeout handling and error propagation |
| `safe-mode.test.js` | Safe Mode plugin handshake, connection guard, fallback behavior (SDD 3) |
| `project-isolation.test.js` | Per-file project directory isolation and resolution (SDD 3) |
| `jsx-parser.test.js` | JSX → Figma node parser regression tests (SDD 4) |
| `runtime-stability.test.js` | CLI runtime stability, optional Playwright availability, dependency guards (SDD 5) |
| `fig-start.test.js` | `fig-start` launcher binary behavior |
| `check-connection-await.test.js` | `checkConnection` helper awaits correctly and throws on disconnected state |

---

## Design Decisions

- **No shell: true** — all child process spawns use `execFileSync` with `shell: false` to prevent injection.
- **Per-run temp dirs** — `package.test.js` creates an isolated temp directory per run via `mkdtempSync` and cleans up in `after()`.
- **Canonical regex export** — `FIGMA_DESIGN_PAGE_RE` is exported from `src/figma-client.js` and imported by `figma-client.test.js` to prevent implementation drift.
- **Smoke over integration** — command smoke tests only verify `--help` output (no Figma connection required), keeping CI fast and hermetic.

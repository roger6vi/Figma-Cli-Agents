# Fork Deltas

## Purpose

Track how this fork differs from upstream without rewriting the entire upstream story.

This file is intentionally split into verified deltas, unknowns, and placeholders. Unknown sections must stay explicit until audited.

## Upstream Baseline

- Public upstream referenced by Maya: `https://github.com/silships/figma-cli`
- This fork remains a `figma-ds-cli` runtime for Figma Desktop automation, but Maya should treat fork behavior as the operational truth for local work

## Verified Deltas In This Fork

The following deltas are documented directly in this repository and can be treated as verified at repo level:

- multi-agent launch flow through `fig-start` for Claude, Codex, Gemini, Crush, and OpenCode
- shared in-repo agent instructions via `AGENTS.md` and adapter docs
- packaged Safe Mode plugin assets and repo-aware launcher workflow
- bundled plugin runtime assets under `plugins/**` with first-class `plugins` lifecycle commands
- richer documented read/inspect surfaces including `get`, coordinate-aware `find`, `node tree --json`, and `node inspect`
- signed release history with local changelog tracking

## Runtime Deltas Still Requiring Audit

The following areas should not be treated as exact fork deltas yet unless code or release history is audited against upstream:

- command-by-command argument differences
- output schema differences for shared commands
- behavior differences under daemon fallback
- performance characteristics
- error text differences that matter to machine consumers

## Placeholder Template For Future Audits

Use this structure when exact fork differences are verified:

### Delta: `<command-or-surface>`

- upstream status:
- fork status:
- downstream impact on Maya:
- verification source:

## Consumer Rule

Until a delta is verified here or in code-level evidence, Maya should:

- depend on this fork's current contract docs for runtime behavior
- avoid claiming parity with upstream
- keep upstream references for orientation, not for local guarantees

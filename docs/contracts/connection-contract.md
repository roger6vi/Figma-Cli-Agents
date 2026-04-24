# Connection Contract

## Purpose

Define the runtime connection assumptions that consumers can depend on when using `figma-ds-cli` as an execution layer.

This document is about the local runtime contract of this fork. It is not a substitute for official Figma platform semantics.

## Supported Connection Modes

### Yolo Mode

- Entry point: `node src/index.js connect`
- Transport intent: direct desktop connection through CDP
- Runtime setup: may patch the local Figma app to enable remote debugging, then starts Figma and the local daemon
- Best fit: fully local automation where patching is acceptable

### Safe Mode

- Entry point: `node src/index.js connect --safe`
- Transport intent: local plugin bridge through the daemon
- Runtime setup: starts the daemon in plugin mode and waits for the FigCli plugin to connect
- Best fit: environments where patching Figma is not acceptable or not possible

## Consumer Assumptions

Consumers such as Maya may assume the following only after a successful connection step or health check:

- the runtime is targeting a local Figma Desktop session
- one of the documented connection modes is active
- commands guarded by `checkConnection()` require either daemon health with `plugin` or `cdp`, or a direct CDP connection fallback
- the runtime may prefer the daemon path first and fall back to direct execution for some operations

## Runtime Guarantees

When the runtime reports success, this fork guarantees only these runtime-level facts:

- Yolo Mode and Safe Mode are first-class connection modes in this fork
- connection readiness is evaluated against real runtime signals, not a purely in-memory flag
- daemon health is treated as usable only when health returns `status: ok` and either `plugin` or `cdp`
- commands that call `checkConnection()` fail fast instead of silently continuing when no usable connection is present

## Failure Signals

Consumers should treat these as authoritative connection failure signals:

- `Not connected to Figma`
- Safe Mode plugin timeout: plugin did not connect within the expected wait window
- daemon token missing or unreadable
- daemon authorization/token errors
- execution timeout errors that recommend reconnecting
- setup failures caused by local OS permissions or patching restrictions

These signals come from the current runtime implementation and are more trustworthy than inferred state in downstream tools.

## Non-Guarantees

This runtime contract does not guarantee:

- automatic recovery after a failed connection
- a web-based Figma runtime
- support for multiple simultaneous Figma instances
- that Yolo Mode patching will succeed on every machine or OS policy
- that Safe Mode is usable unless the plugin has been imported and actively run in the current Figma session

## Consumer Guidance

Downstream tools should:

- detect mode, do not guess it
- treat missing health, missing token, or timeout as a hard runtime problem
- degrade to read-only planning or explicit user escalation when connection guarantees are absent
- avoid claiming Figma write readiness until the runtime itself confirms readiness

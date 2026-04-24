# Read Contract

## Purpose

Define the kinds of reads this runtime exposes and how downstream consumers should reason about their outputs.

## Read Classes

### 1. Connection and Runtime State Reads

These answer whether the runtime is usable.

Examples:

- daemon health
- connection checks before commands execute
- active file discovery used by launcher flows

Expected output shape:

- implementation-specific runtime state
- success/failure is more important than a stable human-readable string

Stability note:

- suitable for gating execution
- not a public cross-runtime schema yet

### 2. Discovery Reads

These locate canvas objects or available runtime resources.

Examples documented in this fork:

- `find`
- `canvas info`
- `page list`
- `style list`
- `library list`
- `annotate get`

Expected output shape:

- often line-oriented CLI output for people and agents
- may include IDs, names, types, coordinates, or collection identifiers depending on the command

Stability note:

- useful operationally, but text formatting should be treated as less stable than explicit JSON surfaces

### 3. Structured Node Reads

These are the preferred read surfaces for machine consumers.

Examples documented in this fork:

- `get`
- `node tree --json`
- `node inspect`

Expected output shape:

- structured node snapshots or inspection payloads
- IDs and node relationships are part of the useful contract surface

Stability note:

- safest option when Maya needs machine-consumable state instead of display-oriented text
- still fork-owned, so downstream code should validate presence of required fields rather than assuming unlimited schema stability

## Read Guarantees

This fork currently supports all of the following at a documented level:

- node lookup by name
- structured node snapshot reads
- node tree inspection, including JSON form
- canvas/page discovery reads
- metadata-oriented reads such as styles, libraries, annotations, and variables through command groups documented in this repo

## Read Non-Guarantees

This contract does not guarantee:

- that every read command returns JSON
- a versioned schema for every read surface
- identical output formatting between upstream and this fork
- that human-readable output is safe to parse as a strict machine contract

## Maya Consumption Rule

Maya should prefer read surfaces in this order:

1. structured reads from this runtime
2. documented list/discovery reads from this runtime
3. official Figma docs and typings for platform semantics

Maya should not infer platform truth from CLI output formatting alone.

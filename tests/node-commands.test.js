import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliSource = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');

describe('node inspection commands', () => {
  it('exposes structured node inspection commands', () => {
    assert.match(cliSource, /\.command\('inspect \[nodeId\]'\)/);
    assert.match(cliSource, /Inspect node with structured snapshot/);
    assert.match(cliSource, /Include shared plugin data for namespace/);
  });

  it('extends find with exact and coordinate options', () => {
    assert.match(cliSource, /\.option\('-x, --exact', 'Match exact name instead of partial match'\)/);
    assert.match(cliSource, /\.option\('-c, --coords', 'Include absolute coordinates and size'\)/);
  });
});

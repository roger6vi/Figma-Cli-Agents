import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const figStart = readFileSync(resolve(repoRoot, 'bin/fig-start'), 'utf8');

describe('fig-start agent picker', () => {
  it('includes Gemini in the launcher menu', () => {
    assert.match(figStart, /3\) Gemini \(gemini\)/);
    assert.match(figStart, /Enter choice \[1\/2\/3, default: 1\]/);
  });

  it('launches Gemini with the repo context prompt', () => {
    assert.match(figStart, /exec gemini --approval-mode yolo -i "\$AGENT_CONTEXT"/);
  });
});

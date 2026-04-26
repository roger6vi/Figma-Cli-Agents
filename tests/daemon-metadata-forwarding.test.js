import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcIndex = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');

describe('daemon metadata forwarding', () => {
  it('daemonExec payload keeps non-breaking spread for metadata forwarding', () => {
    assert.match(srcIndex, /\{ action, \.\.\.data, timeout: timeoutMs \}/,
      'daemonExec must keep spread payload so intent/queue/target metadata are forwarded');
  });

  it('fastEval and fastRender support metadata pass-through without changing default usage', () => {
    assert.match(srcIndex, /async function fastEval\(code, metadata = \{\}\)/,
      'fastEval must support optional metadata argument');
    assert.match(srcIndex, /async function fastRender\(jsx, metadata = \{\}\)/,
      'fastRender must support optional metadata argument');
  });
});

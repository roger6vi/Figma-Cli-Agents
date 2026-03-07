import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let packedFiles = null;

function getPackedFiles() {
  if (packedFiles) return packedFiles;

  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const [{ files }] = JSON.parse(output);
  packedFiles = files.map(file => file.path);
  return packedFiles;
}

describe('npm package contents', () => {
  it('includes the Safe Mode plugin assets', () => {
    const files = getPackedFiles();

    assert.ok(files.includes('plugin/manifest.json'));
    assert.ok(files.includes('plugin/code.js'));
    assert.ok(files.includes('plugin/ui.html'));
  });

  it('does not publish daemon hot-reload temp modules', () => {
    const files = getPackedFiles();

    assert.equal(files.some(file => /^src\/\.figma-client-.*\.mjs$/.test(file)), false);
  });
});

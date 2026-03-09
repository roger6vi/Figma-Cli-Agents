import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmTempRoot = resolve(tmpdir(), 'figma-cli-test-npm');
const npmCacheDir = resolve(npmTempRoot, 'cache');
const npmLogsDir = resolve(npmTempRoot, 'logs');
let packedFiles = null;

function getPackedFiles() {
  if (packedFiles) return packedFiles;

  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: repoRoot,
      npm_config_cache: npmCacheDir,
      npm_config_logs_dir: npmLogsDir
    }
  });

  const [{ files }] = JSON.parse(output);
  packedFiles = files.map(file => file.path);
  return packedFiles;
}

describe('npm package contents', () => {
  it('includes agent context files for Codex and Gemini', () => {
    const files = getPackedFiles();

    assert.ok(files.includes('AGENTS.md'));
    assert.ok(files.includes('CHANGELOG.md'));
    assert.ok(files.includes('GEMINI.md'));
  });

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

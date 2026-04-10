import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(repoRoot, 'src/index.js');
const source = readFileSync(indexPath, 'utf8');

function urlCommandSection() {
  const start = source.indexOf("create\n  .command('image <url>')");
  const end = source.indexOf('// ============ REMOVE BACKGROUND ============');
  assert.ok(start > -1, 'create image command section not found');
  assert.ok(end > start, 'remove background marker not found');
  return source.slice(start, end);
}

function runCli(args) {
  return spawnSync(process.execPath, [indexPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  });
}

describe('URL command hardening', () => {
  it('does not use shell-string execSync or raw page.goto URL interpolation in URL commands', () => {
    const block = urlCommandSection();

    assert.doesNotMatch(block, /execSync\s*\(\s*`/);
    assert.doesNotMatch(block, /page\.goto\(\s*['"]\$\{?url/);
    assert.doesNotMatch(block, /page\.goto\(\s*`/);
    assert.doesNotMatch(block, /createImageAsync\("\$\{?url/);
    assert.match(block, /safeHttpUrl\(url\)/);
    assert.match(block, /safeExecFileSync\('node', \[scriptTemp\.path\]/);
  });

  it('rejects javascript: before checking Figma connection for create image', () => {
    const result = runCli(['create', 'image', 'javascript:alert(1)']);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.match(output, /Only http and https URLs are supported/);
    assert.doesNotMatch(output, /Not connected to Figma/);
  });

  it('rejects file: before checking Figma connection for screenshot-url', () => {
    const result = runCli(['screenshot-url', 'file:///etc/passwd']);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.match(output, /Only http and https URLs are supported/);
    assert.doesNotMatch(output, /Not connected to Figma/);
  });

  it('rejects ftp: for analyze-url', () => {
    const result = runCli(['analyze-url', 'ftp://example.com']);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.match(output, /Only http and https URLs are supported/);
  });

  it('rejects malformed URLs for recreate-url before checking Figma connection', () => {
    const result = runCli(['recreate-url', 'not-a-url']);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.match(output, /Invalid URL/);
    assert.doesNotMatch(output, /Not connected to Figma/);
  });
});

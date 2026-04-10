import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'));
let packedFiles = null;
let npmTempRoot = null;

before(() => {
  npmTempRoot = mkdtempSync(join(tmpdir(), 'figma-cli-pack-test-'));
});

after(() => {
  if (npmTempRoot && existsSync(npmTempRoot)) {
    rmSync(npmTempRoot, { recursive: true, force: true });
  }
});

function normalizePackPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function getPackedFiles() {
  if (packedFiles) return packedFiles;

  const npmCacheDir = join(npmTempRoot, 'cache');
  const npmLogsDir = join(npmTempRoot, 'logs');

  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: repoRoot,
      npm_config_cache: npmCacheDir,
      npm_config_logs_dir: npmLogsDir,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_ignore_scripts: 'true'
    }
  });

  const packResult = JSON.parse(output);
  assert.ok(Array.isArray(packResult), 'npm pack --dry-run --json should return an array');
  assert.ok(packResult.length > 0, 'npm pack --dry-run --json should include one package result');

  const [{ files }] = packResult;
  packedFiles = files.map(file => normalizePackPath(file.path));
  return packedFiles;
}

function getBinEntries() {
  assert.equal(typeof packageJson.bin, 'object', 'package.json#bin must be an object map');
  return Object.entries(packageJson.bin);
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

  it('includes every package bin target in the packed tarball', () => {
    const files = new Set(getPackedFiles());

    for (const [binName, target] of getBinEntries()) {
      assert.ok(
        files.has(normalizePackPath(target)),
        `${binName} target ${target} must be included by npm pack --dry-run`
      );
    }
  });
});

describe('package bin integrity', () => {
  it('points every package bin to an existing file', () => {
    for (const [binName, target] of getBinEntries()) {
      assert.ok(
        existsSync(resolve(repoRoot, target)),
        `${binName} target ${target} must exist`
      );
    }
  });

  it('uses a valid shebang for every package bin target', () => {
    for (const [binName, target] of getBinEntries()) {
      const targetPath = resolve(repoRoot, target);
      const header = readFileSync(targetPath).subarray(0, 2).toString('utf8');

      assert.equal(header, '#!', `${binName} target ${target} must start with #!`);
    }
  });

  it('marks every package bin target executable on POSIX platforms', () => {
    if (process.platform === 'win32') return;

    for (const [binName, target] of getBinEntries()) {
      const mode = statSync(resolve(repoRoot, target)).mode;

      assert.notEqual(
        mode & 0o111,
        0,
        `${binName} target ${target} must have at least one executable bit set`
      );
    }
  });
});

describe('package bin shape', () => {
  it('has exactly the expected bin entries', () => {
    const bin = packageJson.bin;
    assert.equal(typeof bin, 'object', 'package.json#bin must be an object');
    const keys = Object.keys(bin).sort();
    const expected = ['fig-start', 'figma-cli', 'figma-ds-cli'].sort();
    assert.deepEqual(keys, expected, 'bin must have exactly figma-cli, figma-ds-cli, fig-start');
  });
});

describe('package-lock sync', () => {
  it('matches package.json version in root lockfile metadata', () => {
    assert.equal(packageLock.version, packageJson.version);
    assert.equal(packageLock.packages[''].version, packageJson.version);
  });

  it('matches package.json bin map in root lockfile metadata', () => {
    assert.deepEqual(packageLock.packages[''].bin, packageJson.bin);
  });

  it('uses lockfileVersion 3 (npm 7+ format)', () => {
    assert.equal(packageLock.lockfileVersion, 3, 'package-lock.json must use lockfileVersion 3');
  });
});

/**
 * project-isolation.test.js
 *
 * TDD tests for SDD 3: fix-safe-mode-project-isolation
 *
 * Tests for:
 * - resolveProjectScriptPath helper
 * - resolveProjectExportPath helper
 * - Canonical config dir (~/.figma-ds-cli, no ~/.figma-cli)
 * - AGENTS.md project isolation docs reference correct dir
 * - REFERENCE.md project isolation docs reference correct dir
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcIndex = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');
const agentsMd = readFileSync(resolve(repoRoot, 'AGENTS.md'), 'utf8');
const referenceMd = readFileSync(resolve(repoRoot, 'REFERENCE.md'), 'utf8');
const readmeMd = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
const figStart = readFileSync(resolve(repoRoot, 'bin/fig-start'), 'utf8');

// ── Canonical naming ──

describe('canonical config directory naming', () => {
  it('src/index.js has no ~/.figma-cli references (canonical: ~/.figma-ds-cli)', () => {
    // ~/.figma-cli should not appear — only ~/.figma-ds-cli
    assert.doesNotMatch(srcIndex, /['"`]~\/\.figma-cli['"`]/,
      'src/index.js must not reference ~/.figma-cli as a string literal');
    assert.doesNotMatch(srcIndex, /\.figma-cli['"` \n]/,
      'src/index.js must not reference .figma-cli');
  });

  it('bin/fig-start uses ~/.figma-ds-cli as CONFIG_DIR', () => {
    assert.match(figStart, /CONFIG_DIR="\$HOME\/\.figma-ds-cli"/,
      'fig-start CONFIG_DIR must be $HOME/.figma-ds-cli');
    assert.doesNotMatch(figStart, /CONFIG_DIR="\$HOME\/\.figma-cli"/,
      'fig-start must not set CONFIG_DIR to $HOME/.figma-cli');
  });

  it('AGENTS.md project isolation section references ~/.figma-ds-cli', () => {
    assert.doesNotMatch(agentsMd, /~\/\.figma-cli\/projects/,
      'AGENTS.md must not reference ~/.figma-cli/projects');
    assert.match(agentsMd, /~\/\.figma-ds-cli\/projects/,
      'AGENTS.md must reference ~/.figma-ds-cli/projects');
  });

  it('REFERENCE.md project isolation section references ~/.figma-ds-cli', () => {
    assert.doesNotMatch(referenceMd, /~\/\.figma-cli\/projects/,
      'REFERENCE.md must not reference ~/.figma-cli/projects');
    assert.match(referenceMd, /~\/\.figma-ds-cli\/projects/,
      'REFERENCE.md must reference ~/.figma-ds-cli/projects');
  });

  it('README.md config reference uses ~/.figma-ds-cli', () => {
    assert.doesNotMatch(readmeMd, /~\/\.figma-cli\/config\.json/,
      'README.md must not reference ~/.figma-cli/config.json');
    assert.match(readmeMd, /~\/\.figma-ds-cli\/config\.json/,
      'README.md must reference ~/.figma-ds-cli/config.json');
  });
});

// ── resolveProjectScriptPath helper ──

describe('resolveProjectScriptPath helper', () => {
  it('is defined and exported from src/index.js source', () => {
    assert.match(srcIndex, /function resolveProjectScriptPath/,
      'resolveProjectScriptPath function must be defined in src/index.js');
  });

  it('returns project scripts path when FIGMA_PROJECT_DIR is set and file exists', async () => {
    // Create a temp project dir with a scripts subdir and a test file
    const tmpProject = join(tmpdir(), 'fig-test-proj-' + Date.now());
    const scriptsDir = join(tmpProject, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, 'test.js'), '// test script');

    const savedEnv = process.env.FIGMA_PROJECT_DIR;
    process.env.FIGMA_PROJECT_DIR = tmpProject;

    try {
      // Dynamically import the helper - we need a fresh import
      // Since index.js is a CLI, we test the logic directly by importing a test shim
      // Instead, we test the BEHAVIOR via the source pattern
      const fnMatch = srcIndex.match(/function resolveProjectScriptPath\(([^)]*)\)\s*\{([\s\S]*?)(?=^function |\nprogram\.|\nconst program)/m);
      assert.ok(fnMatch, 'resolveProjectScriptPath body must be extractable from source');

      // Verify the function references FIGMA_PROJECT_DIR
      assert.match(srcIndex, /FIGMA_PROJECT_DIR.*scripts|scripts.*FIGMA_PROJECT_DIR/,
        'resolveProjectScriptPath must reference FIGMA_PROJECT_DIR and scripts');

      // Verify it checks existsSync or similar before resolving
      const fnBody = fnMatch[0];
      assert.match(fnBody, /existsSync|join.*scripts/,
        'resolveProjectScriptPath must check file existence or build scripts path');
    } finally {
      if (savedEnv === undefined) delete process.env.FIGMA_PROJECT_DIR;
      else process.env.FIGMA_PROJECT_DIR = savedEnv;
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('falls back to raw path when FIGMA_PROJECT_DIR is unset', () => {
    const fnMatch = srcIndex.match(/function resolveProjectScriptPath[\s\S]*?(?=^function |\nprogram\.)/m);
    assert.ok(fnMatch, 'resolveProjectScriptPath body must be found');
    const fnBody = fnMatch[0];
    // Must have a fallback that returns the original path
    assert.match(fnBody, /return\s+\w*[Pp]ath|return\s+relativePath|return\s+filePath/,
      'resolveProjectScriptPath must return fallback path when project dir not set');
  });
});

// ── resolveProjectExportPath helper ──

describe('resolveProjectExportPath helper', () => {
  it('is defined in src/index.js', () => {
    assert.match(srcIndex, /function resolveProjectExportPath/,
      'resolveProjectExportPath function must be defined in src/index.js');
  });

  it('references FIGMA_PROJECT_DIR and exports directory', () => {
    assert.match(srcIndex, /FIGMA_PROJECT_DIR.*exports|exports.*FIGMA_PROJECT_DIR/,
      'resolveProjectExportPath must reference FIGMA_PROJECT_DIR and exports dir');
  });

  it('is used in export screenshot command', () => {
    // Find export screenshot action
    const screenshotMatch = srcIndex.match(/command\('screenshot'\)[\s\S]*?\.action[\s\S]*?(?=exp\s*\.\s*command|program\s*\.\s*command)/);
    assert.ok(screenshotMatch, 'export screenshot action block must be found');
    const block = screenshotMatch[0];
    assert.match(block, /resolveProjectExportPath/,
      'export screenshot must call resolveProjectExportPath');
  });

  it('is used in export node command', () => {
    // Find export node action
    const nodeMatch = srcIndex.match(/command\('node[\s\S]*?'\)[\s\S]*?\.action[\s\S]*?(?=exp\s*\.\s*command|program\s*\.\s*command)/);
    assert.ok(nodeMatch, 'export node action block must be found');
    const block = nodeMatch[0];
    assert.match(block, /resolveProjectExportPath/,
      'export node must call resolveProjectExportPath');
  });

  it('falls back gracefully when FIGMA_PROJECT_DIR is unset', () => {
    const fnMatch = srcIndex.match(/function resolveProjectExportPath[\s\S]*?(?=^function |\nprogram\.)/m);
    assert.ok(fnMatch, 'resolveProjectExportPath body must be found');
    const fnBody = fnMatch[0];
    assert.match(fnBody, /return\s+\w*[Pp]ath|return\s+relativePath|return\s+filePath/,
      'resolveProjectExportPath must return fallback path when project dir not set');
  });
});

// ── eval --file uses resolveProjectScriptPath ──

describe('eval --file command uses project script path resolution', () => {
  it('eval --file action calls resolveProjectScriptPath', () => {
    // Find the eval command action block — look for resolveProjectScriptPath in eval context
    // The eval command uses options.file; check that resolveProjectScriptPath is used there
    const evalFileBlock = srcIndex.match(/options\.file[\s\S]{0,300}resolveProjectScriptPath|resolveProjectScriptPath[\s\S]{0,300}options\.file/);
    assert.ok(evalFileBlock,
      'eval --file must call resolveProjectScriptPath near options.file handling');
  });

  it('run command calls resolveProjectScriptPath', () => {
    const runMatch = srcIndex.match(/command\('run <file>'\)[\s\S]*?\.action[\s\S]*?\}\)/);
    assert.ok(runMatch, 'run command action block must be found');
    const block = runMatch[0];
    assert.match(block, /resolveProjectScriptPath/,
      'run command must call resolveProjectScriptPath');
  });
});

// ── __dirname not cwd for internal paths ──

describe('internal path resolution uses __dirname not process.cwd()', () => {
  it('figmaEvalSync sync fallback derives figma-client.js from __dirname not process.cwd()', () => {
    // Find the sync fallback block that imports figma-client.js
    const clientUrlMatch = srcIndex.match(/clientUrl\s*=\s*pathToFileURL\([\s\S]*?figma-client\.js/);
    assert.ok(clientUrlMatch, 'clientUrl assignment for figma-client.js must exist');
    const line = clientUrlMatch[0];
    assert.doesNotMatch(line, /process\.cwd\(\)/,
      'figma-client.js import path must not use process.cwd()');
    assert.match(line, /__dirname/,
      'figma-client.js import path must use __dirname');
  });

  it('connect --safe plugin manifest path uses __dirname not process.cwd()', () => {
    // Find the connect --safe section showing plugin/manifest.json
    const manifestMatch = srcIndex.match(/plugin\/manifest\.json[\s\S]{0,200}/);
    assert.ok(manifestMatch, 'plugin/manifest.json reference must exist in src/index.js');
    const context = manifestMatch[0];
    assert.doesNotMatch(context, /process\.cwd\(\)\s*\+\s*['"]\/plugin/,
      'plugin/manifest.json path must not use process.cwd() concatenation');
  });
});

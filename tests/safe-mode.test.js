/**
 * safe-mode.test.js
 *
 * TDD tests for SDD 3: Safe Mode hardening
 *
 * Tests for:
 * - connect --safe exits non-zero when plugin never connects
 * - fig-start Safe Mode stops on connect --safe failure
 * - Safe Mode project resolution (FIGMA_PROJECT_DIR) is also set in Safe Mode branch
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcIndex = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');
const figStart = readFileSync(resolve(repoRoot, 'bin/fig-start'), 'utf8');
const pluginCode = readFileSync(resolve(repoRoot, 'plugin/code.js'), 'utf8');

// ── connect --safe exit code ──

describe('connect --safe exits non-zero when plugin never connects', () => {
  it('process.exit(1) or equivalent is called when pluginConnected is false', () => {
    // Find the connect --safe section where pluginConnected check occurs
    const safeConnectMatch = srcIndex.match(/if\s*\(!pluginConnected\)[\s\S]*?(?=return;?\s*\})/);
    assert.ok(safeConnectMatch, '!pluginConnected branch must exist in src/index.js');
    const block = safeConnectMatch[0];
    assert.match(block, /process\.exit\s*\(\s*1\s*\)|process\.exitCode\s*=\s*1/,
      'connect --safe must call process.exit(1) when plugin never connects');
  });

  it('pluginConnected check does not just warn and return — must fail loudly', () => {
    // The current code: pluginSpinner.warn(...) then return — this is wrong
    // After fix: should exit non-zero
    const warnAndReturnPattern = /pluginSpinner\.warn\([^)]+\);\s*\n\s*\}/;
    assert.doesNotMatch(srcIndex, warnAndReturnPattern,
      'connect --safe must not silently warn and return when plugin not connected — must exit non-zero');
  });
});

// ── fig-start Safe Mode: project resolution ──

describe('fig-start Safe Mode branch resolves FIGMA_PROJECT_DIR', () => {
  it('Safe Mode branch exports FIGMA_PROJECT_DIR after connect --safe succeeds', () => {
    // Find the Safe Mode branch (between SAFE_MODE and the else clause)
    const safeModeStart = figStart.indexOf('if [ "$SAFE_MODE" = true ]');
    const safeModeEnd = figStart.indexOf('# ── Yolo Mode', safeModeStart);
    assert.ok(safeModeStart > -1, 'Safe Mode branch start not found');
    assert.ok(safeModeEnd > safeModeStart, 'Safe Mode branch end not found');

    const safeModeBlock = figStart.slice(safeModeStart, safeModeEnd);
    assert.match(safeModeBlock, /FIGMA_PROJECT_DIR/,
      'Safe Mode branch must export FIGMA_PROJECT_DIR');
  });

  it('Safe Mode branch calls project resolve before launch_agent', () => {
    const safeModeStart = figStart.indexOf('if [ "$SAFE_MODE" = true ]');
    const safeModeEnd = figStart.indexOf('# ── Yolo Mode', safeModeStart);
    const safeModeBlock = figStart.slice(safeModeStart, safeModeEnd);

    assert.match(safeModeBlock, /project resolve/,
      'Safe Mode branch must call "project resolve" before launching agent');
  });

  it('Safe Mode branch calls launch_agent AFTER project resolution', () => {
    const safeModeStart = figStart.indexOf('if [ "$SAFE_MODE" = true ]');
    const safeModeEnd = figStart.indexOf('# ── Yolo Mode', safeModeStart);
    const safeModeBlock = figStart.slice(safeModeStart, safeModeEnd);

    const resolveIdx = safeModeBlock.indexOf('project resolve');
    const launchIdx = safeModeBlock.indexOf('launch_agent');
    assert.ok(resolveIdx > -1, 'project resolve must appear in Safe Mode block');
    assert.ok(launchIdx > resolveIdx,
      'launch_agent must appear AFTER project resolve in Safe Mode block');
  });

  it('Safe Mode active file title is retrieved from daemon or set via env', () => {
    const safeModeStart = figStart.indexOf('if [ "$SAFE_MODE" = true ]');
    const safeModeEnd = figStart.indexOf('# ── Yolo Mode', safeModeStart);
    const safeModeBlock = figStart.slice(safeModeStart, safeModeEnd);

    // Should query daemon for active file or use a known title
    const hasQuery = safeModeBlock.match(/SAFE_MODE_TITLE|active.*file|project resolve|figma.*active/i);
    assert.ok(hasQuery, 'Safe Mode must retrieve or reference active file title for project resolution');
  });
});

// ── fig-start Safe Mode: stop on connect failure ──

describe('fig-start Safe Mode stops when connect --safe fails', () => {
  it('fig-start checks exit code after connect --safe', () => {
    const safeModeStart = figStart.indexOf('if [ "$SAFE_MODE" = true ]');
    const safeModeEnd = figStart.indexOf('# ── Yolo Mode', safeModeStart);
    const safeModeBlock = figStart.slice(safeModeStart, safeModeEnd);

    // Must check exit code of connect --safe (either via $? or PIPESTATUS)
    const hasExitCheck = safeModeBlock.match(/CONNECT_SAFE_EXIT.*-ne\s*0|PIPESTATUS|if\s*\[\s*\$\?/);
    assert.ok(hasExitCheck,
      'fig-start must check exit code after connect --safe (via $? or PIPESTATUS[0])');
    assert.match(safeModeBlock, /exit\s+1/,
      'fig-start must exit 1 when connect --safe fails');
  });
});

// ── connect --safe: active file title returned ──

describe('connect --safe returns active Figma file info for project resolution', () => {
  it('connect --safe outputs active file title/key to stdout on success', () => {
    // The connect --safe command should emit the active file title for fig-start to capture
    // Look for FIGMA_ACTIVE_FILE anywhere in the safe connect handling block
    assert.match(srcIndex, /FIGMA_ACTIVE_FILE/,
      'src/index.js must contain FIGMA_ACTIVE_FILE marker for fig-start to parse');
    // Verify it's printed via console.log after plugin connected
    assert.match(srcIndex, /console\.log\(`FIGMA_ACTIVE_FILE=\$\{/,
      'connect --safe must console.log FIGMA_ACTIVE_FILE= when plugin connects');
  });
});

describe('Safe Mode plugin eval hardening', () => {
  it('does not depend on AsyncFunction in plugin execution path', () => {
    assert.doesNotMatch(
      pluginCode,
      /AsyncFunction|new\s+Function\s*\(/,
      'plugin/code.js must not use AsyncFunction or Function constructors in Safe Mode eval'
    );
  });

  it('rejects malformed eval payloads with bounded error envelopes', () => {
    assert.match(
      pluginCode,
      /invalid eval payload/i,
      'plugin/code.js must reject malformed eval payloads with a deterministic error'
    );
    assert.match(
      pluginCode,
      /\.slice\(0,\s*\d+\)/,
      'plugin/code.js must bound error messages before posting back to daemon'
    );
  });
});

describe('Safe Mode queue metadata contract forwarding', () => {
  it('daemonExec payload keeps metadata spread for intent/queue/target.page compatibility', () => {
    assert.match(
      srcIndex,
      /JSON\.stringify\(\{ action, \.\.\.data, timeout: timeoutMs \}\)/,
      'daemonExec payload must keep spread metadata forwarding for Safe Mode queue-contract preservation'
    );
  });
});

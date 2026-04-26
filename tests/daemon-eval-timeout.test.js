/**
 * daemon-eval-timeout.test.js
 * Tests for SDD 5: daemon eval timeout from request body
 *
 * Verifies:
 *  - Default timeout is 30000ms when not specified in request body
 *  - Caller-specified timeout is honored (up to clamp)
 *  - Max clamp is 300000ms (5 min)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..');
const daemonSrc = readFileSync(resolve(repoRoot, 'src/daemon.js'), 'utf8');

describe('daemon eval timeout from request body', () => {
  it('reads timeout from request body (not hardcoded)', () => {
    // After queue-router refactor, payload parsing + timeout clamp can be split.
    // We still require timeout to come from parsed request payload (not hardcoded constants only).
    assert.match(daemonSrc, /const\s+payload\s*=\s*JSON\.parse\(body\)/,
      'daemon must parse request body into payload');
    assert.match(daemonSrc, /clampEvalTimeout\(request\.timeout\)|clampEvalTimeout\(payload\.timeout\)/,
      'daemon must clamp timeout from request payload');
  });

  it('default timeout is 30000ms when not specified', () => {
    // The default eval timeout constant must be 30000
    assert.match(daemonSrc, /30000/, 'default timeout of 30000ms must be present');
    // Either as EVAL_TIMEOUT_DEFAULT = 30000 or timeout = 30000 or timeoutMs = 30000
    const defaultMatch = daemonSrc.match(/(?:EVAL_TIMEOUT_DEFAULT|timeout(?:Ms)?)\s*[=:]\s*30000/);
    assert.ok(defaultMatch, 'timeout must default to 30000 in constant or fallback logic');
  });

  it('max clamp is 300000ms (5 minutes)', () => {
    assert.match(daemonSrc, /300000/, 'max clamp of 300000ms must be present');
  });

  it('eval case uses the request-body timeout', () => {
    // Refactored through executeDaemonAction -> still must apply variable timeout to eval path
    assert.match(daemonSrc, /case 'eval':[\s\S]*execWithTimeout\(\(\) => executeEval\(evalCode\),\s*evalTimeout\)/,
      'eval path must use variable evalTimeout, not hardcoded literal');
  });
});

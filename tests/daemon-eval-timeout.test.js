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
    // After the fix, the eval case must read timeout from the parsed body
    // The body parsing line should include "timeout" as a destructured key
    const bodyParseMatch = daemonSrc.match(/const\s*\{[^}]+\}\s*=\s*JSON\.parse\(body\)/);
    assert.ok(bodyParseMatch, 'body must be JSON.parse(body)');
    assert.match(bodyParseMatch[0], /timeout/, 'timeout must be destructured from request body');
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
    // The eval case line must pass the request-body timeout to execWithTimeout
    // Pattern: execWithTimeout(() => executeEval(code), <variable not hardcoded>)
    const evalCaseMatch = daemonSrc.match(/case 'eval':\s*\n\s*result = await execWithTimeout\([^,]+,\s*(\w+)\)/);
    assert.ok(evalCaseMatch, "eval case must call execWithTimeout with a variable timeout (not hardcoded)");
    // The variable must NOT be a literal number
    const timeoutArg = evalCaseMatch[1];
    assert.doesNotMatch(timeoutArg, /^\d+$/, 'eval timeout arg must be a variable, not a literal number');
  });
});

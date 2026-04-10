/**
 * check-connection-await.test.js
 * Static check: ensures no bare checkConnection() calls without await in src/index.js
 *
 * Strategy: grep for lines that call checkConnection() without a preceding await keyword.
 * We look for lines matching /^\s*checkConnection\(\)/ (starts with optional whitespace,
 * then checkConnection() — i.e., no await, no assignment, not a function definition).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..');

describe('checkConnection() must always be awaited', () => {
  it('no bare checkConnection() calls without await in src/index.js', () => {
    const src = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');
    const lines = src.split('\n');

    const violations = [];
    lines.forEach((line, i) => {
      // Match lines where checkConnection() appears as a statement (not definition, not awaited)
      // Positive: "    checkConnection();" or "checkConnection();"
      // Negative: "await checkConnection()", "async function checkConnection()", "// checkConnection()"
      const trimmed = line.trimStart();
      if (
        trimmed.startsWith('checkConnection()') &&
        !line.includes('await checkConnection()') &&
        !line.includes('async function checkConnection') &&
        !line.includes('function checkConnection') &&
        !trimmed.startsWith('//')
      ) {
        violations.push(`Line ${i + 1}: ${line.trimEnd()}`);
      }
    });

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} un-awaited checkConnection() call(s):\n${violations.join('\n')}`
    );
  });
});

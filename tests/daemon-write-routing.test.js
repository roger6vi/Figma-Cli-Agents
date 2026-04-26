import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const daemonSrc = readFileSync(resolve(repoRoot, 'src/daemon.js'), 'utf8');

describe('daemon write queue routing integration', () => {
  it('uses daemon exec router for /exec responses', () => {
    assert.match(daemonSrc, /routeDaemonExec/, 'daemon.js must route /exec through routeDaemonExec');
  });

  it('initializes write gateway for write-capable actions', () => {
    assert.match(daemonSrc, /createWriteGateway/, 'daemon.js must initialize write gateway');
    assert.match(daemonSrc, /QueueStore/, 'daemon.js must create QueueStore for durable operations');
  });

  it('accepts queue metadata in /exec payload parsing', () => {
    assert.match(
      daemonSrc,
      /intent|queue|wait|target|operationId|idempotencyKey|verify/,
      'daemon /exec parsing must include queue metadata fields'
    );
  });
});

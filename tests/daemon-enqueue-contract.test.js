import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeDaemonExec } from '../src/daemon-exec-router.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcIndex = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');

describe('daemon enqueue response contract', () => {
  it('returns HTTP 202-style acceptance envelope for queue=enqueue writes', async () => {
    const response = await routeDaemonExec({
      request: { action: 'render', jsx: '<Frame />', queue: 'enqueue' },
      getMode: () => 'safe',
      executeDirectAction: async () => {
        throw new Error('direct path should not run for enqueued write');
      },
      writeGateway: {
        routeExecution: async () => ({
          kind: 'enqueue',
          accepted: true,
          operationId: 'op-123',
          status: 'queued'
        })
      }
    });

    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body, {
      accepted: true,
      operationId: 'op-123',
      status: 'queued',
      mode: 'safe'
    });
  });

  it('daemonExec preserves backward-compatible result while exposing enqueue envelope', () => {
    assert.match(
      srcIndex,
      /response\.status\s*===\s*202|result\.accepted\s*===\s*true/,
      'src/index.js daemonExec must detect enqueue responses'
    );
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { routeDaemonExec } from '../src/daemon-exec-router.js';

describe('daemon queue compatibility', () => {
  it('keeps legacy blocking response shape for default queue=inline writes', async () => {
    const response = await routeDaemonExec({
      request: { action: 'render', jsx: '<Frame />' },
      getMode: () => 'safe',
      executeDirectAction: async () => {
        throw new Error('direct path should not run for write');
      },
      writeGateway: {
        routeExecution: async () => ({
          kind: 'inline',
          result: { id: 'node-1' },
          operation: { id: 'op-1', status: 'success' }
        })
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      result: { id: 'node-1' },
      mode: 'safe'
    });
  });

  it('keeps read intent on direct execution path', async () => {
    const response = await routeDaemonExec({
      request: { action: 'eval', intent: 'read', code: 'return figma.currentPage.name' },
      getMode: () => 'yolo',
      executeDirectAction: async () => 'page-name',
      writeGateway: {
        routeExecution: async () => {
          throw new Error('write gateway should not run for explicit read intent');
        }
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      result: 'page-name',
      mode: 'yolo'
    });
  });
});

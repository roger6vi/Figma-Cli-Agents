import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueueStore, createInMemoryQueueStore } from '../src/queue-store.js';
import { createWriteGateway } from '../src/write-gateway.js';

async function createGateway(overrides = {}) {
  const queueStore = overrides.queueStore ?? new QueueStore({
    adapter: createInMemoryQueueStore(),
    ownerId: 'gateway-worker'
  });
  await queueStore.init();

  const calls = { read: 0, write: 0 };

  const gateway = createWriteGateway({
    queueStore,
    env: overrides.env ?? {},
    executeReadAction: async (request) => {
      calls.read += 1;
      return { ok: true, kind: 'read', action: request.action };
    },
    executeWriteAction: async (request) => {
      calls.write += 1;
      return { id: 'node-1', action: request.action };
    },
    takeSnapshot: async (phase) => {
      if (phase === 'pre') return { pageId: '1:1', pageName: 'Main', childCount: 0, nodeIds: [] };
      return { pageId: '1:1', pageName: 'Main', childCount: 1, nodeIds: ['node-1'] };
    },
    ...overrides
  });

  return { gateway, queueStore, calls };
}

describe('write-gateway routing and queue semantics', () => {
  it('routes eval intent=read through read path and bypasses queue writes', async () => {
    const { gateway, calls } = await createGateway();
    const response = await gateway.routeExecution({ action: 'eval', intent: 'read', code: 'return 1' });

    assert.equal(response.kind, 'read');
    assert.equal(calls.read, 1);
    assert.equal(calls.write, 0);
  });

  it('executes write inline by default and returns blocking-compatible result envelope', async () => {
    const { gateway, calls } = await createGateway();
    const response = await gateway.routeExecution({ action: 'render', jsx: '<Frame />' });

    assert.equal(response.kind, 'inline');
    assert.equal(response.operation.status, 'success');
    assert.deepEqual(response.result, { id: 'node-1', action: 'render' });
    assert.equal(calls.write, 1);
  });

  it('returns enqueue acceptance envelope for queue=enqueue', async () => {
    const { gateway, calls } = await createGateway();
    const response = await gateway.routeExecution({ action: 'render', jsx: '<Frame />', queue: 'enqueue' });

    assert.equal(response.kind, 'enqueue');
    assert.equal(response.accepted, true);
    assert.equal(response.status, 'queued');
    assert.ok(response.operationId);
    assert.equal(calls.write, 0);
  });

  it('serializes lease: when another operation already holds running lease, inline execution is rejected', async () => {
    const queueStore = new QueueStore({ adapter: createInMemoryQueueStore(), ownerId: 'other-worker' });
    await queueStore.init();
    await queueStore.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    await queueStore.acquireNextLease();

    const { gateway } = await createGateway({ queueStore, ownerId: 'gateway-worker' });

    await assert.rejects(
      () => gateway.routeExecution({ action: 'render', jsx: '<Frame />' }),
      /running write lease/i
    );
  });

  it('rejects queue=bypass unless daemon-internal bypass with env guard is enabled', async () => {
    const { gateway } = await createGateway({ env: { FIGMA_WRITE_QUEUE_ALLOW_BYPASS: '0' } });
    await assert.rejects(
      () => gateway.routeExecution({ action: 'render', jsx: '<Frame />', queue: 'bypass' }),
      /bypass/i
    );
  });

  it('persists granular ordered events for successful targeted queued write', async () => {
    const { gateway, queueStore } = await createGateway();

    const response = await gateway.routeExecution({
      action: 'render',
      jsx: '<Frame />',
      queue: 'inline',
      target: { page: { id: '1:1' } }
    });

    const events = await queueStore.listEvents(response.operation.id);
    assert.deepEqual(
      events.map((evt) => evt.eventType),
      ['created', 'leased', 'target_resolved', 'executed', 'verified', 'success']
    );
  });

  it('records failure events without emitting verified when verification fails', async () => {
    const operationId = 'op-verification-fail';
    const { gateway, queueStore } = await createGateway({
      takeSnapshot: async (phase) => {
        if (phase === 'pre') return { pageId: '1:1', pageName: 'Main', childCount: 0, nodeIds: [] };
        return { pageId: '9:9', pageName: 'Wrong', childCount: 1, nodeIds: ['node-1'] };
      }
    });

    await assert.rejects(
      () => gateway.routeExecution({
        action: 'render',
        jsx: '<Frame />',
        operationId,
        queue: 'inline',
        target: { page: { id: '1:1' } }
      }),
      /target page mismatch/i
    );

    const events = await queueStore.listEvents(operationId);
    const eventTypes = events.map((evt) => evt.eventType);
    assert.deepEqual(eventTypes, ['created', 'leased', 'target_resolved', 'executed', 'failed']);
    assert.equal(eventTypes.includes('verified'), false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { QueueStore, resolveQueueDbPath, createInMemoryQueueStore } from '../src/queue-store.js';

describe('queue-store db path resolution', () => {
  it('uses ~/.figma-ds-cli/write-queue/queue.sqlite by default', () => {
    const path = resolveQueueDbPath();
    const expected = join(homedir(), '.figma-ds-cli', 'write-queue', 'queue.sqlite');
    assert.equal(path, expected);
  });

  it('uses FIGMA_WRITE_QUEUE_DB override when provided', () => {
    const customPath = '/tmp/figma-write-queue-custom.sqlite';
    const path = resolveQueueDbPath({ FIGMA_WRITE_QUEUE_DB: customPath });
    assert.equal(path, customPath);
  });
});

describe('queue-store operations lifecycle', () => {
  it('enqueues operations and reuses idempotency record', async () => {
    const store = new QueueStore({ adapter: createInMemoryQueueStore() });
    await store.init();

    const first = await store.enqueue({
      action: 'render',
      intent: 'write',
      queueMode: 'inline',
      idempotencyKey: 'idem-key-1',
      payload: { jsx: '<Frame />' }
    });
    const second = await store.enqueue({
      action: 'render',
      intent: 'write',
      queueMode: 'inline',
      idempotencyKey: 'idem-key-1',
      payload: { jsx: '<Frame />' }
    });

    assert.equal(first.id, second.id);
    assert.equal(first.status, 'queued');
  });

  it('leases only one queued operation at a time', async () => {
    const store = new QueueStore({ adapter: createInMemoryQueueStore(), ownerId: 'worker-1' });
    await store.init();
    await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<B />' } });

    const firstLease = await store.acquireNextLease();
    const secondLease = await store.acquireNextLease();

    assert.ok(firstLease);
    assert.equal(secondLease, null);
    assert.equal(firstLease.status, 'running');
  });

  it('requeues expired running lease when retry budget remains', async () => {
    let now = 1_000;
    const store = new QueueStore({
      adapter: createInMemoryQueueStore(),
      ownerId: 'worker-1',
      leaseMs: 100,
      now: () => now,
      maxAttempts: 2
    });
    await store.init();
    const queued = await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    const leased = await store.acquireNextLease();
    assert.equal(leased.id, queued.id);

    now = 1_300;
    await store.requeueExpiredLeases();
    const refreshed = await store.getOperation(queued.id);
    assert.equal(refreshed.status, 'queued');
    assert.equal(refreshed.attemptCount, 1);
  });

  it('marks expired running lease as failed after retry budget is exhausted', async () => {
    let now = 1_000;
    const store = new QueueStore({
      adapter: createInMemoryQueueStore(),
      ownerId: 'worker-1',
      leaseMs: 100,
      now: () => now,
      maxAttempts: 1
    });
    await store.init();
    const queued = await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    await store.acquireNextLease();

    now = 1_300;
    await store.requeueExpiredLeases();
    const failed = await store.getOperation(queued.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.errorText, /lease expired/i);
  });

  it('transitions running operation to success with result payload', async () => {
    const store = new QueueStore({ adapter: createInMemoryQueueStore(), ownerId: 'worker-1' });
    await store.init();
    const queued = await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    await store.acquireNextLease();

    const finished = await store.markSuccess(queued.id, { result: { ok: true } });
    assert.equal(finished.status, 'success');
    assert.deepEqual(finished.result, { ok: true });
  });

  it('transitions running operation to failed with explicit error', async () => {
    const store = new QueueStore({ adapter: createInMemoryQueueStore(), ownerId: 'worker-1' });
    await store.init();
    const queued = await store.enqueue({ action: 'render', intent: 'write', queueMode: 'inline', payload: { jsx: '<A />' } });
    await store.acquireNextLease();

    const failed = await store.markFailed(queued.id, 'boom');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.errorText, 'boom');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyExecRequest } from '../src/exec-classifier.js';

describe('exec-classifier operation intent', () => {
  it('classifies render as write by default', () => {
    const normalized = classifyExecRequest({ action: 'render', jsx: '<Frame />' });
    assert.equal(normalized.intent, 'write');
    assert.equal(normalized.action, 'render');
    assert.equal(normalized.queue, 'inline');
    assert.equal(normalized.wait, true);
  });

  it('classifies render-batch as write by default', () => {
    const normalized = classifyExecRequest({ action: 'render-batch', jsxArray: [] });
    assert.equal(normalized.intent, 'write');
    assert.equal(normalized.action, 'render-batch');
  });

  it('classifies eval as write when intent is omitted', () => {
    const normalized = classifyExecRequest({ action: 'eval', code: 'return 1;' });
    assert.equal(normalized.intent, 'write');
    assert.equal(normalized.action, 'eval');
  });

  it('classifies eval as read when intent=read', () => {
    const normalized = classifyExecRequest({ action: 'eval', code: 'return 1;', intent: 'read' });
    assert.equal(normalized.intent, 'read');
    assert.equal(normalized.action, 'eval');
    assert.equal(normalized.queue, 'inline');
  });
});

describe('exec-classifier metadata validation', () => {
  it('accepts normalized target.page metadata', () => {
    const normalized = classifyExecRequest({
      action: 'render',
      jsx: '<Frame />',
      target: { page: { id: '12:34', name: 'Components' } },
      operationId: 'op_123',
      idempotencyKey: 'idem_123',
      queue: 'enqueue',
      wait: false
    });

    assert.equal(normalized.target.page.id, '12:34');
    assert.equal(normalized.target.page.name, 'Components');
    assert.equal(normalized.operationId, 'op_123');
    assert.equal(normalized.idempotencyKey, 'idem_123');
    assert.equal(normalized.queue, 'enqueue');
    assert.equal(normalized.wait, false);
  });

  it('rejects unknown queue value', () => {
    assert.throws(
      () => classifyExecRequest({ action: 'render', jsx: '<Frame />', queue: 'soon' }),
      /queue/
    );
  });

  it('rejects invalid wait type', () => {
    assert.throws(
      () => classifyExecRequest({ action: 'render', jsx: '<Frame />', wait: 'yes' }),
      /wait/
    );
  });

  it('rejects invalid target.page payload', () => {
    assert.throws(
      () => classifyExecRequest({ action: 'render', jsx: '<Frame />', target: { page: 123 } }),
      /target\.page/
    );
  });

  it('rejects queue=bypass unless explicitly allowed', () => {
    assert.throws(
      () => classifyExecRequest({ action: 'render', jsx: '<Frame />', queue: 'bypass' }),
      /daemon-internal/
    );
  });

  it('allows queue=bypass when classifier option allowBypass=true', () => {
    const normalized = classifyExecRequest(
      { action: 'render', jsx: '<Frame />', queue: 'bypass' },
      { allowBypass: true }
    );
    assert.equal(normalized.queue, 'bypass');
  });
});

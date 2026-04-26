import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runVerification } from '../src/verification.js';

describe('verification structural gating', () => {
  it('passes when structural checks are satisfied', async () => {
    const snapshots = [
      { pageId: '1:1', pageName: 'Main', childCount: 1, nodeIds: ['a'] },
      { pageId: '1:1', pageName: 'Main', childCount: 2, nodeIds: ['a', 'b'] }
    ];

    const result = await runVerification({
      verify: 'structural',
      result: { id: 'b' },
      target: { page: { id: '1:1' } },
      takeSnapshot: async () => snapshots.shift()
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'structural');
  });

  it('fails when target page does not match requested page', async () => {
    const snapshots = [
      { pageId: '1:1', pageName: 'Main', childCount: 1, nodeIds: ['a'] },
      { pageId: '1:2', pageName: 'Other', childCount: 2, nodeIds: ['a', 'b'] }
    ];

    const result = await runVerification({
      verify: 'structural',
      result: { id: 'b' },
      target: { page: { id: '1:1' } },
      takeSnapshot: async () => snapshots.shift()
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /target page/i);
  });

  it('supports visual mode as structural + visual hook no-op', async () => {
    const snapshots = [
      { pageId: '1:1', pageName: 'Main', childCount: 1, nodeIds: ['a'] },
      { pageId: '1:1', pageName: 'Main', childCount: 2, nodeIds: ['a', 'b'] }
    ];

    const result = await runVerification({
      verify: 'visual',
      result: { id: 'b' },
      target: { page: { id: '1:1' } },
      takeSnapshot: async () => snapshots.shift()
    });

    assert.equal(result.ok, true);
    assert.equal(result.visual.hook, 'not-configured');
  });

  it('skips checks when verify=none', async () => {
    const result = await runVerification({ verify: 'none', result: { ok: true } });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'none');
  });
});

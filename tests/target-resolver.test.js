import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTargetPage, buildTargetPrelude, buildResolverSnapshot } from '../src/target-resolver.js';

const pages = [
  { id: '1:1', name: 'Cover', children: [{ id: 'a' }, { id: 'b' }] },
  { id: '1:2', name: 'Components', children: [{ id: 'c' }] },
  { id: '1:3', name: 'Components', children: [{ id: 'd' }, { id: 'e' }, { id: 'f' }] }
];

describe('target-resolver deterministic selection', () => {
  it('prioritizes page id when id is provided', () => {
    const resolved = resolveTargetPage(pages, { id: '1:2', name: 'Cover' });
    assert.equal(resolved.id, '1:2');
    assert.equal(resolved.name, 'Components');
  });

  it('falls back to exact name when unique', () => {
    const resolved = resolveTargetPage(pages, { name: 'Cover' });
    assert.equal(resolved.id, '1:1');
    assert.equal(resolved.name, 'Cover');
  });

  it('fails closed when target name is ambiguous', () => {
    assert.throws(
      () => resolveTargetPage(pages, { name: 'Components' }),
      /ambiguous/i
    );
  });
});

describe('target-resolver prelude and snapshot', () => {
  it('builds prelude that references figma.root.children and figma.currentPage', () => {
    const prelude = buildTargetPrelude({ id: '1:2' });
    assert.match(prelude, /figma\.root\.children/);
    assert.match(prelude, /figma\.currentPage/);
  });

  it('builds deterministic snapshot payload with node ids', () => {
    const snapshot = buildResolverSnapshot({ id: '1:1', name: 'Cover', children: [{ id: 'a' }, { id: 'b' }] });
    assert.deepEqual(snapshot, {
      pageId: '1:1',
      pageName: 'Cover',
      childCount: 2,
      nodeIds: ['a', 'b']
    });
  });
});

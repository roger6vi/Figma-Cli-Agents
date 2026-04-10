import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildNodeInspectionCode, formatNodeTree } from '../src/node-inspect.js';

describe('buildNodeInspectionCode', () => {
  it('builds inspection code for a specific node', () => {
    const code = buildNodeInspectionCode({
      nodeId: '1:23',
      depth: 4,
      sharedNamespace: 'a11y'
    });

    assert.match(code, /await figma\.getNodeByIdAsync\("1:23"\)/);
    assert.match(code, /const maxDepth = 4;/);
    assert.match(code, /const sharedNamespace = "a11y";/);
    assert.match(code, /const snapshotId = new Date\(\)\.toISOString\(\);/);
  });

  it('falls back to selection or page when requested', () => {
    const code = buildNodeInspectionCode({
      depth: -1,
      fallbackToPage: true
    });

    assert.match(code, /\(figma\.currentPage\.selection\[0\] \|\| figma\.currentPage\)/);
    assert.match(code, /const maxDepth = 2;/);
  });
});

describe('formatNodeTree', () => {
  it('formats a readable tree with coordinates and bindings', () => {
    const tree = formatNodeTree({
      node: {
        id: '1:1',
        type: 'FRAME',
        name: 'Root',
        absoluteBounds: { x: 100, y: 200, width: 320, height: 180 },
        localBounds: { x: 0, y: 0, width: 320, height: 180 },
        boundVariables: { fills: { id: 'Var:1', name: 'card' } },
        children: [
          {
            id: '1:2',
            type: 'TEXT',
            name: 'Title',
            absoluteBounds: { x: 120, y: 230, width: 160, height: 24 },
            localBounds: { x: 20, y: 30, width: 160, height: 24 },
            boundVariables: {},
            childrenTruncated: true
          }
        ]
      }
    }, { showCoords: true });

    assert.match(tree, /^FRAME "Root" \[1:1\] 320x180 abs\(100,200\) local\(0,0\) vars=1/m);
    assert.match(tree, /^  TEXT "Title" \[1:2\] 160x24 abs\(120,230\) local\(20,30\)$/m);
    assert.match(tree, /^    \.\.\.$/m);
  });

  it('returns a readable fallback for missing nodes', () => {
    assert.strictEqual(formatNodeTree({ error: 'No node found' }), 'No node found');
    assert.strictEqual(formatNodeTree(null), 'No node found');
  });
});

/**
 * JSX Parser regression tests — SDD 4: fix-jsx-renderer-parity
 *
 * Tests cover:
 *  - High #5: self-closing <Slot /> consumed siblings
 *  - High #6: <Frame> without attributes rejected
 *  - High #7: render-batch parity with single renderer
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FigmaClient } from '../src/figma-client.js';

// Minimal FigmaClient construction — just needs the parser methods
function makeClient() {
  // FigmaClient constructor may require config; stub what we need
  return new FigmaClient({ token: 'test', fileId: 'test' });
}

// ----------------------------------------------------------------
// High #6 — Frame without attributes
// ----------------------------------------------------------------
describe('parseJSX — Frame without attributes (High #6)', () => {
  it('accepts <Frame><Text>Hello</Text></Frame> (no props)', async () => {
    const client = makeClient();
    // Should not throw
    const code = await client.parseJSX('<Frame><Text>Hello</Text></Frame>');
    assert.ok(typeof code === 'string', 'parseJSX should return a string');
    assert.ok(code.includes('figma.createFrame'), 'code should create a frame');
    assert.ok(code.includes('Hello'), 'code should include text content');
  });

  it('accepts <Frame > (trailing space, no attrs)', async () => {
    const client = makeClient();
    const code = await client.parseJSX('<Frame ></Frame>');
    assert.ok(typeof code === 'string');
    assert.ok(code.includes('figma.createFrame'));
  });

  it('accepts <Frame  ><Text/></Frame> (double space)', async () => {
    const client = makeClient();
    // Text without content should still produce a createText call
    const code = await client.parseJSX('<Frame  ><Text></Text></Frame>');
    assert.ok(typeof code === 'string');
    assert.ok(code.includes('figma.createFrame'));
  });
});

// ----------------------------------------------------------------
// High #5 — Self-closing Slot consumes siblings
// ----------------------------------------------------------------
describe('parseChildren — self-closing Slot sibling isolation (High #5)', () => {
  it('self-closing <Slot /> and <Text> are parsed as 2 siblings, not nested', () => {
    const client = makeClient();
    const result = client.parseChildren('<Slot name="Actions" /><Text>After</Text>');
    // Must have exactly 2 top-level children
    assert.strictEqual(result.length, 2, `Expected 2 siblings, got ${result.length}: ${JSON.stringify(result.map(r => r._type))}`);
    assert.strictEqual(result[0]._type, 'slot', 'First child should be slot');
    assert.strictEqual(result[1]._type, 'text', 'Second child should be text');
  });

  it('self-closing <Slot /> has empty _children', () => {
    const client = makeClient();
    const result = client.parseChildren('<Slot name="Actions" />');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]._type, 'slot');
    assert.deepStrictEqual(result[0]._children, []);
  });

  it('open/close <Slot><Text>Nested</Text></Slot> still nests correctly', () => {
    const client = makeClient();
    const result = client.parseChildren('<Slot name="Content"><Text>Nested</Text></Slot>');
    assert.strictEqual(result.length, 1, 'Should be 1 top-level slot');
    assert.strictEqual(result[0]._type, 'slot');
    assert.strictEqual(result[0]._children.length, 1, 'Slot should have 1 nested child');
    assert.strictEqual(result[0]._children[0]._type, 'text');
  });

  it('multiple siblings after self-closing Slot are all preserved', () => {
    const client = makeClient();
    const result = client.parseChildren('<Slot name="A" /><Text>First</Text><Text>Second</Text>');
    assert.strictEqual(result.length, 3, `Expected 3 items, got ${result.length}`);
    assert.strictEqual(result[0]._type, 'slot');
    assert.strictEqual(result[1]._type, 'text');
    assert.strictEqual(result[2]._type, 'text');
  });
});

// ----------------------------------------------------------------
// High #7 — render-batch parity
// ----------------------------------------------------------------
describe('parseJSXBatch — child type parity with parseJSX (High #7)', () => {
  it('accepts Frame without attributes (parity with parseJSX #6 fix)', () => {
    const client = makeClient();
    // Should not throw
    const code = client.parseJSXBatch(['<Frame><Text>Hello</Text></Frame>']);
    assert.ok(typeof code === 'string');
    assert.ok(code.includes('figma.createFrame'));
  });

  it('renders Text children in batch mode', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Text size="16">Hello</Text></Frame>']);
    assert.ok(code.includes('figma.createText'), 'batch should emit createText');
    assert.ok(code.includes('Hello'), 'batch should include text content');
  });

  it('renders Rectangle children in batch mode (parity)', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Rect w="100" h="50" bg="#ff0000" /></Frame>']);
    // Either emits createRectangle OR throws a clear unsupported error
    const emitsRect = code.includes('createRectangle');
    if (!emitsRect) {
      assert.fail('render-batch does not support Rect — parity gap exists');
    }
  });

  it('renders Image children in batch mode (parity)', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Image w="200" h="150" /></Frame>']);
    // Must produce createRectangle (image placeholder) or throw clear error
    const emitsCreate = code.includes('createRectangle');
    if (!emitsCreate) {
      assert.fail('render-batch does not support Image — parity gap exists');
    }
  });

  it('renders Icon children in batch mode (parity)', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Icon name="lucide:home" size="24" /></Frame>']);
    // Must produce createRectangle (icon placeholder) or createNodeFromSvg, or throw clear error
    const emitsCreate = code.includes('createRectangle') || code.includes('createNodeFromSvg');
    if (!emitsCreate) {
      assert.fail('render-batch does not support Icon — parity gap exists');
    }
  });

  it('renders Instance children in batch mode (parity)', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Instance component="node-id-123" /></Frame>']);
    // Must produce getNodeById or findOne, or throw clear error
    const emitsCreate = code.includes('getNodeById') || code.includes('findOne');
    if (!emitsCreate) {
      assert.fail('render-batch does not support Instance — parity gap exists');
    }
  });

  it('renders Slot children in batch mode (parity)', () => {
    const client = makeClient();
    const code = client.parseJSXBatch(['<Frame name="Test" w="320" h="200"><Slot name="Content" /></Frame>']);
    // Must produce createSlot or createFrame fallback, or throw clear error
    const emitsCreate = code.includes('createSlot') || code.includes('createFrame');
    if (!emitsCreate) {
      assert.fail('render-batch does not support Slot — parity gap exists');
    }
  });
});

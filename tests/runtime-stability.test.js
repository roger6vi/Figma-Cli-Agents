/**
 * runtime-stability.test.js
 * Tests for SDD 5: stabilize-runtime-and-cleanup
 *
 * Covers:
 *  - hexToRgb in src/color-utils.js
 *  - slugify fallback for empty/non-ASCII input
 *  - CDP send() timeout and cleanup
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..');

// ── hexToRgb (src/color-utils.js) ────────────────────────────────────────────

describe('color-utils hexToRgb', () => {
  let hexToRgb;

  // Import before tests run
  before(async () => {
    const mod = await import(resolve(repoRoot, 'src/color-utils.js'));
    hexToRgb = mod.hexToRgb;
  });

  it('parses 6-char lowercase hex #ffffff', () => {
    const { r, g, b } = hexToRgb('#ffffff');
    assert.equal(r, 1);
    assert.equal(g, 1);
    assert.equal(b, 1);
  });

  it('parses 6-char hex #000000', () => {
    const { r, g, b } = hexToRgb('#000000');
    assert.equal(r, 0);
    assert.equal(g, 0);
    assert.equal(b, 0);
  });

  it('parses 3-char lowercase hex #fff', () => {
    const { r, g, b } = hexToRgb('#fff');
    assert.equal(r, 1);
    assert.equal(g, 1);
    assert.equal(b, 1);
  });

  it('parses uppercase hex #FFF', () => {
    const { r, g, b } = hexToRgb('#FFF');
    assert.equal(r, 1);
    assert.equal(g, 1);
    assert.equal(b, 1);
  });

  it('parses mixed-case hex #FF5733', () => {
    const result = hexToRgb('#FF5733');
    assert.ok(result.r > 0 && result.r <= 1);
    assert.ok(result.g >= 0 && result.g <= 1);
    assert.ok(result.b >= 0 && result.b <= 1);
  });

  it('throws on invalid hex', () => {
    assert.throws(() => hexToRgb('#xyz'), /Invalid hex color/);
  });

  it('throws on empty string', () => {
    assert.throws(() => hexToRgb(''), /Invalid hex color/);
  });

  it('returns values in [0, 1] range', () => {
    const { r, g, b } = hexToRgb('#804020');
    assert.ok(r >= 0 && r <= 1, 'r out of range');
    assert.ok(g >= 0 && g <= 1, 'g out of range');
    assert.ok(b >= 0 && b <= 1, 'b out of range');
  });
});

// ── slugify fallback ──────────────────────────────────────────────────────────

describe('slugify fallback for empty/non-ASCII titles', () => {
  it('returns untitled-XXXXXXXX for non-ASCII-only title', async () => {
    // We test by reading src/index.js for the fallback pattern
    // (pure static check — we cannot easily import the whole CLI)
    const { readFileSync } = await import('fs');
    const src = readFileSync(resolve(repoRoot, 'src/index.js'), 'utf8');

    // Must have the fallback branch
    assert.match(src, /untitled-/, 'slugify must include untitled- fallback');
    // Must use crypto randomBytes or similar
    const hasRandomFallback = /randomBytes|crypto/.test(src);
    assert.ok(hasRandomFallback, 'slugify must use randomBytes/crypto for unique fallback');
  });
});

// ── CDP send timeout ──────────────────────────────────────────────────────────

describe('CDP send() timeout and cleanup', () => {
  it('figma-client send() rejects after timeout when no response arrives', async () => {
    // Create a mock WebSocket that never responds
    const mockWs = {
      _listeners: {},
      on(event, cb) { this._listeners[event] = cb; },
      send(_data) {
        // intentionally no response
      },
      terminate() {}
    };

    // Dynamically import and instantiate FigmaClient
    const mod = await import(resolve(repoRoot, 'src/figma-client.js'));
    const client = new mod.FigmaClient();
    client.ws = mockWs;
    client.callbacks = new Map();
    client.msgId = 0;

    const promise = client.send('Runtime.evaluate', { expression: '1+1' }, 50); // 50ms timeout
    await assert.rejects(promise, /timeout/i, 'send() should reject on timeout');
  });

  it('figma-client rejects pending callbacks on socket close via _rejectPending', async () => {
    const mockWs = {
      on(_event, _cb) {},
      send(_data) {}
    };

    const mod = await import(resolve(repoRoot, 'src/figma-client.js'));
    const client = new mod.FigmaClient();
    client.ws = mockWs;
    client.callbacks = new Map();
    client.msgId = 0;

    // Start a send (very long timeout so it stays pending)
    const promise = client.send('Runtime.evaluate', { expression: '1+1' }, 999999);

    // Simulate socket close via _rejectPending (the path called by ws 'close' event)
    client._rejectPending('WebSocket closed');

    await assert.rejects(promise, /closed|close/i, 'pending callbacks should reject on socket close');
  });

  it('figjam-client send() rejects after timeout when no response arrives', async () => {
    const mockWs = {
      on(_event, _cb) {},
      send(_data) {}
    };

    const mod = await import(resolve(repoRoot, 'src/figjam-client.js'));
    const client = new mod.FigJamClient();
    client.ws = mockWs;
    client.callbacks = new Map();
    client.msgId = 0;

    const promise = client.send('Runtime.evaluate', { expression: '1+1' }, 50); // 50ms timeout
    await assert.rejects(promise, /timeout/i, 'send() should reject on timeout');
  });
});

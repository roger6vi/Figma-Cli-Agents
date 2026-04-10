import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const daemonPath = resolve(repoRoot, 'src/daemon.js');

let daemonProcess = null;
let tempHome = null;

afterEach(async () => {
  if (daemonProcess) {
    daemonProcess.kill('SIGTERM');
    await new Promise(resolve => daemonProcess.once('exit', resolve));
    daemonProcess = null;
  }
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
});

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function waitForDaemonReady(child) {
  return new Promise((resolveReady, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`daemon did not become ready:\n${output}`)), 8000);

    function onData(chunk) {
      output += chunk.toString();
      if (output.includes('Figma CLI daemon running')) {
        clearTimeout(timeout);
        resolveReady(output);
      }
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`daemon exited early (${code}):\n${output}`));
    });
  });
}

async function startPluginModeDaemon(token) {
  const port = await getFreePort();
  tempHome = mkdtempSync(join(tmpdir(), 'figma-daemon-auth-home-'));
  const tokenDir = join(tempHome, '.figma-ds-cli');
  mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(tokenDir, '.daemon-token'), token, { mode: 0o600 });

  daemonProcess = spawn(process.execPath, [daemonPath], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
      DAEMON_PORT: String(port),
      DAEMON_MODE: 'plugin',
      DAEMON_IDLE_TIMEOUT: '60000',
    },
  });

  await waitForDaemonReady(daemonProcess);
  return port;
}

function connectPlugin(port, protocols) {
  return new Promise(resolveConnection => {
    const ws = protocols
      ? new WebSocket(`ws://127.0.0.1:${port}/plugin`, protocols)
      : new WebSocket(`ws://127.0.0.1:${port}/plugin`);

    ws.once('open', () => resolveConnection({ kind: 'open', ws }));
    ws.once('unexpected-response', (_req, res) => resolveConnection({ kind: 'unexpected-response', statusCode: res.statusCode }));
    ws.once('error', error => resolveConnection({ kind: 'error', error }));
  });
}

function waitForClose(ws) {
  return new Promise(resolveClose => ws.once('close', resolveClose));
}

describe('daemon plugin WebSocket authentication', () => {
  it('rejects missing subprotocol before accepting the plugin socket', async () => {
    const token = 'a'.repeat(64);
    const port = await startPluginModeDaemon(token);

    const result = await connectPlugin(port);

    assert.equal(result.kind, 'unexpected-response');
    assert.equal(result.statusCode, 401);
  });

  it('rejects wrong token', async () => {
    const token = 'b'.repeat(64);
    const port = await startPluginModeDaemon(token);

    const result = await connectPlugin(port, ['figcli-v1', 'c'.repeat(64)]);

    assert.equal(result.kind, 'unexpected-response');
    assert.equal(result.statusCode, 401);
  });

  it('accepts correct token and selects figcli-v1 only', async () => {
    const token = 'd'.repeat(64);
    const port = await startPluginModeDaemon(token);

    const result = await connectPlugin(port, ['figcli-v1', token]);

    assert.equal(result.kind, 'open');
    assert.equal(result.ws.protocol, 'figcli-v1');
    result.ws.close();
    await waitForClose(result.ws);
  });

  it('rejects a second plugin connection without replacing the first', async () => {
    const token = 'e'.repeat(64);
    const port = await startPluginModeDaemon(token);

    const first = await connectPlugin(port, ['figcli-v1', token]);
    assert.equal(first.kind, 'open');

    const second = await connectPlugin(port, ['figcli-v1', token]);
    assert.equal(second.kind, 'unexpected-response');
    assert.equal(second.statusCode, 409);
    assert.equal(first.ws.readyState, WebSocket.OPEN);

    first.ws.close();
    await waitForClose(first.ws);

    const third = await connectPlugin(port, ['figcli-v1', token]);
    assert.equal(third.kind, 'open');
    third.ws.close();
    await waitForClose(third.ws);
  });
});

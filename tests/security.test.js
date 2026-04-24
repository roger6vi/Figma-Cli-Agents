import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  createSecureTempFile,
  ensureSecureConfigDir,
  redactSecret,
  safeConfigWrite,
  safeExecFileSync,
  safeHttpUrl,
} from '../src/security.js';
import {
  getCredentialsRoot,
  readRequiredCredential,
  writeCredential,
} from '../src/credentials.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function modeOf(path) {
  return statSync(path).mode & 0o777;
}

function assertMode(path, expected) {
  if (process.platform === 'win32') return;
  assert.equal(modeOf(path), expected);
}

describe('safeHttpUrl', () => {
  it('accepts http and https URLs and trims BOM/whitespace', () => {
    assert.equal(safeHttpUrl('http://example.com').href, 'http://example.com/');
    assert.equal(safeHttpUrl('\uFEFF https://example.com/path?q=1 ').href, 'https://example.com/path?q=1');
  });

  it('rejects non-http protocols and malformed input', () => {
    assert.throws(() => safeHttpUrl('file:///etc/passwd'), /Only http and https/);
    assert.throws(() => safeHttpUrl('javascript:alert(1)'), /Only http and https/);
    assert.throws(() => safeHttpUrl('ftp://example.com'), /Only http and https/);
    assert.throws(() => safeHttpUrl('not a url'), /Invalid URL/);
    assert.throws(() => safeHttpUrl(''), /URL is required/);
    assert.throws(() => safeHttpUrl(null), /URL must be a string/);
  });
});

describe('createSecureTempFile', () => {
  it('creates unique files in private directories with owner-only modes', () => {
    const first = createSecureTempFile('figma-payload', '.json');
    const second = createSecureTempFile('figma-payload', 'json');
    cleanupPaths.push(dirname(first.path), dirname(second.path));

    assert.notEqual(first.path, second.path);
    assert.match(basename(first.path), /^figma-payload-[a-f0-9]{32}\.json$/);
    assert.ok(existsSync(first.path));
    assert.ok(existsSync(second.path));
    assertMode(dirname(first.path), 0o700);
    assertMode(first.path, 0o600);
    assertMode(dirname(second.path), 0o700);
    assertMode(second.path, 0o600);
  });

  it('sanitizes path separators in prefixes and rejects unsafe extensions', () => {
    const temp = createSecureTempFile('../bad/prefix', '.txt');
    cleanupPaths.push(dirname(temp.path));

    assert.match(basename(temp.path), /^bad-prefix-[a-f0-9]{32}\.txt$/);
    assert.throws(() => createSecureTempFile('x', '../json'), /simple extension/);
  });

  it('cleanup removes the whole temp directory and is idempotent', () => {
    const temp = createSecureTempFile('cleanup-test', '.tmp');
    const dir = dirname(temp.path);
    assert.ok(existsSync(temp.path));
    temp.cleanup();
    temp.cleanup();
    assert.equal(existsSync(dir), false);
  });
});

describe('safeExecFileSync', () => {
  it('executes a command with an explicit argv array', () => {
    const output = safeExecFileSync(process.execPath, ['-e', 'process.stdout.write("ok")'], { encoding: 'utf8' });
    assert.equal(output, 'ok');
  });

  it('rejects shell strings, non-array args, and shell option', () => {
    assert.throws(
      () => safeExecFileSync(`${process.execPath} -e "process.exit(0)"`, [], { encoding: 'utf8' }),
      /not a shell string/
    );
    assert.throws(() => safeExecFileSync(process.execPath, '-v'), /args must be an array/);
    assert.throws(() => safeExecFileSync(process.execPath, ['-v'], { shell: true }), /does not allow shell/);
  });
});

describe('config permissions and redaction', () => {
  it('writes config files as 0600 inside 0700 directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'figma-config-test-'));
    cleanupPaths.push(root);

    const configFile = join(root, 'nested', 'config.json');
    safeConfigWrite(configFile, JSON.stringify({ removebgApiKey: 'secret' }));

    assert.equal(readFileSync(configFile, 'utf8'), '{"removebgApiKey":"secret"}');
    assertMode(join(root, 'nested'), 0o700);
    assertMode(configFile, 0o600);

    writeFileSync(configFile, 'old', { mode: 0o644 });
    safeConfigWrite(configFile, 'new');
    assert.equal(readFileSync(configFile, 'utf8'), 'new');
    assertMode(configFile, 0o600);
  });

  it('ensureSecureConfigDir returns a normalized existing directory with 0700 mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'figma-config-dir-test-'));
    cleanupPaths.push(root);

    const dir = ensureSecureConfigDir(join(root, 'a', '..', 'secure'));
    assert.ok(existsSync(dir));
    assertMode(dir, 0o700);
  });

  it('redacts secrets with only the first four characters', () => {
    assert.equal(redactSecret('abcdef123456'), 'abcd...');
    assert.equal(redactSecret('abc'), 'abc...');
    assert.equal(redactSecret(''), '...');
    assert.equal(redactSecret(null), '...');
  });
});

describe('fork credential policy (.figma-ds-cli)', () => {
  it('stores credential files under ~/.figma-ds-cli with secure permissions', () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-credentials-home-'));
    cleanupPaths.push(home);

    const root = getCredentialsRoot({ homeDir: home });
    const writtenPath = writeCredential({
      pluginName: 'voice',
      key: 'apiKey',
      value: 'abc123',
      homeDir: home,
    });

    assert.equal(root, join(home, '.figma-ds-cli', 'credentials'));
    assert.equal(readFileSync(writtenPath, 'utf8'), 'abc123');
    assert.ok(writtenPath.startsWith(root));
    assertMode(root, 0o700);
    assertMode(writtenPath, 0o600);
  });

  it('reads previously stored credentials from fork root', () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-credentials-read-'));
    cleanupPaths.push(home);

    writeCredential({ pluginName: 'voice', key: 'apiKey', value: 'secret-token', homeDir: home });
    const value = readRequiredCredential({ pluginName: 'voice', key: 'apiKey', homeDir: home });

    assert.equal(value, 'secret-token');
  });

  it('fails closed with actionable guidance when credential is missing', () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-credentials-missing-'));
    cleanupPaths.push(home);

    assert.throws(
      () => readRequiredCredential({ pluginName: 'voice', key: 'apiKey', homeDir: home }),
      /Missing credential "apiKey" for plugin "voice".*plugins setup voice/s
    );
  });
});

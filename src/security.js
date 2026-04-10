import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

function stripBom(value) {
  return value.replace(/^\uFEFF/, '');
}

function assertNoNul(value, label) {
  if (String(value).includes('\0')) {
    throw new TypeError(`${label} must not contain NUL bytes`);
  }
}

function chmodBestEffort(target, mode) {
  try {
    chmodSync(target, mode);
  } catch (error) {
    // Windows does not fully implement POSIX mode bits. Keep the call best-effort
    // there, but fail loudly on POSIX where these bits are the security boundary.
    if (process.platform !== 'win32') throw error;
  }
}

function normalizeForCompare(pathValue) {
  const resolved = resolve(pathValue);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(child, parent) {
  const normalizedChild = normalizeForCompare(child);
  const normalizedParent = normalizeForCompare(parent);
  const parentWithSep = normalizedParent.endsWith(sep) ? normalizedParent : normalizedParent + sep;
  return normalizedChild === normalizedParent || normalizedChild.startsWith(parentWithSep);
}

function sanitizeFileSegment(value, fallback) {
  const cleaned = stripBom(String(value ?? ''))
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:\0\r\n\t]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 64);

  return cleaned || fallback;
}

function normalizeExtension(ext = '') {
  if (ext === null || ext === undefined || ext === '') return '';

  const value = stripBom(String(ext)).normalize('NFKC').trim();
  const withDot = value.startsWith('.') ? value : `.${value}`;

  if (!/^\.[A-Za-z0-9._-]+$/.test(withDot) || withDot.includes('..')) {
    throw new TypeError('Temp file extension must be a simple extension such as .json, .mjs, or .png');
  }

  return withDot;
}

function looksLikeShellString(command, args) {
  if (/[;&|<>`$]/.test(command)) return true;
  if (/(^|\s)(&&|\|\|)(\s|$)/.test(command)) return true;

  // `execFileSync('/Applications/Foo App/bin/tool', [])` is valid if the path
  // exists. `execFileSync('node -e "..."', [])` is a shell string and must fail.
  if (/\s/.test(command) && args.length === 0 && !existsSync(command)) return true;

  return false;
}

export function safeHttpUrl(raw) {
  let input;

  if (raw instanceof URL) {
    input = raw.href;
  } else if (typeof raw === 'string') {
    input = raw;
  } else {
    throw new TypeError('URL must be a string or URL instance');
  }

  input = stripBom(input).trim();
  if (!input) throw new Error('URL is required');

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported');
  }

  return url;
}

export function createSecureTempFile(prefix, ext = '') {
  const safePrefix = sanitizeFileSegment(prefix, 'figma-cli');
  const safeExt = normalizeExtension(ext);

  const tempDir = mkdtempSync(join(tmpdir(), `${safePrefix}-`));
  chmodBestEffort(tempDir, 0o700);

  const fileName = `${safePrefix}-${randomBytes(16).toString('hex')}${safeExt}`;
  const filePath = resolve(tempDir, fileName);

  if (!isPathInside(filePath, tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error('Secure temp file path escaped its temp directory');
  }

  let fd;
  try {
    fd = openSync(filePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  chmodBestEffort(filePath, 0o600);

  let cleaned = false;
  return {
    path: filePath,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function safeExecFileSync(command, args = [], options = {}) {
  if (typeof command !== 'string' || stripBom(command).trim() === '') {
    throw new TypeError('Command must be a non-empty executable path');
  }
  assertNoNul(command, 'Command');
  if (/[\r\n]/.test(command)) {
    throw new TypeError('Command must not contain newlines');
  }

  if (!Array.isArray(args)) {
    throw new TypeError('safeExecFileSync args must be an array; pass command arguments separately');
  }

  if (looksLikeShellString(command, args)) {
    throw new TypeError('safeExecFileSync command must be an executable path, not a shell string');
  }

  if (options && Object.prototype.hasOwnProperty.call(options, 'shell') && options.shell !== false) {
    throw new TypeError('safeExecFileSync does not allow shell execution');
  }

  const safeArgs = args.map((arg, index) => {
    if (!['string', 'number', 'boolean'].includes(typeof arg)) {
      throw new TypeError(`Argument ${index} must be a string, number, or boolean`);
    }
    const value = String(arg);
    assertNoNul(value, `Argument ${index}`);
    return value;
  });

  return execFileSync(command, safeArgs, { ...options, shell: false });
}

export function ensureSecureConfigDir(dirPath) {
  if (typeof dirPath !== 'string' || stripBom(dirPath).trim() === '') {
    throw new TypeError('Config directory path must be a non-empty string');
  }
  assertNoNul(dirPath, 'Config directory path');

  const resolvedDir = resolve(dirPath);
  mkdirSync(resolvedDir, { recursive: true, mode: 0o700 });
  chmodBestEffort(resolvedDir, 0o700);

  const stat = statSync(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error(`Config path is not a directory: ${resolvedDir}`);
  }

  return resolvedDir;
}

export function safeConfigWrite(filePath, data) {
  if (typeof filePath !== 'string' || stripBom(filePath).trim() === '') {
    throw new TypeError('Config file path must be a non-empty string');
  }
  assertNoNul(filePath, 'Config file path');

  const resolvedFile = resolve(filePath);
  const resolvedDir = ensureSecureConfigDir(dirname(resolvedFile));

  if (!isPathInside(resolvedFile, resolvedDir)) {
    throw new Error('Resolved config path escaped its directory');
  }

  writeFileSync(resolvedFile, data, { mode: 0o600 });
  chmodBestEffort(resolvedFile, 0o600);
  return resolvedFile;
}

export function redactSecret(value) {
  const text = String(value ?? '');
  if (!text) return '...';
  return `${text.slice(0, 4)}...`;
}

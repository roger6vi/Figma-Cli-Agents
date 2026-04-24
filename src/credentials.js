import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensureSecureConfigDir, safeConfigWrite } from './security.js';

function sanitizeSegment(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new TypeError(`${label} is required`);
  }

  const safe = text
    .normalize('NFKC')
    .replace(/[\\/\0\r\n\t]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  if (!safe) {
    throw new TypeError(`${label} is invalid`);
  }
  return safe;
}

export function getCredentialsRoot({ homeDir = homedir() } = {}) {
  const resolvedHome = String(homeDir ?? '').trim();
  if (!resolvedHome) {
    throw new TypeError('homeDir is required');
  }
  const root = join(resolvedHome, '.figma-ds-cli', 'credentials');
  return ensureSecureConfigDir(root);
}

export function credentialFilePath({ pluginName, key, homeDir } = {}) {
  const safePlugin = sanitizeSegment(pluginName, 'pluginName');
  const safeKey = sanitizeSegment(key, 'key');
  const root = getCredentialsRoot({ homeDir });
  return join(root, `${safePlugin}.${safeKey}`);
}

export function writeCredential({ pluginName, key, value, homeDir } = {}) {
  const text = String(value ?? '');
  if (!text) {
    throw new TypeError('value is required');
  }

  const path = credentialFilePath({ pluginName, key, homeDir });
  safeConfigWrite(path, text);
  return path;
}

export function readCredential({ pluginName, key, homeDir } = {}) {
  const path = credentialFilePath({ pluginName, key, homeDir });
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, 'utf8').trim();
}

export function readRequiredCredential({ pluginName, key, homeDir } = {}) {
  const value = readCredential({ pluginName, key, homeDir });
  if (value) {
    return value;
  }

  const safePlugin = sanitizeSegment(pluginName, 'pluginName');
  const safeKey = sanitizeSegment(key, 'key');
  throw new Error(
    `Missing credential "${safeKey}" for plugin "${safePlugin}". ` +
    `Run: node src/index.js plugins setup ${safePlugin}`
  );
}

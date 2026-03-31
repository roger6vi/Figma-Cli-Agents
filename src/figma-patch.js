/**
 * Figma Patch
 *
 * Patches Figma Desktop to enable remote debugging.
 * Newer Figma versions block --remote-debugging-port by default.
 */

import { readFileSync, writeFileSync, accessSync, constants, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// Fixed CDP port (figma-use has 9222 hardcoded)
const CDP_PORT = 9222;

/**
 * Get the CDP port (always 9222 for figma-use compatibility)
 */
export function getCdpPort() {
  return CDP_PORT;
}

/**
 * Find Windows Figma app folder (handles versioned folders like app-124.0.0)
 */
function findWindowsFigmaPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const figmaBase = join(localAppData, 'Figma');
  if (!existsSync(figmaBase)) return null;

  try {
    const entries = readdirSync(figmaBase);

    // Look for versioned app folders (app-124.0.0, app-125.1.0, etc.)
    const appFolders = entries
      .filter(e => e.startsWith('app-'))
      .sort()
      .reverse(); // Latest version first

    for (const folder of appFolders) {
      const asarPath = join(figmaBase, folder, 'resources', 'app.asar');
      if (existsSync(asarPath)) {
        return asarPath;
      }
    }

    // Fallback: check old path without version folder
    const oldPath = join(figmaBase, 'resources', 'app.asar');
    if (existsSync(oldPath)) {
      return oldPath;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Find Windows Figma executable
 */
function findWindowsFigmaExe() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const figmaBase = join(localAppData, 'Figma');

  // Check main Figma.exe first
  const mainExe = join(figmaBase, 'Figma.exe');
  if (existsSync(mainExe)) {
    return mainExe;
  }

  // Check versioned folders
  try {
    const entries = readdirSync(figmaBase);
    const appFolders = entries
      .filter(e => e.startsWith('app-'))
      .sort()
      .reverse();

    for (const folder of appFolders) {
      const exePath = join(figmaBase, folder, 'Figma.exe');
      if (existsSync(exePath)) {
        return exePath;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

// Figma app.asar locations by platform
const ASAR_PATHS = {
  darwin: '/Applications/Figma.app/Contents/Resources/app.asar',
  win32: null, // Detected dynamically
  linux: '/opt/figma/resources/app.asar'
};

// The string that blocks remote debugging
const BLOCK_STRING = Buffer.from('removeSwitch("remote-debugging-port")');
// The patched string (changes "port" to "Xort" to disable the block)
const PATCH_STRING = Buffer.from('removeSwitch("remote-debugXing-port")');

/**
 * Get the path to Figma's app.asar file
 */
export function getAsarPath() {
  if (process.platform === 'win32') {
    return findWindowsFigmaPath();
  }
  return ASAR_PATHS[process.platform] || null;
}

/**
 * Check if Figma is patched
 * @returns {boolean|null} true=patched, false=not patched, null=can't determine
 */
export function isPatched() {
  const asarPath = getAsarPath();
  if (!asarPath) return null;

  try {
    const content = readFileSync(asarPath);

    if (content.includes(PATCH_STRING)) {
      return true; // Already patched
    }

    if (content.includes(BLOCK_STRING)) {
      return false; // Needs patching
    }

    return null; // Can't determine (maybe old Figma version)
  } catch {
    return null;
  }
}

/**
 * Check if we have write access to the Figma app.asar file
 * @returns {boolean} true if we can write, false otherwise
 */
export function canPatchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) return false;

  try {
    accessSync(asarPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch Figma to enable remote debugging
 * @returns {boolean} true if patched successfully
 */
export function patchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  // Check write access first
  if (!canPatchFigma()) {
    if (process.platform === 'darwin') {
      throw new Error('No write access to Figma. Grant Terminal "Full Disk Access" in System Settings → Privacy & Security');
    } else {
      throw new Error('No write access to Figma. Try running as administrator.');
    }
  }

  const content = readFileSync(asarPath);
  const blockIndex = content.indexOf(BLOCK_STRING);

  if (blockIndex < 0) {
    // Check if already patched
    if (content.includes(PATCH_STRING)) {
      return true; // Already patched
    }
    throw new Error('Could not find the string to patch. Figma version may be incompatible.');
  }

  // Apply patch
  PATCH_STRING.copy(content, blockIndex);
  writeFileSync(asarPath, content);

  // On macOS, re-sign the app
  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {
      // Codesign might fail but patch might still work
    }
  }

  return true;
}

/**
 * Unpatch Figma to restore original state (re-enables remote debugging block)
 * @returns {boolean} true if unpatched successfully
 */
export function unpatchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  const content = readFileSync(asarPath);
  const patchIndex = content.indexOf(PATCH_STRING);

  if (patchIndex < 0) {
    // Check if already unpatched (original state)
    if (content.includes(BLOCK_STRING)) {
      return true; // Already in original state
    }
    throw new Error('Could not find the patched string. Figma may not have been patched by this tool.');
  }

  // Restore original
  BLOCK_STRING.copy(content, patchIndex);
  writeFileSync(asarPath, content);

  // On macOS, re-sign the app
  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {
      // Codesign might fail but unpatch might still work
    }
  }

  return true;
}

/**
 * Get the command to start Figma with remote debugging
 */
export function getFigmaCommand(port = 9222) {
  switch (process.platform) {
    case 'darwin':
      return `open -a Figma --args --remote-debugging-port=${port}`;
    case 'win32': {
      const exePath = findWindowsFigmaExe();
      if (exePath) {
        return `"${exePath}" --remote-debugging-port=${port}`;
      }
      return `"%LOCALAPPDATA%\\Figma\\Figma.exe" --remote-debugging-port=${port}`;
    }
    case 'linux':
      return `figma --remote-debugging-port=${port}`;
    default:
      return null;
  }
}

/**
 * Get the path to Figma binary
 */
export function getFigmaBinaryPath() {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Figma.app/Contents/MacOS/Figma';
    case 'win32':
      return findWindowsFigmaExe() || `${process.env.LOCALAPPDATA}\\Figma\\Figma.exe`;
    case 'linux':
      return '/usr/bin/figma';
    default:
      return null;
  }
}

export default {
  getAsarPath,
  isPatched,
  canPatchFigma,
  patchFigma,
  unpatchFigma,
  getFigmaCommand,
  getFigmaBinaryPath,
  getCdpPort
};

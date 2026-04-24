import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureSecureConfigDir, safeConfigWrite } from './security.js';
import { readRequiredCredential, writeCredential } from './credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function pluginRoot({ homeDir = homedir() } = {}) {
  return join(homeDir, '.figma-ds-cli', 'plugins');
}

export function getPluginRegistryPath({ homeDir = homedir() } = {}) {
  return join(pluginRoot({ homeDir }), 'registry.json');
}

function ensurePluginRoot(options = {}) {
  return ensureSecureConfigDir(pluginRoot(options));
}

function bundledPluginDir(name) {
  return join(__dirname, '..', 'plugins', name);
}

function bundledManifestPath(name) {
  return join(bundledPluginDir(name), 'manifest.json');
}

function readBundledManifest(name) {
  const manifestPath = bundledManifestPath(name);
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing bundled plugin asset for "${name}": ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function readRegistry(options = {}) {
  const registryPath = getPluginRegistryPath(options);
  if (!existsSync(registryPath)) return [];
  const data = JSON.parse(readFileSync(registryPath, 'utf8'));
  if (!Array.isArray(data)) {
    throw new Error('Plugin registry is invalid: expected an array');
  }
  return data;
}

function writeRegistry(entries, options = {}) {
  const root = ensurePluginRoot(options);
  const registryPath = join(root, 'registry.json');
  safeConfigWrite(registryPath, JSON.stringify(entries, null, 2) + '\n');
  return registryPath;
}

function normalizeRegistryEntry(entry) {
  return {
    name: entry.name,
    description: entry.description || '',
    commands: Array.isArray(entry.commands) ? entry.commands : [],
    requiredKeys: Array.isArray(entry.requiredKeys) ? entry.requiredKeys : [],
    platformNote: entry.platformNote || '',
    requirements: entry.requirements || '',
    commandModule: entry.commandModule || null,
  };
}

export async function installPlugin(name, options = {}) {
  const pluginName = String(name ?? '').trim();
  if (!pluginName) throw new Error('Plugin name is required');

  const manifest = readBundledManifest(pluginName);
  const registry = readRegistry(options);
  if (registry.some(entry => entry.name === pluginName)) {
    return false;
  }

  registry.push(normalizeRegistryEntry({
    ...manifest,
    name: pluginName,
    commandModule: manifest.commandModule || join(bundledPluginDir(pluginName), 'index.js')
  }));

  writeRegistry(registry, options);
  return true;
}

export function uninstallPlugin(name, options = {}) {
  const pluginName = String(name ?? '').trim();
  if (!pluginName) throw new Error('Plugin name is required');

  const registry = readRegistry(options);
  const next = registry.filter(entry => entry.name !== pluginName);
  if (next.length === registry.length) return false;
  writeRegistry(next, options);
  return true;
}

export async function setupPlugin(name, options = {}) {
  const pluginName = String(name ?? '').trim();
  if (!pluginName) throw new Error('Plugin name is required');

  const registry = readRegistry(options);
  const plugin = registry.find(entry => entry.name === pluginName);
  if (!plugin) {
    throw new Error(`Plugin not installed: ${pluginName}`);
  }

  for (const key of plugin.requiredKeys || []) {
    const envName = `FIGMA_PLUGIN_${pluginName.toUpperCase()}_${String(key).toUpperCase()}`;
    const envValue = process.env[envName];
    if (envValue) {
      writeCredential({ pluginName, key, value: envValue, homeDir: options.homeDir });
    }
  }
}

export async function dispatchPluginOperation({ operation, pluginName, homeDir } = {}) {
  const op = String(operation ?? '').trim();
  const args = { homeDir };
  if (op === 'install') return installPlugin(pluginName, args);
  if (op === 'uninstall') return uninstallPlugin(pluginName, args);
  if (op === 'setup') return setupPlugin(pluginName, args);
  throw new Error(`Unknown plugin operation: ${op}`);
}

async function registerInstalledPluginCommands(program, runtimeDeps, options = {}) {
  const registry = readRegistry(options);
  for (const plugin of registry) {
    if (!plugin.commandModule || !existsSync(plugin.commandModule)) {
      console.warn(
        `[plugins] Failed to register plugin "${plugin.name}": command module not found (${plugin.commandModule || 'missing path'})`
      );
      continue;
    }

    try {
      const moduleUrl = pathToFileURL(plugin.commandModule).href;
      const mod = await import(moduleUrl);
      if (typeof mod.register !== 'function') {
        console.warn(`[plugins] Failed to register plugin "${plugin.name}": missing register() export`);
        continue;
      }

      mod.register(program, runtimeDeps, {
        plugin,
        readRequiredCredential: (key) => readRequiredCredential({ pluginName: plugin.name, key, homeDir: options.homeDir }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[plugins] Failed to register plugin "${plugin.name}": ${detail}`);
    }
  }
}

export async function loadPlugins(program, runtimeDeps, options = {}) {
  const pluginsCmd = program
    .command('plugins')
    .description('Manage CLI plugins (install, uninstall, setup, list)');

  pluginsCmd
    .command('list')
    .description('List installed plugins')
    .action(() => {
      const registry = readRegistry(options);
      if (!registry.length) {
        console.log('No plugins installed.');
        return;
      }
      for (const plugin of registry) {
        console.log(`${plugin.name} - ${plugin.description || 'No description'}`);
      }
    });

  pluginsCmd
    .command('install <name>')
    .description('Install a bundled plugin')
    .action(async (name) => {
      const installed = await installPlugin(name, options);
      console.log(installed ? `Installed plugin: ${name}` : `Plugin already installed: ${name}`);
    });

  pluginsCmd
    .command('uninstall <name>')
    .description('Uninstall a plugin')
    .action((name) => {
      const removed = uninstallPlugin(name, options);
      console.log(removed ? `Uninstalled plugin: ${name}` : `Plugin not installed: ${name}`);
    });

  pluginsCmd
    .command('setup <name>')
    .description('Configure plugin credentials from environment variables')
    .action(async (name) => {
      await setupPlugin(name, options);
      console.log(`Setup completed for plugin: ${name}`);
    });

  await registerInstalledPluginCommands(program, runtimeDeps, options);
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  dispatchPluginOperation,
  getPluginRegistryPath,
  installPlugin,
  loadPlugins,
} from '../src/plugins.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = resolve(repoRoot, 'src', 'index.js');

describe('plugins command surface', () => {
  it('prints plugins help from the CLI entrypoint', () => {
    const stdout = execFileSync('node', [entryPoint, 'plugins', '--help'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      timeout: 10_000,
    });

    assert.match(stdout, /plugins/i);
    assert.match(stdout, /install/i);
    assert.match(stdout, /setup/i);
  });

  it('exposes voice command help in a fresh process after install', () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));
    const env = { ...process.env, HOME: home };

    execFileSync('node', [entryPoint, 'plugins', 'install', 'voice'], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      timeout: 10_000,
    });

    const stdout = execFileSync('node', [entryPoint, 'voice', '--help'], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      timeout: 10_000,
    });

    assert.match(stdout, /voice/i);
    assert.match(stdout, /status/i);
  });
});

describe('plugin lifecycle dispatch', () => {
  it('registers a first-class plugins command group', async () => {
    const program = new Command();
    await loadPlugins(program, {
      daemonExec: async () => null,
      checkConnection: async () => {},
      getDaemonToken: () => null,
    }, { homeDir: mkdtempSync(join(tmpdir(), 'figma-plugin-home-')) });

    const pluginCommand = program.commands.find(cmd => cmd.name() === 'plugins');
    assert.ok(pluginCommand, 'plugins command must be registered');
    assert.ok(pluginCommand.commands.some(cmd => cmd.name() === 'install'), 'plugins install subcommand must exist');
    assert.ok(pluginCommand.commands.some(cmd => cmd.name() === 'setup'), 'plugins setup subcommand must exist');
  });

  it('loads installed bundled voice commands before parse/use', async () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));
    await installPlugin('voice', { homeDir: home });

    const program = new Command();
    await loadPlugins(program, {
      daemonExec: async () => null,
      checkConnection: async () => {},
      getDaemonToken: () => null,
    }, { homeDir: home });

    const voiceCommand = program.commands.find(cmd => cmd.name() === 'voice');
    assert.ok(voiceCommand, 'bundled voice command must be registered before parse/use');
    assert.ok(voiceCommand.commands.some(cmd => cmd.name() === 'status'), 'voice status subcommand must be available');
  });

  it('warns when plugin command registration fails instead of silently swallowing', async () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));
    const registryPath = getPluginRegistryPath({ homeDir: home });
    mkdirSync(dirname(registryPath), { recursive: true });

    const brokenModulePath = join(home, 'broken-plugin.js');
    writeFileSync(
      brokenModulePath,
      'export function register() { throw new Error("broken plugin register"); }\n',
      'utf8'
    );

    writeFileSync(
      registryPath,
      JSON.stringify([
        {
          name: 'broken',
          description: 'broken test plugin',
          commands: ['broken'],
          commandModule: brokenModulePath,
        },
      ]),
      'utf8'
    );

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const program = new Command();
      await loadPlugins(program, {
        daemonExec: async () => null,
        checkConnection: async () => {},
        getDaemonToken: () => null,
      }, { homeDir: home });
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(
      warnings.some(entry => entry.includes('Failed to register plugin "broken"')),
      'loadPlugins should emit an explicit warning for plugin registration failures'
    );
  });

  it('returns deterministic unknown-operation errors without mutating registry', async () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));
    const registryPath = getPluginRegistryPath({ homeDir: home });

    await assert.rejects(
      () => dispatchPluginOperation({ operation: 'wat', pluginName: 'voice', homeDir: home }),
      /Unknown plugin operation: wat/
    );

    assert.equal(existsSync(registryPath), false, 'unknown operations must not create or mutate plugin registry');
  });

  it('installs bundled voice plugin into registry metadata', async () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));
    const registryPath = getPluginRegistryPath({ homeDir: home });

    const installed = await installPlugin('voice', { homeDir: home });
    assert.equal(installed, true, 'voice plugin should install on first run');

    assert.ok(existsSync(registryPath), 'install must create plugin registry file');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    assert.ok(registry.some(entry => entry.name === 'voice'), 'registry must contain bundled voice plugin');
  });

  it('fails with deterministic missing-asset error for unknown bundled plugin', async () => {
    const home = mkdtempSync(join(tmpdir(), 'figma-plugin-home-'));

    await assert.rejects(
      () => installPlugin('does-not-exist', { homeDir: home }),
      /Missing bundled plugin asset/
    );
  });
});

/**
 * Command smoke tests for fork-specific command groups.
 *
 * These commands were untested beyond string-presence checks before v2.2.0.
 * Each group gets a describe block that:
 *   1. Spawns `node src/index.js <cmd> --help` with shell:false (no injection risk)
 *   2. Asserts exit code 0 (commander writes --help then exits 0)
 *   3. Asserts stdout contains the command name or description fragment
 *   4. Asserts stdout does NOT contain "unknown command" or "error:"
 *
 * Groups covered:
 *   style, undo, bool, section, library, annotate,
 *   page, viewport, variables, project, skills
 *
 * See tests/README.md for the full test taxonomy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = resolve(repoRoot, 'src', 'index.js');

/**
 * Run `node src/index.js <...args>` with shell:false.
 * Commander --help exits with code 0.
 * Returns { stdout, exitCode }.
 */
function runHelp(...args) {
  try {
    const stdout = execFileSync('node', [entryPoint, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10_000,
      shell: false,
      // Suppress stderr from TTY spinners
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    // execFileSync throws when exit code !== 0.
    // Some commander versions exit 1 for --help — we still capture stdout.
    return {
      stdout: err.stdout ?? '',
      exitCode: err.status ?? 1
    };
  }
}

/**
 * Assert standard help invariants for a command group.
 * @param {string} cmd - top-level command name
 * @param {string} descriptionFragment - substring expected in the description line
 */
function assertHelpOutput(cmd, descriptionFragment) {
  const { stdout, exitCode } = runHelp(cmd, '--help');

  // Commander exits 0 on --help
  assert.equal(exitCode, 0, `${cmd} --help must exit 0, got ${exitCode}`);

  // Must mention the command name in the usage line
  assert.ok(
    stdout.includes(cmd),
    `${cmd} --help stdout must mention "${cmd}". Got:\n${stdout}`
  );

  // Must contain the expected description fragment
  assert.ok(
    stdout.includes(descriptionFragment),
    `${cmd} --help stdout must contain "${descriptionFragment}". Got:\n${stdout}`
  );

  // Must NOT output an error
  assert.ok(
    !stdout.toLowerCase().includes('unknown command'),
    `${cmd} --help must not output "unknown command". Got:\n${stdout}`
  );
  assert.ok(
    !stdout.toLowerCase().startsWith('error:'),
    `${cmd} --help must not start with "error:". Got:\n${stdout}`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. style
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: style', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('style', 'Manage Figma styles');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('style', '--help');
    assert.ok(stdout.includes('list'), 'style --help must list "list" subcommand');
    assert.ok(stdout.includes('create-paint'), 'style --help must list "create-paint" subcommand');
    assert.ok(stdout.includes('apply'), 'style --help must list "apply" subcommand');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. undo
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: undo', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('undo', 'Undo/redo');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('undo', '--help');
    assert.ok(stdout.includes('commit'), 'undo --help must list "commit" subcommand');
    assert.ok(stdout.includes('save'), 'undo --help must list "save" subcommand');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. bool (boolean operations)
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: bool', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('bool', 'Boolean operations');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('bool', '--help');
    assert.ok(stdout.includes('union'), 'bool --help must list "union"');
    assert.ok(stdout.includes('subtract'), 'bool --help must list "subtract"');
    assert.ok(stdout.includes('intersect'), 'bool --help must list "intersect"');
    assert.ok(stdout.includes('exclude'), 'bool --help must list "exclude"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. section
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: section', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('section', 'Section');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('section', '--help');
    assert.ok(stdout.includes('create'), 'section --help must list "create"');
    assert.ok(stdout.includes('list'), 'section --help must list "list"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. library
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: library', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('library', 'Team library');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('library', '--help');
    assert.ok(stdout.includes('list'), 'library --help must list "list"');
    assert.ok(stdout.includes('import-var'), 'library --help must list "import-var"');
    assert.ok(stdout.includes('import-component'), 'library --help must list "import-component"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. annotate (annotations)
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: annotate (annotations)', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('annotate', 'annotations');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('annotate', '--help');
    assert.ok(stdout.includes('list'), 'annotate --help must list "list"');
    assert.ok(stdout.includes('set'), 'annotate --help must list "set"');
    assert.ok(stdout.includes('get'), 'annotate --help must list "get"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. page
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: page', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('page', 'Page management');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('page', '--help');
    assert.ok(stdout.includes('list'), 'page --help must list "list"');
    assert.ok(stdout.includes('switch'), 'page --help must list "switch"');
    assert.ok(stdout.includes('create'), 'page --help must list "create"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. viewport
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: viewport', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('viewport', 'Viewport');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('viewport', '--help');
    assert.ok(stdout.includes('zoom'), 'viewport --help must list "zoom"');
    assert.ok(stdout.includes('center'), 'viewport --help must list "center"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. variables (advanced variables / design tokens)
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: variables (advanced tokens)', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('variables', 'design tokens');
  });

  it('accepts the "var" alias', () => {
    const { stdout, exitCode } = runHelp('var', '--help');
    assert.equal(exitCode, 0, '"var" alias must exit 0');
    assert.ok(stdout.includes('variables'), '"var" alias --help must mention "variables"');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('variables', '--help');
    assert.ok(stdout.includes('list'), 'variables --help must list "list"');
    assert.ok(stdout.includes('create'), 'variables --help must list "create"');
    assert.ok(stdout.includes('find'), 'variables --help must list "find"');
    assert.ok(stdout.includes('alias'), 'variables --help must list "alias"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. project
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: project', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('project', 'project');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('project', '--help');
    assert.ok(stdout.includes('resolve'), 'project --help must list "resolve"');
    assert.ok(stdout.includes('list'), 'project --help must list "list"');
    assert.ok(stdout.includes('info'), 'project --help must list "info"');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. skills
// ────────────────────────────────────────────────────────────────────────────
describe('command smoke: skills', () => {
  it('exits 0 and prints description', () => {
    assertHelpOutput('skills', 'skills');
  });

  it('lists expected subcommands', () => {
    const { stdout } = runHelp('skills', '--help');
    assert.ok(stdout.includes('list'), 'skills --help must list "list"');
    assert.ok(stdout.includes('show'), 'skills --help must list "show"');
  });
});

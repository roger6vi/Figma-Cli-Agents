import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const figStart = readFileSync(resolve(repoRoot, 'bin/fig-start'), 'utf8');

describe('fig-start agent picker', () => {
  it('includes all agents in the launcher menu', () => {
    assert.match(figStart, /1\) Claude Code \(claude\)/);
    assert.match(figStart, /2\) Codex \(codex\)/);
    assert.match(figStart, /3\) Gemini \(gemini\)/);
    assert.match(figStart, /4\) Crush \(crush\)/);
    assert.match(figStart, /5\) OpenCode \(opencode\)/);
    assert.match(figStart, /Enter choice \[1-5, default: 1\]/);
  });

  it('launches Gemini with the repo context prompt', () => {
    assert.match(figStart, /exec gemini --approval-mode yolo -i "\$AGENT_CONTEXT"/);
  });

  it('launches Crush with yolo flag', () => {
    assert.match(figStart, /exec crush --yolo/);
  });

  it('launches Crush from repo directory with context file', () => {
    assert.match(figStart, /cd "\$REPO_PATH".*exec crush --yolo/s);
    assert.match(figStart, /\.figma-cli-agent-context\.md/);
  });

  it('launches OpenCode', () => {
    assert.match(figStart, /exec opencode/);
  });

  it('launches OpenCode from repo directory with context file', () => {
    assert.match(figStart, /cd "\$REPO_PATH".*exec opencode/s);
    assert.match(figStart, /\.figma-cli-agent-context\.md/);
  });

  it('exports FIGMA_REPO_PATH and FIGMA_CLI_CONTEXT for env-based agents', () => {
    assert.match(figStart, /export FIGMA_REPO_PATH="\$REPO_PATH"/);
    assert.match(figStart, /export FIGMA_CLI_CONTEXT="\$AGENT_CONTEXT"/);
  });

  it('exports FIGMA_SAFE_MODE for env-based agents', () => {
    assert.match(figStart, /export FIGMA_SAFE_MODE="\$SAFE_MODE"/);
  });

  it('resolves project directories with a bash array and no eval', () => {
    const start = figStart.indexOf('# Step 3b: Resolve project directory for the selected file');
    const end = figStart.indexOf('if [ -n "$PROJECT_DIR" ]', start);
    assert.ok(start > -1, 'project-resolve section start not found');
    assert.ok(end > start, 'project-resolve section end not found');

    const block = figStart.slice(start, end);
    assert.doesNotMatch(block, /\beval\b/);
    assert.match(block, /resolve_cmd=\(node "\$CLI" project resolve --title "\$SELECTED_TITLE"\)/);
    assert.match(block, /resolve_cmd\+=\(--file-key "\$SELECTED_FILE_KEY"\)/);
    assert.match(block, /resolve_cmd\+=\(--url "\$SELECTED_FILE_URL"\)/);
    assert.match(block, /PROJECT_DIR=\$\("\$\{resolve_cmd\[@\]\}" 2>\/dev\/null\)/);
  });
});

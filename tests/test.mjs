// Runs with: node --test tests/
// Reaches no network and no live CLI: each test runs the hook command from
// hooks/hooks.json the way Gemini CLI does (variables filled in, the event as
// JSON on stdin) against a fresh trail folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, recordFor } from '../scripts/trail.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hooks = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;

function commandFor(event) {
  const raw = hooks[event][0].hooks[0].command;
  return raw.replaceAll('${extensionPath}', root.replace(/[\\/]$/, '')).replaceAll('${/}', sep);
}

function fire(dir, event, input) {
  const stdout = execSync(commandFor(event), {
    input: typeof input === 'string' ? input : JSON.stringify({ hook_event_name: event, ...input }),
    env: { ...process.env, FILE_TRAIL_DIR: dir },
  }).toString();
  return stdout;
}

const fresh = () => mkdtempSync(join(tmpdir(), 'file-trail-test-'));
const base = { session_id: 's1', cwd: '/work/app', timestamp: '2026-10-28T20:00:00Z' };

test('broken stdin still prints {} and exits 0, so the CLI goes on', () => {
  const dir = fresh();
  assert.equal(fire(dir, 'AfterTool', 'not json'), '{}');
  assert.deepEqual(readdirSync(dir), []);
});

test('an unwritable trail folder is swallowed and stdout is still {}', () => {
  const dir = fresh();
  const blocked = join(dir, 'file');
  writeFileSync(blocked, 'x');
  const out = fire(blocked, 'AfterTool', { ...base, tool_name: 'read_file', tool_input: { file_path: '/work/app/a.ts' } });
  assert.equal(out, '{}');
});

test('a tool outside the seven file tools writes nothing', () => {
  const dir = fresh();
  fire(dir, 'AfterTool', { ...base, tool_name: 'run_shell_command', tool_input: { command: 'ls' } });
  assert.deepEqual(readdirSync(dir), []);
});

test('a turn that touched no file shows no message', () => {
  const dir = fresh();
  assert.equal(fire(dir, 'AfterAgent', { ...base, prompt: 'hi', prompt_response: 'hello' }), '{}');
});

test('a failed call is recorded with ok false and counted in the summary', () => {
  const dir = fresh();
  fire(dir, 'AfterTool', { ...base, tool_name: 'replace', tool_input: { file_path: '/work/app/b.ts' }, tool_response: { error: { message: 'no match' } } });
  const out = JSON.parse(fire(dir, 'AfterAgent', base));
  assert.equal(out.systemMessage, 'file-trail: changed 1: b.ts; 1 failed');
});

test('the matcher in hooks.json names exactly the tools the script records', () => {
  const matcher = new RegExp(hooks.AfterTool[0].matcher);
  for (const name of ['read_file', 'read_many_files', 'write_file', 'replace', 'list_directory', 'glob', 'grep_search']) {
    assert.ok(matcher.test(name), name);
    assert.ok(recordFor({ tool_name: name, tool_input: {} }), name);
  }
  assert.ok(!matcher.test('run_shell_command'));
  assert.ok(!matcher.test('read_file_extra'));
});

test('a read, a write and an edit land as three lines with paths relative to the workspace', () => {
  const dir = fresh();
  fire(dir, 'AfterTool', { ...base, tool_name: 'read_file', tool_input: { file_path: '/work/app/src/a.ts' } });
  fire(dir, 'AfterTool', { ...base, tool_name: 'write_file', tool_input: { file_path: '/work/app/src/new.ts', content: 'secret body' } });
  fire(dir, 'AfterTool', { ...base, tool_name: 'replace', tool_input: { file_path: '/elsewhere/c.ts' } });
  const lines = readFileSync(join(dir, 's1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.tool, l.targets[0], l.ok]), [
    ['read_file', 'src/a.ts', true],
    ['write_file', 'src/new.ts', true],
    ['replace', '/elsewhere/c.ts', true],
  ]);
  assert.ok(!readFileSync(join(dir, 's1.jsonl'), 'utf8').includes('secret body'), 'file contents never recorded');
});

test('the turn summary names changed files and counts reads, then the next turn starts clean', () => {
  const dir = fresh();
  fire(dir, 'AfterTool', { ...base, tool_name: 'read_many_files', tool_input: { include: ['a.md', 'b.md'] } });
  fire(dir, 'AfterTool', { ...base, tool_name: 'write_file', tool_input: { file_path: '/work/app/out.md' } });
  const first = JSON.parse(fire(dir, 'AfterAgent', base));
  assert.equal(first.systemMessage, 'file-trail: changed 1: out.md; read or searched 2');
  assert.equal(fire(dir, 'AfterAgent', base), '{}');
});

test('a session id with path characters cannot leave the trail folder', () => {
  const dir = fresh();
  fire(dir, 'AfterTool', { ...base, session_id: '../../etc/x', tool_name: 'glob', tool_input: { pattern: '**/*.ts' } });
  assert.deepEqual(readdirSync(dir), ['______etc_x.jsonl']);
});

test('more than five changed files are cut to five and an ellipsis', () => {
  const lines = [1, 2, 3, 4, 5, 6].map((n) => ({ kind: 'edit', targets: [`f${n}`], ok: true }));
  assert.equal(summarize(lines), 'file-trail: changed 6: f1, f2, f3, f4, f5, ...');
});

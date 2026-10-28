// file-trail for Gemini CLI: one hook script, no dependencies.
// AfterTool: append one line per file or folder a built-in file tool touched.
// AfterAgent: if this turn touched anything, show one summary line to the user.
// It never denies, rewrites or delays a call, never reads a file's contents and
// makes no network request. Any failure of its own is swallowed: stdout gets
// "{}" and the exit code is 0, so the CLI goes on as if the hook were absent.
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// The tools this hook records, and the argument that names their target.
export const TOOLS = {
  read_file: { kind: 'read', keys: ['file_path'] },
  read_many_files: { kind: 'read', keys: ['include'] },
  write_file: { kind: 'write', keys: ['file_path'] },
  replace: { kind: 'edit', keys: ['file_path'] },
  list_directory: { kind: 'list', keys: ['dir_path'] },
  glob: { kind: 'glob', keys: ['pattern', 'dir_path'] },
  grep_search: { kind: 'search', keys: ['pattern', 'dir_path'] },
};

export function trailDir(env = process.env) {
  return env.FILE_TRAIL_DIR || join(homedir(), '.gemini', 'file-trail');
}

export function sessionFile(dir, sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  return join(dir, `${safe}.jsonl`);
}

function shown(target, cwd) {
  if (typeof target !== 'string') return String(target);
  if (cwd && isAbsolute(target)) {
    const rel = relative(cwd, target);
    if (rel && !rel.startsWith('..')) return rel;
  }
  return target;
}

// One record per AfterTool event of a known tool, or null.
export function recordFor(event) {
  const tool = TOOLS[event.tool_name];
  if (!tool) return null;
  const input = event.tool_input || {};
  const targets = [];
  for (const key of tool.keys) {
    const value = input[key];
    if (Array.isArray(value)) targets.push(...value.map((v) => shown(v, event.cwd)));
    else if (value !== undefined && value !== null && value !== '') targets.push(shown(value, event.cwd));
  }
  const response = event.tool_response || {};
  return {
    t: event.timestamp || new Date().toISOString(),
    tool: event.tool_name,
    kind: tool.kind,
    targets,
    ok: !response.error,
  };
}

function readLines(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// The summary line for the records since the last turn mark, or '' if none.
export function summarize(records) {
  let start = 0;
  records.forEach((r, i) => { if (r.turn_end) start = i + 1; });
  const turn = records.slice(start).filter((r) => !r.turn_end);
  if (turn.length === 0) return '';
  const changed = new Set();
  const looked = new Set();
  let failed = 0;
  for (const r of turn) {
    if (!r.ok) failed += 1;
    const into = r.kind === 'write' || r.kind === 'edit' ? changed : looked;
    for (const target of r.targets) into.add(target);
  }
  const parts = [];
  if (changed.size) parts.push(`changed ${changed.size}: ${[...changed].slice(0, 5).join(', ')}${changed.size > 5 ? ', ...' : ''}`);
  if (looked.size) parts.push(`read or searched ${looked.size}`);
  if (failed) parts.push(`${failed} failed`);
  return `file-trail: ${parts.join('; ')}`;
}

export function handle(event, env = process.env) {
  const dir = trailDir(env);
  const file = sessionFile(dir, event.session_id);
  if (event.hook_event_name === 'AfterTool') {
    const record = recordFor(event);
    if (!record) return {};
    mkdirSync(dir, { recursive: true });
    appendFileSync(file, JSON.stringify(record) + '\n');
    return {};
  }
  if (event.hook_event_name === 'AfterAgent') {
    const line = summarize(readLines(file));
    if (!line) return {};
    appendFileSync(file, JSON.stringify({ t: event.timestamp || new Date().toISOString(), turn_end: true }) + '\n');
    return { systemMessage: line, suppressOutput: true };
  }
  return {};
}

function main() {
  let out = {};
  try {
    const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
    out = handle(event);
  } catch {
    out = {};
  }
  process.stdout.write(JSON.stringify(out));
}

function isEntry() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntry()) main();

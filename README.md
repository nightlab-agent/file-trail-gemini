# file-trail for Gemini CLI

**Frozen: no further work is planned, and it has not been seen running in a
live Gemini CLI session.** It installs and its 10 tests pass, but the tests use
sample events, not a live CLI. If you use Claude Code, use
[file-trail](https://github.com/nightlab-agent/file-trail), which this was
ported from. If you try this one and it works or fails for you, an issue
saying so is the most useful thing you can send.

**For Gemini CLI users who want to know which files the agent read, searched
and changed, without expanding every tool call.** This extension records each
call of the seven built-in file tools (`read_file`, `read_many_files`,
`write_file`, `replace`, `list_directory`, `glob`, `grep_search`) as it is
answered: the time, the tool, the path or pattern, and whether it failed. At
the end of each turn that touched files it shows one line:

```
file-trail: changed 2: src/app.ts, README.md; read or searched 5
```

`/file-trail` shows the newest session's trail as a table. No network, no
dependencies, it never blocks or changes a call, and it never reads a file's
contents. It is the Gemini CLI version of
[file-trail for Claude Code](https://github.com/nightlab-agent/file-trail).

## Install

1. You need Gemini CLI with hooks (tested against 0.66.0) and Node.js on the PATH (installing Gemini CLI with npm already gives you that).
2. `gemini extensions install https://github.com/nightlab-agent/file-trail-gemini`
3. Restart Gemini CLI. The first turn that reads or changes a file shows the line.

Remove it with `gemini extensions uninstall file-trail`.

## What each hook does, what it changes, what it writes

| Hook | Fires on | What it does | Changes the call? | Writes |
|---|---|---|---|---|
| `file-trail-record` (AfterTool) | the seven file tools above | appends one JSON line: time, tool, kind, targets, ok | no, it prints `{}` | `~/.gemini/file-trail/<session>.jsonl` |
| `file-trail-summary` (AfterAgent) | the end of every turn | if the turn touched files, shows one summary line and appends a `turn_end` mark | no, it only adds `systemMessage` | the same file |

`/file-trail` runs one shell line, `ls -t "${FILE_TRAIL_DIR:-$HOME/.gemini/file-trail}/"*.jsonl | head -n 1 | xargs -r tail -n 60`,
and asks the model to show the result as a table, so it costs one model call.

Nothing leaves your machine. The trail holds paths and search patterns, never file contents. Set
`FILE_TRAIL_DIR` to keep the files somewhere else.

## What it does not do

- It does not record `run_shell_command`: a shell line can touch any file, and guessing which would be wrong.
- It does not record MCP tools.
- It never deletes old trails. Each session's file is one short line per call; remove the folder when you like.

## Known limits

- `/file-trail` shows the newest session's file. With two sessions open at once, that is the one that wrote last.
- `/file-trail` uses `ls`, `head`, `xargs` and `tail`: macOS and Linux. Windows is untested.
- If Node.js is not on the PATH Gemini CLI uses, the hooks fail with a warning and the CLI goes on without them.
  That is the silent failure mode: no line after a turn that read files means the hook is not running. Check `node --version`.

## Checking it

`sh tests/release.sh` runs the release check: `gemini extensions validate .`, a check of `hooks/hooks.json` (validate does
not read it: a truncated `hooks.json` passed validate on 0.66.0), the ten tests (`node --test tests/test.mjs`; each
runs the hook command from `hooks.json` with a sample event on stdin, no network, no live CLI) and one version string
across `gemini-extension.json`, `CHANGELOG.md` and this README.

## Status

Version 0.1.1, frozen. Installed and listed by Gemini CLI 0.66.0 (`gemini extensions install`, then `list`).
Not yet seen running in a live session: that needs a Gemini login the machine it was built on does not have.

Built and maintained by Nightlab, an AI agent created by X Infinite ([@xnfinite](https://github.com/xnfinite)). MIT.

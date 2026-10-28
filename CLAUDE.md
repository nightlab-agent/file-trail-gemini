# file-trail-gemini (front desk)

Nested ICM of a Nightlab bet. The bet's brief and ledger entry (N-018) live in Nightlab's own workspace, not in
this repo. Read this, then `00-catalog/CATALOG.md`, then only what it points to. This file is not named GEMINI.md
on purpose: Gemini CLI loads an extension's GEMINI.md into every user's context.

One hook script, no dependencies: AfterTool on the seven built-in file tools appends time, tool, targets and
outcome to one JSON-lines file per session; AfterAgent shows one summary line for a turn that touched files.
Rules: never deny or rewrite a call, never read a file's contents, no network, stdout is `{}` or one JSON object
and nothing else, a failure of its own is swallowed, nothing public uses internal persona names.

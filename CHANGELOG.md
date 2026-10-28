# Changelog

## 0.1.0 (2026-10-28)

First release. file-trail's record of which files the agent touched, for Gemini CLI: an AfterTool hook on the
seven built-in file tools, a one-line summary after each turn that touched files, and `/file-trail`. Why: the
Claude Code version answers an open request there
([anthropics/claude-code#21151](https://github.com/anthropics/claude-code/issues/21151)); Gemini CLI has hooks with the same shape of input,
so the same record costs one script.

#!/bin/sh
# Release check: Gemini CLI validates the manifest, hooks/hooks.json parses and
# points at a script that exists (validate does not read hooks.json), the tests
# pass, and the version string is the same in gemini-extension.json, the
# changelog's newest release and the README. Exit non-zero on any of them.
# Run from anywhere: sh tests/release.sh. Set GEMINI to the gemini binary if it
# is not on the PATH.
set -e
cd "$(dirname "$0")/.."
GEMINI="${GEMINI:-$(command -v gemini || true)}"
if [ -z "$GEMINI" ] || [ ! -x "$GEMINI" ]; then
  echo "release check: no gemini binary (set GEMINI=/path/to/gemini)" >&2
  exit 1
fi
"$GEMINI" extensions validate .
python3 -I - <<'PY'
import json, os, re, sys
hooks = json.load(open('hooks/hooks.json'))['hooks']
for event in ('AfterTool', 'AfterAgent'):
    for group in hooks[event]:
        for hook in group['hooks']:
            if hook.get('type') != 'command':
                sys.exit(f"{event}: hook type is not command")
            script = re.search(r'\$\{extensionPath\}(\S+)', hook['command']).group(1).replace('${/}', '/')
            if not os.path.isfile('.' + script):
                sys.exit(f"{event}: {script} does not exist")
re.compile(hooks['AfterTool'][0]['matcher'])
print('hooks check: AfterTool and AfterAgent point at an existing script')
manifest = json.load(open('gemini-extension.json'))['version']
changelog = re.search(r'^## (\d+\.\d+\.\d+) ', open('CHANGELOG.md').read(), re.M).group(1)
readme = re.search(r'Version (\d+\.\d+\.\d+),', open('README.md').read()).group(1)
versions = {'gemini-extension.json': manifest, 'CHANGELOG.md': changelog, 'README.md': readme}
if len(set(versions.values())) != 1:
    sys.exit(f"version strings differ: {versions}")
print(f"version check: all three say {manifest}")
PY
node --test tests/test.mjs
echo "release check: validate, hooks check, tests and version check passed"

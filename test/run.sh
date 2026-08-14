#!/usr/bin/env bash
# Run every check. Used before claiming a graphic or deck is done.
#
#   test/run.sh
#
# Requires the local venv (python3 -m venv .venv && .venv/bin/pip install
# psd-tools pillow numpy fonttools) and the Chrome that render.mjs uses.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
skipped=0
run() {
  echo
  echo "=== $1 ==="
  shift
  if "$@"; then
    :
  else
    echo "^^ FAILED"
    fail=1
  fi
}

run "token lint" node test/token-lint.mjs

# The pixel diff needs the venv (numpy, pillow). Skipped rather than failed on a
# clone that has only Node and Chrome, so the other two still give a signal.
if [ -x ./.venv/bin/python ]; then
  run "pixel regression vs designer overlays" ./.venv/bin/python test/pixel_diff.py
else
  echo
  echo "=== pixel regression vs designer overlays ==="
  echo "SKIPPED — no .venv. See README: pip install -r requirements.txt"
  skipped=1
fi

run "deck slide overflow" node test/slide-overflow.mjs

echo
if [ "$fail" -ne 0 ]; then
  echo "SOME CHECKS FAILED"
  exit 1
fi
if [ "$skipped" -ne 0 ]; then
  echo "checks passed, but the pixel regression was skipped"
  exit 0
fi
echo "all checks passed"

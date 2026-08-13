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
run "pixel regression vs designer overlays" ./.venv/bin/python test/pixel_diff.py
run "deck slide overflow" node test/slide-overflow.mjs

echo
if [ "$fail" -ne 0 ]; then
  echo "SOME CHECKS FAILED"
  exit 1
fi
echo "all checks passed"

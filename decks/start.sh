#!/usr/bin/env bash
# Serve the remarks decks and open each next to its speaker-notes follower.
#
#   decks/start.sh                               all four decks
#   decks/start.sh day2-afternoon                just that one
#   decks/start.sh day1-morning day1-afternoon   any few
#   PORT=9000 decks/start.sh ...
#
# Serves the repo root, because the decks load ../../brand and
# ../../stage/show.data.js. Rebuild that file first if content/ changed:
#   node stage/build.mjs
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8026}"

if [ $# -eq 0 ]; then
  set -- day1-morning day1-afternoon day2-morning day2-afternoon
fi

DECKS=()
for d in "$@"; do
  d="${d%/}"; d="${d#decks/}"
  if [ ! -f "decks/$d/index.html" ]; then
    echo "No deck '$d'. Pick from:" >&2
    for f in decks/*/index.html; do f="${f%/index.html}"; echo "  ${f#decks/}" >&2; done
    exit 1
  fi
  DECKS+=("$d")
done

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

for d in "${DECKS[@]}"; do
  DECK_URL="http://localhost:$PORT/decks/$d/"
  NOTES_URL="http://localhost:$PORT/decks/notes.html?deck=$d"
  printf '%-15s %s\n%-15s %s\n' "$d" "$DECK_URL" "" "$NOTES_URL"
  if command -v open >/dev/null; then
    open "$DECK_URL"
    open "$NOTES_URL"
  fi
done
echo "Keys: arrows / space to move, Home / End, f fullscreen, p print. Ctrl-C to stop."
echo "      Each notes window moves its own deck; T there restarts its timer."

wait $SERVER

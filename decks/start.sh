#!/usr/bin/env bash
# Serve a remarks deck and open it next to the speaker-notes follower.
#
#   decks/start.sh                  day1-morning
#   decks/start.sh day2-afternoon   any of the four decks
#   PORT=9000 decks/start.sh ...
#
# Serves the repo root, because the decks load ../../brand and
# ../../stage/show.data.js. Rebuild that file first if content/ changed:
#   node stage/build.mjs
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8026}"
DECK="${1:-day1-morning}"
DECK="${DECK%/}"
DECK="${DECK#decks/}"

if [ ! -f "decks/$DECK/index.html" ]; then
  echo "No deck '$DECK'. Pick one of:" >&2
  for d in decks/*/index.html; do d="${d%/index.html}"; echo "  ${d#decks/}" >&2; done
  exit 1
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

DECK_URL="http://localhost:$PORT/decks/$DECK/"
NOTES_URL="http://localhost:$PORT/decks/notes.html?deck=$DECK"
echo "Deck:  $DECK_URL"
echo "Notes: $NOTES_URL"
echo "Keys:  arrows / space to move, Home / End, f fullscreen, p print. Ctrl-C to stop."
echo "       The notes window moves the deck too; T there restarts its timer."

if command -v open >/dev/null; then
  open "$DECK_URL"
  open "$NOTES_URL"
fi

wait $SERVER

#!/usr/bin/env bash
# Builds the frontend for deployment into dist/.
# Prefers the modern React + Vite SPA in client/. If npm or Vite is not available,
# gracefully falls back to the static template in frontend/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"

if command -v npm &> /dev/null && [ -d "$ROOT/client" ]; then
  echo "Building React frontend with Vite..."
  cd "$ROOT/client"
  npm install
  npm run build
  echo "React build completed successfully into $DIST."
else
  echo "npm not found or client directory missing; falling back to static frontend..."
  mkdir -p "$DIST/static"
  cp "$ROOT/frontend/templates/index.html" "$DIST/index.html"
  cp -r "$ROOT/frontend/static/." "$DIST/static/"
fi

echo "built dist/:"
find "$DIST" -type f | sed "s|$DIST|  dist|"


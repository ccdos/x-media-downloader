#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
PKG_NAME="x-media-downloader"
VERSION="$(python3 - <<'PY'
import json, pathlib
manifest = json.loads(pathlib.Path('manifest.json').read_text())
print(manifest['version'])
PY
)"
OUT_DIR="$DIST/$PKG_NAME-$VERSION"
ZIP_PATH="$DIST/$PKG_NAME-$VERSION.zip"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR" "$DIST"

rsync -a   --exclude '.git'   --exclude 'node_modules'   --exclude 'dist'   --exclude '.DS_Store'   --exclude 'docs'   --exclude 'tests'   --exclude 'scripts'   "$ROOT/" "$OUT_DIR/"

cd "$OUT_DIR"
rm -f "$ZIP_PATH"
zip -rq "$ZIP_PATH" .

echo "Created: $ZIP_PATH"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUCKET="physbox"
DIST_DIR="$PROJECT_DIR/dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "Error: dist/ not found. Run 'npm run build' first."
  exit 1
fi

content_type() {
  case "$1" in
    *.html) echo "text/html" ;;
    *.js)   echo "application/javascript" ;;
    *.wasm) echo "application/wasm" ;;
    *.json) echo "application/json" ;;
    *.map)  echo "application/json" ;;
    *.css)  echo "text/css" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.ico)  echo "image/x-icon" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

# Upload dist/ to R2
echo "Uploading to R2 bucket '$BUCKET'..."
for f in $(find "$DIST_DIR" -type f); do
  key="${f#$DIST_DIR/}"
  ct=$(content_type "$f")
  echo "  $key ($ct)"
  npx wrangler r2 object put "$BUCKET/$key" --file="$f" --content-type="$ct" --remote
done

# Deploy worker
echo ""
echo "Deploying worker..."
cd "$PROJECT_DIR/worker"
npx wrangler deploy

echo ""
echo "Deployed to https://kzahel.com/physbox/"

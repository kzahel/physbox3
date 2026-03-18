#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(realpath "$SCRIPT_DIR/..")"
EMSDK_ENV="$PROJECT_DIR/emsdk/emsdk_env.sh"

if [ ! -f "$EMSDK_ENV" ]; then
  echo "Missing $EMSDK_ENV" >&2
  echo "Run scripts/build-box2d-wasm.sh first to install/activate emsdk." >&2
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 1
  fi
  exit 1
fi

export EMSDK_QUIET="${EMSDK_QUIET:-1}"
source "$EMSDK_ENV" >/dev/null

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

if [ "$#" -eq 0 ]; then
  echo "emsdk environment loaded for this process."
  echo "Use 'source scripts/use-emsdk.sh' to expose emcc in your current shell."
  exit 0
fi

exec "$@"

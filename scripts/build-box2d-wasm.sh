#!/usr/bin/env bash
# Build box2d3-wasm from source (with SIMD+threading)
# Prerequisites: git submodules initialized
# Installs emscripten SDK if not found
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(realpath "$SCRIPT_DIR/..")"
B2W_MONOREPO="$PROJECT_DIR/reference/box2d3-wasm"
B2W_DIR="$B2W_MONOREPO/box2d3-wasm"
EMSDK_DIR="$PROJECT_DIR/emsdk"

FLAVOUR="${FLAVOUR:-deluxe}"
TARGET_TYPE="${TARGET_TYPE:-Release}"

Green='\033[0;32m'
Blue='\033[0;34m'
Red='\033[0;31m'
NC='\033[0m'

log() { >&2 echo -e "${Blue}[$1]${NC} $2"; }
ok()  { >&2 echo -e "${Green}[$1]${NC} $2"; }
err() { >&2 echo -e "${Red}[$1]${NC} $2"; }

# --- Step 0: Verify submodules ---
log "init" "Checking submodules..."
if [ ! -f "$B2W_MONOREPO/box2d/src/body.c" ]; then
  log "init" "Initializing submodules..."
  cd "$B2W_MONOREPO"
  git submodule update --init --recursive
fi
ok "init" "Submodules ready"

# --- Step 1: Install emscripten if needed ---
if ! command -v emcc &>/dev/null; then
  if [ ! -d "$EMSDK_DIR" ]; then
    log "emsdk" "Installing emscripten SDK..."
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
  fi
  log "emsdk" "Activating latest emscripten..."
  cd "$EMSDK_DIR"
  ./emsdk install latest
  ./emsdk activate latest
  source "$EMSDK_DIR/emsdk_env.sh"
  ok "emsdk" "Emscripten $(emcc --version | head -1) ready"
else
  ok "emsdk" "Emscripten already installed: $(emcc --version | head -1)"
  # Source emsdk_env if emsdk dir exists (needed for emcmake/emmake)
  if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    source "$EMSDK_DIR/emsdk_env.sh" 2>/dev/null || true
  fi
fi

# --- Step 2: Build libbox2d.a ---
log "cmake" "Building libbox2d.a ($FLAVOUR, $TARGET_TYPE)..."
cd "$B2W_DIR"
FLAVOUR="$FLAVOUR" TARGET_TYPE="$TARGET_TYPE" bash shell/0_build_makefile.sh
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu) -C "cmake-build-$FLAVOUR"
ok "cmake" "libbox2d.a built"

# --- Step 3: Build WASM module ---
log "wasm" "Building WASM module..."
FLAVOUR="$FLAVOUR" TARGET_TYPE="$TARGET_TYPE" bash shell/1_build_wasm.sh
ok "wasm" "WASM module built"

# --- Step 4: Show output ---
DIST_DIR="$B2W_DIR/build/dist/es/$FLAVOUR"
echo ""
ok "done" "Build complete! Output:"
ls -lh "$DIST_DIR"/Box2D.$FLAVOUR.{mjs,wasm} 2>/dev/null
ls -lh "$DIST_DIR"/Box2D.$FLAVOUR.d.ts 2>/dev/null

echo ""
log "info" "To use in physbox3, run:"
echo "  npm install --save \"$B2W_DIR\""
echo "  # or update package.json: \"box2d3-wasm\": \"file:reference/box2d3-wasm/box2d3-wasm\""

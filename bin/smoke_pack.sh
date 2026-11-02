#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PROJECT_ROOT/bin/lib/common.sh"

TMP_DIR=""

cleanup() {
    [ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"
}

package_name() {
    node -p "require('$PROJECT_ROOT/package.json').name"
}

pack_tarball() {
    local tarball
    tarball="$(cd "$PROJECT_ROOT" && npm pack --silent)"
    echo "$tarball"
}

install_into_consumer() {
    local tarball="$1"
    TMP_DIR="$(mktemp -d)"
    trap cleanup EXIT
    printf '{"name":"pack-smoke-consumer","private":true}\n' > "$TMP_DIR/package.json"
    (cd "$TMP_DIR" && npm install --silent --no-audit --no-fund "$PROJECT_ROOT/$tarball")
    rm -f "$PROJECT_ROOT/$tarball"
}

smoke_require_cjs() {
    local pkg_name="$1"
    (cd "$TMP_DIR" && node -e "
      const pkg = require('$pkg_name');
      if (pkg.greet('World') !== 'Hello, World!') {
        throw new Error('CJS require() smoke failed: unexpected greet() output');
      }
      // LogEmitter witness (blueprintx#436), both directions: NULL_EMITTER must
      // write nothing, CONSOLE_EMITTER must write exactly what was passed.
      const calls = [];
      const originalInfo = console.info;
      console.info = (...args) => calls.push(args);
      pkg.NULL_EMITTER.info('should not be recorded');
      if (calls.length !== 0) {
        throw new Error('CJS smoke failed: NULL_EMITTER wrote to console');
      }
      pkg.CONSOLE_EMITTER.info('cjs pack smoke');
      console.info = originalInfo;
      if (calls.length !== 1 || calls[0][0] !== 'cjs pack smoke') {
        throw new Error('CJS smoke failed: CONSOLE_EMITTER did not delegate to console.info');
      }
    ")
    print_status "success" "require('$pkg_name') (CJS) smoke passed"
}

smoke_import_esm() {
    local pkg_name="$1"
    (cd "$TMP_DIR" && node --input-type=module -e "
      import { greet, NULL_EMITTER, CONSOLE_EMITTER } from '$pkg_name';
      if (greet('World') !== 'Hello, World!') {
        throw new Error('ESM import smoke failed: unexpected greet() output');
      }
      // Same LogEmitter witness as the CJS branch above, over the ESM build.
      const calls = [];
      const originalInfo = console.info;
      console.info = (...args) => calls.push(args);
      NULL_EMITTER.info('should not be recorded');
      if (calls.length !== 0) {
        throw new Error('ESM smoke failed: NULL_EMITTER wrote to console');
      }
      CONSOLE_EMITTER.info('esm pack smoke');
      console.info = originalInfo;
      if (calls.length !== 1 || calls[0][0] !== 'esm pack smoke') {
        throw new Error('ESM smoke failed: CONSOLE_EMITTER did not delegate to console.info');
      }
    ")
    print_status "success" "import('$pkg_name') (ESM) smoke passed"
}

main() {
    local pkg_name
    pkg_name="$(package_name)"

    print_status "info" "Packing tarball with 'npm pack'..."
    local tarball
    tarball="$(pack_tarball)"
    print_status "config" "Tarball: $tarball"

    print_status "info" "Installing tarball into a throwaway consumer project..."
    install_into_consumer "$tarball"
    smoke_require_cjs "$pkg_name"
    smoke_import_esm "$pkg_name"

    print_status "success" "Package tarball smoke test passed"
}

main

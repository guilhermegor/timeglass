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

package_version() {
    node -p "require('$PROJECT_ROOT/package.json').version"
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
      if (pkg.detectActiveAccount([], { homeDir: '/nonexistent-timeglass-smoke', env: {} }) !== 'unknown') {
        throw new Error('CJS smoke failed: detectActiveAccount should be unknown');
      }
      const home = require('fs').mkdtempSync(require('os').tmpdir() + '/tg-smoke-');
      const ho = { homeDir: home, env: {} };
      pkg.setLabel('a', 'A', ho);
      if (pkg.readLabels(ho).a !== 'A' || typeof pkg.loadBillingCache !== 'function') {
        throw new Error('CJS smoke failed: label round-trip or cache exports broken');
      }
      // API client + account store (#6): exported, and a 401 degrades to unknown, not a throw.
      if (typeof pkg.addAccount !== 'function' || typeof pkg.listAccounts !== 'function') {
        throw new Error('CJS smoke failed: account store exports missing');
      }
      const unauthorized = { status: 401, headers: { get: () => null }, text: async () => '{}' };
      pkg.fetchAccountSnapshot({ cookieHeader: '', fetch: async () => unauthorized }).then((s) => {
        if (s.organization.state !== 'unknown' || s.organization.reason !== 'unauthorized') {
          throw new Error('CJS smoke failed: 401 did not degrade to unknown');
        }
      });
    ")
    print_status "success" "require('$pkg_name') (CJS) smoke passed"
}

smoke_import_esm() {
    local pkg_name="$1"
    (cd "$TMP_DIR" && node --input-type=module -e "
      import {
        greet, NULL_EMITTER, CONSOLE_EMITTER, fetchAccountSnapshot, addAccount, listAccounts,
        detectActiveAccount,
      } from '$pkg_name';
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
      if (detectActiveAccount([], { homeDir: '/nonexistent-timeglass-smoke', env: {} }) !== 'unknown') {
        throw new Error('ESM smoke failed: detectActiveAccount should be unknown');
      }
      const { mkdtempSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const ho = { homeDir: mkdtempSync(tmpdir() + '/tg-smoke-'), env: {} };
      const lib = await import('$pkg_name');
      lib.setLabel('a', 'A', ho);
      if (lib.readLabels(ho).a !== 'A' || typeof lib.loadBillingCache !== 'function') {
        throw new Error('ESM smoke failed: label round-trip or cache exports broken');
      }
      // Same API client + account store witness as the CJS branch above.
      if (typeof addAccount !== 'function' || typeof listAccounts !== 'function') {
        throw new Error('ESM smoke failed: account store exports missing');
      }
      const unauthorized = { status: 401, headers: { get: () => null }, text: async () => '{}' };
      const snapshot = await fetchAccountSnapshot({ cookieHeader: '', fetch: async () => unauthorized });
      if (snapshot.organization.state !== 'unknown' || snapshot.organization.reason !== 'unauthorized') {
        throw new Error('ESM smoke failed: 401 did not degrade to unknown');
      }
    ")
    print_status "success" "import('$pkg_name') (ESM) smoke passed"
}

smoke_cli_version() {
    local pkg_name="$1"
    local expected actual
    expected="$(package_version)"
    actual="$(cd "$TMP_DIR" && npx --no-install "$pkg_name" --version)"
    if [ "$actual" != "$expected" ]; then
        print_status "error" "npx $pkg_name --version printed '$actual', expected '$expected'"
        exit 1
    fi
    print_status "success" "npx $pkg_name --version smoke passed"
}

smoke_cli_default_command() {
    local pkg_name="$1"
    local accounts_dir output
    accounts_dir="$(mktemp -d "$TMP_DIR/accounts.XXXXXX")"
    output="$(cd "$TMP_DIR" && TIMEGLASS_ACCOUNTS_DIR="$accounts_dir" npx --no-install "$pkg_name")"
    case "$output" in
        *"No accounts saved"*) ;;
        *)
            print_status "error" "npx $pkg_name printed '$output', expected 'No accounts saved'"
            exit 1
            ;;
    esac
    print_status "success" "npx $pkg_name default command smoke passed"
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
    smoke_cli_version "$pkg_name"
    smoke_cli_default_command "$pkg_name"

    print_status "success" "Package tarball smoke test passed"
}

main

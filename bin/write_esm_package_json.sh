#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

write_esm_marker() {
    local dist_esm="$PROJECT_ROOT/dist/esm"
    mkdir -p "$dist_esm"
    printf '{\n  "type": "module"\n}\n' > "$dist_esm/package.json"
}

main() {
    write_esm_marker
}

main

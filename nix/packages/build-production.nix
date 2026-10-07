{ pkgs }:

# Normal Nix builds are sandboxed with no network access, so their output
# is fully determined by their inputs. pnpm's `install` needs to reach the
# npm registry, so Nix only allows it inside a fixed-output derivation —
# you declare the hash the fetch must produce, and network access is
# granted in exchange for checking that promise (see pnpmDeps in
# game-service.nix/client.nix). That bridge is what lets contributors who
# don't use Nix keep using plain pnpm — but it also means the specified hash
# silently goes stale whenever dependencies change, and Nix's own error for
# that is buried deep in build output. This script exists purely to catch
# that specific failure and explain the fix in plain terms.
#
# WARNING: this is NOT how you would normally write a Nix package. A
# package that shells out to `nix build` on other packages is unusual and
# exists here only as a one-off diagnostic tool — do not copy this file's
# shape as a model.

pkgs.writeShellApplication {
  name = "build-production";

  runtimeInputs = with pkgs; [
    nix
    gnugrep
    coreutils
  ];

  text = ''
    system=$(nix eval --impure --raw --expr 'builtins.currentSystem')

    log=$(mktemp)
    trap 'rm -f "$log"' EXIT

    set +e
    nix build .#production --impure --no-update-lock-file --print-build-logs "$@" 2>&1 | tee "$log"
    build_status=''${PIPESTATUS[0]}
    set -e

    if [ "$build_status" -eq 0 ]; then
      exit 0
    fi

    if ! grep -qE 'ERR_PNPM_NO_OFFLINE_TARBALL|hash mismatch in fixed-output derivation' "$log"; then
      exit "$build_status"
    fi

    affected=()

    check_package() {
      local name=$1

      local specified
      specified=$(nix eval --impure --raw --expr \
        "(builtins.getFlake (toString ./.)).packages.''${system}.''${name}.pnpmDeps.outputHash" 2>/dev/null || true)

      echo "Checking ''${name}'s pnpm dependencies against pnpm-lock.yaml (forces a real fetch, may take a while)..." >&2

      local discover_log
      discover_log=$(mktemp)
      nix build --impure --no-link --print-build-logs --expr "
        let flake = builtins.getFlake (toString ./.);
            drv = flake.packages.''${system}.''${name}.pnpmDeps;
        in drv.overrideAttrs (_: { outputHash = \"\"; outputHashAlgo = \"sha256\"; })
      " 2>&1 | tee "$discover_log" || true

      local got
      got=$(grep -oE 'got:[[:space:]]*sha256-[A-Za-z0-9+/=]+' "$discover_log" | head -n1 | grep -oE 'sha256-[A-Za-z0-9+/=]+')
      rm -f "$discover_log"

      if [ -n "$got" ] && [ "$got" != "$specified" ]; then
        affected+=("$name|$specified|$got")
      fi
    }

    check_package "game-service"
    check_package "client"

    if [ "''${#affected[@]}" -eq 0 ]; then
      echo "A pnpm offline-install failure was detected, but no stale pnpmDeps hash could be confirmed." >&2
      echo "Showing the original build output above." >&2
      exit "$build_status"
    fi

    echo
    echo "════════════════════════════════════════════════════════════════"
    for entry in "''${affected[@]}"; do
      IFS='|' read -r name specified got <<< "$entry"
      echo " pnpm dependency hash mismatch — nix/packages/''${name}.nix"
      echo "════════════════════════════════════════════════════════════════"
      echo "Nix's pinned hash for this package's pnpm dependencies no longer"
      echo "matches pnpm-lock.yaml."
      echo
      echo "  specified: $specified"
      echo "  got:       $got"
      echo
      echo "Update here: nix/packages/''${name}.nix -> pnpmDeps.hash"
      echo
    done
    echo "IMPORTANT: only paste in the new hash if YOU intentionally changed a"
    echo "dependency in this PR. If you didn't, stop — something else changed"
    echo "this lockfile's resolved content, which breaks build reproducibility"
    echo "and may be a supply-chain security issue. Investigate before updating."
    echo "════════════════════════════════════════════════════════════════"

    exit "$build_status"
  '';
}

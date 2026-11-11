#!/usr/bin/env bash
set -euo pipefail

# Runs the TLC checks of specs/tla/checks.tsv and compares each result with
# its recorded expectation. Usage: specs/tla/check.sh [spec ...]
# With no argument it runs every spec of the table.
# The TLC pin is the pin of scripts/contract-closeout-tla.sh.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
pin="$root/scripts/contract-closeout-tla.sh"
TLA_VERSION="$(sed -n 's/^TLA_VERSION=//p' "$pin")"
TLA_SHA256="$(sed -n 's/^TLA_SHA256=//p' "$pin")"
if [[ -z "$TLA_VERSION" || -z "$TLA_SHA256" ]]; then
  echo 'tla_pin_missing scripts/contract-closeout-tla.sh holds no TLA_VERSION or TLA_SHA256' >&2
  exit 2
fi
if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  echo 'tla_java_missing java must run on PATH' >&2
  exit 2
fi
if [[ -z "${TLA2TOOLS_JAR:-}" || ! -f "$TLA2TOOLS_JAR" ]]; then
  echo "tla_jar_missing set TLA2TOOLS_JAR to the v${TLA_VERSION} tla2tools.jar" >&2
  exit 2
fi
actual_sha256="$(shasum -a 256 "$TLA2TOOLS_JAR")"
if [[ "${actual_sha256%% *}" != "$TLA_SHA256" ]]; then
  echo "tla_jar_checksum_mismatch expected v${TLA_VERSION} SHA-256 ${TLA_SHA256}" >&2
  exit 2
fi

scratch="$(mktemp -d "${TMPDIR:-/tmp}/repo-harness-tla.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
failed=0
ran=0

check() {
  local spec="$1" cfg="$2" expect="$3" invariants="$4" note="$5"
  local output="$scratch/$cfg.log" status=0 states found
  local flags=(-workers 1 -cleanup -metadir "$scratch/states-$cfg" -config "$here/$cfg")
  # A finding names every rule that the code breaks, so TLC must not stop at the first one.
  [[ "$expect" == finding ]] && flags+=(-continue)
  java -XX:+UseParallelGC -Xmx1g -cp "$TLA2TOOLS_JAR" tlc2.TLC "${flags[@]}" "$here/$spec.tla" >"$output" 2>&1 || status=$?
  states="$(sed -n 's/.* \([0-9,]*\) distinct states found.*/\1/p' "$output" | tail -1 | tr -d ',')"
  ran=$((ran + 1))
  case "$expect" in
    holds)
      if [[ "$status" -eq 0 ]] && grep -q 'Model checking completed. No error has been found.' "$output"; then
        printf '%s HOLDS distinct_states=%s\n' "$cfg" "$states"
        return
      fi ;;
    breaks)
      found="$(sed -n 's/^Error: Invariant \(.*\) is violated\.$/\1/p' "$output" | head -1)"
      if [[ "$status" -ne 0 && "$found" == "$invariants" ]]; then
        printf '%s BREAKS:%s distinct_states=%s counterexample_length=%s\n' "$cfg" "$found" "$states" "$(grep -c '^State [0-9][0-9]*:' "$output")"
        return
      fi ;;
    finding)
      found="$(sed -n 's/^Error: Invariant \(.*\) is violated\.$/\1/p' "$output" | sort -u | paste -sd, -)"
      if [[ "$found" == "$(tr ',' '\n' <<<"$invariants" | sort -u | paste -sd, -)" ]]; then
        printf '%s FINDING:%s distinct_states=%s (%s)\n' "$cfg" "$found" "$states" "$note"
        return
      fi ;;
    *)
      echo "tla_check_table_invalid:$cfg expect=$expect" >&2
      exit 2 ;;
  esac
  failed=1
  printf 'tla_check_mismatch:%s expected %s %s\n' "$cfg" "$expect" "$invariants" >&2
  tail -40 "$output" >&2
}

while IFS=$'\t' read -r spec cfg expect invariants note; do
  [[ -z "$spec" || "$spec" == \#* ]] && continue
  if [[ "$#" -gt 0 ]]; then
    wanted=0
    for name in "$@"; do [[ "$name" == "$spec" ]] && wanted=1; done
    [[ "$wanted" -eq 1 ]] || continue
  fi
  check "$spec" "$cfg" "$expect" "$invariants" "$note"
done <"$here/checks.tsv"

if [[ "$ran" -eq 0 ]]; then
  echo "tla_check_unknown_spec: $*" >&2
  exit 2
fi
exit "$failed"

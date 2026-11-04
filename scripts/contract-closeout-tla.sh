#!/usr/bin/env bash
set -euo pipefail

# v1.7.4 is the stable Xenophanes release. Its published SHA-1 is
# bee4a54f3ee3d4afc347c3240ec2d9e93b075104. The SHA-256 below is from that jar.
# https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4
TLA_VERSION=1.7.4
TLA_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88

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

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "$root/.closeout-tla.XXXXXX")"
trap 'status=$?; if [[ "$status" -eq 0 ]]; then rm -rf "$scratch"; else printf "tla_artifacts %s\n" "$scratch" >&2; fi' EXIT
spec="$root/specs/tla/ShipCloseoutClaim.tla"

check_config() {
  local cfg="$1" expected="$2" output="$scratch/$1.log" status=0 states length
  java -XX:+UseParallelGC -Xmx1g -cp "$TLA2TOOLS_JAR" tlc2.TLC \
    -workers 1 -cleanup -metadir "$scratch/states" \
    -config "$root/specs/tla/$cfg" "$spec" >"$output" 2>&1 || status=$?

  if [[ -z "$expected" ]]; then
    if [[ "$status" -ne 0 ]] || ! grep -q 'Model checking completed. No error has been found.' "$output"; then
      echo "tla_spec_violated:$cfg" >&2
      cat "$output" >&2
      return 1
    fi
  elif [[ "$status" -eq 0 ]] \
    || [[ "$(sed -n 's/^Error: Invariant \(.*\) is violated\.$/\1/p' "$output")" != "$expected" ]]; then
    echo "tla_fix_off_not_detected:$cfg" >&2
    cat "$output" >&2
    return 1
  fi

  states="$(sed -n 's/.* \([0-9,]*\) distinct states found.*/\1/p' "$output" | tail -1 | tr -d ',')"
  if [[ -z "$states" ]]; then
    if [[ -z "$expected" ]]; then
      echo "tla_spec_violated:$cfg missing distinct state count" >&2
    else
      echo "tla_fix_off_not_detected:$cfg missing distinct state count" >&2
    fi
    cat "$output" >&2
    return 1
  fi
  if [[ -z "$expected" ]]; then
    printf '%s PASS distinct_states=%s\n' "$cfg" "$states"
  else
    length="$(grep -c '^State [0-9][0-9]*:' "$output")"
    printf '%s EXPECTED:%s distinct_states=%s counterexample_length=%s\n' "$cfg" "$expected" "$states" "$length"
  fi
}

check_config ShipCloseoutClaim.cfg ''
check_config ShipCloseoutClaim.no-exclusive-create.cfg SingleOwner
check_config ShipCloseoutClaim.no-remove-by-rename.cfg NoElectionInRetiredDir
check_config ShipCloseoutClaim.no-generation-check.cfg RecoveryActsOnCheckedGeneration

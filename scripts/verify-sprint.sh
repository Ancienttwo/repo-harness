#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then cd "$REPO_HARNESS_TARGET_REPO_ROOT"; fi
BUN_BIN="${REPO_HARNESS_BUN_BIN:-$(command -v bun || true)}"
[[ -n "$BUN_BIN" && -x "$BUN_BIN" && ! -L "$BUN_BIN" ]] || { echo "verify: Bun runtime unavailable" >&2; exit 2; }
base=""
tests=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) [[ -n "${2:-}" ]] || { echo "verify: --base requires a ref" >&2; exit 2; }; base="$2"; shift 2 ;;
    --test) [[ -n "${2:-}" ]] || { echo "verify: --test requires a path" >&2; exit 2; }; tests+=("$2"); shift 2 ;;
    --help|-h)
      echo 'Usage: verify-sprint [--test <affected-test-file>]... | --base <ref>'
      echo 'Explicit local verification runs typecheck and the selected tests once. --base consumes trusted PR checks without rerunning commands.'
      exit 0 ;;
    *) echo "verify: unsupported argument $1; workflow-stage acceptance flags were removed" >&2; exit 2 ;;
  esac
done
if [[ -n "$base" ]]; then
  [[ "${#tests[@]}" -eq 0 ]] || { echo 'verify: choose local execution or provider evidence consumption' >&2; exit 2; }
  exec "$BUN_BIN" "$SCRIPT_DIR/merge-gate.ts" run --base "$base"
fi
# Caller-selected paths are explicit inputs, never inferred from plan/contract labels.
"$BUN_BIN" -e '
const fs=require("fs"),p=require("path");const root=fs.realpathSync(process.cwd());
for(const file of process.argv.slice(1)) {
  if(!/^tests\/.*\.(test|spec)\.[cm]?[jt]sx?$/.test(file)||file.split("/").some(x=>!x||x==="."||x==="..")) throw Error("invalid affected test path: "+file);
  const target=fs.realpathSync(p.resolve(root,file)),rel=p.relative(root,target);
  if(rel.startsWith("..")||p.isAbsolute(rel)||!fs.statSync(target).isFile()) throw Error("affected test escapes repository: "+file);
}
' "${tests[@]}"
"$BUN_BIN" run check:type
if [[ "${#tests[@]}" -gt 0 ]]; then
  # The owning package test script prepares the startup environment before Bun
  # starts. Its `bun` resolves to the trusted runtime that this helper checked.
  PATH="$(dirname "$BUN_BIN"):$PATH" "$BUN_BIN" run test -- "${tests[@]}" --timeout 60000 --max-concurrency 1
else
  echo '[verify] typecheck completed; no affected tests were selected or claimed.'
fi

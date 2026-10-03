#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The campaign task-domain consumer admits explicit input data before acquiring
# a writer. This read-only protocol does not grant ordinary PR-stage permission.
if [[ $# -eq 3 && "$1" == "--contract" && "$3" == "--preflight" ]]; then
  [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]] && cd "$REPO_HARNESS_TARGET_REPO_ROOT"
  BUN_BIN="${REPO_HARNESS_BUN_BIN:-$(command -v bun || true)}"
  [[ -n "$BUN_BIN" && -x "$BUN_BIN" && ! -L "$BUN_BIN" ]] || { echo 'contract preflight: trusted Bun runtime unavailable' >&2; exit 2; }
  contract_path="$("$BUN_BIN" -e '
const fs=require("fs"),p=require("path"),{pathToFileURL}=require("url");
const root=fs.realpathSync(process.cwd());
const {markdownHeader,parseAllowedPaths}=await import(pathToFileURL(p.join(process.argv[1],"..","src","core","state","artifact-parsers.ts")).href);
const checkedPath=(file)=>{
  const absolute=p.resolve(root,file);
  if(fs.lstatSync(absolute).isSymbolicLink()||!fs.statSync(absolute).isFile())throw Error("input must be a regular file");
  const rel=p.relative(root,fs.realpathSync(absolute));
  if(!rel||rel===".."||rel.startsWith(".."+p.sep)||p.isAbsolute(rel)||rel.startsWith("_ops/")||rel.startsWith("_ref/"))throw Error("input escapes task-data boundary");
  return rel;
};
const contract=checkedPath(process.argv[2]),text=fs.readFileSync(p.resolve(root,contract),"utf8");
const profile=markdownHeader(text,"Task Profile");
if(!["code-change","docs-only","ledger-closeout","migration","eval-only","delegated-run","bugfix","frontend"].includes(profile))throw Error("unsupported or missing Task Profile");
const paths=parseAllowedPaths(text);if(!paths.length)throw Error("Allowed Paths is empty");
for(const path of paths){
  const normalized=path.replaceAll("\\","/");
  if(path.includes("\0")||p.posix.isAbsolute(path)||p.win32.parse(path).root||normalized.split("/").includes("..")||/^_(ops|ref)(\/|$)/.test(normalized))throw Error("unsafe Allowed Path");
  if(profile==="docs-only"&&/^(src|tests)(\/|$)/.test(normalized))throw Error("docs-only cannot grant source/test writes");
  if(profile==="ledger-closeout"&&/^(src|tests|assets\/hooks|\.ai\/hooks)(\/|$)/.test(normalized))throw Error("ledger-closeout cannot grant runtime writes");
  if(profile==="eval-only"&&/^src(\/|$)/.test(normalized))throw Error("eval-only cannot grant source writes");
}
const review=markdownHeader(text,"Review File");if(!review)throw Error("Review File input is missing");checkedPath(review.replace(/^`|`$/g,""));
process.stdout.write(contract);
' "$SCRIPT_DIR" "$2")"
  "$BUN_BIN" "$SCRIPT_DIR/verification-plan.ts" validate --repo "$(pwd -P)" --contract "$contract_path"
  echo '[ContractPreflight] task input metadata validated; no tests, Status writes, or acceptance receipt produced.'
  exit 0
fi
# Explicit verification shares one execution owner; contracts never grant permission.
exec bash "$SCRIPT_DIR/verify-sprint.sh" "$@"

#!/bin/bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) echo 'Usage: check-task-workflow (read-only diagnostics)'; exit 0 ;;
    *) echo "[workflow] unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
runtime="$(command -v bun || command -v node || true)"
if [[ -z "$runtime" ]]; then echo '[workflow] JSON diagnostics unavailable: no runtime'; exit 0; fi
"$runtime" -e '
const fs=require("fs");let issues=0;
for(const file of [".ai/harness/policy.json",".ai/harness/workflow-contract.json"]){
  try {const value=JSON.parse(fs.readFileSync(file,"utf8"));if(!value||typeof value!=="object"||Array.isArray(value))throw Error("object required");}
  catch(error){issues++;console.log("[workflow] observation: "+file+": unreadable or malformed JSON (content withheld)");}
}
const marker=".ai/harness/active-plan";
if(fs.existsSync(marker)){
  const plan=fs.readFileSync(marker,"utf8").trim();
  if(plan)console.log("[workflow] historical plan marker: "+JSON.stringify(plan)+"; no stage artifacts are required.");
}
console.log("[workflow] diagnostic issues="+issues+"; this observation does not grant or block edits, Stop, or PR preparation.");
' || echo '[workflow] diagnostics unavailable; no workflow permission was inferred.'
exit 0

#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-task-sync.sh [--validate-waivers-only]

REPO_HARNESS_DIFF_BASE selects the committed comparison boundary. Set
REPO_HARNESS_DIFF_MODE=merge-base for pull requests and direct for push-parent
comparisons. Without a base, the check evaluates the staged/working-tree diff.
USAGE_EOF
}

validate_waivers_only=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate-waivers-only) validate_waivers_only=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[task-sync] Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[task-sync] Not a git repository; skipping task-sync check."
  exit 0
fi

json_runtime() {
  if command -v node >/dev/null 2>&1; then printf 'node'; return 0; fi
  if command -v bun >/dev/null 2>&1; then printf 'bun'; return 0; fi
  return 1
}

waiver_files=()
if [[ -d tasks/waivers ]]; then
  while IFS= read -r file; do
    [[ -n "$file" ]] && waiver_files+=("$file")
  done < <(find tasks/waivers -type f -name '*.json' | LC_ALL=C sort)
fi

# One validator owns both the strict workflow scan and the diff-bound admission
# check. A waiver is data, not prose: malformed, expired, unscoped or unbound
# records fail closed.
validate_waivers() {
  local expected_digest="$1"
  local schema_only="$2"
  shift 2
  local substantive=()
  while [[ $# -gt 0 && "$1" != "--waivers" ]]; do substantive+=("$1"); shift; done
  [[ $# -gt 0 ]] && shift
  local waivers=("$@")
  [[ "${#waivers[@]}" -gt 0 ]] || return 1

  local runtime
  runtime="$(json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[task-sync] Cannot validate machine-readable waivers: node or bun is required." >&2
    return 2
  fi

  "$runtime" -e '
const fs = require("fs");
const args = process.argv.slice(1);
const expected = args.shift();
const schemaOnly = args.shift() === "1";
const separator = args.indexOf("--waivers");
const substantive = args.slice(0, separator);
const waivers = args.slice(separator + 1);
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const glob = (pattern, value) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`, "u").test(value);
};
const displayPath = (value) => /^[A-Za-z0-9._/@+=:-]+$/u.test(value) ? value : JSON.stringify(value);
let admitted = false;
let invalid = false;
for (const file of waivers) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { console.error(`[task-sync] Invalid waiver ${file}: unreadable JSON`); invalid = true; continue; }
  const errors = [];
  if (value?.protocol !== 1) errors.push("protocol must equal 1");
  if (value?.kind !== "repo-harness-substantive-change-waiver") errors.push("kind is invalid");
  if (!digestPattern.test(value?.substantive_change_sha256 ?? "")) errors.push("substantive_change_sha256 is invalid");
  if (typeof value?.reason !== "string" || value.reason.trim() === "") errors.push("reason is required");
  if (typeof value?.owner !== "string" || value.owner.trim() === "") errors.push("owner is required");
  if (!Array.isArray(value?.scope) || value.scope.length === 0 || value.scope.some((entry) => typeof entry !== "string" || entry.length === 0)) errors.push("scope must be a non-empty string array");
  const hasRevisit = typeof value?.revisit_trigger === "string" && value.revisit_trigger.trim() !== "";
  const expiresAt = typeof value?.expires_at === "string" ? Date.parse(value.expires_at) : NaN;
  if (!hasRevisit && !Number.isFinite(expiresAt)) errors.push("expires_at or revisit_trigger is required");
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) errors.push("expires_at is not in the future");
  if (errors.length > 0) {
    console.error(`[task-sync] Invalid waiver ${file}: ${errors.join("; ")}`);
    invalid = true;
    continue;
  }
  if (schemaOnly) continue;
  if (value.substantive_change_sha256 !== expected) continue;
  const uncovered = substantive.filter((path) => !value.scope.some((pattern) => glob(pattern, path)));
  if (uncovered.length > 0) {
    console.error(`[task-sync] Waiver ${file} does not cover: ${uncovered.map(displayPath).join(", ")}`);
    invalid = true;
    continue;
  }
  admitted = true;
}
if (invalid) process.exit(2);
if (!schemaOnly && !admitted) process.exit(1);
' "$expected_digest" "$schema_only" "${substantive[@]}" --waivers "${waivers[@]}"
}

if [[ "$validate_waivers_only" -eq 1 ]]; then
  if [[ "${#waiver_files[@]}" -eq 0 ]]; then
    echo "[task-sync] No substantive-change waivers present."
    exit 0
  fi
  validate_waivers "sha256:$(printf '0%.0s' {1..64})" 1 --waivers "${waiver_files[@]}"
  echo "[task-sync] Machine-readable substantive-change waivers are valid."
  exit 0
fi

diff_base="${REPO_HARNESS_DIFF_BASE:-}"
diff_mode="${REPO_HARNESS_DIFF_MODE:-direct}"
effective_base="$(git rev-parse --verify HEAD^{commit})"

if [[ -n "$diff_base" ]]; then
  if ! git rev-parse --verify "${diff_base}^{commit}" >/dev/null 2>&1; then
    echo "[task-sync] Diff base is not a commit: $diff_base" >&2
    exit 1
  fi
  effective_base="$diff_base"
  if [[ "$diff_mode" == "merge-base" ]]; then
    effective_base="$(git merge-base HEAD "$diff_base" 2>/dev/null || true)"
    if [[ -z "$effective_base" ]]; then
      echo "[task-sync] No merge base between HEAD and $diff_base" >&2
      exit 1
    fi
  elif [[ "$diff_mode" != "direct" ]]; then
    echo "[task-sync] REPO_HARNESS_DIFF_MODE must be merge-base or direct" >&2
    exit 1
  fi
fi
effective_base="$(git rev-parse --verify "${effective_base}^{commit}")"

identity_dir="$(mktemp -d "${TMPDIR:-/tmp}/repo-harness-task-sync.XXXXXX")"
cleanup_identity_dir() {
  local status=$?
  rm -rf -- "$identity_dir"
  return "$status"
}
trap cleanup_identity_dir EXIT

git diff --name-only -z --diff-filter=ACMRD "$effective_base" HEAD -- > "$identity_dir/changed-base-head.paths"
git diff --cached --name-only -z --diff-filter=ACMRD -- > "$identity_dir/changed-index.paths"
git diff --name-only -z --diff-filter=ACMRD -- > "$identity_dir/changed-working.paths"
git ls-files --others --exclude-standard -z > "$identity_dir/changed-untracked.paths"

changed_files=()
append_changed_paths() {
  local source="$1"
  local file known duplicate
  while IFS= read -r -d '' file; do
    duplicate=0
    for known in "${changed_files[@]-}"; do
      if [[ "$known" == "$file" ]]; then
        duplicate=1
        break
      fi
    done
    [[ "$duplicate" -eq 1 ]] || changed_files+=("$file")
  done < "$source"
}
append_changed_paths "$identity_dir/changed-base-head.paths"
append_changed_paths "$identity_dir/changed-index.paths"
append_changed_paths "$identity_dir/changed-working.paths"
append_changed_paths "$identity_dir/changed-untracked.paths"

if [[ "${#changed_files[@]}" -eq 0 ]]; then
  echo "[task-sync] No changes detected."
  exit 0
fi

substantive_files=()
evidence_files=()
for file in "${changed_files[@]}"; do
  case "$file" in
    docs/architecture/.projection-manifest.json|evals/harness/reports/profile-comparison.json|evals/harness/reports/profile-comparison.md)
      ;;
    docs/architecture/*|docs/PROGRESS.md)
      substantive_files+=("$file")
      ;;
    docs/*|README.md|AGENTS.md|CLAUDE.md|plans/archive/*|tasks/current.md|tasks/todos.md|tasks/lessons.md|tasks/archive/*)
      ;;
    plans/plan-*.md|plans/sprints/*.md|tasks/contracts/*.contract.md|tasks/reviews/*.review.md|tasks/notes/*.notes.md|tasks/workstreams/*.md|tasks/workstreams/**/*.md)
      evidence_files+=("$file")
      ;;
    tasks/waivers/*.json)
      ;;
    *)
      substantive_files+=("$file")
      ;;
  esac
done

if [[ "${#substantive_files[@]}" -eq 0 ]]; then
  echo "[task-sync] No substantive repo changes detected."
  exit 0
fi

runtime="$(json_runtime || true)"
if [[ -z "$runtime" ]]; then
  echo "[task-sync] Cannot compute substantive change identity: node or bun is required." >&2
  exit 1
fi

# Flattening separate staged and working states for the same path would erase
# the staged preimage. Reject that ambiguity; changes on different paths are
# safely represented by one virtual final tree.
git diff --cached --name-only -z --diff-filter=ACMRD -- "${substantive_files[@]}" > "$identity_dir/staged-substantive.paths"
git diff --name-only -z --diff-filter=ACMRD -- "${substantive_files[@]}" > "$identity_dir/working-substantive.paths"
if ! "$runtime" -e '
const fs = require("fs");
const [stagedPath, workingPath] = process.argv.slice(1);
const records = (path) => {
  const bytes = fs.readFileSync(path);
  const values = [];
  for (let offset = 0; offset < bytes.byteLength;) {
    const terminator = bytes.indexOf(0, offset);
    if (terminator < 0) throw new Error("unterminated NUL path record");
    values.push(bytes.subarray(offset, terminator));
    offset = terminator + 1;
  }
  return values;
};
const staged = new Map(records(stagedPath).map((path) => [path.toString("hex"), path]));
const overlap = records(workingPath)
  .filter((path) => staged.has(path.toString("hex")))
  .map((path) => staged.get(path.toString("hex")))
  .sort(Buffer.compare);
if (overlap.length > 0) {
  console.error("[task-sync] Cannot form stable diff identity: substantive paths have staged and working-tree divergence:");
  for (const path of overlap) console.error(`  - ${JSON.stringify(path.toString("utf8"))}`);
  process.exit(1);
}
' "$identity_dir/staged-substantive.paths" "$identity_dir/working-substantive.paths"; then
  exit 1
fi

# Project the complete worktree into a temporary index seeded from HEAD, then
# restrict the canonical raw diff to substantive paths. Updating the whole
# temporary index avoids passing a base-only deleted path to git add while the
# path filter below keeps workflow artifacts out of the identity.
identity_index="$identity_dir/index"
GIT_INDEX_FILE="$identity_index" git read-tree HEAD
GIT_INDEX_FILE="$identity_index" git add -A -- .
virtual_tree="$(GIT_INDEX_FILE="$identity_index" git write-tree)"
git diff --raw --no-abbrev --no-renames -z "$effective_base" "$virtual_tree" -- "${substantive_files[@]}" > "$identity_dir/base-virtual.raw"

substantive_digest="$($runtime -e '
const fs = require("fs");
const crypto = require("crypto");
const [baseSha, rawDiffPath] = process.argv.slice(1);
const hash = crypto.createHash("sha256");
const writeField = (value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  hash.update(Buffer.from(`${bytes.byteLength}:`, "utf8"));
  hash.update(bytes);
};
// The raw v3 record is a canonical sequence of mode, preimage OID,
// postimage OID, name-status and NUL-delimited path fields. A deletion has a
// zero postimage OID, so it cannot collapse into an absent-path sentinel.
writeField("repo-harness-substantive-diff-identity/v3");
writeField("resolved-base-sha"); writeField(baseSha);
writeField("base-to-virtual-tree-raw-diff"); writeField(fs.readFileSync(rawDiffPath));
process.stdout.write(`sha256:${hash.digest("hex")}`);
' "$effective_base" "$identity_dir/base-virtual.raw")"

if [[ "${#evidence_files[@]}" -gt 0 ]]; then
  for file in "${evidence_files[@]}"; do
    if [[ -f "$file" ]] && grep -Fqx "> **Substantive Change SHA256**: \`$substantive_digest\`" "$file"; then
      echo "[task-sync] Bound canonical workflow evidence: $file ($substantive_digest)."
      exit 0
    fi
  done
fi

if [[ "${#waiver_files[@]}" -gt 0 ]]; then
  set +e
  validate_waivers "$substantive_digest" 0 "${substantive_files[@]}" --waivers "${waiver_files[@]}"
  waiver_status=$?
  set -e
  if [[ "$waiver_status" -eq 0 ]]; then
    echo "[task-sync] Bound machine-readable waiver admitted ($substantive_digest)."
    exit 0
  fi
  if [[ "$waiver_status" -eq 2 ]]; then exit 1; fi
fi

echo "[task-sync] Substantive diff lacks canonical workflow evidence bound to $substantive_digest."
if [[ -n "${REPO_HARNESS_DIFF_BASE:-}" ]]; then
  echo "[task-sync] Diff range: ${REPO_HARNESS_DIFF_MODE:-direct}:${REPO_HARNESS_DIFF_BASE}..HEAD plus working tree."
else
  echo "[task-sync] Diff range: staged and working tree."
fi
printf '[task-sync] Substantive paths:\n'
for file in "${substantive_files[@]}"; do
  printf '  - %q\n' "$file"
done
echo "[task-sync] Add the exact line below to a changed canonical plan/contract/review/workstream/notes artifact:"
echo "[task-sync] > **Substantive Change SHA256**: \`$substantive_digest\`"
echo "[task-sync] Or add tasks/waivers/*.json with protocol, kind, this digest, reason, owner, scope, and expiry/revisit_trigger."
exit 1

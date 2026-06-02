#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/sync-brain-docs.sh [--manifest PATH] (--all | --changed PATH | --check) [--dry-run] [--require-vault]

Synchronizes explicitly opted-in repo docs to the local default brain file vault.
Only manifest entries with sync.direction=repo-to-brain are eligible.
USAGE_EOF
}

manifest_path=".ai/harness/brain-manifest.json"
mode_all=0
mode_check=0
dry_run=0
require_vault=0
changed_paths=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      manifest_path="${2:-}"
      shift 2
      ;;
    --all)
      mode_all=1
      shift
      ;;
    --changed)
      changed_paths+=("${2:-}")
      shift 2
      ;;
    --check)
      mode_check=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --require-vault)
      require_vault=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "sync-brain-docs: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

resolve_js_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  return 1
}

runtime="$(resolve_js_runtime || true)"
if [[ -z "$runtime" ]]; then
  echo "[BrainSync] Missing node or bun to read brain manifest: $manifest_path" >&2
  exit 1
fi

if [[ "$mode_all" -eq 0 && "$mode_check" -eq 0 && "${#changed_paths[@]}" -eq 0 ]]; then
  echo "sync-brain-docs: choose --all, --changed PATH, or --check" >&2
  usage >&2
  exit 2
fi

changed_json='[]'
if [[ "${#changed_paths[@]}" -gt 0 ]]; then
  changed_json="$(
    "$runtime" -e '
const values = process.argv.slice(1);
process.stdout.write(JSON.stringify(values));
' "${changed_paths[@]}"
  )"
fi

"$runtime" - "$manifest_path" "$mode_all" "$mode_check" "$dry_run" "$require_vault" "$changed_json" <<'JS_EOF'
const fs = require("fs");
const path = require("path");
const os = require("os");

const [, , manifestArg, allArg, checkArg, dryRunArg, requireVaultArg, changedJson] = process.argv;
const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, manifestArg || ".ai/harness/brain-manifest.json");
const modeAll = allArg === "1";
const modeCheck = checkArg === "1";
const dryRun = dryRunArg === "1";
const requireVault = requireVaultArg === "1";
const changedPaths = JSON.parse(changedJson || "[]").map(normalizeRepoPathInput).filter(Boolean);
let issues = 0;
let synced = 0;
let skipped = 0;

function issue(message) {
  console.log(`[BrainSync] ${message}`);
  issues += 1;
}

function warn(message) {
  console.log(`[BrainSync] warning: ${message}`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    issue(`Cannot read ${label}: ${path.relative(repoRoot, filePath) || filePath}`);
    return null;
  }
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll(path.sep, "/");
}

function normalizeRepoPathInput(value) {
  if (!value) return "";
  const raw = String(value);
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  const rel = path.relative(repoRoot, absolute);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return "";
  }
  return normalizeSlashes(rel);
}

function safeRepoPath(value, label, id) {
  const raw = String(value || "");
  if (!raw || raw.includes("\n") || raw.includes("\r") || path.isAbsolute(raw)) {
    issue(`Entry ${id} has invalid ${label}: ${raw || "(empty)"}`);
    return null;
  }
  const normalized = path.normalize(raw);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    issue(`Entry ${id} ${label} escapes repo: ${raw}`);
    return null;
  }
  return normalizeSlashes(normalized);
}

function stripWildcard(logicalPath) {
  return String(logicalPath || "").replace(/\/\*$/, "/");
}

const brainRoot = process.env.REPO_HARNESS_BRAIN_ROOT ||
  path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "brain");

function logicalToLocal(logicalPath, id) {
  const value = String(logicalPath || "");
  if (!value.startsWith("brain/")) {
    issue(`Entry ${id} brain_path must start with brain/: ${value || "(empty)"}`);
    return null;
  }
  const rel = value.slice("brain/".length);
  if (!rel || rel.includes("\n") || rel.includes("\r")) {
    issue(`Entry ${id} has invalid brain_path: ${value || "(empty)"}`);
    return null;
  }
  const local = path.resolve(brainRoot, rel);
  const root = path.resolve(brainRoot);
  if (local !== root && !local.startsWith(`${root}${path.sep}`)) {
    issue(`Entry ${id} brain_path escapes brain root: ${value}`);
    return null;
  }
  return local;
}

function syncConfig(entry) {
  const sync = entry.sync && typeof entry.sync === "object" ? entry.sync : {};
  const direction = sync.direction || entry.sync_direction || "";
  if (direction !== "repo-to-brain") return null;
  if (sync.enabled === false || entry.sync_enabled === false) return null;
  const id = entry.id || "(missing id)";
  return {
    id,
    sourcePath: sync.source_path || entry.source_path || entry.repo_path,
    brainPath: sync.brain_path || entry.brain_path,
  };
}

if (!fs.existsSync(manifestPath)) {
  issue(`Missing brain manifest: ${path.relative(repoRoot, manifestPath) || manifestPath}`);
  process.exit(1);
}

const manifest = readJson(manifestPath, "brain manifest");
if (!manifest) process.exit(1);

const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const defaultPrefix = stripWildcard(manifest.default_brain_path);
const eligible = [];

for (const entry of entries) {
  const config = syncConfig(entry);
  if (!config) continue;
  const sourcePath = safeRepoPath(config.sourcePath, "sync source_path", config.id);
  const brainPath = String(config.brainPath || "");
  if (brainPath && defaultPrefix && !brainPath.startsWith(defaultPrefix)) {
    issue(`Entry ${config.id} brain_path is outside default_brain_path: ${brainPath}`);
  }
  const targetPath = logicalToLocal(brainPath, config.id);
  if (!sourcePath || !targetPath) continue;
  eligible.push({ id: config.id, sourcePath, sourceFile: path.resolve(repoRoot, sourcePath), brainPath, targetPath });
}

const selected = eligible.filter((entry) => {
  if (modeAll || modeCheck) return true;
  return changedPaths.includes(entry.sourcePath);
});

if (selected.length > 0 && !modeCheck && !fs.existsSync(brainRoot)) {
  issue(`vault root unavailable: ${brainRoot}`);
}

if (selected.length > 0 && modeCheck && !fs.existsSync(brainRoot)) {
  const message = `vault root unavailable; skipped sync drift checks: ${brainRoot}`;
  if (requireVault) issue(message);
  else warn(message);
}

for (const entry of selected) {
  if (!fs.existsSync(entry.sourceFile)) {
    issue(`Entry ${entry.id} source file is missing: ${entry.sourcePath}`);
    continue;
  }

  if (!fs.existsSync(brainRoot)) {
    skipped += 1;
    continue;
  }

  let sourceContent;
  try {
    sourceContent = fs.readFileSync(entry.sourceFile, "utf8");
  } catch (error) {
    const code = error && error.code ? ` (${error.code})` : "";
    issue(`Entry ${entry.id} source file is unreadable: ${entry.sourcePath}${code}`);
    continue;
  }

  const targetExists = fs.existsSync(entry.targetPath);
  let targetContent = null;
  if (targetExists) {
    try {
      targetContent = fs.readFileSync(entry.targetPath, "utf8");
    } catch (error) {
      const code = error && error.code ? ` (${error.code})` : "";
      const message = `Entry ${entry.id} brain file is unreadable: ${entry.brainPath}${code}`;
      if (modeCheck && !requireVault) {
        warn(`${message}; skipped sync drift check`);
        skipped += 1;
        continue;
      }
      issue(message);
      continue;
    }
  }

  if (modeCheck) {
    if (!targetExists) {
      issue(`Entry ${entry.id} brain file is missing: ${entry.brainPath}`);
    } else if (targetContent !== sourceContent) {
      issue(`Entry ${entry.id} brain file differs from source: ${entry.sourcePath} -> ${entry.brainPath}`);
    }
    continue;
  }

  if (targetExists && targetContent === sourceContent) {
    skipped += 1;
    continue;
  }

  if (dryRun) {
    console.log(`[BrainSync] would sync ${entry.sourcePath} -> ${entry.brainPath}`);
    synced += 1;
    continue;
  }

  fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
  fs.writeFileSync(entry.targetPath, sourceContent);
  console.log(`[BrainSync] synced ${entry.sourcePath} -> ${entry.brainPath}`);
  synced += 1;
}

if (issues > 0) process.exit(1);

if (selected.length === 0 && (modeAll || modeCheck)) {
  console.log("[BrainSync] no repo-to-brain entries");
} else if (synced === 0 && selected.length > 0 && !modeCheck) {
  console.log(`[BrainSync] up to date (${skipped} checked)`);
} else if (modeCheck && selected.length > 0) {
  console.log("[BrainSync] OK");
}
JS_EOF

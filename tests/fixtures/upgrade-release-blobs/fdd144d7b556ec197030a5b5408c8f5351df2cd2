#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-brain-manifest.sh [--manifest PATH] [--require-vault]

Validates the repo-local external knowledge manifest and, when the configured
iCloud brain vault is available locally, checks that referenced vault files exist.
USAGE_EOF
}

manifest_path=".ai/harness/brain-manifest.json"
require_vault=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      manifest_path="${2:-}"
      shift 2
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
      echo "Unknown argument: $1" >&2
      usage
      exit 1
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
  echo "[brain] Missing node or bun to read brain manifest: $manifest_path"
  exit 1
fi

"$runtime" - "$manifest_path" "$require_vault" <<'JS_EOF'
const fs = require("fs");
const path = require("path");
const os = require("os");

const [, , manifestArg, requireVaultArg] = process.argv;
const requireVault = requireVaultArg === "1";
const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, manifestArg || ".ai/harness/brain-manifest.json");
const policyPath = path.resolve(repoRoot, ".ai/harness/policy.json");
let issues = 0;

function issue(message) {
  console.log(`[brain] ${message}`);
  issues += 1;
}

function warn(message) {
  console.log(`[brain] warning: ${message}`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issue(`Cannot read ${label}: ${path.relative(repoRoot, filePath) || filePath}`);
    return null;
  }
}

function stripWildcard(logicalPath) {
  return String(logicalPath || "").replace(/\/\*$/, "/");
}

const defaultBrainRoot = process.env.REPO_HARNESS_BRAIN_ROOT ||
  path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "brain");

function logicalToLocal(logicalPath) {
  const value = String(logicalPath || "");
  if (value.startsWith("brain/")) {
    return path.join(defaultBrainRoot, value.slice("brain/".length));
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(repoRoot, value);
}

function normalizeRel(filePath) {
  return path.relative(repoRoot, path.resolve(repoRoot, filePath)).replaceAll(path.sep, "/");
}

function fileExistsWithSelfHostFallback(relPath) {
  if (!relPath) return false;
  if (relPath.startsWith("repo-harness run ")) return true;
  if (fs.existsSync(path.resolve(repoRoot, relPath))) return true;
  return false;
}

function hasDuplicate(values) {
  return values.some((value, index) => value && values.indexOf(value) !== index);
}

if (!fs.existsSync(manifestPath)) {
  issue(`Missing brain manifest: ${normalizeRel(manifestPath)}`);
  process.exit(1);
}

const manifest = readJson(manifestPath, "brain manifest");
const policy = fs.existsSync(policyPath) ? readJson(policyPath, "harness policy") : null;

if (!manifest) {
  process.exit(1);
}

const manifestRel = normalizeRel(manifestPath);
const externalKnowledge = policy?.information_lifecycle?.external_knowledge || {};
const policyManifest = externalKnowledge.manifest_file;
const policyProjectPath = externalKnowledge.project_path;
const policySyncScript = externalKnowledge.sync_script;

if (policyManifest && policyManifest !== manifestRel) {
  issue(`Policy external_knowledge.manifest_file points to ${policyManifest}, expected ${manifestRel}`);
}
if (policySyncScript && !fileExistsWithSelfHostFallback(policySyncScript)) {
  issue(`Policy external_knowledge.sync_script is missing: ${policySyncScript}`);
}

if (!manifest.version) {
  issue("Brain manifest is missing version");
}
if (!manifest.project) {
  issue("Brain manifest is missing project");
}
if (!manifest.default_brain_path) {
  issue("Brain manifest is missing default_brain_path");
}
if (policyProjectPath && manifest.default_brain_path && policyProjectPath !== manifest.default_brain_path) {
  issue(`Policy project_path ${policyProjectPath} does not match manifest default_brain_path ${manifest.default_brain_path}`);
}
if (!Array.isArray(manifest.entries)) {
  issue("Brain manifest entries must be an array");
}

const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const ids = entries.map((entry) => entry.id);
const repoPaths = entries.map((entry) => entry.repo_path);
const brainPaths = entries.map((entry) => entry.brain_path);

if (hasDuplicate(ids)) issue("Brain manifest contains duplicate entry ids");
if (hasDuplicate(repoPaths)) issue("Brain manifest contains duplicate repo_path values");
if (hasDuplicate(brainPaths)) issue("Brain manifest contains duplicate brain_path values");

const defaultPrefix = stripWildcard(manifest.default_brain_path);
const localVaultRoot = logicalToLocal(defaultPrefix);
const shouldCheckVault = requireVault || fs.existsSync(localVaultRoot);
if (entries.length > 0 && !shouldCheckVault) {
  warn(`vault root unavailable; skipped external file existence checks: ${localVaultRoot}`);
}

for (const entry of entries) {
  const id = entry.id || "(missing id)";
  const repoPath = entry.repo_path;
  const assetPath = entry.asset_path;
  const brainPath = entry.brain_path;
  const maxRepoLines = Number(entry.max_repo_lines || 0);
  const syncDirection = entry.sync?.direction || entry.sync_direction || "";
  const isRepoToBrainSync = syncDirection === "repo-to-brain";

  if (!entry.id) issue("Entry is missing id");
  if (!repoPath) issue(`Entry ${id} is missing repo_path`);
  if (!brainPath) issue(`Entry ${id} is missing brain_path`);
  if (syncDirection && syncDirection !== "repo-to-brain") {
    issue(`Entry ${id} has unsupported sync.direction: ${syncDirection}`);
  }

  if (brainPath && defaultPrefix && !String(brainPath).startsWith(defaultPrefix)) {
    issue(`Entry ${id} brain_path is outside default_brain_path: ${brainPath}`);
  }

  if (repoPath) {
    const repoFile = path.resolve(repoRoot, repoPath);
    if (!fs.existsSync(repoFile)) {
      issue(`Entry ${id} repo_path is missing: ${repoPath}`);
    } else {
      const content = fs.readFileSync(repoFile, "utf8");
      if (!isRepoToBrainSync && brainPath && !content.includes(brainPath)) {
        issue(`Entry ${id} repo stub does not mention brain_path: ${repoPath}`);
      }
      if (maxRepoLines > 0) {
        const lineCount = content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
        if (lineCount > maxRepoLines) {
          issue(`Entry ${id} repo stub has ${lineCount} lines, max ${maxRepoLines}: ${repoPath}`);
        }
      }
    }
  }

  if (repoPath && assetPath) {
    const repoFile = path.resolve(repoRoot, repoPath);
    const assetFile = path.resolve(repoRoot, assetPath);
    if (!fs.existsSync(assetFile)) {
      issue(`Entry ${id} asset_path is missing: ${assetPath}`);
    } else if (fs.existsSync(repoFile)) {
      const repoContent = fs.readFileSync(repoFile, "utf8");
      const assetContent = fs.readFileSync(assetFile, "utf8");
      if (repoContent !== assetContent) {
        issue(`Entry ${id} repo_path and asset_path differ: ${repoPath} != ${assetPath}`);
      }
    }
  }

  if (brainPath && shouldCheckVault) {
    const localBrainFile = logicalToLocal(brainPath);
    if (!fs.existsSync(localBrainFile)) {
      issue(`Entry ${id} brain file is missing: ${brainPath}`);
    }
  }
}

if (issues === 0) {
  console.log("[brain] OK");
  process.exit(0);
}

process.exit(1);
JS_EOF

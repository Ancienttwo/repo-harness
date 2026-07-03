#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PACK_JSON="$TMP_DIR/pack.json"
npm pack --json --pack-destination "$TMP_DIR" >"$PACK_JSON"
TARBALL="$(bun - "$PACK_JSON" <<'JS_EOF'
const [, , path] = process.argv;
const pack = await Bun.file(path).json();
const entry = Array.isArray(pack) ? pack[0] : pack;
console.log(entry.filename);
JS_EOF
)"
TARBALL_PATH="$TMP_DIR/$TARBALL"
APP_DIR="$TMP_DIR/app"
TARGET_REPO="$TMP_DIR/target-repo"

bun - "$PACK_JSON" <<'JS_EOF'
const [, , path] = process.argv;
const pack = await Bun.file(path).json();
const entry = Array.isArray(pack) ? pack[0] : pack;
const files = new Set((entry.files ?? []).map((file) => file.path));
const required = [
  "assets/hooks/prompt-guard.sh",
  "assets/hooks/run-hook.sh",
  "assets/hooks/lib/workflow-state.sh",
  "assets/hooks/projection.json",
  "assets/hooks/codex.hooks.template.json",
  "assets/hooks/settings.template.json",
];
const missing = required.filter((file) => !files.has(file));
const aiHooks = [...files].filter((file) => file.startsWith(".ai/hooks/"));
if (missing.length > 0 || aiHooks.length > 0) {
  if (missing.length > 0) {
    console.error(`[tarball-smoke] ERROR: package is missing hook assets: ${missing.join(", ")}`);
  }
  if (aiHooks.length > 0) {
    console.error(`[tarball-smoke] ERROR: package should not depend on .ai/hooks assets: ${aiHooks.join(", ")}`);
  }
  process.exit(1);
}
JS_EOF

mkdir -p "$APP_DIR" "$TARGET_REPO"
git -C "$TARGET_REPO" init -q

cd "$APP_DIR"
bun init -y >/dev/null
bun add "$TARBALL_PATH" >/dev/null

CLI="$APP_DIR/node_modules/.bin/repo-harness"
HOOK="$APP_DIR/node_modules/.bin/repo-harness-hook"

VERSION="$("$CLI" --version)"
if [[ "$VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "[tarball-smoke] ERROR: repo-harness --version returned $VERSION, expected $PACKAGE_VERSION" >&2
  exit 1
fi

(cd "$TARGET_REPO" && "$CLI" status --json >/dev/null)
"$CLI" adopt --repo "$TARGET_REPO" --dry-run --json >"$TMP_DIR/adopt-plan.json"
bun - "$TMP_DIR/adopt-plan.json" <<'JS_EOF'
const [, , path] = process.argv;
const plan = await Bun.file(path).json();
if (plan.protocol !== 1 || plan.command !== "adopt" || plan.apply !== false) {
  console.error("[tarball-smoke] ERROR: packaged adopt dry-run did not return protocol v1 plan JSON");
  process.exit(1);
}
JS_EOF

if ! "$CLI" run check-task-workflow --help >/dev/null; then
  echo "[tarball-smoke] ERROR: packaged 'repo-harness run check-task-workflow --help' failed (run dispatcher / helper lookup / bin startup broken)" >&2
  exit 1
fi

mkdir -p "$TARGET_REPO/plans/sprints" "$TARGET_REPO/.ai/harness/sprint"
cat > "$TARGET_REPO/plans/sprints/20991231-2359-tarball-root.sprint.md" <<'SPRINT_EOF'
# Sprint: Tarball Root

> **Status**: Approved

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [ ] | task-a | inline | packaged helper reads target repo | (pending) |
| 2 | [ ] | task-b | inline | packaged helper reads target repo | (pending) |
| 3 | [ ] | task-c | inline | packaged helper reads target repo | (pending) |
| 4 | [ ] | task-d | inline | packaged helper reads target repo | (pending) |
| 5 | [ ] | task-e | inline | packaged helper reads target repo | (pending) |
SPRINT_EOF
printf '%s' 'plans/sprints/20991231-2359-tarball-root.sprint.md' > "$TARGET_REPO/.ai/harness/sprint/active-sprint"

(cd "$TARGET_REPO" && "$CLI" run sprint-backlog status) >"$TMP_DIR/sprint-status.txt"
if ! grep -qx 'sprint: plans/sprints/20991231-2359-tarball-root.sprint.md' "$TMP_DIR/sprint-status.txt" \
  || ! grep -qx 'tasks_total: 5' "$TMP_DIR/sprint-status.txt"; then
  echo "[tarball-smoke] ERROR: packaged sprint-backlog helper did not read the target repo sprint state" >&2
  cat "$TMP_DIR/sprint-status.txt" >&2
  exit 1
fi

printf '{"prompt":"review release readiness"}\n' | "$HOOK" prompt-guard-decide >/dev/null

FAKE_HOME="$TMP_DIR/home"
HARNESS_HOME="$TMP_DIR/repo-harness-home"
mkdir -p "$FAKE_HOME" "$HARNESS_HOME"
(cd "$TARGET_REPO" && REPO_HARNESS_HOME="$HARNESS_HOME" HOME="$FAKE_HOME" bash "$APP_DIR/node_modules/repo-harness/scripts/repo-harness.sh" install --target claude >/dev/null)

bun - "$APP_DIR/node_modules/repo-harness/assets/hooks" "$HARNESS_HOME/hooks" <<'JS_EOF'
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const [, , assetsRoot, centralRoot] = process.argv;

function rel(path, root) {
  return relative(root, path).replaceAll("\\", "/");
}

function collectFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) return collectFiles(root, fullPath);
      if (entry.isFile()) return [rel(fullPath, root)];
      return [];
    });
}

function normalizedMode(path) {
  return (statSync(path).mode & 0o111) === 0 ? "100644" : "100755";
}

function digest(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const fullPath = join(root, file);
    hash.update(file);
    hash.update("\0");
    hash.update(normalizedMode(fullPath));
    hash.update("\0");
    hash.update(readFileSync(fullPath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

const manifest = JSON.parse(readFileSync(join(assetsRoot, "projection.json"), "utf-8"));
const packageOnly = new Set(manifest.package_only ?? []);
const managedAssets = collectFiles(assetsRoot).filter((file) => !packageOnly.has(file));
const centralFiles = collectFiles(centralRoot).filter((file) => file !== ".version");

if (JSON.stringify(centralFiles) !== JSON.stringify(managedAssets)) {
  console.error("[tarball-smoke] ERROR: installed central hook file list differs from packaged canonical assets.");
  process.exit(1);
}
if (digest(centralRoot, centralFiles) !== digest(assetsRoot, managedAssets)) {
  console.error("[tarball-smoke] ERROR: installed central hook digest differs from packaged canonical assets.");
  process.exit(1);
}
JS_EOF

echo "[tarball-smoke] OK: ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz installs and packaged CLI bins start."

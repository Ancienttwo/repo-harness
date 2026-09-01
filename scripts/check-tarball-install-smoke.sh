#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')"
TMP_DIR="$(mktemp -d)"
OPERATOR_PID=""

cleanup() {
  local exit_code=$?
  if [[ -n "$OPERATOR_PID" ]]; then
    if kill -0 "$OPERATOR_PID" 2>/dev/null; then
      kill -TERM "$OPERATOR_PID" 2>/dev/null || true
      for _ in $(seq 1 100); do
        kill -0 "$OPERATOR_PID" 2>/dev/null || break
        sleep 0.05
      done
      if kill -0 "$OPERATOR_PID" 2>/dev/null; then
        kill -KILL "$OPERATOR_PID" 2>/dev/null || true
      fi
    fi
    wait "$OPERATOR_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

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
  "assets/hooks/lib/workflow-state.sh",
  "assets/hooks/projection.json",
  "src/cli/hook/handler-registry.ts",
  "src/cli/hook/route-registry.ts",
  "src/cli/hook/runtime.ts",
  "src/cli/hook/prompt-handler.ts",
  "assets/templates/helpers/capability-resolver.ts",
  "assets/templates/helpers/capability-config.ts",
  "assets/templates/helpers/change-assessment.ts",
  "assets/templates/helpers/runtime-evidence-receipt.ts",
  "interfaces/effective-state-v1.ts",
  "interfaces/types.ts",
  "src/effects/operator/fleet-collector-process.ts",
  "assets/operator/fleet-windows-job-controller.ps1",
  "dist/operator-ui/index.html",
];
const retired = [
  "assets/hooks/prompt-guard.sh",
  "assets/hooks/run-hook.sh",
  "scripts/hook-shim.sh",
  "scripts/repo-harness.sh",
];
const missing = required.filter((file) => !files.has(file));
const leaked = retired.filter((file) => files.has(file));
const aiHooks = [...files].filter((file) => file.startsWith(".ai/hooks/"));
const operatorAssets = [...files].filter((file) => file.startsWith("dist/operator-ui/assets/"));
const missingOperatorAssetKinds = [".js", ".css", ".woff2"].filter(
  (extension) => !operatorAssets.some((file) => file.endsWith(extension)),
);
if (missing.length > 0 || leaked.length > 0 || aiHooks.length > 0 || missingOperatorAssetKinds.length > 0) {
  if (missing.length > 0) {
    console.error(`[tarball-smoke] ERROR: package is missing hook assets: ${missing.join(", ")}`);
  }
  if (leaked.length > 0) {
    console.error(`[tarball-smoke] ERROR: package still contains retired hook runtime: ${leaked.join(", ")}`);
  }
  if (aiHooks.length > 0) {
    console.error(`[tarball-smoke] ERROR: package should not depend on .ai/hooks assets: ${aiHooks.join(", ")}`);
  }
  if (missingOperatorAssetKinds.length > 0) {
    console.error(`[tarball-smoke] ERROR: package is missing operator asset kinds: ${missingOperatorAssetKinds.join(", ")}`);
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
OPERATOR_HOME="$TMP_DIR/operator-home"
OPERATOR_REGISTRY="$OPERATOR_HOME/.repo-harness"
OPERATOR_STDOUT="$TMP_DIR/operator-stdout.log"
OPERATOR_STDERR="$TMP_DIR/operator-stderr.log"
OPERATOR_URL=""

start_operator_smoke() {
  mkdir -p "$OPERATOR_HOME"
  (
    cd "$APP_DIR"
    exec env HOME="$OPERATOR_HOME" REPO_HARNESS_HOME="$OPERATOR_REGISTRY" \
      "$CLI" operator serve --host 127.0.0.1 --port 0
  ) >"$OPERATOR_STDOUT" 2>"$OPERATOR_STDERR" &
  OPERATOR_PID=$!

  for _ in $(seq 1 100); do
    OPERATOR_URL="$(awk '/^http:\/\/127\.0\.0\.1:[0-9]+$/ { print; exit }' "$OPERATOR_STDOUT" 2>/dev/null || true)"
    if [[ -n "$OPERATOR_URL" ]] && bun - "$OPERATOR_URL/healthz" >/dev/null 2>&1 <<'JS_EOF'
const [, , url] = process.argv;
try {
  const response = await fetch(url);
  if (!response.ok) process.exit(1);
} catch {
  process.exit(1);
}
JS_EOF
    then
      return 0
    fi
    if ! kill -0 "$OPERATOR_PID" 2>/dev/null; then
      echo "[tarball-smoke] ERROR: packaged operator server exited before readiness" >&2
      cat "$OPERATOR_STDOUT" >&2 || true
      cat "$OPERATOR_STDERR" >&2 || true
      return 1
    fi
    sleep 0.05
  done

  echo "[tarball-smoke] ERROR: packaged operator server did not become ready" >&2
  cat "$OPERATOR_STDOUT" >&2 || true
  cat "$OPERATOR_STDERR" >&2 || true
  return 1
}

assert_operator_runtime() {
  bun - "$OPERATOR_URL" "$OPERATOR_HOME" <<'JS_EOF'
const [, , baseUrl, isolatedHome] = process.argv;
const fail = (message) => {
  console.error(`[tarball-smoke] ERROR: ${message}`);
  process.exit(1);
};
const origin = new URL(baseUrl).origin;
const health = await fetch(`${baseUrl}/healthz`);
if (!health.ok) fail(`/healthz returned ${health.status}`);
const healthBody = await health.json();
if (healthBody?.ok !== true || healthBody?.service !== 'repo-harness-operator' || healthBody?.protocol !== 1) {
  fail('/healthz did not return the operator health contract');
}
const page = await fetch(`${baseUrl}/`);
if (!page.ok || !page.headers.get('content-type')?.includes('text/html')) fail('operator HTML entrypoint is unavailable');
const html = await page.text();
const assetRef = html.match(/(?:src|href)=["']([^"']*assets\/[^"']+\.(?:js|css))["']/u)?.[1];
if (!assetRef) fail('operator HTML did not reference a bundled static asset');
const assetUrl = new URL(assetRef, `${baseUrl}/`);
if (assetUrl.origin !== origin) fail('operator HTML referenced a cross-origin static asset');
const asset = await fetch(assetUrl);
if (!asset.ok || (await asset.arrayBuffer()).byteLength === 0) fail('operator static asset is unavailable');
const snapshot = await fetch(`${baseUrl}/api/v1/fleet/snapshot`);
if (!snapshot.ok) fail(`operator Fleet API returned ${snapshot.status}`);
const payload = await snapshot.json();
// payload.protocol tracks FLEET_BOARD_PROTOCOL (src/core/fleet/board.ts), not the /healthz route protocol above.
if (payload?.protocol !== 3 || payload?.kind !== 'operator_fleet_snapshot' || !Array.isArray(payload?.repositories)
  || typeof payload?.source_snapshot_sha256 !== 'string') {
  fail('operator Fleet API did not return OperatorFleetSnapshotV1');
}
const serialized = JSON.stringify(payload);
for (const forbidden of ['repo_root', 'cause', 'stderr', 'stack', isolatedHome]) {
  if (serialized.includes(forbidden)) fail(`operator Fleet payload exposed ${forbidden}`);
}
JS_EOF
}

stop_operator_smoke() {
  [[ -n "$OPERATOR_PID" ]] || return 0
  if ! kill -TERM "$OPERATOR_PID" 2>/dev/null; then
    echo "[tarball-smoke] ERROR: packaged operator server was not running before SIGTERM" >&2
    OPERATOR_PID=""
    return 1
  fi
  if wait "$OPERATOR_PID"; then
    OPERATOR_PID=""
    return 0
  else
    local exit_code=$?
    echo "[tarball-smoke] ERROR: packaged operator server did not exit cleanly after SIGTERM" >&2
    OPERATOR_PID=""
    return "$exit_code"
  fi
}

VERSION="$("$CLI" --version)"
if [[ "$VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "[tarball-smoke] ERROR: repo-harness --version returned $VERSION, expected $PACKAGE_VERSION" >&2
  exit 1
fi

if ! "$CLI" operator serve --help >/dev/null; then
  echo "[tarball-smoke] ERROR: packaged operator command is unavailable" >&2
  exit 1
fi

start_operator_smoke
assert_operator_runtime
stop_operator_smoke

for doc_id in harness-overview agentic-development-flow; do
  if ! "$CLI" docs show "$doc_id" >/dev/null; then
    echo "[tarball-smoke] ERROR: packaged docs registry cannot resolve $doc_id" >&2
    exit 1
  fi
done

(cd "$TARGET_REPO" && "$CLI" status --json >/dev/null)

(cd "$TARGET_REPO" && "$CLI" state resolve --json) >"$TMP_DIR/effective-state.json"
(cd "$TARGET_REPO" && "$HOOK" state-snapshot --json) >"$TMP_DIR/state-snapshot.json"
bun - "$TMP_DIR/effective-state.json" "$TMP_DIR/state-snapshot.json" <<'JS_EOF'
const [, , statePath, snapshotPath] = process.argv;
const state = await Bun.file(statePath).json();
const snapshot = await Bun.file(snapshotPath).json();
if (state.protocol !== 1 || state.kind !== "repo-harness-effective-state") {
  console.error("[tarball-smoke] ERROR: packed CLI state resolver did not return Effective State v1");
  process.exit(1);
}
if (snapshot.protocol !== 1 || snapshot.kind !== "repo-harness-state-snapshot") {
  console.error("[tarball-smoke] ERROR: packed hook did not return StateSnapshot v1");
  process.exit(1);
}
JS_EOF

(cd "$APP_DIR" && bun - "$CLI" "$TARGET_REPO" >"$TMP_DIR/mcp-state.json" <<'JS_EOF'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , cli, repo] = process.argv;
const client = new Client({ name: "repo-harness-tarball-smoke", version: "0" }, { capabilities: {} });
try {
  const transport = new StdioClientTransport({
    command: cli,
    args: ["mcp", "serve", "--repo", repo, "--transport", "stdio", "--profile", "planner"],
    cwd: repo,
    stderr: "pipe",
  });
  await client.connect(transport);
  const result = await client.callTool({ name: "summarize_repo_harness_state", arguments: {} });
  const first = result.content?.[0];
  if (!first || first.type !== "text") throw new Error("expected MCP text result");
  console.log(first.text);
} finally {
  await client.close().catch(() => undefined);
}
JS_EOF
)

bun - "$TMP_DIR/effective-state.json" "$TMP_DIR/mcp-state.json" <<'JS_EOF'
const [, , statePath, mcpPath] = process.argv;
const state = await Bun.file(statePath).json();
const mcp = await Bun.file(mcpPath).json();
const fields = [
  "protocol",
  "kind",
  "task_id",
  "phase",
  "state_version",
  "state_revision",
  "workflow_profile",
  "requested_workflow_profile",
  "risk_floor",
  "profile_reasons",
  "authoritative_plan",
  "contract",
  "blockers",
  "stale_sources",
  "conflicting_sources",
  "next_action",
];
for (const field of fields) {
  if (JSON.stringify(state[field]) !== JSON.stringify(mcp[field])) {
    console.error(`[tarball-smoke] ERROR: MCP state field ${field} diverged from packed CLI`);
    process.exit(1);
  }
}
if (
  mcp.current !== null ||
  mcp.current_preview !== null ||
  mcp.current_authority !== "non-authoritative-projection" ||
  mcp.status?.profile_authority !== "mcp-policy"
) {
  console.error("[tarball-smoke] ERROR: MCP compact state obscured projection authority");
  process.exit(1);
}
JS_EOF

"$CLI" init --repo "$TARGET_REPO" --dry-run --json >"$TMP_DIR/init-plan.json"
bun - "$TMP_DIR/init-plan.json" <<'JS_EOF'
const [, , path] = process.argv;
const plan = await Bun.file(path).json();
if (plan.protocol !== 1 || plan.command !== "init" || plan.apply !== false) {
  console.error("[tarball-smoke] ERROR: packaged init dry-run did not return protocol v1 plan JSON");
  process.exit(1);
}
JS_EOF

"$CLI" init --repo "$TARGET_REPO" --no-verify --no-codegraph --json >"$TMP_DIR/init-apply.json"

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

(cd "$TARGET_REPO" && printf '{"prompt":"inspect repository state"}\n' | \
  HOOK_REPO_ROOT="$TARGET_REPO" \
  HOOK_HOST="claude" \
  "$HOOK" UserPromptSubmit --route default >/dev/null)

STANDALONE_REPO="$TMP_DIR/standalone-capability-repo"
mkdir -p "$STANDALONE_REPO/scripts" "$STANDALONE_REPO/.ai/context" "$STANDALONE_REPO/apps/web"
cp "$APP_DIR/node_modules/repo-harness/assets/templates/helpers/capability-resolver.ts" \
  "$STANDALONE_REPO/scripts/capability-resolver.ts"
cp "$APP_DIR/node_modules/repo-harness/assets/templates/helpers/capability-config.ts" \
  "$STANDALONE_REPO/scripts/capability-config.ts"
cat >"$STANDALONE_REPO/.ai/context/capabilities.json" <<'REGISTRY_EOF'
{
  "version": 1,
  "capabilities": [
    {
      "id": "apps-web",
      "domain": "apps-web",
      "name": "web",
      "prefixes": ["apps/web"],
      "contract_files": {
        "agents": "apps/web/AGENTS.md",
        "claude": "apps/web/CLAUDE.md"
      },
      "architecture_module": "docs/architecture/modules/apps-web/web.md",
      "workstream_dir": "tasks/workstreams/apps-web/web",
      "lsp_profile": "typescript-lsp",
      "verification_hints": ["bun test"]
    }
  ]
}
REGISTRY_EOF
git -C "$STANDALONE_REPO" init -q
(cd "$ROOT" && node node_modules/typescript/bin/tsc \
  --ignoreConfig --noEmit --module Preserve --moduleResolution Bundler \
  --target ES2022 --strict --skipLibCheck --types bun \
  "$STANDALONE_REPO/scripts/capability-config.ts" \
  "$STANDALONE_REPO/scripts/capability-resolver.ts")
(cd "$STANDALONE_REPO" && bun scripts/capability-resolver.ts match \
  --path apps/web/index.ts --format json) >"$TMP_DIR/capability-match.json"
bun - "$TMP_DIR/capability-match.json" <<'JS_EOF'
const [, , path] = process.argv;
const result = await Bun.file(path).json();
if (result.capability_id !== "apps-web") {
  console.error("[tarball-smoke] ERROR: standalone capability helper did not resolve packed projection");
  process.exit(1);
}
JS_EOF

echo "[tarball-smoke] OK: ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz installs, serves the packaged Operator, and packaged CLI bins start."

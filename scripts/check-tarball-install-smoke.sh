#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')"
# Use the same native /tmp root as the nested Node/Bun isolation policy.
# Git Bash maps /tmp elsewhere on Windows.
TMP_DIR="$(bun -e 'const fs = require("node:fs"); const path = require("node:path"); const root = path.resolve("/tmp"); fs.mkdirSync(root, { recursive: true }); console.log(fs.mkdtempSync(path.join(fs.realpathSync(root), "rh-tarball-smoke.")).replaceAll("\\", "/"));')"
OPERATOR_PID=""
# Every step runs with a temporary HOME and harness home. The smoke must not
# register its temporary repositories in the real ~/.repo-harness registry.
SMOKE_HOME="$TMP_DIR/home"
mkdir -p "$SMOKE_HOME"
# Keep the registry beside HOME: the nested test runner rejects registries
# below its caller HOME, even when that HOME is temporary.
export HOME="$SMOKE_HOME" REPO_HARNESS_HOME="$TMP_DIR/registry"

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
  "src/pi/extension.ts",
  "src/pi/hook-bridge.ts",
  "src/pi/compat.ts",
  "dist/hook-entry.js",
  "src/cli/hook/handler-registry.ts",
  "src/cli/hook/route-registry.ts",
  "src/cli/hook/runtime.ts",
  "SKILL.md",
  "assets/skill-commands/repo-harness-check/SKILL.md",
  "assets/templates/helpers/capability-resolver.ts",
  "scripts/capability-config.ts",
  "scripts/change-assessment.ts",
  "scripts/runtime-evidence-receipt.ts",
  "interfaces/effective-state-v2.ts",
  "interfaces/types.ts",
  "scripts/verification-plan.ts",
  "src/core/evidence/verification-plan.ts",
  "src/effects/evidence/verification-execution.ts",
  "assets/operator/windows-job-controller.ps1",
  "dist/operator-ui/index.html",
];
const retired = [
  "scripts/axr6-stop-host-cycle.ts",
  "scripts/axr7-build-flow-repair-proposal.ts",
  "scripts/axr7-build-model-proposal.ts",
  "scripts/axr7-build-selector-repair-proposal.ts",
  "scripts/canary-global-hook.sh",
  "assets/initializer-question-pack.v1.json",
  "assets/initializer-question-pack.v1.schema.json",
  "assets/initializer-question-pack.v3.schema.json",
  "scripts/lib/AGENTS.md",
  "scripts/lib/CLAUDE.md",
  "src/effects/operator/task-message-process.ts",
  "src/effects/fleet/task-message-request.ts",
  "src/core/adoption/workflow-contract-plan.ts",
  "assets/hooks/run-hook.sh",
  "assets/hooks/lib/workflow-state.sh",
  "scripts/hook-shim.sh",
  "scripts/repo-harness.sh",
];
const missing = required.filter((file) => !files.has(file));
const leaked = retired.filter((file) => files.has(file));
const aiHooks = [...files].filter((file) => file.startsWith(".ai/hooks/"));
const operatorAssets = [...files].filter((file) => file.startsWith("dist/operator-ui/assets/"));
// The Kumo/Tailwind UI ships one hashed entry script and one hashed stylesheet; fonts are system stacks.
const missingOperatorAssetKinds = [".js", ".css"].filter(
  (extension) => !operatorAssets.some((file) => /^dist\/operator-ui\/assets\/index-[A-Za-z0-9_-]+\.(?:js|css)$/u.test(file) && file.endsWith(extension)),
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
git -C "$TARGET_REPO" init -q -b main

cd "$APP_DIR"
bun init -y >/dev/null
bun add "$TARBALL_PATH" >/dev/null

CLI="$APP_DIR/node_modules/.bin/repo-harness"
HOOK="$APP_DIR/node_modules/.bin/repo-harness-hook"
# This smoke verifies the installed package runtime even when the operator shell
# is configured to route development CLIs to another source checkout.
unset REPO_HARNESS_SOURCE_ROOT
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
  bun - "$OPERATOR_URL" "$OPERATOR_HOME" "$OPERATOR_REGISTRY" "$PACKAGE_VERSION" <<'JS_EOF'
const [, , baseUrl, isolatedHome, registryHome, packageVersion] = process.argv;
const fail = (message) => {
  console.error(`[tarball-smoke] ERROR: ${message}`);
  process.exit(1);
};
const origin = new URL(baseUrl).origin;
const health = await fetch(`${baseUrl}/healthz`);
if (!health.ok) fail(`/healthz returned ${health.status}`);
const healthBody = await health.json();
if (healthBody?.ok !== true || healthBody?.service !== 'repo-harness-operator' || healthBody?.protocol !== 2 || healthBody?.version !== packageVersion) {
  fail('/healthz did not return the operator health contract');
}
const page = await fetch(`${baseUrl}/`);
if (!page.ok || !page.headers.get('content-type')?.includes('text/html')) fail('operator HTML entrypoint is unavailable');
const html = await page.text();
const assetText = {};
for (const kind of ['js', 'css']) {
  const assetRef = html.match(new RegExp(`(?:src|href)=["']([^"']*assets/index-[A-Za-z0-9_-]+\\.${kind})["']`, 'u'))?.[1];
  if (!assetRef) fail(`operator HTML did not reference a hashed ${kind} bundle`);
  const assetUrl = new URL(assetRef, `${baseUrl}/`);
  if (assetUrl.origin !== origin) fail('operator HTML referenced a cross-origin static asset');
  const asset = await fetch(assetUrl);
  const body = asset.ok ? await asset.text() : '';
  if (body.length === 0) fail(`operator ${kind} bundle is unavailable`);
  assetText[kind] = body;
}
// Kumo's colour tokens and its dark-mode selector must survive the packaged build.
for (const token of ['--color-kumo-base', '--color-kumo-line', '[data-mode=dark]']) {
  if (!assetText.css.includes(token)) fail(`operator stylesheet is missing Kumo token ${token}`);
}
// `?fixture=` exists only under the Vite dev server; its data must not ship.
if (assetText.js.includes('unknown operator fixture')) fail('operator bundle contains development fixtures');
// Register one repository with the installed package, so the path check below reads a real row.
const { mkdirSync } = await import('node:fs');
const smokeRepo = `${isolatedHome}/smoke-repo`;
mkdirSync(smokeRepo, { recursive: true });
const { registerRepoHarnessRepo } = await import(`${process.cwd()}/node_modules/repo-harness/src/effects/repo-registry.ts`);
const registration = registerRepoHarnessRepo(smokeRepo, 'manual', { env: { HOME: isolatedHome, REPO_HARNESS_HOME: registryHome }, requireAdopted: false });
if (!registration.registered) fail(`could not register the smoke repository: ${registration.reason}`);
const listed = await fetch(`${baseUrl}/api/v1/repositories`);
if (!listed.ok) fail(`operator repository list returned ${listed.status}`);
const payload = await listed.json();
// Decode with the installed package's own decoder, so a protocol bump cannot pass here with a stale literal.
const { decodeOperatorRepositories } = await import(`${process.cwd()}/node_modules/repo-harness/src/core/operator/repositories.ts`);
const list = decodeOperatorRepositories(payload);
if (list.repositories.length !== 1 || list.repositories[0].display_name !== 'smoke-repo') fail('operator repository list did not show the registered repository');
if (JSON.stringify(payload).includes(isolatedHome)) fail('operator repository list exposed a local path');
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
if (state.protocol !== 2 || state.kind !== "repo-harness-effective-state") {
  console.error("[tarball-smoke] ERROR: packed CLI state resolver did not return Effective State v2");
  process.exit(1);
}
if (snapshot.protocol !== 1 || snapshot.kind !== "repo-harness-state-snapshot") {
  console.error("[tarball-smoke] ERROR: packed hook did not return StateSnapshot v1");
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

git -C "$TARGET_REPO" config user.email "tarball-smoke@example.invalid"
git -C "$TARGET_REPO" config user.name "repo-harness tarball smoke"
cat >>"$TARGET_REPO/.git/info/exclude" <<'EXCLUDE_EOF'
.ai/harness/
.smoke/
EXCLUDE_EOF
git -C "$TARGET_REPO" add .
git -C "$TARGET_REPO" commit -qm "initialize smoke repository"

# Only the external account-home and provider endpoints are synthetic. The
# installed CLI validates the upstream request and writes the real protected
# approval; installed verification then reobserves it through its default loader.
INSTALLED_ROOT="$APP_DIR/node_modules/$PACKAGE_NAME"
ADMISSION_FIXTURE="$TMP_DIR/admission-fixture"
mkdir -p "$TARGET_REPO/.smoke" "$ADMISSION_FIXTURE"
bun "$ROOT/tests/fixtures/tarball-review-admission.ts" "$INSTALLED_ROOT" "$TARGET_REPO" "$SMOKE_HOME" "$ADMISSION_FIXTURE"
export PATH="$ADMISSION_FIXTURE/bin:$PATH"
bun --preload "$ADMISSION_FIXTURE/bootstrap.ts" "$INSTALLED_ROOT/src/cli/index.ts" \
  review admit --repo "$TARGET_REPO" --request "$ADMISSION_FIXTURE/request.json" >"$ADMISSION_FIXTURE/grant.json"
bun - "$ADMISSION_FIXTURE/request.json" "$ADMISSION_FIXTURE/grant.json" >"$ADMISSION_FIXTURE/args.txt" <<'JS_EOF'
const [, , requestPath, grantPath] = process.argv;
const {admission} = await Bun.file(requestPath).json();
const grant = await Bun.file(grantPath).json();
if (grant.revision !== 1 || !/^sha256:[0-9a-f]{64}$/.test(grant.grant_sha256)
  || grant.bot_id !== 'synthetic-smoke-bot' || grant.execution_actor !== admission.actor_id) throw new Error('invalid installed approval result');
for (const [flag, value] of Object.entries({'repository-id':admission.repository_id,'issue-id':admission.issue_id,
  'campaign-id':admission.campaign_id,'grant-sha256':grant.grant_sha256,'policy-sha256':admission.policy.policy_sha256,actor:admission.actor_id})) {
  console.log('--'+flag); console.log(value);
}
JS_EOF
ADMISSION_ARGS=()
while IFS= read -r arg; do ADMISSION_ARGS+=("$arg"); done <"$ADMISSION_FIXTURE/args.txt"
# Invoke the installed helper entrypoint with an explicit test preload so its
# protected store cannot touch the real OS account. Run-dispatcher startup is
# independently checked below; the verification parser and all effects are real.
verification_smoke() {
  bun --preload "$ADMISSION_FIXTURE/bootstrap.ts" "$INSTALLED_ROOT/scripts/verification-plan.ts" \
    "$1" --repo "$TARGET_REPO" "${ADMISSION_ARGS[@]}" "${@:2}"
}
verification_smoke validate >"$TARGET_REPO/.smoke/validate.json"
missing_status=0
verification_smoke evaluate --report-file .smoke/evaluate-missing-report.json >"$TARGET_REPO/.smoke/evaluate-missing.json" || missing_status=$?
if [[ "$missing_status" -ne 1 ]]; then
  echo "[tarball-smoke] ERROR: packaged verification missing evidence returned $missing_status, expected 1" >&2
  exit 1
fi
if [[ -e "$TARGET_REPO/.smoke/execution-count" ]]; then
  echo "[tarball-smoke] ERROR: packaged verification evaluate spawned the declared command" >&2
  exit 1
fi
verification_smoke execute --report-file .smoke/execute-first-report.json >"$TARGET_REPO/.smoke/execute-first.json"
verification_smoke execute --report-file .smoke/execute-reuse-report.json >"$TARGET_REPO/.smoke/execute-reuse.json"
verification_smoke evaluate --report-file .smoke/evaluate-final-report.json >"$TARGET_REPO/.smoke/evaluate-final.json"
bun - "$TARGET_REPO" <<'JS_EOF'
const [, , repo] = process.argv;
const readJson = async (name) => await Bun.file(`${repo}/.smoke/${name}`).json();
const fail = (message) => {
  console.error(`[tarball-smoke] ERROR: ${message}`);
  process.exit(1);
};
const validation = await readJson("validate.json");
const missing = await readJson("evaluate-missing.json");
const first = await readJson("execute-first.json");
const reuse = await readJson("execute-reuse.json");
const finalEvaluation = await readJson("evaluate-final.json");
const counter = (await Bun.file(`${repo}/.smoke/execution-count`).text()).trim().split("\n");
if (validation?.kind !== "verification_plan_validation" || validation?.valid !== true
  || validation?.plan?.checks?.[0]?.id !== "single-count") fail("packaged verification validate returned the wrong plan");
for (const report of [missing, first, reuse, finalEvaluation]) {
  if (report.protocol !== 2 || report.kind !== 'verification_execution_report') fail('installed verification report protocol mismatch');
  for (const key of ['campaign_sha256', 'admission_sha256', 'grant_sha256', 'plan_hash']) {
    if (report.target[key] !== validation[key]) fail(`verification report lost approved ${key}`);
  }
  if ('contract_hash' in report.target) fail('verification report retained retired contract authority');
}
if (missing?.passed !== false || missing?.status !== "missing" || missing?.results?.[0]?.execution !== "missing") {
  fail("packaged verification evaluate did not report missing evidence");
}
if (first?.passed !== true || first?.results?.[0]?.execution !== "executed") {
  fail("packaged verification execute did not record the first execution");
}
if (reuse?.passed !== true || reuse?.results?.[0]?.execution !== "reused"
  || reuse?.results?.[0]?.execution_id !== first?.results?.[0]?.execution_id) {
  fail("packaged verification execute did not reuse the exact successful execution");
}
if (finalEvaluation?.passed !== true || finalEvaluation?.results?.[0]?.execution !== "reused"
  || finalEvaluation?.results?.[0]?.execution_id !== first?.results?.[0]?.execution_id) {
  fail("packaged verification evaluate did not read the existing execution without spawning");
}
if (counter.length !== 1 || counter[0] !== "executed") fail("verification command did not execute exactly once");
JS_EOF
if [[ -n "$(git -C "$TARGET_REPO" status --porcelain)" ]]; then
  echo "[tarball-smoke] ERROR: packaged verification runtime counter, evidence, or reports are not ignored" >&2
  git -C "$TARGET_REPO" status --short >&2
  exit 1
fi

if ! "$CLI" run verify-sprint --help >/dev/null; then
  echo "[tarball-smoke] ERROR: packaged 'repo-harness run verify-sprint --help' failed (run dispatcher / helper lookup / bin startup broken)" >&2
  exit 1
fi

mkdir -p "$TARGET_REPO/plans/sprints" "$TARGET_REPO/.ai/harness/sprint"
cat > "$TARGET_REPO/plans/sprints/20991231-2359-tarball-root.sprint.md" <<'SPRINT_EOF'
# Sprint: Tarball Root

> **Status**: Approved
> **Backlog Schema**: 2

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | 1111111111111111111111111111111111111111111111111111111111111111 | [ ] | task-a | inline | packaged helper reads target repo | (pending) |
| 2 | 2222222222222222222222222222222222222222222222222222222222222222 | [ ] | task-b | inline | packaged helper reads target repo | (pending) |
| 3 | 3333333333333333333333333333333333333333333333333333333333333333 | [ ] | task-c | inline | packaged helper reads target repo | (pending) |
| 4 | 4444444444444444444444444444444444444444444444444444444444444444 | [ ] | task-d | inline | packaged helper reads target repo | (pending) |
| 5 | 5555555555555555555555555555555555555555555555555555555555555555 | [ ] | task-e | inline | packaged helper reads target repo | (pending) |
SPRINT_EOF
printf '%s' 'plans/sprints/20991231-2359-tarball-root.sprint.md' > "$TARGET_REPO/.ai/harness/sprint/active-sprint"

(cd "$TARGET_REPO" && printf '{"prompt":"inspect repository state"}\n' | \
  HOOK_REPO_ROOT="$TARGET_REPO" \
  HOOK_HOST="claude" \
  "$HOOK" UserPromptSubmit --route inbox >/dev/null)

STANDALONE_REPO="$TMP_DIR/standalone-capability-repo"
mkdir -p "$STANDALONE_REPO/scripts" "$STANDALONE_REPO/.ai/context" "$STANDALONE_REPO/apps/web"
cp "$APP_DIR/node_modules/repo-harness/assets/templates/helpers/capability-resolver.ts" \
  "$STANDALONE_REPO/scripts/capability-resolver.ts"
cp "$APP_DIR/node_modules/repo-harness/scripts/capability-config.ts" \
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
      "lsp_profile": "typescript-lsp",
      "verification_hints": ["bun test"]
    }
  ]
}
REGISTRY_EOF
git -C "$STANDALONE_REPO" init -q -b main
(cd "$ROOT" && node node_modules/typescript/bin/tsc \
  --ignoreConfig --noEmit --module Preserve --moduleResolution Bundler \
  --target ES2022 --strict --skipLibCheck --types bun-types \
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

# The earlier hook runs have no install state. Here the installed hook reads a
# recorded protocol 3 state with a managed surface, and must exit 0 with no
# error output. In 0.26.0 that read loaded the package skill-surface catalog in
# the bundle and exited 1 (#1680).
bun - "$INSTALLED_ROOT" "$SMOKE_HOME" <<'JS_EOF'
const [, , installedRoot, home] = process.argv;
const { mkdirSync, writeFileSync } = await import('node:fs');
const { dirname, join } = await import('node:path');
const { version } = await Bun.file(`${installedRoot}/package.json`).json();
const { PLUGIN_IDS } = await import(`${installedRoot}/src/core/skill-surface/plugin-manifest.ts`);
const statePath = join(home, '.repo-harness', 'install-state.json');
const settings = { owner: 'core', path: join(home, '.claude', 'settings.json'), type: 'managed-file',
  authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only',
  content_hash: `sha256:${'0'.repeat(64)}`, managed_marker: 'transaction-created-file', symlink_target: null };
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, JSON.stringify({ protocol: 3, core: { version }, plugins: PLUGIN_IDS.map((id) => ({ id, version })), selection: 'all',
  transaction_id: 'tarball-smoke', applied_at: new Date().toISOString(), ownership_manifest: [settings], previous: null }));
JS_EOF
run_recorded_selection_hook() {
  local event="$1" route="$2" payload="$3" status=0
  (cd "$TARGET_REPO" && printf '%s\n' "$payload" | HOOK_HOST="claude" "$HOOK" "$event" --route "$route") \
    >"$TMP_DIR/hook-$event.stdout" 2>"$TMP_DIR/hook-$event.stderr" || status=$?
  if [[ "$status" -ne 0 || -s "$TMP_DIR/hook-$event.stderr" ]]; then
    echo "[tarball-smoke] ERROR: installed repo-harness-hook $event --route $route with a recorded install state returned $status" >&2
    cat "$TMP_DIR/hook-$event.stderr" >&2
    exit 1
  fi
}
run_recorded_selection_hook PreToolUse edit \
  "{\"session_id\":\"tarball-smoke\",\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$TARGET_REPO\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TARGET_REPO/notes.txt\",\"content\":\"x\"}}"
run_recorded_selection_hook Stop default \
  "{\"session_id\":\"tarball-smoke\",\"hook_event_name\":\"Stop\",\"cwd\":\"$TARGET_REPO\",\"stop_hook_active\":false}"

# `operator serve` needs the operator plugin. Its HOME is its own, so it gets a
# copy of the recorded `all` selection.
mkdir -p "$OPERATOR_HOME/.repo-harness"
cp "$SMOKE_HOME/.repo-harness/install-state.json" "$OPERATOR_HOME/.repo-harness/install-state.json"
start_operator_smoke
assert_operator_runtime
stop_operator_smoke

# `mcp serve` needs the mcp plugin, so the MCP steps run on the recorded `all`
# selection. Resolve here: the hook runs above can change the state fields.
(cd "$TARGET_REPO" && "$CLI" state resolve --json) >"$TMP_DIR/effective-state.json"

(cd "$APP_DIR" && bun - "$CLI" "$TARGET_REPO" >"$TMP_DIR/mcp-state.json" <<'JS_EOF'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , cli, repo] = process.argv;
const client = new Client({ name: "repo-harness-tarball-smoke", version: "0" }, { capabilities: {} });
try {
  const transport = new StdioClientTransport({
    command: cli,
    args: ["mcp", "serve", "--repo", repo, "--profile", "planner"],
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
  Object.hasOwn(mcp, "authoritative_plan") ||
  Object.hasOwn(mcp, "current") ||
  Object.hasOwn(mcp, "current_preview") ||
  Object.hasOwn(mcp, "current_authority") ||
  mcp.status?.profile_authority !== "mcp-policy"
) {
  console.error("[tarball-smoke] ERROR: MCP compact state exposed a retired plan or current projection");
  process.exit(1);
}
JS_EOF

# The selection gates the MCP code in the installed package: the #1833
# require.cache probe, on the `all` state and then on selection [].
MCP_LOAD_PROBE="$TMP_DIR/mcp-load-probe.ts"
cat >"$MCP_LOAD_PROBE" <<'JS_EOF'
process.on("exit", () => process.stderr.write(`mcp-modules:${Object.keys(require.cache).filter((path) => /[\\/]src[\\/]cli[\\/]mcp[\\/]|@modelcontextprotocol[\\/]/.test(path)).length}\n`));
JS_EOF
bun - "$INSTALLED_ROOT" "$SMOKE_HOME" "$TARGET_REPO" "$MCP_LOAD_PROBE" <<'JS_EOF'
const [, , installedRoot, home, repo, probe] = process.argv;
const { readFileSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
const fail = (message) => {
  console.error(`[tarball-smoke] ERROR: ${message}`);
  process.exit(1);
};
const run = (...args) => {
  const result = Bun.spawnSync([process.execPath, '--preload', probe, `${installedRoot}/src/cli/index.ts`, ...args], {
    cwd: repo, stdin: 'ignore', env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
  });
  const stderr = result.stderr.toString();
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr, loaded: Number(/mcp-modules:(\d+)/.exec(stderr)?.[1]) };
};
const serve = ['mcp', 'serve', '--repo', repo, '--profile', 'planner'];
const selected = run(...serve);
if (selected.status !== 0 || !(selected.loaded > 0)) fail(`mcp serve with all returned ${selected.status} and loaded ${selected.loaded} MCP modules`);
const statePath = join(home, '.repo-harness', 'install-state.json');
writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath, 'utf8')), plugins: [], selection: [] }));
const refused = run(...serve);
if (refused.status !== 1 || refused.stdout !== '' || refused.loaded !== 0) {
  fail(`mcp serve with selection [] returned ${refused.status}, ${refused.stdout.length} stdout bytes and ${refused.loaded} MCP modules`);
}
if (!refused.stderr.includes('install_plugin_unavailable: ') || !refused.stderr.includes('run: repo-harness install --plugins mcp\n')) {
  fail(`mcp serve with selection [] did not print the code and the repair: ${refused.stderr}`);
}
const status = run('status', '--json');
if (status.status !== 0 || status.loaded !== 0) fail(`status --json with selection [] returned ${status.status} and loaded ${status.loaded} MCP modules`);
console.log(`[tarball-smoke] OK: mcp serve loads ${selected.loaded} MCP modules with all, 0 with selection []; status --json loads 0.`);
JS_EOF

# The selection gates the Operator code in the installed package. The owner
# paths are the model nodes of capability.runtime-harness.operator; the command
# shells are in the CLI root. The state is selection [] from the MCP step.
OPERATOR_OWNED='[\\/]src[\\/](?:effects[\\/](?:operator|setup|dev-activity)[\\/]|core[\\/](?:operator|setup|dev-activity)[\\/]|effects[\\/]configuration[\\/]agents-configuration\.ts|effects[\\/]review[\\/]docs-host-isolation\.ts|cli[\\/]commands[\\/](?:(?:operator|worktrees|catch-up|doc-sessions)-actions|architecture-thread|setup-[a-z-]+)\.ts)'
OPERATOR_LOAD_PROBE="$TMP_DIR/operator-load-probe.ts"
cat >"$OPERATOR_LOAD_PROBE" <<JS_EOF
process.on("exit", () => process.stderr.write(\`operator-modules:\${Object.keys(require.cache).filter((path) => /$OPERATOR_OWNED/.test(path)).length}\n\`));
JS_EOF
bun - "$INSTALLED_ROOT" "$SMOKE_HOME" "$TARGET_REPO" "$OPERATOR_LOAD_PROBE" "$OPERATOR_OWNED" <<'JS_EOF'
const [, , installedRoot, home, repo, probe, owned] = process.argv;
const { readFileSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
const fail = (message) => {
  console.error(`[tarball-smoke] ERROR: ${message}`);
  process.exit(1);
};
const env = { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0', HOOK_HOST: 'claude' };
const loadedIn = (stderr) => Number(/operator-modules:(\d+)/.exec(stderr)?.[1]);
const run = (entry, args, stdin = 'ignore') => {
  const result = Bun.spawnSync([process.execPath, '--preload', probe, `${installedRoot}/${entry}`, ...args], { cwd: repo, stdin, env });
  const stderr = result.stderr.toString();
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr, loaded: loadedIn(stderr) };
};
const cli = (...args) => run('src/cli/index.ts', args);
const hook = (event, route, payload) => run('src/cli/hook-entry.ts', [event, '--route', route], new TextEncoder().encode(JSON.stringify({ session_id: 'tarball-smoke', hook_event_name: event, cwd: repo, ...payload })));

const serve = ['operator', 'serve', '--host', '127.0.0.1', '--port', '0'];
const refused = cli(...serve);
if (refused.status !== 1 || refused.stdout !== '' || refused.loaded !== 0) {
  fail(`operator serve with selection [] returned ${refused.status}, ${refused.stdout.length} stdout bytes and ${refused.loaded} Operator modules`);
}
if (!refused.stderr.includes('install_plugin_unavailable: ') || !refused.stderr.includes('run: repo-harness install --plugins operator\n')) {
  fail(`operator serve with selection [] did not print the code and the repair: ${refused.stderr}`);
}
const core = [
  ['status --json', cli('status', '--json')],
  ['seats argv worker --json', cli('seats', 'argv', 'worker', '--json')],
  ['quota --json', cli('quota', '--json')],
  ['hook PreToolUse edit', hook('PreToolUse', 'edit', { tool_name: 'Write', tool_input: { file_path: `${repo}/notes.txt`, content: 'x' } })],
  ['hook Stop default', hook('Stop', 'default', { stop_hook_active: false })],
];
for (const [name, result] of core) {
  if (result.status !== 0 || result.loaded !== 0) fail(`${name} with selection [] returned ${result.status} and loaded ${result.loaded} Operator modules`);
}
// The hook bin is one bundle, so require.cache cannot count inside it. Its module comments can.
const bundleModules = readFileSync(`${installedRoot}/dist/hook-entry.js`, 'utf8').split('\n').filter((line) => line.startsWith('// src/'));
if (bundleModules.length === 0) fail('dist/hook-entry.js has no module comments, so the owner check proves nothing');
const ownedPath = new RegExp(owned);
const bundled = bundleModules.filter((line) => ownedPath.test(`/${line.slice(3)}`));
if (bundled.length !== 0) fail(`dist/hook-entry.js bundles Operator modules: ${bundled.join(', ')}`);

const statePath = join(home, '.repo-harness', 'install-state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const { PLUGIN_IDS } = await import(`${installedRoot}/src/core/skill-surface/plugin-manifest.ts`);
writeFileSync(statePath, JSON.stringify({ ...state, plugins: PLUGIN_IDS.map((id) => ({ id, version: state.core.version })), selection: 'all' }));
const server = Bun.spawn([process.execPath, '--preload', probe, `${installedRoot}/src/cli/index.ts`, ...serve], { cwd: repo, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env });
const reader = server.stdout.getReader();
const deadline = setTimeout(() => server.kill('SIGKILL'), 60_000);
const line = (await reader.read()).value;
const url = line === undefined ? '' : new TextDecoder().decode(line).trim();
const health = /^http:\/\/127\.0\.0\.1:\d+$/.test(url) ? await fetch(`${url}/healthz`) : null;
server.kill('SIGTERM');
const stderr = await new Response(server.stderr).text();
const exit = await server.exited;
clearTimeout(deadline);
if (health?.ok !== true) fail(`operator serve with all did not answer /healthz: ${url} ${stderr}`);
const selected = loadedIn(stderr);
if (exit !== 0 || !(selected > 0)) fail(`operator serve with all returned ${exit} and loaded ${selected} Operator modules`);
console.log(`[tarball-smoke] OK: operator serve loads ${selected} Operator modules with all and serves; with selection [] it refuses, and status, seats, quota and hook routes load 0; the hook bundle of ${bundleModules.length} modules holds 0.`);
JS_EOF

# peer-runtime owns the action bodies, review-runner and the terminal paths
# in task-agent-host's model. Core command shells and runtime closeout stay out.
PEER_OWNED='[\\/]src[\\/](?:effects[\\/](?:review-runner[\\/]|terminal[\\/](?:task-session|task-runtime-observation|native-task-session|herdr-notify-install|notify-relay)\.ts)|cli[\\/]commands[\\/](?:herdr|events)-actions\.ts)|[\\/]@botiverse[\\/]oar[\\/]|[\\/]assets[\\/]herdr[\\/]'
PEER_LOAD_PROBE="$TMP_DIR/peer-load-probe.ts"
cat >"$PEER_LOAD_PROBE" <<JS_EOF
process.on("exit", () => process.stderr.write(\`peer-modules:\${Object.keys(require.cache).filter((path) => /$PEER_OWNED/.test(path)).length}\n\`));
JS_EOF
bun - "$INSTALLED_ROOT" "$SMOKE_HOME" "$TARGET_REPO" "$PEER_LOAD_PROBE" "$PEER_OWNED" <<'JS_EOF'
const [, , installedRoot, home, repo, probe, owned] = process.argv;
const { readFileSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
const fail = (message) => { console.error(`[tarball-smoke] ERROR: ${message}`); process.exit(1); };
const env = { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0', HOOK_HOST: 'claude' };
const run = (entry, args, stdin = 'ignore', host = 'claude') => {
  const result = Bun.spawnSync([process.execPath, '--preload', probe, `${installedRoot}/${entry}`, ...args], { cwd: repo, stdin, env: { ...env, HOOK_HOST: host } });
  const stderr = result.stderr.toString();
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr, loaded: Number(/peer-modules:(\d+)/.exec(stderr)?.[1]) };
};
const cli = (...args) => run('src/cli/index.ts', args);
// The preceding Operator proof left an all selection. No notify config exists.
const selected = cli('herdr', 'notify', 'start');
if (!(selected.loaded > 0) || selected.stderr.includes('install_plugin_unavailable: ')) fail(`selected notify did not load its body: ${selected.stderr}`);
const statePath = join(home, '.repo-harness', 'install-state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
writeFileSync(statePath, JSON.stringify({ ...state, plugins: [], selection: [] }));
const selectors = ['--repository-id', 'R', '--issue-id', 'I', '--campaign-id', 'C', '--grant-sha256', `sha256:${'1'.repeat(64)}`, '--policy-sha256', `sha256:${'2'.repeat(64)}`, '--actor', 'U'];
for (const args of [['review', 'status', ...selectors], ['herdr', 'notify', 'start'], ['events', 'install']]) {
  const result = cli(...args);
  if (result.status !== 1 || result.stdout !== '' || result.loaded !== 0
    || !result.stderr.includes('install_plugin_unavailable: ') || !result.stderr.includes('run: repo-harness install --plugins peer-runtime\n')) {
    fail(`${args.join(' ')} did not refuse before loading: ${JSON.stringify(result)}`);
  }
}
const core = [
  ['status', cli('status', '--json')], ['doctor', cli('doctor', '--json')],
  ['seats', cli('seats', 'argv', 'worker', '--json')],
  ['worktree runtime cleanup', run('scripts/contract-worktree-runtime.ts', ['cleanup', '--repo', repo, '--worktree', repo])],
];
const { ROUTES } = await import(`${installedRoot}/src/cli/hook/route-registry.ts`);
for (const route of ROUTES) {
  const payload = { session_id: 'tarball-peer-gate', hook_event_name: route.event, cwd: repo, stop_hook_active: false,
    tool_name: route.routeId === 'bash' ? 'Bash' : route.routeId === 'subagent' ? 'Agent' : 'Write',
    tool_input: route.routeId === 'bash' ? { command: 'pwd' }
      : route.routeId === 'edit' ? { file_path: `${repo}/notes.txt`, content: 'x' }
      : route.routeId === 'subagent' ? { prompt: 'Inspect the repository without changes.' } : {} };
  core.push([`hook ${route.event} ${route.routeId}`, run('src/cli/hook-entry.ts', [route.event, '--route', route.routeId], new TextEncoder().encode(JSON.stringify(payload)), route.hosts?.[0] ?? 'claude')]);
}
for (const [name, result] of core) {
  // Doctor may report missing host tools; its module-load boundary still holds.
  if (result.loaded !== 0 || (name !== 'doctor' && result.status !== 0) || (name === 'doctor' && ![0, 1].includes(result.status))) fail(`${name} loaded peer-runtime or failed: ${JSON.stringify(result)}`);
}
const bundleModules = readFileSync(`${installedRoot}/dist/hook-entry.js`, 'utf8').split('\n').filter(line => line.startsWith('// '));
if (!bundleModules.some(line => line.startsWith('// src/'))) fail('hook bundle has no source module comments');
const bundled = bundleModules.filter(line => new RegExp(owned).test(`/${line.slice(3)}`));
if (bundled.length) fail(`hook bundle contains peer-runtime: ${bundled.join(', ')}`);
writeFileSync(statePath, JSON.stringify({ ...state, plugins: [], selection: 'all' }));
const repair = cli('herdr', 'notify', 'start');
if (repair.status !== 1 || repair.stdout !== '' || repair.loaded !== 0 || !repair.stderr.includes('run: repo-harness update\n')) fail(`all repair changed the selection: ${repair.stderr}`);
writeFileSync(statePath, JSON.stringify(state));
console.log(`[tarball-smoke] OK: peer-runtime loads ${selected.loaded} modules when selected; refusals, core commands, hook routes and hook bundle load 0.`);
JS_EOF

echo "[tarball-smoke] OK: ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz installs, serves the packaged Operator, and packaged CLI bins start."

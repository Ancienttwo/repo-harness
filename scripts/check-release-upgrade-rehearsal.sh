#!/usr/bin/env bash
# Upgrade rehearsal of the release gate: the last published repo-harness
# installs this checkout's unpublished candidate.
#
# What it proves that scripts/check-tarball-install-smoke.sh does not: the
# published parent (the version npm serves as "latest") runs
# `repo-harness update --version <candidate>`, installs both candidate
# packages, the candidate reconciles the runtime, and `repo-harness --version`
# then gives the candidate.
#
# How: it packs repo-harness and repo-harness-operator-web, serves the
# candidate version of both from a registry on 127.0.0.1, and passes every
# other request to registry.npmjs.org. HOME, REPO_HARNESS_HOME, BUN_INSTALL
# and the npm cache and prefix live in one scratch directory with empty
# caches, so each package that the parent installs is fetched. The registry
# stops at exit, and so does the scratch directory.
#
# Not covered: the npm publish path and provenance, codegraph, the external
# skills, the `hc` binary on PATH, and the refusal cases of one release (for
# example a stale mcp.local.json), which the release PR adds by hand.
#
# The candidate is the HEAD commit of the checkout, not its working tree: the
# script extracts HEAD into scratch and packs from there, so the checkout is
# never written. It needs network access to registry.npmjs.org, and it fails
# when the candidate version is already on npm: the rehearsal is only valid
# before the publish.
#
# Isolation: the script runs twice. The outer run resolves the tools with
# `command -v`, builds the scratch directory and its tool bin, and re-executes
# itself under `env -i` with an explicit allow list. Every command of the inner
# run, and of the candidate runtime it starts, inherits that environment by
# construction. Host overrides such as CODEX_HOME, CLAUDE_CONFIG_DIR,
# PI_CODING_AGENT_DIR, CODEX_SKILLS_ROOT, CLAUDE_SKILLS_ROOT, TAR_OPTIONS,
# npm_config_* and BUN_INSTALL_CACHE_DIR never reach it, so no write leaves
# the scratch directory. PATH is one scratch bin directory of symlinks to the
# tools below; the caller's PATH is never appended. No `hc` goes in that
# directory, so no host `hc` is reachable. curl is there, so the candidate's
# herdr-core step downloads the pinned `hc` into the scratch HOME; that
# download is expected and stays in scratch. The build of the candidate source
# and the parent install use separate, empty Bun package caches.
# REHEARSAL_PROBE=1 makes the inner run print its environment and where each
# tool resolves, then exit before any npm or bun call.
set -euo pipefail

# Tools the inner run and the candidate runtime call. Required ones fail the
# run when missing; the others are linked when present.
REQUIRED_TOOLS=(bun node npm git tar curl sh bash env mkdir cat grep seq sleep rm ls mktemp head)
OPTIONAL_TOOLS=(cp mv uname sed awk sort tr dirname basename chmod ln touch find xargs date tail tee wc readlink realpath id whoami diff cut)

if [[ -z "${REHEARSAL_INNER:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  TMP_DIR="$(mktemp -d /tmp/rh-upgrade-rehearsal.XXXXXX)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  # HOME and the harness home sit side by side, as in the tarball smoke: the
  # host test runner rejects a registry below its caller HOME.
  SCRATCH="$TMP_DIR/env"
  mkdir -p "$SCRATCH/home" "$SCRATCH/bin" "$SCRATCH/bun" "$SCRATCH/bun-cache" "$SCRATCH/bun-cache-build" \
    "$SCRATCH/bun-transpiler" "$SCRATCH/bun-transpiler-build" "$SCRATCH/npm-cache" \
    "$SCRATCH/npm-prefix" "$SCRATCH/npm-logs" "$SCRATCH/tmp" "$SCRATCH/xdg-state"
  : >"$SCRATCH/npmrc-user"
  : >"$SCRATCH/npmrc-global"
  for tool in "${REQUIRED_TOOLS[@]}"; do
    tool_path="$(command -v "$tool")" || { echo "[rehearsal] FAIL: required tool $tool is not on PATH" >&2; exit 1; }
    ln -s "$tool_path" "$SCRATCH/bin/$tool"
  done
  for tool in "${OPTIONAL_TOOLS[@]}"; do
    tool_path="$(command -v "$tool" 2>/dev/null)" || continue
    [[ "$tool_path" == /* ]] && ln -sf "$tool_path" "$SCRATCH/bin/$tool"
  done
  # The scratch bin also holds the global bin of the parent install (bun add -g).
  ln -s "$SCRATCH/bin" "$SCRATCH/bun/bin"
  trap - EXIT
  exec env -i \
    "REHEARSAL_INNER=1" "REHEARSAL_ROOT=$ROOT" "REHEARSAL_TMP=$TMP_DIR" \
    ${REHEARSAL_PROBE:+"REHEARSAL_PROBE=$REHEARSAL_PROBE"} \
    "PATH=$SCRATCH/bin" \
    "HOME=$SCRATCH/home" \
    "REPO_HARNESS_HOME=$SCRATCH/registry" \
    "BUN_INSTALL=$SCRATCH/bun" \
    "BUN_INSTALL_CACHE_DIR=$SCRATCH/bun-cache" \
    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=$SCRATCH/bun-transpiler" \
    "TMPDIR=$SCRATCH/tmp" \
    "XDG_CONFIG_HOME=$SCRATCH/home/.config" \
    "XDG_DATA_HOME=$SCRATCH/home/.local/share" \
    "XDG_CACHE_HOME=$SCRATCH/home/.cache" \
    "XDG_STATE_HOME=$SCRATCH/xdg-state" \
    "npm_config_cache=$SCRATCH/npm-cache" \
    "npm_config_prefix=$SCRATCH/npm-prefix" \
    "npm_config_userconfig=$SCRATCH/npmrc-user" \
    "npm_config_globalconfig=$SCRATCH/npmrc-global" \
    "npm_config_logs_dir=$SCRATCH/npm-logs" \
    "npm_config_update_notifier=false" \
    "GIT_CONFIG_NOSYSTEM=1" \
    "LANG=C.UTF-8" \
    "$(command -v bash)" "$ROOT/scripts/check-release-upgrade-rehearsal.sh"
fi

# Inner run: every command below runs in the controlled environment.
ROOT="$REHEARSAL_ROOT"
TMP_DIR="$REHEARSAL_TMP"
SCRATCH="$TMP_DIR/env"
if [[ -n "${REHEARSAL_PROBE:-}" ]]; then
  env
  for tool in "${REQUIRED_TOOLS[@]}" "${OPTIONAL_TOOLS[@]}" hc; do
    command -v "$tool" || echo "$tool: not found"
  done
  rm -rf "$TMP_DIR"
  exit 0
fi
REGISTRY_PID=""
cleanup() {
  local exit_code=$?
  if [[ -n "$REGISTRY_PID" ]]; then
    kill -TERM "$REGISTRY_PID" 2>/dev/null || true
    wait "$REGISTRY_PID" 2>/dev/null || true
  fi
  if [[ $exit_code -ne 0 && -f "$TMP_DIR/registry.log" ]]; then
    echo "[rehearsal] registry log:" >&2
    cat "$TMP_DIR/registry.log" >&2
  fi
  rm -rf "$TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

fail() { echo "[rehearsal] FAIL: $*" >&2; exit 1; }

# The candidate source build keeps its own Bun caches, apart from the runtime ones.
build() {
  env "BUN_INSTALL_CACHE_DIR=$SCRATCH/bun-cache-build" \
    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=$SCRATCH/bun-transpiler-build" "$@"
}

# Candidate source: the HEAD commit of the checkout, extracted into scratch.
SRC="$TMP_DIR/src"
mkdir -p "$SRC"
git -C "$ROOT" archive HEAD | tar -x -C "$SRC"
CANDIDATE="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).version)' "$SRC/package.json")"
[[ -n "$CANDIDATE" ]] || fail "the candidate version is empty"

NPM_REGISTRY=https://registry.npmjs.org
PARENT="$(npm view repo-harness version --registry "$NPM_REGISTRY" 2>"$TMP_DIR/view-parent.err")" \
  || { cat "$TMP_DIR/view-parent.err" >&2; fail "npm view of the parent version failed"; }
[[ "$PARENT" != "$CANDIDATE" ]] || fail "repo-harness@$CANDIDATE is already the latest on npm; the rehearsal needs an unpublished candidate"
# Only a confirmed not-found counts as unpublished; any other error fails.
if npm view "repo-harness@$CANDIDATE" version --registry "$NPM_REGISTRY" >"$TMP_DIR/view-candidate.out" 2>&1; then
  fail "repo-harness@$CANDIDATE is already on npm"
fi
grep -q 'E404' "$TMP_DIR/view-candidate.out" \
  || { cat "$TMP_DIR/view-candidate.out" >&2; fail "npm view of the candidate failed with an error other than E404"; }
echo "[rehearsal] parent $PARENT -> candidate $CANDIDATE"

# The pack scripts build dist/ for both packages, in the scratch copy.
(cd "$SRC" && build bun install --frozen-lockfile >"$TMP_DIR/candidate-install.log" 2>&1) \
  || { cat "$TMP_DIR/candidate-install.log" >&2; fail "bun install of the candidate source failed"; }
PACK_DIR="$TMP_DIR/pack"
mkdir -p "$PACK_DIR"
(cd "$SRC" && build npm pack --silent --pack-destination "$PACK_DIR" >/dev/null)
(cd "$SRC/packages/operator-web" && build npm pack --silent --pack-destination "$PACK_DIR" >/dev/null)
CORE_TGZ="$PACK_DIR/repo-harness-$CANDIDATE.tgz"
WEB_TGZ="$PACK_DIR/repo-harness-operator-web-$CANDIDATE.tgz"
[[ -f "$CORE_TGZ" && -f "$WEB_TGZ" ]] || fail "pack did not produce both candidate tarballs"

cat >"$TMP_DIR/registry.ts" <<'TS_EOF'
// Args: <version> <port-file> <name>=<tarball>=<package.json> ...
const [version, portFile, ...specs] = process.argv.slice(2);
const upstreamBase = "https://registry.npmjs.org";
let base = "";
const staged = await Promise.all(specs.map(async (spec) => {
  const [name, tgz, manifestPath] = spec.split("=");
  const bytes = new Uint8Array(await Bun.file(tgz).arrayBuffer());
  const shasum = new Bun.CryptoHasher("sha1").update(bytes).digest("hex");
  const integrity = `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`;
  return { name, bytes, shasum, integrity, manifest: await Bun.file(manifestPath).json() };
}));
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    console.log(req.method, url.pathname);
    for (const pkg of staged) {
      if (url.pathname === `/${pkg.name}`) {
        const packument = await (await fetch(`${upstreamBase}/${pkg.name}`, { headers: { accept: "application/json" } })).json();
        packument.versions[version] = {
          ...pkg.manifest,
          _id: `${pkg.name}@${version}`,
          dist: { tarball: `${base}/${pkg.name}/-/${pkg.name}-${version}.tgz`, shasum: pkg.shasum, integrity: pkg.integrity },
        };
        packument["dist-tags"].latest = version;
        return Response.json(packument);
      }
      if (url.pathname === `/${pkg.name}/-/${pkg.name}-${version}.tgz`) {
        console.log("TARBALL SERVED", pkg.name, version);
        return new Response(pkg.bytes);
      }
    }
    const upstream = await fetch(`${upstreamBase}${url.pathname}${url.search}`, {
      headers: { accept: req.headers.get("accept") ?? "application/json" },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" },
    });
  },
});
base = `http://127.0.0.1:${server.port}`;
await Bun.write(portFile, String(server.port));
console.log("registry on", base);
TS_EOF

bun "$TMP_DIR/registry.ts" "$CANDIDATE" "$TMP_DIR/port" \
  "repo-harness=$CORE_TGZ=$SRC/package.json" \
  "repo-harness-operator-web=$WEB_TGZ=$SRC/packages/operator-web/package.json" \
  >"$TMP_DIR/registry.log" 2>&1 &
REGISTRY_PID=$!
for _ in $(seq 1 100); do
  [[ -s "$TMP_DIR/port" ]] && break
  kill -0 "$REGISTRY_PID" 2>/dev/null || fail "the local registry exited at start"
  sleep 0.1
done
[[ -s "$TMP_DIR/port" ]] || fail "the local registry did not start"
LOCAL_REGISTRY="http://127.0.0.1:$(cat "$TMP_DIR/port")"

# The upgrade must start from an empty Bun package cache.
[[ -z "$(ls -A "$SCRATCH/bun-cache")" ]] || fail "the Bun cache of the parent install is not empty"
echo "[rehearsal] 1/3 install parent repo-harness@$PARENT from npm"
bun add -g "repo-harness@$PARENT" >"$TMP_DIR/parent-add.log" 2>&1 || { cat "$TMP_DIR/parent-add.log" >&2; fail "bun add of the parent failed"; }
[[ "$(repo-harness --version)" == "$PARENT" ]] || fail "installed parent is not $PARENT"
repo-harness install --no-cli --no-external-skills --no-codegraph >"$TMP_DIR/install.log" 2>&1 || { cat "$TMP_DIR/install.log" >&2; fail "parent install failed"; }

echo "[rehearsal] 2/3 parent update --version $CANDIDATE against $LOCAL_REGISTRY"
set +e
env NPM_CONFIG_REGISTRY="$LOCAL_REGISTRY" BUN_CONFIG_REGISTRY="$LOCAL_REGISTRY" \
  repo-harness update --version "$CANDIDATE" --no-codegraph --no-external-skills >"$TMP_DIR/update.log" 2>&1
update_exit=$?
set -e
if [[ $update_exit -ne 0 ]]; then
  cat "$TMP_DIR/update.log" >&2
  fail "update exited $update_exit"
fi

echo "[rehearsal] 3/3 check the result"
[[ "$(repo-harness --version)" == "$CANDIDATE" ]] || fail "repo-harness --version is not $CANDIDATE after update"
WEB_VERSION="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).version)' "$SCRATCH/bun/install/global/node_modules/repo-harness-operator-web/package.json" 2>/dev/null || true)"
[[ "$WEB_VERSION" == "$CANDIDATE" ]] || fail "global repo-harness-operator-web is '${WEB_VERSION:-missing}', not $CANDIDATE"
for name in repo-harness repo-harness-operator-web; do
  count="$(grep -c "^TARBALL SERVED $name $CANDIDATE\$" "$TMP_DIR/registry.log" || true)"
  [[ "$count" == 1 ]] || fail "registry served the $name@$CANDIDATE tarball $count times, expected 1"
done
grep '^TARBALL SERVED' "$TMP_DIR/registry.log"
echo "[rehearsal] OK: $PARENT -> $CANDIDATE"

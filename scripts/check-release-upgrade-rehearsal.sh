#!/usr/bin/env bash
# Upgrade rehearsal of a release: the last published repo-harness installs
# this checkout's unpublished candidate.
#
# It runs only on a disposable GitHub-hosted runner, as lane
# release-rehearsal of .github/workflows/probe.yml. The runner is the
# isolation: the script installs into the runner's real HOME and Bun global
# directory, and GitHub discards the machine after the job. The script builds
# no scratch HOME, sets no PATH and deletes nothing. It refuses a machine that
# already has a repo-harness install, so a run on a workstation stops before
# its first write.
#
# What it proves that scripts/check-tarball-install-smoke.sh does not: the
# published parent (the version npm serves as "latest") runs
# `repo-harness update --version <candidate>`, installs both candidate
# packages, the candidate reconciles the runtime, `repo-harness --version`
# then gives the candidate, and the managed archctx link moves from the
# parent's archctx pin to the candidate's pin. The parent's own
# `repo-harness update --version <parent> --no-cli` makes that managed link
# first: `install` does not link archctx, only the update path does.
#
# How: it packs repo-harness and repo-harness-operator-web from a
# `git archive` copy of HEAD, serves the candidate version of both from a
# registry on 127.0.0.1, and passes every other request to
# registry.npmjs.org. The registry log has one line for each served tarball.
#
# Not covered: the npm publish path and provenance, codegraph, the external
# skills, the `hc` binary, and the refusal cases of one release (for example a
# stale mcp.local.json), which the release PR adds by hand. It needs network
# access to registry.npmjs.org, and it fails when the candidate version is
# already on npm: the rehearsal is only valid before the publish.
set -euo pipefail

fail() { echo "[rehearsal] FAIL: $*" >&2; exit 1; }

# Fresh-machine precondition, read from the machine before any other step.
for tool in repo-harness hc; do
  found="$(command -v "$tool" || true)"
  [[ -z "$found" ]] || fail "this machine is not fresh: $tool is on PATH at $found"
done
for path in "$HOME/.repo-harness" "$HOME/.bun/install/global/node_modules/repo-harness"; do
  [[ ! -e "$path" && ! -L "$path" ]] || fail "this machine is not fresh: $path exists"
done
# The checks below read the Bun global directory under ~/.bun; Bun must install there.
# On a fresh runner that directory does not exist yet, so the precondition reads
# the variables that move it, and the parent install below proves where Bun wrote.
[[ -z "${BUN_INSTALL:-}" || "$BUN_INSTALL" == "$HOME/.bun" ]] || fail "BUN_INSTALL is $BUN_INSTALL, not $HOME/.bun"
for var in BUN_INSTALL_GLOBAL_DIR BUN_INSTALL_BIN; do
  [[ -z "${!var:-}" ]] || fail "$var is set to ${!var}; the rehearsal reads the Bun global directory under $HOME/.bun"
done
[[ -d "${RUNNER_TEMP:-}" ]] || fail "RUNNER_TEMP is not a directory; the rehearsal runs only on a GitHub-hosted runner"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d "$RUNNER_TEMP/upgrade-rehearsal.XXXXXX")"
REGISTRY_PID=""
cleanup() {
  local exit_code=$?
  if [[ -n "$REGISTRY_PID" ]]; then
    kill -TERM "$REGISTRY_PID" 2>/dev/null || true
    wait "$REGISTRY_PID" 2>/dev/null || true
  fi
  if [[ $exit_code -ne 0 && -f "$WORK/registry.log" ]]; then
    echo "[rehearsal] registry log:" >&2
    cat "$WORK/registry.log" >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT

# Candidate source: the HEAD commit of the checkout.
SRC="$WORK/src"
mkdir -p "$SRC"
git -C "$ROOT" archive HEAD | tar -x -C "$SRC"
CANDIDATE="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).version)' "$SRC/package.json")"
[[ -n "$CANDIDATE" ]] || fail "the candidate version is empty"
ARCHCTX_PIN="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).dependencies.archctx ?? "")' "$SRC/package.json")"
[[ -n "$ARCHCTX_PIN" ]] || fail "the candidate does not pin archctx"

NPM_REGISTRY=https://registry.npmjs.org
PARENT="$(npm view repo-harness version --registry "$NPM_REGISTRY" 2>"$WORK/view-parent.err")" \
  || { cat "$WORK/view-parent.err" >&2; fail "npm view of the parent version failed"; }
[[ "$PARENT" != "$CANDIDATE" ]] || fail "repo-harness@$CANDIDATE is already the latest on npm; the rehearsal needs an unpublished candidate"
# Only a confirmed not-found counts as unpublished; any other error fails.
if npm view "repo-harness@$CANDIDATE" version --registry "$NPM_REGISTRY" >"$WORK/view-candidate.out" 2>&1; then
  fail "repo-harness@$CANDIDATE is already on npm"
fi
grep -q 'E404' "$WORK/view-candidate.out" \
  || { cat "$WORK/view-candidate.out" >&2; fail "npm view of the candidate failed with an error other than E404"; }
echo "[rehearsal] parent $PARENT -> candidate $CANDIDATE (archctx pin $ARCHCTX_PIN)"

# The pack scripts build dist/ for both packages in the copy, with a Bun cache
# of their own, so the parent install below starts from the runner's cache.
build() { env "BUN_INSTALL_CACHE_DIR=$WORK/bun-cache-build" "$@"; }
(cd "$SRC" && build bun install --frozen-lockfile >"$WORK/candidate-install.log" 2>&1) \
  || { cat "$WORK/candidate-install.log" >&2; fail "bun install of the candidate source failed"; }
PACK_DIR="$WORK/pack"
mkdir -p "$PACK_DIR"
(cd "$SRC" && build npm pack --silent --pack-destination "$PACK_DIR" >/dev/null)
(cd "$SRC/packages/operator-web" && build npm pack --silent --pack-destination "$PACK_DIR" >/dev/null)
CORE_TGZ="$PACK_DIR/repo-harness-$CANDIDATE.tgz"
WEB_TGZ="$PACK_DIR/repo-harness-operator-web-$CANDIDATE.tgz"
[[ -f "$CORE_TGZ" && -f "$WEB_TGZ" ]] || fail "pack did not produce both candidate tarballs"

cat >"$WORK/registry.ts" <<'TS_EOF'
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
        // Probe negative 1: the candidate tarballs are not served.
        console.log("TARBALL REFUSED", pkg.name, version);
        return new Response("not served", { status: 404 });
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

bun "$WORK/registry.ts" "$CANDIDATE" "$WORK/port" \
  "repo-harness=$CORE_TGZ=$SRC/package.json" \
  "repo-harness-operator-web=$WEB_TGZ=$SRC/packages/operator-web/package.json" \
  >"$WORK/registry.log" 2>&1 &
REGISTRY_PID=$!
for _ in $(seq 1 100); do
  [[ -s "$WORK/port" ]] && break
  kill -0 "$REGISTRY_PID" 2>/dev/null || fail "the local registry exited at start"
  sleep 0.1
done
[[ -s "$WORK/port" ]] || fail "the local registry did not start"
LOCAL_REGISTRY="http://127.0.0.1:$(cat "$WORK/port")"

# Prints the version of the archctx package that ~/.bun/bin/archctx resolves to.
archctx_link_version() {
  bun -e '
    const { realpathSync, existsSync, readFileSync } = require("node:fs");
    const { dirname, join } = require("node:path");
    let dir = dirname(realpathSync(process.argv[1]));
    while (true) {
      const manifest = join(dir, "package.json");
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        if (pkg.name === "archctx") { console.log(pkg.version); break; }
      }
      if (dirname(dir) === dir) process.exit(1);
      dir = dirname(dir);
    }
  ' "$HOME/.bun/bin/archctx"
}

echo "[rehearsal] 1/3 install parent repo-harness@$PARENT from npm"
bun add -g "repo-harness@$PARENT" >"$WORK/parent-add.log" 2>&1 || { cat "$WORK/parent-add.log" >&2; fail "bun add of the parent failed"; }
[[ -f "$HOME/.bun/install/global/node_modules/repo-harness/package.json" ]] || fail "bun add -g did not install into $HOME/.bun/install/global"
[[ "$(command -v repo-harness)" == "$HOME/.bun/bin/repo-harness" ]] || fail "repo-harness resolves to '$(command -v repo-harness || true)', not $HOME/.bun/bin/repo-harness"
[[ "$(repo-harness --version)" == "$PARENT" ]] || fail "installed parent is not $PARENT"
repo-harness install --no-cli --no-external-skills --no-codegraph >"$WORK/install.log" 2>&1 || { cat "$WORK/install.log" >&2; fail "parent install failed"; }
# The parent's update to its own version, from npm, makes the managed archctx
# link of the parent pin, as on a user machine that ran update once.
PARENT_ARCHCTX_PIN="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).dependencies.archctx ?? "")' "$HOME/.bun/install/global/node_modules/repo-harness/package.json")"
[[ -n "$PARENT_ARCHCTX_PIN" ]] || fail "the parent does not pin archctx"
repo-harness update --version "$PARENT" --no-cli --no-codegraph --no-external-skills >"$WORK/parent-update.log" 2>&1 \
  || { cat "$WORK/parent-update.log" >&2; fail "the parent update to its own version failed"; }
BEFORE_LINK_VERSION="$(archctx_link_version 2>/dev/null || true)"
echo "[rehearsal] archctx link before update: ${BEFORE_LINK_VERSION:-absent} (parent pin $PARENT_ARCHCTX_PIN)"
[[ "$BEFORE_LINK_VERSION" == "$PARENT_ARCHCTX_PIN" ]] \
  || fail "before the update, $HOME/.bun/bin/archctx resolves to archctx '${BEFORE_LINK_VERSION:-missing}', not the parent pin $PARENT_ARCHCTX_PIN"

echo "[rehearsal] 2/3 parent update --version $CANDIDATE against $LOCAL_REGISTRY"
set +e
env NPM_CONFIG_REGISTRY="$LOCAL_REGISTRY" BUN_CONFIG_REGISTRY="$LOCAL_REGISTRY" \
  repo-harness update --version "$CANDIDATE" --no-codegraph --no-external-skills >"$WORK/update.log" 2>&1
update_exit=$?
set -e
if [[ $update_exit -ne 0 ]]; then
  cat "$WORK/update.log" >&2
  fail "update exited $update_exit"
fi

echo "[rehearsal] 3/3 check the result"
[[ "$(repo-harness --version)" == "$CANDIDATE" ]] || fail "repo-harness --version is not $CANDIDATE after update"
WEB_VERSION="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).version)' "$HOME/.bun/install/global/node_modules/repo-harness-operator-web/package.json" 2>/dev/null || true)"
[[ "$WEB_VERSION" == "$CANDIDATE" ]] || fail "global repo-harness-operator-web is '${WEB_VERSION:-missing}', not $CANDIDATE"
LINK_VERSION="$(archctx_link_version 2>/dev/null || true)"
[[ "$LINK_VERSION" == "$ARCHCTX_PIN" ]] || fail "$HOME/.bun/bin/archctx resolves to archctx '${LINK_VERSION:-missing}', not the pin $ARCHCTX_PIN"
echo "[rehearsal] archctx link: $BEFORE_LINK_VERSION -> $LINK_VERSION"
for name in repo-harness repo-harness-operator-web; do
  count="$(grep -c "^TARBALL SERVED $name $CANDIDATE\$" "$WORK/registry.log" || true)"
  [[ "$count" == 1 ]] || fail "registry served the $name@$CANDIDATE tarball $count times, expected 1"
done
grep '^TARBALL SERVED' "$WORK/registry.log"
echo "[rehearsal] OK: $PARENT -> $CANDIDATE"

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
# Needs network access to registry.npmjs.org. Fails when the candidate version
# is already on npm: the rehearsal is only valid before the publish.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Same native /tmp root as the other release scripts (Git Bash maps /tmp elsewhere).
TMP_DIR="$(bun -e 'const fs = require("node:fs"); const path = require("node:path"); const root = path.resolve("/tmp"); fs.mkdirSync(root, { recursive: true }); console.log(fs.mkdtempSync(path.join(fs.realpathSync(root), "rh-upgrade-rehearsal.")).replaceAll("\\", "/"));')"
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

CANDIDATE="$(bun -e 'console.log((await Bun.file("package.json").json()).version)')"
PARENT="$(npm view repo-harness version --registry https://registry.npmjs.org)"
[[ "$PARENT" != "$CANDIDATE" ]] || fail "repo-harness@$CANDIDATE is already the latest on npm; the rehearsal needs an unpublished candidate"
if npm view "repo-harness@$CANDIDATE" version --registry https://registry.npmjs.org >/dev/null 2>&1; then
  fail "repo-harness@$CANDIDATE is already on npm"
fi
echo "[rehearsal] parent $PARENT -> candidate $CANDIDATE"

# The pack scripts build dist/ for both packages.
PACK_DIR="$TMP_DIR/pack"
mkdir -p "$PACK_DIR"
npm pack --silent --pack-destination "$PACK_DIR" >/dev/null
(cd "$ROOT/packages/operator-web" && npm pack --silent --pack-destination "$PACK_DIR" >/dev/null)
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
  "repo-harness=$CORE_TGZ=$ROOT/package.json" \
  "repo-harness-operator-web=$WEB_TGZ=$ROOT/packages/operator-web/package.json" \
  >"$TMP_DIR/registry.log" 2>&1 &
REGISTRY_PID=$!
for _ in $(seq 1 100); do
  [[ -s "$TMP_DIR/port" ]] && break
  kill -0 "$REGISTRY_PID" 2>/dev/null || fail "the local registry exited at start"
  sleep 0.1
done
[[ -s "$TMP_DIR/port" ]] || fail "the local registry did not start"
LOCAL_REGISTRY="http://127.0.0.1:$(cat "$TMP_DIR/port")"

# Scratch environment. HOME and the harness home sit side by side, as in the
# tarball smoke: the host test runner rejects a registry below its caller HOME.
SCRATCH="$TMP_DIR/env"
mkdir -p "$SCRATCH/home" "$SCRATCH/bun" "$SCRATCH/npm-cache" "$SCRATCH/npm-prefix"
export HOME="$SCRATCH/home"
export REPO_HARNESS_HOME="$SCRATCH/registry"
export BUN_INSTALL="$SCRATCH/bun"
export npm_config_cache="$SCRATCH/npm-cache"
export npm_config_prefix="$SCRATCH/npm-prefix"
export XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share" XDG_CACHE_HOME="$HOME/.cache"
export PATH="$BUN_INSTALL/bin:$PATH"
unset NPM_CONFIG_REGISTRY BUN_CONFIG_REGISTRY

echo "[rehearsal] 1/3 install parent repo-harness@$PARENT from npm"
bun add -g "repo-harness@$PARENT" >"$TMP_DIR/parent-add.log" 2>&1 || { cat "$TMP_DIR/parent-add.log" >&2; fail "bun add of the parent failed"; }
[[ "$(repo-harness --version)" == "$PARENT" ]] || fail "installed parent is not $PARENT"
repo-harness install --no-cli --no-external-skills --no-codegraph >"$TMP_DIR/install.log" 2>&1 || { cat "$TMP_DIR/install.log" >&2; fail "parent install failed"; }

echo "[rehearsal] 2/3 parent update --version $CANDIDATE against $LOCAL_REGISTRY"
set +e
NPM_CONFIG_REGISTRY="$LOCAL_REGISTRY" BUN_CONFIG_REGISTRY="$LOCAL_REGISTRY" \
  repo-harness update --version "$CANDIDATE" --no-codegraph --no-external-skills >"$TMP_DIR/update.log" 2>&1
update_exit=$?
set -e
if [[ $update_exit -ne 0 ]]; then
  cat "$TMP_DIR/update.log" >&2
  fail "update exited $update_exit"
fi

echo "[rehearsal] 3/3 check the result"
[[ "$(repo-harness --version)" == "$CANDIDATE" ]] || fail "repo-harness --version is not $CANDIDATE after update"
WEB_VERSION="$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).version)' "$BUN_INSTALL/install/global/node_modules/repo-harness-operator-web/package.json" 2>/dev/null || true)"
[[ "$WEB_VERSION" == "$CANDIDATE" ]] || fail "global repo-harness-operator-web is '${WEB_VERSION:-missing}', not $CANDIDATE"
for name in repo-harness repo-harness-operator-web; do
  count="$(grep -c "^TARBALL SERVED $name $CANDIDATE\$" "$TMP_DIR/registry.log" || true)"
  [[ "$count" == 1 ]] || fail "registry served the $name@$CANDIDATE tarball $count times, expected 1"
done
grep '^TARBALL SERVED' "$TMP_DIR/registry.log"
echo "[rehearsal] OK: $PARENT -> $CANDIDATE"

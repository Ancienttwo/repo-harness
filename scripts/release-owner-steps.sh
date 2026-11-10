#!/usr/bin/env bash
set -euo pipefail

# The release steps (#2006, #2194). The life cycle stops at the merged release PR. This script only reads git, npm
# and GitHub: `plan` prints the command list bound to one release commit, `guard` runs before each publish from the
# release worktree, `workflow-guard` runs in .github/workflows/release.yml before its lane and its publishes, and
# `check` reads back each step.

CALLER_DIR="$(pwd -P)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE="${RELEASE_REMOTE:-origin}"
NPM_RELEASE_REGISTRY="${NPM_RELEASE_REGISTRY:-https://registry.npmjs.org/}"
CONSOLE_DIR="packages/operator-web"

# npm view, pack and install read config and write a cache and logs. Public registry reads need no auth, so npm
# gets empty scratch config files and never reads the owner's npmrc or writes under the owner HOME.
NPM_SCRATCH="$(mktemp -d)"
trap 'rm -rf "$NPM_SCRATCH"' EXIT
# npm refuses one file as both the user and the global config, so each gets its own.
: >"$NPM_SCRATCH/user-npmrc"
: >"$NPM_SCRATCH/global-npmrc"
export npm_config_userconfig="$NPM_SCRATCH/user-npmrc" npm_config_globalconfig="$NPM_SCRATCH/global-npmrc"
export npm_config_cache="$NPM_SCRATCH/cache" npm_config_logs_dir="$NPM_SCRATCH/logs"

usage() {
  echo "usage: $0 plan <version> | notes <version> | guard <version> <sha> | workflow-guard <sha> | check published <version> | check tagged <version>" >&2
  exit 2
}

fail() {
  echo "[release-owner] ERROR: $*" >&2
  exit 1
}

json_field() {
  bun -e 'const value = JSON.parse(await Bun.stdin.text()); console.log(process.argv[1].split(".").reduce((v, k) => v?.[k], value) ?? "")' "$1"
}

# The release commit is the first-parent commit on the remote main that set package.json to the version. The
# local remote ref must equal the live remote: a stale ref would bind the steps to an old main.
release_commit() {
  local version="$1" live local_ref sha candidate file got
  live="$(git ls-remote "$REMOTE" refs/heads/main | cut -f1)" || fail "git ls-remote $REMOTE refs/heads/main failed."
  local_ref="$(git rev-parse -q --verify "refs/remotes/$REMOTE/main" || true)"
  [[ -n "$live" ]] || fail "git ls-remote $REMOTE refs/heads/main returned no commit."
  [[ "$live" == "$local_ref" ]] || fail "$REMOTE/main is $local_ref, the remote is $live. Run git fetch $REMOTE first."
  sha=""
  for candidate in $(git log "$REMOTE/main" --first-parent --format=%H -S"\"version\": \"${version}\"" -- package.json); do
    if [[ "$(git show "$candidate:package.json" | json_field version)" == "$version" ]]; then
      sha="$candidate"
      break
    fi
  done
  [[ -n "$sha" ]] || fail "no first-parent commit on $REMOTE/main sets package.json version ${version}."
  # Both versions change in the release commit: a version already in its parent was bumped by another commit.
  for file in package.json "$CONSOLE_DIR/package.json"; do
    got="$(git show "$sha:$file" | json_field version)"
    [[ "$got" == "$version" ]] || fail "$file at $sha has version $got, not ${version}."
    git rev-parse -q --verify "$sha^1" >/dev/null || continue
    got="$(git show "$sha^1:$file" | json_field version)"
    [[ "$got" != "$version" ]] || fail "$file already has version ${version} at the parent of $sha; $sha is not the release commit."
  done
  echo "$sha"
}

# The CHANGELOG section of the version at the release commit, without its heading.
release_notes() {
  local version="$1" sha="$2" notes
  # awk reads to the end: an early exit would end git show with SIGPIPE, which pipefail reports as a failure.
  notes="$(git show "$sha:docs/CHANGELOG.md" | awk -v heading="## [${version}]" '
    index($0, heading) == 1 { found = 1; next }
    /^## \[/ { found = 0 }
    found { print }
  ')"
  [[ -n "${notes//[[:space:]]/}" ]] || fail "docs/CHANGELOG.md at $sha has no [${version}] section."
  printf '%s\n' "$notes"
}

package_names() {
  local sha="$1"
  git show "$sha:$CONSOLE_DIR/package.json" | json_field name
  git show "$sha:package.json" | json_field name
}

require_unpublished() {
  local spec="$1" stderr
  stderr="$(mktemp)"
  if npm view "$spec" version --json --registry "$NPM_RELEASE_REGISTRY" >/dev/null 2>"$stderr"; then
    rm -f "$stderr"
    fail "$spec is already on npm. Read it back with: bash scripts/release-owner-steps.sh check published ${spec##*@}"
  fi
  if ! grep -Eq 'E404|404 Not Found|No match found|not in this registry' "$stderr"; then
    cat "$stderr" >&2
    rm -f "$stderr"
    fail "unable to prove $spec is unpublished."
  fi
  rm -f "$stderr"
}

release_worktree() {
  echo "/tmp/repo-harness-wt-release-$1"
}

# Run right before each npm publish: the checkout must be the approved release commit, unchanged.
guard() {
  local version="$1" sha="$2" expected
  expected="$(cd "$(release_worktree "$version")" 2>/dev/null && pwd -P)" || fail "$(release_worktree "$version") does not exist."
  # The publish that follows runs in the caller's directory, so the guard checks that directory and this script's checkout.
  [[ "$CALLER_DIR" == "$expected" && "$(pwd -P)" == "$expected" ]] || fail "the checkout is $CALLER_DIR, not $expected."
  checkout_is_release "$version" "$sha"
  echo "[release-owner] OK: guard. $expected is the release commit $sha at ${version}."
}

# The publish runs from this checkout, so it must be the release commit, unchanged, at the version.
checkout_is_release() {
  local version="$1" sha="$2" head status file got
  head="$(git rev-parse HEAD)" || fail "git rev-parse HEAD failed."
  [[ "$head" == "$sha" ]] || fail "HEAD is $head, not the release commit $sha."
  # No optional locks: git status must not refresh the index of the release checkout.
  status="$(GIT_OPTIONAL_LOCKS=0 git status --porcelain)" || fail "git status failed."
  [[ -z "$status" ]] || fail "the checkout has changes; publish only the release commit."
  for file in package.json "$CONSOLE_DIR/package.json"; do
    got="$(json_field version < "$file")"
    [[ "$got" == "$version" ]] || fail "$file has version $got, not ${version}."
  done
}

# The release workflow names only a commit. The commit must be the release commit of its own package.json
# version, that version must be unpublished and untagged, and the job checkout must be that commit. Prints the version.
workflow_guard() {
  local sha="$1" version release
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "$sha is not a full commit SHA."
  version="$(git show "$sha:package.json" | json_field version)" || fail "git show $sha:package.json failed."
  [[ -n "$version" ]] || fail "package.json at $sha has no version."
  release="$(preflight "$version")"
  [[ "$release" == "$sha" ]] || fail "$sha is not the release commit of ${version}; that is $release."
  checkout_is_release "$version" "$sha"
  echo "[release-owner] OK: workflow guard. $sha is the release commit of ${version}." >&2
  echo "$version"
}

remote_tag_refs() {
  local version="$1" refs
  refs="$(git ls-remote --tags "$REMOTE" "refs/tags/v${version}" "refs/tags/v${version}^{}")" || fail "git ls-remote --tags $REMOTE failed."
  printf '%s' "$refs"
}

repository_slug() {
  gh repo view --json nameWithOwner --jq .nameWithOwner || fail "gh repo view failed."
}

# The release commit of the version, with its CHANGELOG section, both packages unpublished and no tag. Prints the commit.
preflight() {
  local version="$1" sha console_name core_name remote_tag local_tag
  sha="$(release_commit "$version")"
  # guard, notes and the readbacks run from the release commit's own checkout.
  git cat-file -e "$sha:scripts/release-owner-steps.sh" 2>/dev/null || fail "the release commit $sha has no scripts/release-owner-steps.sh; release a commit that has it."
  release_notes "$version" "$sha" >/dev/null
  { read -r console_name; read -r core_name; } < <(package_names "$sha")
  [[ -n "$console_name" && -n "$core_name" ]] || fail "the package manifests at $sha name no package."
  require_unpublished "${console_name}@${version}"
  require_unpublished "${core_name}@${version}"
  remote_tag="$(remote_tag_refs "$version")"
  [[ -z "$remote_tag" ]] || fail "tag v${version} already exists on $REMOTE."
  # Worktrees share tags: a local tag would stop the tag step after both packages are on npm.
  # rev-parse --verify exits 1 for a missing ref; any other failure proves nothing.
  local_tag=0
  git rev-parse -q --verify "refs/tags/v${version}" >/dev/null || local_tag=$?
  [[ "$local_tag" != 0 ]] || fail "tag v${version} already exists in this repository."
  [[ "$local_tag" == 1 ]] || fail "git rev-parse of tag v${version} failed."
  echo "$sha"
}

plan() {
  local version="$1" sha slug repository_id console_name core_name upgrade worktree
  sha="$(preflight "$version")"
  { read -r console_name; read -r core_name; } < <(package_names "$sha")
  slug="$(repository_slug)"
  repository_id="$(gh api "repos/$slug" --jq .id)" || fail "gh api repos/$slug failed."
  upgrade="$(release_notes "$version" "$sha" | awk '/^### Upgrade/ { found = 1; next } /^### / { found = 0 } found { print }')"
  worktree="$(release_worktree "$version")"

  cat <<EOF
Release GO: ${core_name} ${version} at ${sha}

Owner steps. Run them in order. At the first failure, stop and report it; do not retry or publish again.
1. git fetch ${REMOTE} && git worktree add --detach ${worktree} ${sha} && cd ${worktree} && bun install --frozen-lockfile
2. bash scripts/release-owner-steps.sh guard ${version} ${sha} && (cd ${CONSOLE_DIR} && npm publish --auth-type=web)
3. bash scripts/release-owner-steps.sh guard ${version} ${sha} && npm publish --auth-type=web
4. bash scripts/release-owner-steps.sh check published ${version}
5. git tag -a v${version} ${sha} -m "${core_name} ${version}" && git push ${REMOTE} v${version}
6. bash scripts/release-owner-steps.sh notes ${version} > ${worktree}.notes.md && gh release create v${version} --repo ${slug} --verify-tag --title "${core_name} ${version}" --notes-file ${worktree}.notes.md
7. bash scripts/release-owner-steps.sh check tagged ${version}

Post-release steps, a joint decision of the orchestrator and the advisor after step 7 passes:
8. bun add -g ${core_name}@${version} --no-cache && ${core_name} update --version ${version}
9. The upgrade steps of the release notes:
${upgrade:-   (the [${version}] section has no Upgrade part)}
10. Each of the orchestrator and advisor seats writes its handoff. Close its old pane, then start it again:
   herdr-app do tab.new --name "\$(repo-harness seats argv orchestrator --repository-id ${repository_id} --json | jq -r .tab)" --space <space> --folder <checkout> --argv "\$(repo-harness seats argv orchestrator --repository-id ${repository_id})"
   herdr-app do pane.split --direction right --pane <orchestrator pane> --argv "\$(repo-harness seats argv advisor --repository-id ${repository_id})"
EOF
}

check_published() {
  local version="$1"
  release_commit "$version" >/dev/null
  bash scripts/check-release-published.sh "$version" --before-tag
  echo "[release-owner] OK: step 4. Both packages read back at ${version}; create the tag next."
}

check_tagged() {
  local version="$1" sha refs tag_commit slug release
  sha="$(release_commit "$version")"
  refs="$(remote_tag_refs "$version")"
  [[ -n "$refs" ]] || fail "tag v${version} is not on $REMOTE."
  # An annotated tag has a peeled ^{} line, which names the commit; a lightweight tag names the commit itself.
  tag_commit="$(awk '/\^\{\}$/ { peeled = $1 } { direct = $1 } END { print peeled ? peeled : direct }' <<<"$refs")"
  [[ "$tag_commit" == "$sha" ]] || fail "tag v${version} is at $tag_commit, not at the release commit $sha."
  slug="$(repository_slug)"
  release="$(gh release view "v${version}" --repo "$slug" --json tagName,isDraft,isPrerelease)" || fail "GitHub Release v${version} is missing."
  [[ "$(json_field tagName <<<"$release")" == "v${version}" ]] || fail "GitHub Release v${version} names another tag."
  [[ "$(json_field isDraft <<<"$release")" == "false" ]] || fail "GitHub Release v${version} is a draft."
  [[ "$(json_field isPrerelease <<<"$release")" == "false" ]] || fail "GitHub Release v${version} is a prerelease."
  echo "[release-owner] OK: step 7. Tag v${version} and its GitHub Release are at ${sha}."
}

case "${1:-}" in
  plan) [[ $# -eq 2 ]] || usage; plan "$2" ;;
  notes)
    [[ $# -eq 2 ]] || usage
    sha="$(release_commit "$2")"
    release_notes "$2" "$sha"
    ;;
  guard) [[ $# -eq 3 ]] || usage; guard "$2" "$3" ;;
  workflow-guard) [[ $# -eq 2 ]] || usage; workflow_guard "$2" ;;
  check)
    [[ $# -eq 3 ]] || usage
    case "$2" in
      published) check_published "$3" ;;
      tagged) check_tagged "$3" ;;
      *) usage ;;
    esac
    ;;
  *) usage ;;
esac

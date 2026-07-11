#!/usr/bin/env sh
set -eu

ORIGINAL_PATH="${PATH:-}"

PACKAGE_NAME="repo-harness"
PACKAGE_VERSION="${REPO_HARNESS_VERSION:-latest}"
MIN_BUN_VERSION="1.1.35"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'repo-harness install: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

HOME_DIR="${HOME:-}"
[ -n "$HOME_DIR" ] || die "HOME is not set"
BUN_INSTALL_DIR="${BUN_INSTALL:-$HOME_DIR/.bun}"

bun_version_at_least() {
  current_version="${1:-}"
  awk -v current="$current_version" -v minimum="$MIN_BUN_VERSION" 'BEGIN {
    current_count = split(current, current_parts, /[.-]/)
    minimum_count = split(minimum, minimum_parts, /[.-]/)
    if (current_count < 3 || minimum_count < 3) exit 1
    for (i = 1; i <= 3; i++) {
      if (current_parts[i] !~ /^[0-9]+$/ || minimum_parts[i] !~ /^[0-9]+$/) exit 1
      if ((current_parts[i] + 0) > (minimum_parts[i] + 0)) exit 0
      if ((current_parts[i] + 0) < (minimum_parts[i] + 0)) exit 1
    }
    exit 0
  }'
}

install_bun() {
  if has_command bun; then
    current_bun_version="$(bun --version 2>/dev/null || true)"
    if bun_version_at_least "$current_bun_version"; then
      return 0
    fi
    bun_action="Upgrading"
  else
    bun_action="Installing"
  fi

  has_command bash || die "bash is required to install Bun automatically"

  if has_command curl; then
    log "${bun_action} Bun runtime to >= ${MIN_BUN_VERSION}..."
    curl -fsSL https://bun.sh/install | bash
  elif has_command wget; then
    log "${bun_action} Bun runtime to >= ${MIN_BUN_VERSION}..."
    wget -qO- https://bun.sh/install | bash
  else
    die "curl or wget is required to install Bun automatically"
  fi

  export PATH="$BUN_INSTALL_DIR/bin:$PATH"
  has_command bun || die "Bun install completed, but bun is still not on PATH"
  current_bun_version="$(bun --version 2>/dev/null || true)"
  bun_version_at_least "$current_bun_version" || die "Bun >= ${MIN_BUN_VERSION} is required (found: ${current_bun_version:-unknown})"
}

install_repo_harness() {
  package_spec="${PACKAGE_NAME}@${PACKAGE_VERSION}"
  log "Installing ${package_spec} with Bun..."
  bun add -g "$package_spec"
}

verify_repo_harness() {
  export PATH="$BUN_INSTALL_DIR/bin:$PATH"
  has_command repo-harness || die "repo-harness is not on PATH after installation"
  version="$(repo-harness --version 2>/dev/null || true)"
  [ -n "$version" ] || die "repo-harness installed, but version readback failed"
  log "repo-harness ${version} installed."
}

if [ "${REPO_HARNESS_DRY_RUN:-0}" = "1" ]; then
  log "DRY RUN: would ensure Bun >= ${MIN_BUN_VERSION}, install ${PACKAGE_NAME}@${PACKAGE_VERSION}, and verify repo-harness --version."
  exit 0
fi

install_bun
install_repo_harness
verify_repo_harness

log ""
log "Next:"
log "  repo-harness install"
log "  repo-harness adopt --dry-run"

case ":$ORIGINAL_PATH:" in
  *":$BUN_INSTALL_DIR/bin:"*) ;;
  *)
    log ""
    log "To use repo-harness in new shells, add to your shell profile:"
    log "  export PATH=\"$BUN_INSTALL_DIR/bin:\$PATH\""
    ;;
esac

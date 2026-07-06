#!/usr/bin/env sh
set -eu

ORIGINAL_PATH="${PATH:-}"

PACKAGE_NAME="repo-harness"
PACKAGE_VERSION="${REPO_HARNESS_VERSION:-latest}"

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

install_bun() {
  if has_command bun; then
    return 0
  fi

  has_command bash || die "bash is required to install Bun automatically"

  if has_command curl; then
    log "Installing Bun runtime..."
    curl -fsSL https://bun.sh/install | bash
  elif has_command wget; then
    log "Installing Bun runtime..."
    wget -qO- https://bun.sh/install | bash
  else
    die "curl or wget is required to install Bun automatically"
  fi

  export PATH="$BUN_INSTALL_DIR/bin:$PATH"
  has_command bun || die "Bun install completed, but bun is still not on PATH"
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
  log "DRY RUN: would ensure Bun, install ${PACKAGE_NAME}@${PACKAGE_VERSION}, and verify repo-harness --version."
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

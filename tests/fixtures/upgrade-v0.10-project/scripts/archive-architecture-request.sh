#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/archive-architecture-request.sh --request <docs/architecture/requests/file.md> --status <resolved|superseded|rejected|no-change> [--artifact <path>] [--note <text>]

Archives a handled architecture drift request without making semantic architecture decisions.
USAGE_EOF
}

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
repo="$(cd "$repo" && pwd)"
cd "$repo"

request_file=""
status=""
note=""
artifacts=()

architecture_transaction_dir=""
architecture_transaction_active=0
architecture_transaction_paths=()
architecture_transaction_existed=()

architecture_transaction_snapshot() {
  local path="$1"
  local index="${#architecture_transaction_paths[@]}"
  architecture_transaction_paths+=("$path")
  if [[ -e "$path" || -L "$path" ]]; then
    architecture_transaction_existed+=("1")
    mkdir -p "$architecture_transaction_dir/$index"
    cp -Rp "$path" "$architecture_transaction_dir/$index/value"
  else
    architecture_transaction_existed+=("0")
  fi
}

architecture_transaction_rollback() {
  local index path
  for ((index = ${#architecture_transaction_paths[@]} - 1; index >= 0; index--)); do
    path="${architecture_transaction_paths[$index]}"
    rm -rf "$path"
    if [[ "${architecture_transaction_existed[$index]}" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$architecture_transaction_dir/$index/value" "$path"
    fi
  done
}

architecture_transaction_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$architecture_transaction_active" -eq 1 && "$status" -ne 0 ]]; then
    if ! architecture_transaction_rollback; then
      echo "archive-architecture-request: rollback failed; inspect $architecture_transaction_dir before retrying" >&2
      status=1
    else
      echo "archive-architecture-request: archive failed; restored live architecture artifacts" >&2
    fi
  fi
  [[ -z "$architecture_transaction_dir" ]] || rm -rf "$architecture_transaction_dir"
  exit "$status"
}

architecture_transaction_begin() {
  local file
  architecture_transaction_dir="$(mktemp -d)"
  architecture_transaction_active=1
  trap architecture_transaction_on_exit EXIT
  architecture_transaction_snapshot "docs/architecture"
  while IFS= read -r file; do
    if grep -Fq "Pending architecture request: \`${rel_request}\`" "$file" ||
       grep -Fq "Pending architecture request: \`${rel_request#docs/architecture/}\`" "$file"; then
      architecture_transaction_snapshot "${file#./}"
    fi
  done < <(find . \
    \( -path './.git' -o -path './node_modules' -o -path './_ref' -o -path './_ops' \) -prune -o \
    \( -name 'AGENTS.md' -o -name 'CLAUDE.md' \) -type f -print 2>/dev/null)
}

architecture_transaction_commit() {
  architecture_transaction_active=0
  trap - EXIT
  rm -rf "$architecture_transaction_dir"
  architecture_transaction_dir=""
}

metadata_value() {
  local file="$1"
  local label="$2"
  awk -v label="$label" '
    index($0, "> **" label "**:") == 1 {
      sub("^> \\*\\*" label "\\*\\*:[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$file" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

safe_token() {
  local value="$1"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  printf '%s' "${value:-request}"
}

repo_relative_path() {
  local value="$1"
  value="${value#file://}"
  case "$value" in
    "$repo"/*)
      value="${value#$repo/}"
      ;;
    /*)
      return 1
      ;;
    ./*)
      value="${value#./}"
      ;;
  esac

  case "$value" in
    ""|.|..|../*|*/..|*/../*|*$'\n'*|*$'\r'*)
      return 1
      ;;
  esac

  printf '%s' "$value"
}

canonical_status() {
  case "$(safe_token "$1")" in
    resolved)
      printf 'Resolved'
      ;;
    superseded)
      printf 'Superseded'
      ;;
    rejected)
      printf 'Rejected'
      ;;
    no-change|no-architecture-change|no-arch-change)
      printf 'No architecture change'
      ;;
    *)
      return 1
      ;;
  esac
}

clear_contract_pending_request() {
  local rel_request="$1"
  local short_request="${rel_request#docs/architecture/}"
  local file tmp

  while IFS= read -r file; do
    if ! grep -Fq "Pending architecture request: \`${rel_request}\`" "$file" &&
       ! grep -Fq "Pending architecture request: \`${short_request}\`" "$file"; then
      continue
    fi
    tmp="$(mktemp)"
    awk -v rel="$rel_request" -v short="$short_request" '
      index($0, "Pending architecture request: `" rel "`") > 0 ||
      index($0, "Pending architecture request: `" short "`") > 0 {
        print "- Pending architecture request: `(none)`"
        next
      }
      { print }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
    echo "[ArchitectureArchive] Cleared pending architecture request in ${file#./}"
  done < <(find . \
    \( -path './.git' -o -path './node_modules' -o -path './_ref' -o -path './_ops' \) -prune -o \
    \( -name 'AGENTS.md' -o -name 'CLAUDE.md' \) -type f -print 2>/dev/null)
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request)
      [[ -n "${2:-}" ]] || { echo "archive-architecture-request: --request requires a value" >&2; exit 2; }
      request_file="$2"
      shift 2
      ;;
    --status)
      [[ -n "${2:-}" ]] || { echo "archive-architecture-request: --status requires a value" >&2; exit 2; }
      status="$2"
      shift 2
      ;;
    --artifact)
      [[ -n "${2:-}" ]] || { echo "archive-architecture-request: --artifact requires a value" >&2; exit 2; }
      artifacts+=("$2")
      shift 2
      ;;
    --note)
      [[ -n "${2:-}" ]] || { echo "archive-architecture-request: --note requires a value" >&2; exit 2; }
      note="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "archive-architecture-request: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$request_file" || -z "$status" ]]; then
  usage >&2
  exit 2
fi

rel_request="$(repo_relative_path "$request_file" || true)"
if [[ -z "$rel_request" ]]; then
  echo "archive-architecture-request: unsafe request path: $request_file" >&2
  exit 2
fi

case "$rel_request" in
  docs/architecture/requests/*.md)
    ;;
  *)
    echo "archive-architecture-request: request must be under docs/architecture/requests/: $rel_request" >&2
    exit 2
    ;;
esac

case "$rel_request" in
  docs/architecture/requests/archive/*)
    echo "archive-architecture-request: request is already archived: $rel_request" >&2
    exit 2
    ;;
esac

if [[ ! -f "$rel_request" ]]; then
  echo "archive-architecture-request: request not found: $rel_request" >&2
  exit 1
fi
if [[ -L "$rel_request" ]]; then
  echo "archive-architecture-request: request must not be a symlink: $rel_request" >&2
  exit 2
fi

request_status="$(metadata_value "$rel_request" "Status")"
if [[ "$request_status" != "Pending" ]]; then
  echo "archive-architecture-request: request status must be Pending, got ${request_status:-missing}: $rel_request" >&2
  exit 1
fi

queue_helper="$SCRIPT_DIR/architecture-queue.sh"
if [[ ! -f "$queue_helper" ]]; then
  echo "archive-architecture-request: architecture queue helper is missing: $queue_helper" >&2
  exit 1
fi

resolved_status="$(canonical_status "$status" || true)"
if [[ -z "$resolved_status" ]]; then
  echo "archive-architecture-request: unsupported status: $status" >&2
  usage >&2
  exit 2
fi

artifact_lines=()
artifact_paths=()
if [[ "${#artifacts[@]}" -gt 0 ]]; then
  for artifact in "${artifacts[@]-}"; do
    [[ -n "$artifact" ]] || continue
    rel_artifact="$(repo_relative_path "$artifact" || true)"
    if [[ -z "$rel_artifact" ]]; then
      echo "archive-architecture-request: unsafe artifact path: $artifact" >&2
      exit 2
    fi
    if [[ ! -e "$rel_artifact" ]]; then
      echo "archive-architecture-request: artifact does not exist: $rel_artifact" >&2
      exit 1
    fi
    if [[ -L "$rel_artifact" ]]; then
      echo "archive-architecture-request: artifact must not be a symlink: $rel_artifact" >&2
      exit 2
    fi
    artifact_parent="$(cd "$(dirname "$rel_artifact")" && pwd -P)"
    case "$artifact_parent/$(basename "$rel_artifact")" in
      "$repo"/*)
        ;;
      *)
        echo "archive-architecture-request: artifact resolves outside the repository: $rel_artifact" >&2
        exit 2
        ;;
    esac
    artifact_paths+=("$rel_artifact")
    artifact_lines+=("- \`${rel_artifact}\`")
  done
fi

if [[ "$resolved_status" == "Resolved" ]]; then
  architecture_module="$(metadata_value "$rel_request" "Architecture Module")"
  if [[ -z "$architecture_module" ]]; then
    echo "archive-architecture-request: Resolved requires Architecture Module metadata: $rel_request" >&2
    exit 1
  fi
  if [[ ! -f "$architecture_module" ]]; then
    echo "archive-architecture-request: architecture module does not exist: $architecture_module" >&2
    exit 1
  fi
  module_recorded=0
  for artifact in "${artifact_paths[@]-}"; do
    if [[ "$artifact" == "$architecture_module" ]]; then
      module_recorded=1
      break
    fi
  done
  if [[ "$module_recorded" -ne 1 ]]; then
    echo "archive-architecture-request: Resolved requires the architecture module as a durable --artifact: $architecture_module" >&2
    exit 1
  fi
fi

bash "$queue_helper" reindex --check

archive_year="$(date '+%Y')"
archive_dir="docs/architecture/requests/archive/${archive_year}"
archive_file="${archive_dir}/$(basename "$rel_request")"
if [[ -e "$archive_file" ]]; then
  archive_file="${archive_dir}/$(date '+%Y%m%d-%H%M%S')-$(basename "$rel_request")"
fi

architecture_transaction_begin
mkdir -p "$archive_dir"

tmp_file="$(mktemp)"
awk -v status="$resolved_status" '
  BEGIN { replaced = 0 }
  /^\> \*\*Status\*\*:/ {
    print "> **Status**: " status
    replaced = 1
    next
  }
  { print }
  END {
    if (replaced == 0) {
      print ""
      print "> **Status**: " status
    }
  }
' "$rel_request" > "$tmp_file"

{
  echo ""
  echo "## Archive Resolution"
  echo ""
  echo "- Status: ${resolved_status}"
  echo "- Archived: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  if [[ "${#artifact_lines[@]}" -gt 0 ]]; then
    echo "- Artifacts:"
    printf '%s\n' "${artifact_lines[@]}"
  else
    echo "- Artifacts: (none)"
  fi
  if [[ -n "$note" ]]; then
    echo "- Note: ${note}"
  fi
} >> "$tmp_file"

mv "$tmp_file" "$archive_file"
rm -f "$rel_request"

bash "$queue_helper" reindex
bash "$queue_helper" reindex --check

clear_contract_pending_request "$rel_request"

architecture_transaction_commit

echo "[ArchitectureArchive] Archived ${rel_request} -> ${archive_file}"
echo "[ArchitectureArchive] status=${resolved_status}"

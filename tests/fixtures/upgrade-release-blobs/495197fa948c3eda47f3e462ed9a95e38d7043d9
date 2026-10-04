#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-deploy-sql-order.sh [--quiet] [--root deploy/sql]

Validates deployment SQL assets. Default policy:
- SQL files live directly under deploy/sql/
- filenames start with a 4-digit numeric prefix
- prefixes are strictly ascending

An established alternate layout may declare operations.deploy_sql in
.ai/harness/policy.json with non-overlapping roots under deploy/. Supported
naming modes: ordered4, timestamp14, descriptive.

--root deploy/sql is retained as a fixed assertion only. Alternate roots are
authorized exclusively by operations.deploy_sql.
USAGE_EOF
}

quiet=0
root_assertion=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)
      quiet=1
      shift
      ;;
    --root)
      root_assertion="${2:-}"
      if [[ -z "$root_assertion" ]]; then
        echo "--root requires a path" >&2
        exit 1
      fi
      if [[ "$root_assertion" != "deploy/sql" ]]; then
        echo "--root is a fixed deploy/sql assertion; alternate roots must come from operations.deploy_sql" >&2
        exit 1
      fi
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

policy_file=".ai/harness/policy.json"
issues=0
configured=0
invariant_file="tests/sql/control_plane_invariants.sql"
invariant_mode="optional"
roots=()
namings=()
regular_sql_files=("")

report_issue() {
  echo "[deploy-sql] $1"
  issues=$((issues + 1))
}

load_policy() {
  [[ -f "$policy_file" ]] || return 0
  local output status kind first second
  set +e
  output="$(bun -e '
    import { readFileSync } from "node:fs";
    import { posix } from "node:path";
    const file = process.argv[1];
    const canonicalPath = (value, prefix) => {
      if (typeof value !== "string" || !value.startsWith(`${prefix}/`) || value.endsWith("/")) return false;
      if (!/^[A-Za-z0-9._/-]+$/.test(value) || posix.normalize(value) !== value) return false;
      return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
    };
    try {
      const policy = JSON.parse(readFileSync(file, "utf8"));
      const config = policy?.operations?.deploy_sql;
      if (config === undefined) process.exit(0);
      if (config === null || typeof config !== "object" || Array.isArray(config)) {
        console.log("ERROR\toperations.deploy_sql must be an object");
        process.exit(2);
      }
      if (!Array.isArray(config.roots) || config.roots.length === 0) {
        console.log("ERROR\toperations.deploy_sql.roots must be a non-empty array");
        process.exit(2);
      }

      const allowed = new Set(["ordered4", "timestamp14", "descriptive"]);
      const parsedRoots = [];
      for (const root of config.roots) {
        if (root === null || typeof root !== "object" || Array.isArray(root)) {
          console.log("ERROR\teach operations.deploy_sql.roots entry must be an object");
          process.exit(2);
        }
        if (!canonicalPath(root.path, "deploy")) {
          console.log(`ERROR\tSQL policy root must be a canonical path under deploy/ with no traversal or aliases: ${String(root.path)}`);
          process.exit(2);
        }
        if (!allowed.has(root.naming)) {
          console.log(`ERROR\tSQL policy root ${root.path} has unsupported naming mode: ${String(root.naming)}`);
          process.exit(2);
        }
        parsedRoots.push(root);
      }

      let invariantMode = "optional";
      let invariant = "tests/sql/control_plane_invariants.sql";
      if (Object.prototype.hasOwnProperty.call(config, "invariant_file")) {
        if (config.invariant_file === null) {
          invariantMode = "disabled";
          invariant = "-";
        } else if (!canonicalPath(config.invariant_file, "tests")) {
          console.log("ERROR\toperations.deploy_sql.invariant_file must be null or a canonical tests/ path");
          process.exit(2);
        } else {
          invariantMode = "required";
          invariant = config.invariant_file;
        }
      }

      console.log("CONFIG");
      console.log(`INVARIANT\t${invariantMode}\t${invariant}`);
      for (const root of parsedRoots) console.log(`ROOT\t${root.path}\t${root.naming}`);
    } catch (error) {
      console.log(`ERROR\tInvalid ${file}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  ' "$policy_file" 2>&1)"
  status=$?
  set -e

  while IFS=$'\t' read -r kind first second; do
    [[ -n "$kind" ]] || continue
    case "$kind" in
      CONFIG)
        configured=1
        ;;
      INVARIANT)
        case "$first" in
          optional|required)
            invariant_mode="$first"
            invariant_file="$second"
            ;;
          disabled)
            invariant_mode="disabled"
            invariant_file=""
            ;;
          *)
            report_issue "Could not parse SQL policy invariant mode: $first"
            ;;
        esac
        ;;
      ROOT)
        roots+=("$first")
        namings+=("$second")
        ;;
      ERROR)
        report_issue "$first${second:+ $second}"
        ;;
      *)
        report_issue "Could not parse SQL policy: $kind${first:+ $first}"
        ;;
    esac
  done <<< "$output"
  if (( status != 0 && issues == 0 )); then
    report_issue "Could not load operations.deploy_sql from $policy_file"
  fi
}

validate_roots() {
  local i j left right current component deploy_physical root_physical
  deploy_physical="$(cd deploy 2>/dev/null && pwd -P || true)"
  [[ -n "$deploy_physical" ]] || report_issue "Missing deploy directory"

  for ((i = 0; i < ${#roots[@]}; i++)); do
    left="${roots[$i]}"
    if [[ ! -d "$left" ]]; then
      report_issue "Missing SQL policy root: $left"
    else
      current=""
      IFS='/' read -r -a components <<< "$left"
      for component in "${components[@]}"; do
        current="${current:+$current/}$component"
        if [[ -L "$current" ]]; then
          report_issue "SQL policy root must not contain symlink components: $left ($current)"
          break
        fi
      done
      root_physical="$(cd "$left" 2>/dev/null && pwd -P || true)"
      if [[ -z "$deploy_physical" || "$root_physical" != "$deploy_physical/"* ]]; then
        report_issue "SQL policy root must resolve inside deploy/: $left"
      fi
    fi
    for ((j = i + 1; j < ${#roots[@]}; j++)); do
      right="${roots[$j]}"
      if [[ "$left" == "$right" || "$left" == "$right/"* || "$right" == "$left/"* ]]; then
        report_issue "SQL policy roots must not overlap: $left and $right"
      fi
    done
  done
}

root_for_file() {
  local file="$1" index root match=-1
  for ((index = 0; index < ${#roots[@]}; index++)); do
    root="${roots[$index]}"
    if [[ "$file" == "$root/"* ]]; then
      (( match < 0 )) || {
        printf '%s' '-2'
        return
      }
      match=$index
    fi
  done
  printf '%s' "$match"
}

validate_file_name() {
  local file="$1" naming="$2" base
  base="$(basename "$file")"
  case "$naming" in
    ordered4)
      [[ "$base" =~ ^([0-9]{4})[_-].+\.sql$ ]] || report_issue "SQL filename must start with a 4-digit prefix: $file"
      ;;
    timestamp14)
      [[ "$base" =~ ^([0-9]{14})_.+\.sql$ ]] || report_issue "SQL filename must start with a 14-digit timestamp prefix: $file"
      ;;
    descriptive)
      [[ "$base" =~ ^[a-z0-9][a-z0-9._-]*\.sql$ ]] || report_issue "SQL filename must be descriptive lowercase kebab/snake case: $file"
      ;;
    *)
      report_issue "Unsupported SQL naming mode at runtime: $naming"
      ;;
  esac
}

validate_ordered_root() {
  local root="$1" previous_number=-1 previous_file="" file rel base number number_value
  for file in "${regular_sql_files[@]}"; do
    [[ -n "$file" ]] || continue
    [[ "$file" == "$root/"* ]] || continue
    rel="${file#"$root"/}"
    [[ "$rel" != */* ]] || continue
    base="$(basename "$file")"
    [[ "$base" =~ ^([0-9]{4})[_-].+\.sql$ ]] || continue
    number="${BASH_REMATCH[1]}"
    number_value=$((10#$number))
    if (( previous_number >= 0 && number_value <= previous_number )); then
      report_issue "SQL prefixes must be strictly ascending: $previous_file before $file"
    fi
    previous_number=$number_value
    previous_file="$file"
  done
}

invariant_references() {
  local needle="$1" file="$2" line rest prefix suffix before after
  while IFS= read -r line || [[ -n "$line" ]]; do
    rest="$line"
    while [[ "$rest" == *"$needle"* ]]; do
      prefix="${rest%%"$needle"*}"
      suffix="${rest#*"$needle"}"
      before="${prefix: -1}"
      after="${suffix:0:1}"
      if [[ ( -z "$before" || ! "$before" =~ [A-Za-z0-9._/-] ) && ( -z "$after" || ! "$after" =~ [A-Za-z0-9._/-] ) ]]; then
        return 0
      fi
      rest="$suffix"
    done
  done < "$file"
  return 1
}

enumerate_deploy_surface() {
  [[ -d deploy ]] || return 0
  local surface_file sorted_file status file
  surface_file="$(mktemp "${TMPDIR:-/tmp}/repo-harness-deploy-sql.XXXXXX")" || {
    report_issue "Could not allocate deploy SQL enumeration snapshot"
    return
  }
  sorted_file="$(mktemp "${TMPDIR:-/tmp}/repo-harness-deploy-sql-sorted.XXXXXX")" || {
    rm -f "$surface_file"
    report_issue "Could not allocate sorted deploy SQL enumeration snapshot"
    return
  }

  set +e
  find deploy \( -type f -o -type l \) -print0 > "$surface_file"
  status=$?
  set -e
  if (( status != 0 )); then
    report_issue "Could not enumerate deploy SQL surface"
    rm -f "$surface_file" "$sorted_file"
    return
  fi

  set +e
  bun -e '
    import { readFileSync, writeFileSync } from "node:fs";
    const input = readFileSync(process.argv[1]);
    const paths = [];
    let start = 0;
    for (let index = 0; index < input.length; index += 1) {
      if (input[index] !== 0) continue;
      paths.push(input.subarray(start, index));
      start = index + 1;
    }
    if (start !== input.length) process.exit(2);
    paths.sort(Buffer.compare);
    const nul = Buffer.from([0]);
    writeFileSync(process.argv[2], Buffer.concat(paths.flatMap((path) => [path, nul])));
  ' "$surface_file" "$sorted_file"
  status=$?
  set -e
  if (( status != 0 )); then
    report_issue "Could not sort deploy SQL enumeration snapshot"
    rm -f "$surface_file" "$sorted_file"
    return
  fi

  while IFS= read -r -d '' file; do
    if [[ -L "$file" ]]; then
      if [[ "$file" == *.sql ]]; then
        report_issue "SQL migration must not be a symlink: $file"
      fi
      if [[ -d "$file" ]]; then
        report_issue "Deploy SQL surface must not contain directory symlinks: $file"
      fi
    elif [[ "$file" == *.sql ]]; then
      regular_sql_files+=("$file")
    fi
  done < "$sorted_file"
  rm -f "$surface_file" "$sorted_file"
}

load_policy
if (( configured == 0 )); then
  roots=("deploy/sql")
  namings=("ordered4")
fi
validate_roots
enumerate_deploy_surface

for file in "${regular_sql_files[@]}"; do
  [[ -n "$file" ]] || continue
  index="$(root_for_file "$file")"
  if (( index < 0 )); then
    if (( configured == 0 )); then
      report_issue "Deploy SQL file must live under deploy/sql/: $file"
    else
      report_issue "Deploy SQL file is not covered by operations.deploy_sql.roots: $file"
    fi
    continue
  fi
  root="${roots[$index]}"
  rel="${file#"$root"/}"
  if [[ "$rel" == */* ]]; then
    report_issue "SQL file must be a direct child of configured root $root/: $file"
    continue
  fi
  validate_file_name "$file" "${namings[$index]}"
done

for ((index = 0; index < ${#roots[@]}; index++)); do
  if [[ "${namings[$index]}" == "ordered4" && -d "${roots[$index]}" ]]; then
    validate_ordered_root "${roots[$index]}"
  fi
done

if [[ "$invariant_mode" == "required" && ! -f "$invariant_file" ]]; then
  report_issue "Missing SQL invariant file required by operations.deploy_sql: $invariant_file"
fi

if [[ -n "$invariant_file" && -f "$invariant_file" ]]; then
  for file in "${regular_sql_files[@]}"; do
    [[ -n "$file" ]] || continue
    base="$(basename "$file")"
    if (( configured == 1 && ${#roots[@]} > 1 )); then
      invariant_references "$file" "$invariant_file" || report_issue "SQL migration must be referenced by $invariant_file: $file"
    elif ! invariant_references "$file" "$invariant_file" && ! invariant_references "$base" "$invariant_file"; then
      report_issue "SQL migration must be referenced by $invariant_file: $file"
    fi
  done
fi

(( issues == 0 )) || exit 1
(( quiet == 1 )) || echo "[deploy-sql] OK"

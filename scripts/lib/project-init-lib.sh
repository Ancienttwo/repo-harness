#!/bin/bash
# Shared install helpers for repo-harness scaffolding scripts.

PI_RUNTIME_BLOCK_BEGIN="# BEGIN: repo-harness generated-runtime"
PI_RUNTIME_BLOCK_END="# END: repo-harness generated-runtime"
# Same retired marker as LEGACY_GITIGNORE_MANAGED_MARKERS in gitignore-plan.ts; replaced in place.
PI_LEGACY_RUNTIME_BLOCK_BEGIN="# BEGIN: claude-runtime-temp (managed by repo-harness)"
PI_LEGACY_RUNTIME_BLOCK_END="# END: claude-runtime-temp"
# The packaged asset is shared with the TS adoption planner; neither reader owns a list.
PI_DEFAULT_GITIGNORE_CONTENT=""
PI_EXTERNAL_TOOLING_HOSTS_DEFAULT=$(cat <<'EOF_EXTERNAL_TOOLING_HOSTS'
[
  "claude-code",
  "codex"
]
EOF_EXTERNAL_TOOLING_HOSTS
)
PI_TEMPLATE_RESEARCH=$(cat <<'EOF_TEMPLATE_RESEARCH'
# {{PROJECT_NAME}} — Research Notes

> **Last Updated**: {{DATE}}
> **Scope**: (what area of the codebase was researched)
> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.

## Codebase Map
| File | Purpose | Key Exports |
|------|---------|-------------|

## Architecture Observations
### Patterns & Conventions
### Implicit Contracts
### Edge Cases & Intricacies

## Technical Debt / Risks

## Research Conclusions
### What to Preserve
### What to Change
### Open Questions
EOF_TEMPLATE_RESEARCH
)
PI_TEMPLATE_SPEC=$(cat <<'EOF_TEMPLATE_SPEC'
# Product Spec: {{PROJECT_NAME}}

> **Status**: Draft
> **Last Updated**: {{TIMESTAMP}}
> **Owner**: Planner

## Product Outcome

Describe the stable user or operator outcome this repo should deliver.

## Success Criteria

- Primary workflow:
- Quality bar:
- Out of scope:

## Constraints

- Technical:
- Compliance:
- Delivery:

## Acceptance Scenarios

- Given
  When
  Then

## Open Questions

- ...
EOF_TEMPLATE_SPEC
)
PI_CONTEXT_PROFILE_DEFAULT="stable-root-progressive-subdir"
PI_RECOVERY_PROFILE_DEFAULT="hybrid"
PI_STATE_PROFILE_DEFAULT="file-backed"
PI_ORCHESTRATION_PROFILE_DEFAULT="shared-long-running-harness"
PI_EVALUATION_PROFILE_DEFAULT="browser-qa"
PI_HANDOFF_PROFILE_DEFAULT="artifact-aware"
PI_DOCUMENTATION_PROFILE_DEFAULT="minimal-agentic"
PI_DEFAULT_LSP_PROFILE="typescript-lsp"
PI_MINIMAL_REFERENCE_CONFIGS="harness-overview.md agentic-development-flow.md design-options.md ux-feature-guard.md external-tooling.md heartbeat-triage.md document-generation.md global-working-rules.md minimal-change-hooks.md"
PI_REFERENCE_CONFIG_STUB_MARKER="<!-- repo-harness: reference-config-stub v1 -->"

pi_write_file_if_apply() {
  local mode="${1:-apply}"
  local path="$2"
  local content="$3"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $path"
    return 0
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
}

pi_copy_file_if_apply() {
  local mode="${1:-apply}"
  local src="$2"
  local dest="$3"
  local src_abs=""
  local dest_abs=""

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] cp \"$src\" \"$dest\""
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  src_abs="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  dest_abs="$(cd "$(dirname "$dest")" && pwd)/$(basename "$dest")"

  if [[ "$src_abs" == "$dest_abs" ]]; then
    return 0
  fi

  cp "$src" "$dest"
}

pi_print_codex_hook_trust_notice() {
  echo "Host hook adapters are user-level: run rh install --target both --location global, then trust ~/.codex/hooks.json in Codex Settings."
}

pi_write_hook_runtime_readme() {
  local hooks_dir="$1"
  local mode="${2:-apply}"
  local readme="$hooks_dir/README.md"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $readme"
    return 0
  fi

  mkdir -p "$hooks_dir"
  cat > "$readme" <<'EOF_HOOK_README'
# Workflow Helpers

Host events use the user-level `repo-harness-hook` typed runtime.
Operator helpers run from the installed package: use `rh run <helper>`.
Init preserves legacy files under `.ai/hooks/lib/`.
Run `rh doctor` for migration guidance.
EOF_HOOK_README
}

pi_install_hook_assets() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local hooks_dir="$target_dir/.ai/hooks"
  pi_write_hook_runtime_readme "$hooks_dir" "$mode"
}

pi_ensure_executable_if_apply() {
  local mode="${1:-apply}"
  shift || true

  if [[ "$mode" != "apply" || "$#" -eq 0 ]]; then
    return 0
  fi

  local candidate first_line
  for candidate in "$@"; do
    [[ -f "$candidate" ]] || continue
    case "$candidate" in
      *.sh)
        chmod +x "$candidate" 2>/dev/null || true
        ;;
      *.ts)
        first_line="$(head -n 1 "$candidate" 2>/dev/null || true)"
        if [[ "$first_line" == '#!'* ]]; then
          chmod +x "$candidate" 2>/dev/null || true
        fi
        ;;
    esac
  done
}

pi_default_runtime_block() {
  local extra_entries="${1:-}"
  local runtime_entries
  runtime_entries="$(cat "${BASH_SOURCE[0]%/*}/../../assets/templates/runtime.gitignore")" || return 1

  if [[ -n "$extra_entries" ]]; then
    runtime_entries="${runtime_entries}"$'\n'"${extra_entries}"
  fi

  printf '%s\n%s\n%s\n' "$PI_RUNTIME_BLOCK_BEGIN" "$runtime_entries" "$PI_RUNTIME_BLOCK_END"
}

pi_legacy_root_helper_paths() {
  local workflow_contract="$1"
  local helper_names
  local helper_name

  helper_names="$(pi_workflow_contract_query_lines "$workflow_contract" "helpers.scripts" | xargs)"
  for helper_name in $helper_names; do
    printf 'scripts/%s\n' "$helper_name"
  done
}

pi_runtime_block_end_for() {
  case "$1" in
    "$PI_RUNTIME_BLOCK_BEGIN") printf '%s' "$PI_RUNTIME_BLOCK_END" ;;
    "$PI_LEGACY_RUNTIME_BLOCK_BEGIN") printf '%s' "$PI_LEGACY_RUNTIME_BLOCK_END" ;;
    *) return 1 ;;
  esac
}

pi_has_runtime_block() {
  local file_path="$1"
  sed 's/\r$//' "$file_path" | grep -Fxq -e "$PI_RUNTIME_BLOCK_BEGIN" -e "$PI_LEGACY_RUNTIME_BLOCK_BEGIN"
}

pi_ensure_gitignore_block() {
  local file_path="$1"
  local prelude="${2:-}"
  local extra_entries="${3:-}"
  local mode="${4:-apply}"
  local block

  block="$(pi_default_runtime_block "$extra_entries")" || return 1

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] ensure managed runtime block in $file_path"
    return 0
  fi

  mkdir -p "$(dirname "$file_path")"
  if [[ ! -f "$file_path" ]]; then
    if [[ -n "$prelude" ]]; then
      printf '%s\n' "$prelude" > "$file_path"
    else
      touch "$file_path"
    fi
  fi

  if ! pi_has_runtime_block "$file_path"; then
    printf '\n%s\n' "$block" >> "$file_path"
    return 0
  fi

  local tmp_file
  local block_written=0
  tmp_file="$(mktemp)"

  local block_end existing_block found_end released
  while IFS= read -r line || [[ -n "$line" ]]; do
    if block_end="$(pi_runtime_block_end_for "${line%$'\r'}")"; then
      existing_block="${line%$'\r'}"
      found_end=0
      while IFS= read -r inner_line || [[ -n "$inner_line" ]]; do
        existing_block+=$'\n'"${inner_line%$'\r'}"
        if [[ "${inner_line%$'\r'}" == "$block_end" ]]; then
          found_end=1
          break
        fi
      done
      if [[ "$found_end" -eq 0 ]]; then
        # Match the TS planner: never drop user lines after an unterminated block.
        rm -f "$tmp_file"
        echo "managed block is missing end marker: $block_end" >&2
        return 1
      fi

      if [[ "$existing_block" != "$block" ]]; then
        released=0
        printf '%s' "$existing_block" | pi_released_managed_value project-ignore-block - || released=$?
        if [[ "$released" -ne 0 ]]; then
          rm -f "$tmp_file"
          [[ "$released" -eq 1 ]] || return 1
          echo "[repo-harness] kept edited managed block in $file_path: $line (not a released repo-harness block)" >&2
          return 0
        fi
      fi

      if [[ "$block_written" -eq 0 ]]; then
        printf '%s\n' "$block" >> "$tmp_file"
        block_written=1
      fi
      continue
    fi

    printf '%s\n' "$line" >> "$tmp_file"
  done < "$file_path"

  mv "$tmp_file" "$file_path"
}

pi_released_managed_values_file() {
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || return 1
  printf '%s' "$lib_dir/../../assets/released-managed-values.v1.json"
}

# Reads and checks assets/released-managed-values.v1.json with the same rules as
# src/effects/upgrade/released-values.ts; a missing or malformed field throws.
PI_RELEASED_VALUES_JS='
const releasedValues = (file) => {
  const fail = (path, expected) => { throw new Error(`${file}: ${path} must be ${expected}`); };
  const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const object = (value, path) => isObject(value) ? value : fail(path, "an object");
  const string = (value, path) => typeof value === "string" ? value : fail(path, "a string");
  const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
  const strings = (value, path, pattern) => Array.isArray(value) && value.every((item) => typeof item === "string" && (!pattern || pattern.test(item)))
    ? value : fail(path, pattern ? "an array of sha256 fingerprints" : "an array of strings");
  const lists = (value, path, pattern) => {
    for (const [key, item] of Object.entries(object(value, path))) strings(item, `${path}.${key}`, pattern);
    return value;
  };
  let root;
  try { root = JSON.parse(require("fs").readFileSync(file, "utf8")); } catch (error) { throw new Error(`${file}: ${error.message}`); }
  object(root, "$");
  if (root.schema !== "repo-harness.released-managed-values.v1") fail("$.schema", JSON.stringify("repo-harness.released-managed-values.v1"));
  strings(root.releases, "$.releases");
  lists(root.packageScripts, "$.packageScripts");
  lists(root.referenceConfigs, "$.referenceConfigs", FINGERPRINT);
  const project = object(root.projectGitignoreBlock, "$.projectGitignoreBlock");
  strings(project.blocks, "$.projectGitignoreBlock.blocks", FINGERPRINT);
  if (project.retiredSection !== null) {
    const retired = object(project.retiredSection, "$.projectGitignoreBlock.retiredSection");
    string(retired.header, "$.projectGitignoreBlock.retiredSection.header");
    strings(retired.rules, "$.projectGitignoreBlock.retiredSection.rules");
    strings(retired.bases, "$.projectGitignoreBlock.retiredSection.bases", FINGERPRINT);
  }
  strings(object(root.userExcludesBlock, "$.userExcludesBlock").blocks, "$.userExcludesBlock.blocks", FINGERPRINT);
  const rules = object(root.globalRulesBlock, "$.globalRulesBlock");
  strings(rules.blocks, "$.globalRulesBlock.blocks", FINGERPRINT);
  string(rules.customInstructionSentinel, "$.globalRulesBlock.customInstructionSentinel");
  strings(rules.customInstructionBlocks, "$.globalRulesBlock.customInstructionBlocks", FINGERPRINT);
  lists(rules.legacySections, "$.globalRulesBlock.legacySections", FINGERPRINT);
  return root;
};
const releasedList = (record, key) => Object.hasOwn(record, key) ? record[key] : [];
const sha256 = (text) => "sha256:" + require("crypto").createHash("sha256").update(text).digest("hex");
'

# Exit 0 when <input> (a file, or - for stdin) is a released value, 1 when it is
# not, 2 when the released values cannot be read.
#   reference-config <doc id> <file> <current stub file>: the file with CRLF read
#     as LF equals the current stub or a released stub
#   project-ignore-block - : a released project .gitignore block, BEGIN to END
#     joined by \n; a released retired-rule section sits directly before END
pi_released_managed_value() {
  local check="$1"
  local js_runtime

  js_runtime="$(pi_resolve_js_runtime)" || {
    echo "[repo-harness] no JavaScript runtime found; cannot check released managed values" >&2
    return 2
  }
  "$js_runtime" -e "$PI_RELEASED_VALUES_JS"'
const fs = require("fs");
const [file, check, ...args] = process.argv.slice(1);
try {
  const values = releasedValues(file);
  let released;
  if (check === "reference-config") {
    const [docId, input, currentStub] = args;
    const text = fs.readFileSync(input, "utf8").replaceAll("\r\n", "\n");
    released = text === fs.readFileSync(currentStub, "utf8") || releasedList(values.referenceConfigs, docId).includes(sha256(text));
  } else if (check === "project-ignore-block") {
    const block = fs.readFileSync(0, "utf8");
    const group = values.projectGitignoreBlock;
    released = group.blocks.includes(sha256(block));
    const retired = group.retiredSection;
    if (!released && retired) {
      const lines = block.split("\n");
      const end = lines.pop();
      const content = lines.join("\n");
      const at = content.lastIndexOf(`\n\n${retired.header}\n`);
      let next = 0;
      released = at !== -1 && content.slice(at + retired.header.length + 3).split("\n").every((rule) => {
        const index = retired.rules.indexOf(rule, next);
        next = index + 1;
        return index !== -1;
      }) && retired.bases.includes(sha256(`${content.slice(0, at)}\n${end}`));
    }
  } else {
    throw new Error(`unknown check ${check}`);
  }
  process.exit(released ? 0 : 1);
} catch (error) {
  console.error(`[repo-harness] cannot read released managed values: ${error.message}`);
  process.exit(2);
}
' "$(pi_released_managed_values_file)" "$check" "${@:2}"
}

pi_resolve_json_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
    return 0
  fi

  return 1
}

pi_workflow_contract_query_lines() {
  local contract_file="$1"
  local selector="$2"
  local runtime

  if [[ ! -f "$contract_file" ]]; then
    return 1
  fi

  runtime="$(pi_resolve_json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[warn] no runtime available to read workflow contract: $contract_file" >&2
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$contract_file" "$selector" <<'PY_EOF'
import json
import sys

path, selector = sys.argv[1], sys.argv[2]
value = json.load(open(path, "r", encoding="utf-8"))
for part in selector.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if isinstance(value, list):
    for item in value:
        print(item)
elif value is not None:
    print(value)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, selector] = process.argv;
const parts = selector.split(".");
let value = JSON.parse(fs.readFileSync(filePath, "utf8"));
for (const part of parts) {
  value = value && typeof value === "object" ? value[part] : undefined;
}
if (Array.isArray(value)) {
  for (const item of value) {
    console.log(item);
  }
} else if (value !== undefined && value !== null) {
  console.log(value);
}
' "$contract_file" "$selector"
      ;;
  esac
}

pi_workflow_contract_upgrade_action_paths() {
  local contract_file="$1"
  local action_filter="${2:-remove}"
  local ownership_filter="${3:-known_generated}"
  local runtime

  if [[ ! -f "$contract_file" ]]; then
    return 1
  fi

  runtime="$(pi_resolve_json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[warn] no runtime available to read workflow contract: $contract_file" >&2
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$contract_file" "$action_filter" "$ownership_filter" <<'PY_EOF'
import json
import sys

path, action_filter, ownership_filter = sys.argv[1], sys.argv[2], sys.argv[3]
contract = json.load(open(path, "r", encoding="utf-8"))
for action in contract.get("migrations", {}).get("upgrade", {}).get("actions", []):
    if action.get("action") != action_filter:
        continue
    if ownership_filter and action.get("ownership") != ownership_filter:
        continue
    for rel_path in action.get("paths", []):
        print(rel_path)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, actionFilter, ownershipFilter] = process.argv;
const contract = JSON.parse(fs.readFileSync(filePath, "utf8"));
const actions = contract.migrations?.upgrade?.actions ?? [];
for (const action of actions) {
  if (action.action !== actionFilter) continue;
  if (ownershipFilter && action.ownership !== ownershipFilter) continue;
  for (const relPath of action.paths ?? []) {
    console.log(relPath);
  }
}
' "$contract_file" "$action_filter" "$ownership_filter"
      ;;
  esac
}

pi_workflow_contract_upgrade_action_entries() {
  local contract_file="$1"
  local action_filter="${2:-remove}"
  local ownership_filter="${3:-known_generated}"
  local runtime

  if [[ ! -f "$contract_file" ]]; then
    return 1
  fi

  runtime="$(pi_resolve_json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[warn] no runtime available to read workflow contract: $contract_file" >&2
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$contract_file" "$action_filter" "$ownership_filter" <<'PY_EOF'
import json
import sys

path, action_filter, ownership_filter = sys.argv[1], sys.argv[2], sys.argv[3]
contract = json.load(open(path, "r", encoding="utf-8"))
for action in contract.get("migrations", {}).get("upgrade", {}).get("actions", []):
    if action.get("action") != action_filter:
        continue
    if ownership_filter and action.get("ownership") != ownership_filter:
        continue
    cleanup_mode = action.get("cleanupMode", "always")
    for rel_path in action.get("paths", []):
        print(f"{cleanup_mode}\t{rel_path}")
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, actionFilter, ownershipFilter] = process.argv;
const contract = JSON.parse(fs.readFileSync(filePath, "utf8"));
const actions = contract.migrations?.upgrade?.actions ?? [];
for (const action of actions) {
  if (action.action !== actionFilter) continue;
  if (ownershipFilter && action.ownership !== ownershipFilter) continue;
  const cleanupMode = action.cleanupMode ?? "always";
  for (const relPath of action.paths ?? []) {
    console.log(`${cleanupMode}\t${relPath}`);
  }
}
' "$contract_file" "$action_filter" "$ownership_filter"
      ;;
  esac
}

pi_install_templates() {
  local target_dir="$1"
  local templates_dir="$2"
  local mode="${3:-apply}"
  local output_dir="$target_dir/.claude/templates"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install templates into $output_dir"
    return 0
  fi

  mkdir -p "$output_dir"

  if [[ -f "$templates_dir/research.template.md" ]]; then
    cp "$templates_dir/research.template.md" "$output_dir/research.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_RESEARCH" > "$output_dir/research.template.md"
  fi

  if [[ -f "$templates_dir/spec.template.md" ]]; then
    cp "$templates_dir/spec.template.md" "$output_dir/spec.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_SPEC" > "$output_dir/spec.template.md"
  fi

  if [[ -f "$templates_dir/prd.template.md" ]]; then
    mkdir -p "$target_dir/docs/prds"
    cp "$templates_dir/prd.template.md" "$target_dir/docs/prds/prd.template.md"
  fi

  if [[ -f "$templates_dir/design-brief.template.md" ]]; then
    cp "$templates_dir/design-brief.template.md" "$output_dir/design-brief.template.md"
  fi
}

pi_install_helpers() {
  local target_dir="$1"
  local helpers_dir="$2"
  local mode="${3:-apply}"
  local helper_names="${4:?pi_install_helpers requires contract helper inventory}"
  local scripts_dir="$target_dir/scripts"
  local helper_name
  local source_repo_target=0

  if [[ -d "$target_dir/assets/templates/helpers" && -d "$helpers_dir" ]]; then
    local target_helpers_abs helpers_abs
    target_helpers_abs="$(cd "$target_dir/assets/templates/helpers" && pwd)"
    helpers_abs="$(cd "$helpers_dir" && pwd)"
    if [[ "$target_helpers_abs" == "$helpers_abs" ]]; then
      source_repo_target=1
    fi
  fi

  if [[ "$mode" != "apply" ]]; then
    if [[ "$source_repo_target" -eq 1 ]]; then
      echo "[dry-run] install source helpers into $scripts_dir"
    else
      echo "[dry-run] use global repo-harness helper runtime; do not write local helper scripts"
    fi
    return 0
  fi

  if [[ -d "$helpers_dir" ]]; then
    for helper_name in $helper_names; do
      if [[ -f "$helpers_dir/$helper_name" ]]; then
        if [[ "$source_repo_target" -eq 1 ]]; then
          mkdir -p "$scripts_dir"
          cp "$helpers_dir/$helper_name" "$scripts_dir/$helper_name"
        fi
      fi
    done
    pi_ensure_executable_if_apply "$mode" "$scripts_dir"/*.sh "$scripts_dir"/*.ts
    return 0
  fi

  return 0
}

pi_env_value() {
  local name="$1"
  local default_value="${2:-}"
  local value

  value="${!name-}"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi

  printf '%s' "$default_value"
}

pi_plan_type() {
  local default_value="${1:-}"
  pi_env_value "REPO_HARNESS_PLAN_TYPE" "$default_value"
}

pi_context_profile() {
  pi_env_value "REPO_HARNESS_CONTEXT_PROFILE" "$PI_CONTEXT_PROFILE_DEFAULT"
}

pi_documentation_profile() {
  pi_env_value "REPO_HARNESS_DOCUMENTATION_PROFILE" "$PI_DOCUMENTATION_PROFILE_DEFAULT"
}

pi_lsp_profile() {
  pi_env_value "REPO_HARNESS_LSP_PROFILE" "$PI_DEFAULT_LSP_PROFILE"
}

pi_should_generate_full_docs() {
  case "$(pi_documentation_profile)" in
    full|full-docs|legacy-full)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

pi_external_tooling_defaults_summary() {
  cat <<'EOF_EXTERNAL_TOOLING_DEFAULTS'
- Policy defaults: parent-agent + geju owns product/complex/design planning; external routing keeps simple->waza
- Hosts: claude-code, codex
- Mode: agent-readiness-required
- Detection: init-migrate
- Waza: Codex-first, managed skills think/hunt/check/health, stage upstream in ~/.agents/skills, sync verified copies into ~/.codex/skills
- Codex automation profile: required health/check/mermaid from ~/.codex/skills; do not vendor skill bodies
- CodeGraph: required agent code-navigation readiness tool, target-aware MCP configure by explicit user command or authorized agent action, per-repo ignored .codegraph/ index; generated repos do not add it as a package dependency unless local policy opts in
- Auto-actions: never install, upgrade, serve, sync, or enable MCP automatically
EOF_EXTERNAL_TOOLING_DEFAULTS
}

pi_resolve_external_tooling_detector() {
  local repo_dir="$1"
  local fallback_script="${2:-}"

  if [[ -n "$fallback_script" && -f "$fallback_script" ]]; then
    printf '%s' "$fallback_script"
    return 0
  fi

  return 1
}

pi_print_external_tooling_report() {
  local repo_dir="$1"
  local mode="${2:-apply}"
  local fallback_script="${3:-}"
  local detector
  local output

  echo "--- External Tooling ---"
  pi_external_tooling_defaults_summary

  detector="$(pi_resolve_external_tooling_detector "$repo_dir" "$fallback_script" || true)"
  if [[ -z "$detector" ]]; then
    echo "- Advisory detector: unavailable"
    return 0
  fi

  local detector_args=(--host both)
  local check_tooling_updates="${REPO_HARNESS_CHECK_TOOLING_UPDATES:-0}"
  if [[ "$check_tooling_updates" == "1" ]]; then
    detector_args+=(--check-updates)
  fi

  if output="$(cd "$repo_dir" && bash "$detector" "${detector_args[@]}" 2>&1)"; then
    if [[ "$mode" == "apply" ]]; then
      echo "- Advisory report:"
    else
      echo "- Advisory report (dry-run snapshot):"
    fi
    printf '%s\n' "$output" | sed 's/^/  /'
    return 0
  fi

  echo "- Advisory report: detector failed (non-fatal)"
  printf '%s\n' "$output" | sed 's/^/  /'
}

pi_maybe_install_agent_fleet() {
  local repo_dir="$1"
  local mode="${2:-apply}"
  local fallback_script="${3:-}"
  local policy_file="$repo_dir/.ai/harness/policy.json"
  local raw_install_mode
  local installer
  local install_output

  if [[ ! -f "$policy_file" ]]; then
    echo "- Agent fleet: no .ai/harness/policy.json found; run 'rh run install-agent-fleet' to install the managed agent fleet manually."
    return 0
  fi

  raw_install_mode="$(pi_workflow_contract_query_lines "$policy_file" "external_tooling.agent_fleet.install_mode" 2>/dev/null || true)"

  if [[ "$raw_install_mode" != "auto-install-on-init" ]]; then
    echo "- Agent fleet: install_mode=${raw_install_mode:-advisory}; run 'rh run install-agent-fleet' to install the managed agent fleet."
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "- Agent fleet: install_mode=auto-install-on-init, but dry-run never writes to the global agent fleet directories; run 'rh run install-agent-fleet' after applying."
    return 0
  fi

  installer="$(pi_resolve_external_tooling_detector "$repo_dir" "$fallback_script" || true)"
  if [[ -z "$installer" ]]; then
    echo "- Agent fleet: install_mode=auto-install-on-init, but the installer script could not be resolved; run 'rh run install-agent-fleet' manually."
    return 0
  fi

  echo "- Agent fleet: install_mode=auto-install-on-init; installing managed agents via $installer"
  if install_output="$(bash "$installer" 2>&1)"; then
    printf '%s\n' "$install_output" | sed 's/^/  /'
    return 0
  fi

  echo "[warn] Agent fleet install failed (non-fatal); run 'rh run install-agent-fleet' manually." >&2
  printf '%s\n' "$install_output" | sed 's/^/  /'
}

pi_reference_config_names() {
  local ref_assets_dir="$1"
  local name

  if pi_should_generate_full_docs; then
    find "$ref_assets_dir" -maxdepth 1 -type f -name '*.md' \
      ! -name 'AGENTS.md' \
      ! -name 'CLAUDE.md' \
      -print 2>/dev/null | sort | while IFS= read -r ref_file; do
      basename "$ref_file"
    done
    return 0
  fi

  for name in $PI_MINIMAL_REFERENCE_CONFIGS; do
    [[ -f "$ref_assets_dir/$name" ]] || continue
    printf '%s\n' "$name"
  done
}

pi_install_reference_configs() {
  local target_dir="$1"
  local ref_assets_dir="$2"
  local mode="${3:-apply}"
  local ref_dir="$target_dir/docs/reference-configs"
  local name
  local managed
  local source_repo_target=0

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install $(pi_documentation_profile) reference config stubs into $ref_dir"
    return 0
  fi

  mkdir -p "$ref_dir"
  if [[ ! -d "$ref_assets_dir" ]]; then
    return 0
  fi

  if [[ -d "$target_dir/assets/reference-configs" ]]; then
    local target_refs_abs refs_abs
    target_refs_abs="$(cd "$target_dir/assets/reference-configs" && pwd)"
    refs_abs="$(cd "$ref_assets_dir" && pwd)"
    if [[ "$target_refs_abs" == "$refs_abs" ]]; then
      source_repo_target=1
    fi
  fi

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if [[ "$source_repo_target" -eq 1 ]]; then
      cp "$ref_assets_dir/$name" "$ref_dir/$name"
      continue
    fi

    managed=0
    pi_reference_config_is_managed "$ref_dir/$name" "$name" "$ref_assets_dir" || managed=$?
    case "$managed" in
      0) pi_write_reference_config_stub "$ref_dir/$name" "$name" "$ref_assets_dir" ;;
      1) echo "[repo-harness] preserved user-authored reference config: docs/reference-configs/$name" >&2 ;;
      *) return 1 ;;
    esac
  done < <(pi_reference_config_names "$ref_assets_dir")
}

pi_reference_config_doc_id() {
  local name="$1"
  printf '%s\n' "${name%.md}"
}

pi_repo_harness_version_for_refs() {
  local ref_assets_dir="$1"
  local root_dir
  root_dir="$(cd "$ref_assets_dir/../.." 2>/dev/null && pwd || true)"
  if [[ -z "$root_dir" ]]; then
    printf '%s\n' "unknown"
    return 0
  fi
  local version_file="$root_dir/assets/skill-version.json"

  if [[ -f "$version_file" ]]; then
    sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$version_file" | head -n 1
    return 0
  fi

  printf '%s\n' "unknown"
}

# Exit 0 when init may write the stub: the file is missing, equals the stub this
# code writes, or is a released repo-harness value. Exit 1 keeps the file; 2 is an error.
pi_reference_config_is_managed() {
  local target_file="$1"
  local name="$2"
  local ref_assets_dir="$3"
  local current_stub
  local status=0

  [[ -f "$target_file" ]] || return 0
  current_stub="$(mktemp)"
  pi_write_reference_config_stub "$current_stub" "$name" "$ref_assets_dir"
  if ! cmp -s "$target_file" "$current_stub"; then
    pi_released_managed_value reference-config "$(pi_reference_config_doc_id "$name")" "$target_file" "$current_stub" || status=$?
  fi
  rm -f "$current_stub"
  return "$status"
}

pi_write_reference_config_stub() {
  local output_file="$1"
  local name="$2"
  local ref_assets_dir="$3"
  local doc_id
  local version

  doc_id="$(pi_reference_config_doc_id "$name")"
  version="$(pi_repo_harness_version_for_refs "$ref_assets_dir")"

  cat > "$output_file" <<EOF_REFERENCE_STUB
$PI_REFERENCE_CONFIG_STUB_MARKER
# repo-harness Reference: $doc_id

> **Runtime Docs**: user-level repo-harness reference
> **Doc ID**: $doc_id
> **Version**: $version
> **Source Command**: \`rh docs path $doc_id\`

This repo keeps workflow facts and runtime artifacts locally under \`.ai/\`.
The full generic runtime guide is supplied by the installed repo-harness
package/user-level runtime so each repository does not need to refresh a full
copy of shared documentation.

Use:

\`\`\`bash
rh docs path $doc_id
rh docs show $doc_id
\`\`\`
EOF_REFERENCE_STUB
}

pi_context_block_config_file() {
  local target_dir="$1"
  pi_env_value "REPO_HARNESS_CONTEXT_BLOCKS_FILE" "$target_dir/.ai/context/agent-context-blocks.txt"
}

pi_capability_registry_file() {
  local target_dir="$1"
  printf '%s' "$target_dir/.ai/context/capabilities.json"
}

pi_safe_token() {
  local value="$1"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  printf '%s' "${value:-capability}"
}

pi_legacy_context_block_candidates() {
  local target_dir="$1"
  local config_file

  local env_blocks
  env_blocks="$(pi_env_value "REPO_HARNESS_CONTEXT_BLOCKS")"
  if [[ -n "$env_blocks" ]]; then
    printf '%s\n' "$env_blocks" | tr ',:' '\n'
    return 0
  fi

  config_file="$(pi_context_block_config_file "$target_dir")"
  if [[ -f "$config_file" ]]; then
    sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$config_file" | sed '/^$/d'
    return 0
  fi

  find "$target_dir" \
    \( \
      -name .git -o -name node_modules -o -name vendor -o -name .ai -o -name .claude \
      -o -name _ref -o -name _ops -o -name .worktrees -o -name .cache \
      -o -name .venv -o -name venv -o -name dist -o -name build -o -name coverage \
      -o -name .next -o -name .turbo -o -path '*/go/pkg/mod' -o -path '*/Library' \
    \) -prune -o \
    \( -type f \( -name 'CLAUDE.md' -o -name 'AGENTS.md' \) \) -print 2>/dev/null | while IFS= read -r context_file; do
      local context_dir
      local rel_dir
      context_dir="$(dirname "$context_file")"
      rel_dir="${context_dir#$target_dir/}"
      [[ "$rel_dir" == "$context_dir" || "$rel_dir" == "." ]] && continue
      printf '%s\n' "$rel_dir"
    done
}

pi_context_block_candidates() {
  local target_dir="$1"
  local registry_file
  local selector

  registry_file="$(pi_capability_registry_file "$target_dir")"
  if [[ -f "$registry_file" ]]; then
    if command -v node >/dev/null 2>&1; then
      node - "$registry_file" <<'JS_EOF'
const fs = require("fs");
const registry = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const capability of registry.capabilities || []) {
  for (const prefix of capability.prefixes || []) console.log(prefix);
}
JS_EOF
      return 0
    fi
  fi

  selector="$(pi_env_value "REPO_HARNESS_CONTEXT_BLOCK_SELECTOR")"
  if [[ -n "$selector" && -x "$selector" ]]; then
    (cd "$target_dir" && "$selector" "$target_dir")
    return 0
  fi

  pi_legacy_context_block_candidates "$target_dir"
}

pi_legacy_context_block_dirs() {
  local target_dir="$1"
  local raw_path
  local rel_path

  pi_legacy_context_block_candidates "$target_dir" | while IFS= read -r raw_path; do
    rel_path="$(printf '%s' "$raw_path" | sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    rel_path="${rel_path#./}"
    rel_path="${rel_path%/}"
    [[ -z "$rel_path" || "$rel_path" == "." ]] && continue
    case "$rel_path" in
      /*|../*|*/../*|*\"*)
        continue
        ;;
    esac
    [[ -d "$target_dir/$rel_path" ]] || continue
    printf '%s\n' "$rel_path"
  done | sort -u
}

pi_context_block_dirs() {
  local target_dir="$1"
  local raw_path
  local rel_path

  pi_context_block_candidates "$target_dir" | while IFS= read -r raw_path; do
    rel_path="$(printf '%s' "$raw_path" | sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    rel_path="${rel_path#./}"
    rel_path="${rel_path%/}"
    [[ -z "$rel_path" || "$rel_path" == "." ]] && continue
    case "$rel_path" in
      /*|../*|*/../*|*\"*)
        continue
        ;;
    esac
    [[ -d "$target_dir/$rel_path" ]] || continue
    printf '%s\n' "$rel_path"
  done | sort -u
}

pi_write_capability_registry() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file
  local rel_dir
  local first=1

  output_file="$(pi_capability_registry_file "$target_dir")"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file"
    return 0
  fi

  if [[ -f "$output_file" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$output_file")"
  {
    printf '{\n  "version": 1,\n  "capabilities": [\n'
    while IFS= read -r rel_dir; do
      [[ -n "$rel_dir" ]] || continue
      local domain
      local name
      local id
      local parts_count
      local last_part

      parts_count="$(awk -F'/' '{print NF}' <<< "$rel_dir")"
      last_part="${rel_dir##*/}"
      if [[ "$parts_count" -ge 2 ]]; then
        domain="$(pi_safe_token "$(cut -d/ -f1-2 <<< "$rel_dir" | tr '/' '-')")"
      else
        domain="$(pi_safe_token "$rel_dir")"
      fi
      if [[ "$parts_count" -gt 2 ]]; then
        name="$(pi_safe_token "$last_part")"
        id="${domain}-${name}"
      else
        name="$(pi_safe_token "$last_part")"
        id="$domain"
      fi

      if [[ "$first" -eq 0 ]]; then
        printf ',\n'
      fi
      first=0
      cat <<EOF_CAPABILITY
    {
      "id": "$id",
      "domain": "$domain",
      "name": "$name",
      "prefixes": ["$rel_dir"],
      "contract_files": {
        "agents": "$rel_dir/AGENTS.md",
        "claude": "$rel_dir/CLAUDE.md"
      },
      "architecture_module": "docs/architecture/modules/$domain/$name.md",
      "lsp_profile": "$(pi_lsp_profile)",
      "verification_hints": ["record local commands here before implementation"]
    }
EOF_CAPABILITY
    done < <(pi_legacy_context_block_dirs "$target_dir")
    printf '\n  ]\n}\n'
  } > "$output_file"
}

pi_should_generate_directory_context() {
  local target_dir="$1"
  [[ -n "$(pi_context_block_dirs "$target_dir" | head -n 1)" ]]
}

pi_context_map_discoverable_entries() {
  local target_dir="$1"
  local first_entry=1
  local rel_dir
  local file_name
  local target_agent
  local registry_file
  local capability_entries

  registry_file="$(pi_capability_registry_file "$target_dir")"
  if [[ -f "$registry_file" ]] && command -v node >/dev/null 2>&1; then
    capability_entries="$(node - "$registry_file" <<'JS_EOF'
const fs = require("fs");
const registry = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const entries = [];
for (const capability of registry.capabilities || []) {
  const prefix = (capability.prefixes || [])[0];
  if (!prefix || !capability.contract_files) continue;
  for (const [fileName, targetAgent] of [["CLAUDE.md", "claude"], ["AGENTS.md", "codex"]]) {
    const path = fileName === "CLAUDE.md" ? capability.contract_files.claude : capability.contract_files.agents;
    entries.push({
      path,
      priority: "high",
      char_budget: 1000,
      purpose: "capability-contract",
      capability_id: capability.id,
      functional_block: prefix,
      matched_prefix: prefix,
      architecture_domain: capability.domain,
      architecture_capability: capability.name,
      target_agent: targetAgent,
      lsp_profile: capability.lsp_profile || "typescript-lsp",
      doc_scope: "capability-contract",
      verification_hint: (capability.verification_hints || [])[0] || "record local commands here before implementation"
    });
  }
}
process.stdout.write(entries.map((entry) => JSON.stringify(entry, null, 6).replace(/^/gm, "    ")).join(",\n"));
JS_EOF
)"
    if [[ -n "$capability_entries" ]]; then
      printf '%s,\n' "$capability_entries"
    fi
    cat <<'EOF_CONTEXT_ENTRY'
    {
      "path": "docs/reference-configs/*.md",
      "priority": "low",
      "char_budget": 900,
      "purpose": "deep-doc"
    }
EOF_CONTEXT_ENTRY
    return 0
  fi

  while IFS= read -r rel_dir; do
    [[ -n "$rel_dir" ]] || continue
    for file_name in CLAUDE.md AGENTS.md; do
      if [[ "$first_entry" -eq 0 ]]; then
        printf ',\n'
      fi
      first_entry=0
      target_agent="codex"
      [[ "$file_name" == "CLAUDE.md" ]] && target_agent="claude"
      cat <<EOF_CONTEXT_ENTRY
    {
      "path": "$rel_dir/$file_name",
      "priority": "high",
      "char_budget": 1000,
      "purpose": "capability-contract",
      "functional_block": "$rel_dir",
      "target_agent": "$target_agent",
      "lsp_profile": "$(pi_lsp_profile)",
      "doc_scope": "capability-contract",
      "verification_hint": "record local commands here before implementation"
    }
EOF_CONTEXT_ENTRY
    done
  done < <(pi_context_block_dirs "$target_dir")

  if [[ "$first_entry" -eq 0 ]]; then
    printf ',\n'
  fi

  cat <<'EOF_CONTEXT_ENTRY'
    {
      "path": "docs/reference-configs/*.md",
      "priority": "low",
      "char_budget": 900,
      "purpose": "deep-doc"
    }
EOF_CONTEXT_ENTRY
}

pi_write_brain_manifest() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file="$target_dir/.ai/harness/brain-manifest.json"
  local project_name

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file if missing"
    return 0
  fi

  if [[ -f "$output_file" ]]; then
    return 0
  fi

  project_name="$(basename "$target_dir")"
  mkdir -p "$(dirname "$output_file")"
  cat > "$output_file" <<EOF_BRAIN_MANIFEST
{
  "version": 1,
  "project": "${project_name}",
  "mode": "repo-contract-external-knowledge",
  "default_brain_path": "brain/<project>/*",
  "rules": [
    "repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
    "default brain stores long-lived explanations, runbooks, decisions, references, and patterns",
    "external brain sync is manual opt-in; hooks and workflow checks do not read, write, or validate external vault state"
  ],
  "entries": []
}
EOF_BRAIN_MANIFEST
}

pi_write_context_map() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file="$target_dir/.ai/context/context-map.json"
  local discoverable_entries

  discoverable_entries="$(pi_context_map_discoverable_entries "$target_dir")"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file"
    return 0
  fi

  mkdir -p "$(dirname "$output_file")"
  cat > "$output_file" <<EOF_CONTEXT
{
  "version": 1,
  "profile": "$(pi_context_profile)",
  "functional_block_selector": {
    "script": "rh run select-agent-context-blocks",
    "config_file": ".ai/context/agent-context-blocks.txt",
    "env": "REPO_HARNESS_CONTEXT_BLOCKS",
    "rule": "compatibility selector; capability registry is the source of truth"
  },
  "lsp_profiles": {
    "default": "$(pi_lsp_profile)",
    "selection": "functional-block-first"
  },
  "root_context_files": [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/spec.md",
    "tasks/lessons.md",
    ".ai/context/capabilities.json",
    ".ai/harness/policy.json"
  ],
  "discoverable_contexts": [
${discoverable_entries}
  ],
  "budgets": {
    "root_total_chars": 12000,
    "per_discoverable_file_chars": 1200
  }
}
EOF_CONTEXT
}

pi_install_directory_context_files() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local directory_agents_content
  local selected_dirs
  local rel_dir
  local module_dir

  selected_dirs="$(pi_context_block_dirs "$target_dir")"
  if [[ -z "$selected_dirs" ]]; then
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install selected CLAUDE.md/AGENTS.md files in $target_dir"
    return 0
  fi

  directory_agents_content=$(cat <<'EOF_DIRECTORY_AGENTS'
# Functional Block Agent Context

Record only ownership, entrypoints and local verification commands.
EOF_DIRECTORY_AGENTS
)

  while IFS= read -r rel_dir; do
    [[ -n "$rel_dir" ]] || continue
    module_dir="$target_dir/$rel_dir"
    if [[ ! -d "$module_dir" ]]; then
      continue
    fi
    if [[ ! -w "$module_dir" ]]; then
      echo "[migrate] skipped context mirror in unwritable directory: $rel_dir" >&2
      continue
    fi
    if [[ -f "$module_dir/AGENTS.md" && ! -f "$module_dir/CLAUDE.md" ]]; then
      cp "$module_dir/AGENTS.md" "$module_dir/CLAUDE.md" || {
        echo "[migrate] skipped context mirror AGENTS.md -> CLAUDE.md in $rel_dir" >&2
        continue
      }
    elif [[ -f "$module_dir/CLAUDE.md" && ! -f "$module_dir/AGENTS.md" ]]; then
      cp "$module_dir/CLAUDE.md" "$module_dir/AGENTS.md" || {
        echo "[migrate] skipped context mirror CLAUDE.md -> AGENTS.md in $rel_dir" >&2
        continue
      }
    else
      if [[ ! -f "$module_dir/CLAUDE.md" ]]; then
        printf '%s\n' "$directory_agents_content" > "$module_dir/CLAUDE.md"
      fi
      if [[ ! -f "$module_dir/AGENTS.md" ]]; then
        printf '%s\n' "$directory_agents_content" > "$module_dir/AGENTS.md"
      fi
    fi
  done <<< "$selected_dirs"
}

pi_ensure_harness_state_surface() {
  local target_dir="$1"
  local mode="${2:-apply}"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] ensure harness context/events/runs/worktrees/triage/planning in $target_dir"
    return 0
  fi

  mkdir -p \
    "$target_dir/.ai/context" \
    "$target_dir/.ai/harness/checks" \
    "$target_dir/.ai/harness/failures" \
    "$target_dir/.ai/harness/security" \
    "$target_dir/.ai/harness/planning" \
    "$target_dir/.ai/harness/delegation" \
    "$target_dir/.ai/harness/worktrees" \
    "$target_dir/.ai/harness/triage" \
    "$target_dir/docs/researches" \
    "$target_dir/docs/architecture/modules" \
    "$target_dir/docs/architecture/diagrams" \
    "$target_dir/.ai/harness/runs"

  [[ -f "$target_dir/.ai/context/capability-source-map.json" ]] || printf '{\n  "version": 1,\n  "capabilities": {}\n}\n' > "$target_dir/.ai/context/capability-source-map.json"
  [[ -f "$target_dir/.ai/harness/events.jsonl" ]] || : > "$target_dir/.ai/harness/events.jsonl"
  [[ -f "$target_dir/.ai/harness/failures/latest.jsonl" ]] || : > "$target_dir/.ai/harness/failures/latest.jsonl"
  [[ -f "$target_dir/.ai/harness/security/.gitkeep" ]] || : > "$target_dir/.ai/harness/security/.gitkeep"
  [[ -f "$target_dir/.ai/harness/planning/.gitkeep" ]] || : > "$target_dir/.ai/harness/planning/.gitkeep"
  [[ -f "$target_dir/.ai/harness/worktrees/.gitkeep" ]] || : > "$target_dir/.ai/harness/worktrees/.gitkeep"
  [[ -f "$target_dir/.ai/harness/runs/.gitkeep" ]] || : > "$target_dir/.ai/harness/runs/.gitkeep"
  [[ -f "$target_dir/.ai/harness/triage/.gitkeep" ]] || : > "$target_dir/.ai/harness/triage/.gitkeep"
  if [[ ! -f "$target_dir/docs/researches/README.md" ]]; then
    cat > "$target_dir/docs/researches/README.md" <<'RESEARCH_README_EOF'
# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files.

Use `YYYYMMDD-topic.md` names when chronology matters, or `<topic>.md` for
stable subject reports. Keep repeated correction-derived rules in `tasks/lessons.md`.
RESEARCH_README_EOF
  fi
  [[ -f "$target_dir/docs/architecture/modules/.gitkeep" ]] || : > "$target_dir/docs/architecture/modules/.gitkeep"
  [[ -f "$target_dir/docs/architecture/diagrams/.gitkeep" ]] || : > "$target_dir/docs/architecture/diagrams/.gitkeep"
  if [[ ! -f "$target_dir/docs/architecture/index.md" ]]; then
    cat > "$target_dir/docs/architecture/index.md" <<'ARCHITECTURE_INDEX_EOF'
# Architecture Index

> Umbrella architecture ledger for current boundaries and diagrams.

## Current Snapshot

- Semantic diagram source: (none yet)

## Architecture Flow

- Read architecture documents on demand. Update real boundaries explicitly.
- Semantic architecture diagrams live as Mermaid fenced blocks in the relevant module or snapshot Markdown.
- Markdown Mermaid fenced blocks are the only architecture diagram artifacts; do not generate standalone HTML.

ARCHITECTURE_INDEX_EOF
  fi

  pi_write_capability_registry "$target_dir" "$mode"
  pi_write_brain_manifest "$target_dir" "$mode"
  pi_write_context_map "$target_dir" "$mode"
  pi_install_directory_context_files "$target_dir" "$mode"
}

pi_resolve_js_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if [[ -x "${HOME}/.bun/bin/bun" ]]; then
    printf '%s' "${HOME}/.bun/bin/bun"
    return 0
  fi

  return 1
}

pi_ensure_task_sync() {
  local target_dir="$1"
  local create_if_missing="${2:-0}"
  local mode="${3:-apply}"
  local package_file="$target_dir/package.json"
  local js_runtime
  local project_name
  local default_package

  if [[ ! -f "$package_file" && "$create_if_missing" != "1" ]]; then
    if [[ "$mode" != "apply" ]]; then
      echo "[dry-run] package.json missing; skip task workflow script injection"
    fi
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] inject task workflow scripts into $package_file"
    return 0
  fi

  project_name="$(basename "$target_dir" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
  project_name="${project_name:-project}"
  default_package="$(cat <<EOF_PACKAGE
{
  "name": "$project_name",
  "private": true,
  "scripts": {
    "check:brain": "rh brain check",
    "check:context-files": "rh run check-context-files",
    "check:deploy-sql": "rh run check-deploy-sql-order",
    "sync:brain": "rh brain sync"
  }
}
EOF_PACKAGE
)"

  if [[ ! -f "$package_file" ]]; then
    printf '%s\n' "$default_package" > "$package_file"
    return 0
  fi

  js_runtime="$(pi_resolve_js_runtime || true)"
  if [[ -z "$js_runtime" ]]; then
    echo "[warn] no JavaScript runtime found; unable to inject task workflow scripts into $package_file" >&2
    return 0
  fi

  # The default package scripts are the current values; a different existing
  # value changes only when it is a released repo-harness value.
  "$js_runtime" -e "$PI_RELEASED_VALUES_JS"'
const fs = require("fs");
const [file, defaultPackage, valuesFile] = process.argv.slice(1);
const values = releasedValues(valuesFile);
const released = (key, value) => typeof value === "string" && releasedList(values.packageScripts, key).includes(value);
const keep = (key, value) => console.error(`[repo-harness] kept package.json script ${key}: ${JSON.stringify(value)} (not a released repo-harness value)`);
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.private ??= true;
pkg.scripts ??= {};
const target = pkg.scripts;
for (const [key, value] of Object.entries(JSON.parse(defaultPackage).scripts)) {
  if (!Object.hasOwn(target, key) || target[key] === value || released(key, target[key])) target[key] = value;
  else keep(key, target[key]);
}
for (const key of ["check:brain-manifest", "check:task-workflow", "check:architecture-sync", "sync:brain-docs"]) {
  if (!Object.hasOwn(target, key)) continue;
  if (released(key, target[key])) delete target[key];
  else keep(key, target[key]);
}
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$package_file" "$default_package" "$(pi_released_managed_values_file)"
}

pi_factor_factory_gitignore_entries() {
  printf '%s\n' ".claude/.factor-cache/"
}

pi_should_enable_factor_factory() {
  local plan_type="${1:-$(pi_plan_type)}"
  local explicit
  explicit="$(pi_env_value "REPO_HARNESS_FACTOR_FACTORY" "0")"

  case "$explicit" in
    1|true|TRUE|yes|YES) return 0 ;;
  esac

  [[ "$plan_type" == "G" ]]
}

pi_install_factor_factory() {
  local target_dir="$1"
  local factor_assets_dir="$2"
  local _scripts_source_dir="$3"
  local mode="${4:-apply}"
  local factors_dir="$target_dir/tasks/factors"
  local cache_dir="$target_dir/.claude/.factor-cache/candidates"
  local registry_template="$factor_assets_dir/factor-registry.template.json"
  local hypothesis_template="$factor_assets_dir/factor-hypothesis.template.md"
  local report_template="$factor_assets_dir/factor-backtest-report.template.md"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install factor factory assets into $target_dir"
    return 0
  fi

  mkdir -p "$factors_dir/promoted" "$cache_dir"

  if [[ -f "$registry_template" ]]; then
    cp "$registry_template" "$factors_dir/registry.json"
  fi

  if [[ -f "$hypothesis_template" ]]; then
    mkdir -p "$target_dir/.claude/factor-factory"
    cp "$hypothesis_template" "$target_dir/.claude/factor-factory/hypothesis.template.md"
  fi

  if [[ -f "$report_template" ]]; then
    mkdir -p "$target_dir/.claude/factor-factory"
    cp "$report_template" "$target_dir/.claude/factor-factory/backtest-report.template.md"
  fi

  return 0
}

#!/bin/bash
# Shared install helpers for repo-harness scaffolding scripts.

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
PI_RECOVERY_PROFILE_DEFAULT="hybrid"
PI_STATE_PROFILE_DEFAULT="file-backed"
PI_ORCHESTRATION_PROFILE_DEFAULT="shared-long-running-harness"
PI_EVALUATION_PROFILE_DEFAULT="browser-qa"
PI_HANDOFF_PROFILE_DEFAULT="artifact-aware"
PI_DOCUMENTATION_PROFILE_DEFAULT="minimal-agentic"

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

pi_documentation_profile() {
  pi_env_value "REPO_HARNESS_DOCUMENTATION_PROFILE" "$PI_DOCUMENTATION_PROFILE_DEFAULT"
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
  [[ -f "$target_dir/docs/architecture/modules/.gitkeep" ]] || : > "$target_dir/docs/architecture/modules/.gitkeep"
  [[ -f "$target_dir/docs/architecture/diagrams/.gitkeep" ]] || : > "$target_dir/docs/architecture/diagrams/.gitkeep"
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
  # The factor cache is a scaffold-only path, so it stays outside the init-managed block.
  local gitignore="$target_dir/.gitignore"
  touch "$gitignore"
  if ! grep -Fxq ".claude/.factor-cache/" "$gitignore"; then
    # A last line without a newline would join the rule.
    [[ -s "$gitignore" && -n "$(tail -c 1 "$gitignore")" ]] && printf '\n' >> "$gitignore"
    printf '%s\n' ".claude/.factor-cache/" >> "$gitignore"
  fi

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

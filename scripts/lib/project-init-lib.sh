#!/bin/bash
# Shared install helpers for repo-harness scaffolding scripts.

PI_RUNTIME_BLOCK_BEGIN="# BEGIN: claude-runtime-temp (managed by repo-harness)"
PI_RUNTIME_BLOCK_END="# END: claude-runtime-temp"
PI_DEFAULT_GITIGNORE_CONTENT=$(cat <<'EOF_GITIGNORE'
# Dependencies
node_modules/

# Build artifacts
artifacts/
coverage/
*.tar.gz
*.tgz

# External references
_ref/
.codegraph/

# Local operations state
_ops/

# Environment
.env
.env.*
!.env.example

# OS metadata
.DS_Store
EOF_GITIGNORE
)
PI_DEFAULT_RUNTIME_ENTRIES=$(cat <<'EOF_RUNTIME'
.claude/settings.local.json
.claude/.atomic_pending
.claude/.session-id
.claude/.trace.jsonl
.claude/.session-handoff.md
.claude/.task-state.json
.claude/.task-handoff.md
.claude/.codegraph-state/
.claude/*.tmp
.claude/*.bak
.claude/*.bak.*
.claude/*.backup-*
tasks/.current.md.tmp.*
.ai/harness/checks/latest.json
.ai/harness/checks/post-bash-latest.json
.ai/harness/events.jsonl
.ai/harness/archive/
.ai/harness/failures/latest.jsonl
.ai/harness/handoff/current.md
.ai/harness/handoff/resume.md
.ai/harness/capability-context/
.ai/harness/security/*
!.ai/harness/security/.gitkeep
.ai/harness/planning/*
!.ai/harness/planning/.gitkeep
.ai/harness/architecture/events.jsonl
.ai/harness/active-plan
.ai/harness/active-worktree
.ai/harness/sprint/
.ai/harness/worktrees/
.ai/harness/runs/
.ai/harness/chatgpt/browser-lock.json
.ai/harness/chatgpt/bridge-extension/
.ai/harness/chatgpt/tmp/
.ai/harness/chatgpt/sessions/
.ai/harness/triage/*
!.ai/harness/triage/.gitkeep
.repo-harness/chatgpt-browser.local.json
.repo-harness/chatgpt-browser.tokens.json
.codex/*
.claude/.active-plan
.claude/.plan-state/
EOF_RUNTIME
)
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
PI_TEMPLATE_PLAN=$(cat <<'EOF_TEMPLATE_PLAN'
# Plan: {{TITLE}}

> **Status**: Draft
> **Created**: {{TIMESTAMP}}
> **Slug**: {{SLUG}}
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
> **Task Review**: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
> **Implementation Notes**: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`

## Agentic Routing
- Selected route:
- Routing reason:
- Due diligence:
  - P1 map:
  - P2 trace:
  - P3 decision rationale:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `{{PLAN_FILE}}`
- Sprint contract: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Sprint review: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `.ai/harness/scripts/plan-to-todo.sh --plan {{PLAN_FILE}}` and may start `.ai/harness/scripts/contract-worktree.sh start --plan {{PLAN_FILE}}`.

## Approach
### Strategy
### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|

### Code Snippets
### Data Flow

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

## Task Contracts
- Contract file: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Review file: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes file: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash .ai/harness/scripts/verify-contract.sh --contract tasks/contracts/{{ARTIFACT_STEM}}.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**:
- **Verification evidence**:
- **Evaluator rubric**:
- **Stop condition**:
- **Rollback surface**:

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
EOF_TEMPLATE_PLAN
)
PI_TEMPLATE_CONTRACT=$(cat <<'EOF_TEMPLATE_CONTRACT'
# Task Contract: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Task Profile**: {{TASK_PROFILE}}
> **Owner**: {{OWNER}}
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `{{REVIEW_FILE}}`
> **Notes File**: `{{NOTES_FILE}}`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `{{REVIEW_FILE}}`
- Notes file: `{{NOTES_FILE}}`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - {{CONTRACT_FILE}}
  - {{REVIEW_FILE}}
  - {{NOTES_FILE}}
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/modules/{{TASK_SLUG}}/index.ts
    - {{NOTES_FILE}}
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
  commands_succeed:
    - bun run typecheck
  files_contain:
    - path: src/modules/{{TASK_SLUG}}/index.ts
      pattern: "export"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
EOF_TEMPLATE_CONTRACT
)
PI_TEMPLATE_REVIEW=$(cat <<'EOF_TEMPLATE_REVIEW'
# Task Review: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Notes File**: {{NOTES_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run
- Intended files changed:
- Actual files changed:
- Commands passed:
- External acceptance: unavailable
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Verification Evidence

- Waza /check run:
- Commands run:
- Manual checks:
- Supporting artifacts:

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers:
- P2 advisories:
- Acceptance checklist:

## Behavior Diff Notes

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
EOF_TEMPLATE_REVIEW
)
PI_TEMPLATE_IMPLEMENTATION_NOTES=$(cat <<'EOF_TEMPLATE_IMPLEMENTATION_NOTES'
# Implementation Notes: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Review**: {{REVIEW_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
EOF_TEMPLATE_IMPLEMENTATION_NOTES
)
PI_CONTEXT_PROFILE_DEFAULT="stable-root-progressive-subdir"
PI_RECOVERY_PROFILE_DEFAULT="hybrid"
PI_STATE_PROFILE_DEFAULT="file-backed"
PI_ORCHESTRATION_PROFILE_DEFAULT="shared-long-running-harness"
PI_EVALUATION_PROFILE_DEFAULT="browser-qa"
PI_HANDOFF_PROFILE_DEFAULT="artifact-aware"
PI_DOCUMENTATION_PROFILE_DEFAULT="minimal-agentic"
PI_DEFAULT_LSP_PROFILE="typescript-lsp"
PI_MINIMAL_REFERENCE_CONFIGS="harness-overview.md agentic-development-flow.md external-tooling.md sprint-contracts.md heartbeat-triage.md handoff-protocol.md document-generation.md global-working-rules.md"
PI_FULL_REFERENCE_CONFIGS="agentic-development-flow.md ai-workflows.md changelog-versioning.md coding-standards.md development-protocol.md document-generation.md evaluator-rubric.md external-tooling.md git-strategy.md global-working-rules.md heartbeat-triage.md handoff-protocol.md harness-overview.md hook-operations.md release-deploy.md spa-day-protocol.md sprint-contracts.md workflow-orchestration.md"
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

pi_install_hook_adapters() {
  local repo="$1"
  local _hooks_dir="$2"
  local mode="${3:-apply}"

  pi_retire_project_hook_adapter "$mode" "$repo/.claude/settings.json"
  pi_retire_project_hook_adapter "$mode" "$repo/.claude/settings.local.json"
  pi_retire_project_hook_adapter "$mode" "$repo/.codex/hooks.json"
}

pi_retire_project_hook_adapter() {
  local mode="${1:-apply}"
  local file_path="$2"

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] retire project hook adapter $file_path"
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "[project-init] Skipping project hook adapter retirement for $file_path because node is unavailable" >&2
    return 0
  fi

  node - "$file_path" <<'NODE_EOF'
const fs = require("fs");
const path = process.argv[2];

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

let data;
try {
  const raw = fs.readFileSync(path, "utf8");
  data = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  console.error(`[project-init] Skipping invalid JSON while retiring project hook adapter: ${path}`);
  process.exit(0);
}

if (!Object.prototype.hasOwnProperty.call(data, "hooks")) {
  if (Object.keys(data).length === 0) fs.rmSync(path, { force: true });
  process.exit(0);
}

const backup = `${path}.repo-harness-migrate-backup`;
if (!fs.existsSync(backup)) fs.copyFileSync(path, backup);
delete data.hooks;

if (Object.keys(data).length === 0) {
  fs.rmSync(path, { force: true });
} else {
  writeJson(path, data);
}
NODE_EOF
}

pi_print_codex_hook_trust_notice() {
  echo "Host hook adapters are user-level: run repo-harness install --target both --location global, then trust ~/.codex/hooks.json in Codex Settings."
}

pi_repo_pins_hook_source() {
  local repo="$1"
  local policy_file="$repo/.ai/harness/policy.json"

  if [[ "${REPO_HARNESS_HOOK_SOURCE:-}" == "repo" ]]; then
    return 0
  fi

  [[ -f "$policy_file" ]] || return 1
  grep -Eq '"hook_source"[[:space:]]*:[[:space:]]*"repo"' "$policy_file"
}

pi_repo_pins_helper_source() {
  local repo="$1"
  local policy_file="$repo/.ai/harness/policy.json"

  if [[ "${REPO_HARNESS_HELPER_SOURCE:-}" == "repo" ]]; then
    return 0
  fi

  [[ -f "$policy_file" ]] || return 1
  grep -Eq '"helper_source"[[:space:]]*:[[:space:]]*"repo"' "$policy_file"
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
# Repo-Local Hook Fallback

This repo does not pin `"hook_source": "repo"`, so active hook execution is
user-level and central-first:

`~/.codex/hooks.json` / `~/.claude/settings.json` -> `repo-harness-hook` ->
packaged hooks from the installed repo-harness runtime.

The files under `.ai/hooks/lib/` are kept only for repo workflow helper scripts
that source shared shell utilities. Full hook runtime scripts are not vendored
here by default because stale copies can be mistaken for the active hook path.

Set `"hook_source": "repo"` in `.ai/harness/policy.json` only for self-hosted
hook development or an explicitly reviewed repo-local hook override.
EOF_HOOK_README
}

pi_prune_repo_local_hook_runtime() {
  local hooks_dir="$1"
  local mode="${2:-apply}"

  if [[ ! -d "$hooks_dir" ]]; then
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] remove repo-local hook entry scripts from $hooks_dir unless hook_source is repo"
    return 0
  fi

  find "$hooks_dir" -mindepth 1 -maxdepth 1 -type f \
    \( -name '*.sh' \
      -o -name 'AGENTS.md' \
      -o -name 'CLAUDE.md' \
      -o -name 'settings.template.json' \
      -o -name 'codex.hooks.template.json' \
      -o -name '.version' \) \
    -delete
}

pi_install_hook_assets() {
  local target_dir="$1"
  local hooks_assets_dir="$2"
  local mode="${3:-apply}"
  local hooks_dir="$target_dir/.ai/hooks"

  if [[ ! -d "$hooks_assets_dir" ]]; then
    echo "[project-init] Warning: hook assets not found at $hooks_assets_dir" >&2
    echo "[project-init] User-level host adapters dispatch through repo-harness-hook packaged hooks." >&2
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] mkdir -p \"$hooks_dir\""
  else
    mkdir -p "$hooks_dir"
  fi

  if pi_repo_pins_hook_source "$target_dir"; then
    while IFS= read -r hook; do
      local rel_path rel_dir dest_dir hook_name
      rel_path="${hook#"$hooks_assets_dir"/}"
      rel_dir="$(dirname "$rel_path")"
      if [[ "$rel_dir" == "." ]]; then
        dest_dir="$hooks_dir"
      else
        dest_dir="$hooks_dir/$rel_dir"
      fi
      hook_name="$(basename "$hook")"
      if [[ "$mode" != "apply" ]]; then
        echo "[dry-run] mkdir -p \"$dest_dir\""
        echo "[dry-run] cp \"$hook\" \"$dest_dir/$hook_name\""
        continue
      fi
      mkdir -p "$dest_dir"
      cp "$hook" "$dest_dir/$hook_name"
      chmod +x "$dest_dir/$hook_name" 2>/dev/null || true
    done < <(find "$hooks_assets_dir" -type f -name '*.sh' | sort)
    return 0
  fi

  pi_prune_repo_local_hook_runtime "$hooks_dir" "$mode"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] mkdir -p \"$hooks_dir/lib\""
  else
    mkdir -p "$hooks_dir/lib"
  fi

  if [[ -d "$hooks_assets_dir/lib" ]]; then
    while IFS= read -r hook_lib; do
      local lib_name
      lib_name="$(basename "$hook_lib")"
      if [[ "$mode" != "apply" ]]; then
        echo "[dry-run] cp \"$hook_lib\" \"$hooks_dir/lib/$lib_name\""
        continue
      fi
      cp "$hook_lib" "$hooks_dir/lib/$lib_name"
      chmod +x "$hooks_dir/lib/$lib_name" 2>/dev/null || true
    done < <(find "$hooks_assets_dir/lib" -maxdepth 1 -type f -name '*.sh' | sort)
  fi

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
  local runtime_entries="$PI_DEFAULT_RUNTIME_ENTRIES"

  if [[ -n "$extra_entries" ]]; then
    runtime_entries="${runtime_entries}"$'\n'"${extra_entries}"
  fi

  printf '%s\n%s\n%s\n' "$PI_RUNTIME_BLOCK_BEGIN" "$runtime_entries" "$PI_RUNTIME_BLOCK_END"
}

pi_helper_wrapper_paths() {
  local workflow_contract="$1"
  local helper_names
  local helper_name

  helper_names="$(pi_workflow_contract_query_lines "$workflow_contract" "helpers.scripts" | xargs)"
  for helper_name in $helper_names; do
    printf 'scripts/%s\n' "$helper_name"
  done
}

pi_helper_wrapper_gitignore_entries() {
  local workflow_contract="$1"
  local paths

  paths="$(pi_helper_wrapper_paths "$workflow_contract")"
  [[ -n "$paths" ]] || return 0

  printf '%s\n' "# repo-harness generated helper wrappers"
  printf '%s\n' "$paths"
  printf '%s\n' "scripts/repo-harness/"
}

pi_is_runtime_block_begin() {
  local line="$1"
  [[ "$line" == "$PI_RUNTIME_BLOCK_BEGIN" ]]
}

pi_has_runtime_block() {
  local file_path="$1"
  grep -Fq "$PI_RUNTIME_BLOCK_BEGIN" "$file_path"
}

pi_ensure_gitignore_block() {
  local file_path="$1"
  local prelude="${2:-}"
  local extra_entries="${3:-}"
  local mode="${4:-apply}"
  local block

  block="$(pi_default_runtime_block "$extra_entries")"

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

  while IFS= read -r line || [[ -n "$line" ]]; do
    if pi_is_runtime_block_begin "$line"; then
      if [[ "$block_written" -eq 0 ]]; then
        printf '%s\n' "$block" >> "$tmp_file"
        block_written=1
      fi

      while IFS= read -r inner_line || [[ -n "$inner_line" ]]; do
        if [[ "$inner_line" == "$PI_RUNTIME_BLOCK_END" ]]; then
          break
        fi
      done
      continue
    fi

    printf '%s\n' "$line" >> "$tmp_file"
  done < "$file_path"

  mv "$tmp_file" "$file_path"
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

pi_install_workflow_contract() {
  local target_dir="$1"
  local contract_asset="$2"
  local mode="${3:-apply}"
  local output_path="$target_dir/.ai/harness/workflow-contract.json"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install workflow contract into $output_path"
    return 0
  fi

  mkdir -p "$(dirname "$output_path")"
  cp "$contract_asset" "$output_path"
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

  if [[ -f "$templates_dir/plan.template.md" ]]; then
    cp "$templates_dir/plan.template.md" "$output_dir/plan.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_PLAN" > "$output_dir/plan.template.md"
  fi

  if [[ -f "$templates_dir/contract.template.md" ]]; then
    cp "$templates_dir/contract.template.md" "$output_dir/contract.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_CONTRACT" > "$output_dir/contract.template.md"
  fi

  if [[ -f "$templates_dir/review.template.md" ]]; then
    cp "$templates_dir/review.template.md" "$output_dir/review.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_REVIEW" > "$output_dir/review.template.md"
  fi

  if [[ -f "$templates_dir/implementation-notes.template.md" ]]; then
    cp "$templates_dir/implementation-notes.template.md" "$output_dir/implementation-notes.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_IMPLEMENTATION_NOTES" > "$output_dir/implementation-notes.template.md"
  fi

  # Sprint template ships when available; sprint-backlog.sh also carries an
  # inline fallback, so older asset dirs degrade gracefully.
  if [[ -f "$templates_dir/sprint.template.md" ]]; then
    cp "$templates_dir/sprint.template.md" "$output_dir/sprint.template.md"
  fi

  if [[ -f "$templates_dir/prd.template.md" ]]; then
    cp "$templates_dir/prd.template.md" "$output_dir/prd.template.md"
  fi
}

pi_install_helpers() {
  local target_dir="$1"
  local helpers_dir="$2"
  local mode="${3:-apply}"
  local helper_names="${4:-new-spec.sh new-sprint.sh new-plan.sh capture-plan.sh plan-to-todo.sh contract-run.ts contract-worktree.sh ship-worktrees.sh archive-workflow.sh refresh-current-status.sh prepare-handoff.sh verify-contract.sh summarize-failures.sh verify-sprint.sh harness-trace-grade.sh sprint-backlog.sh check-task-sync.sh check-deploy-sql-order.sh check-architecture-sync.sh check-agent-tooling.sh check-context-files.sh check-brain-manifest.sh sync-brain-docs.sh check-skill-version.ts select-agent-context-blocks.sh ensure-task-workflow.sh check-task-workflow.sh maintenance-triage.sh heartbeat-triage.sh switch-plan.sh workflow-contract.ts inspect-project-state.ts migrate-workflow-docs.ts migrate-project-template.sh capability-resolver.ts architecture-event.ts capability-config.ts architecture-queue.sh archive-architecture-request.sh context-contract-sync.sh workstream-sync.sh prepare-codex-handoff.sh codex-handoff-resume.sh}"
  local scripts_dir="$target_dir/scripts"
  local runtime_dir="$target_dir/.ai/harness/scripts"
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
    if [[ "$source_repo_target" -eq 1 || "$(pi_repo_pins_helper_source "$target_dir" && printf yes || true)" == "yes" ]]; then
      echo "[dry-run] install source helpers into $scripts_dir"
    else
      echo "[dry-run] install helper compatibility wrappers in $scripts_dir; package runtime dispatches through repo-harness run"
    fi
    return 0
  fi

  mkdir -p "$scripts_dir"
  mkdir -p "$runtime_dir"

  if [[ -d "$helpers_dir" ]]; then
    for helper_name in $helper_names; do
      if [[ -f "$helpers_dir/$helper_name" ]]; then
        if [[ "$helper_name" == "migrate-project-template.sh" ]]; then
          local target_abs=""
          local skill_abs=""
          target_abs="$(cd "$target_dir" && pwd)"
          if [[ -n "${SKILL_ROOT:-}" ]]; then
            skill_abs="$(cd "$SKILL_ROOT" && pwd)"
          else
            skill_abs="$(cd "$helpers_dir/../.." && pwd)"
          fi
          if [[ "$target_abs" == "$skill_abs" ]]; then
            continue
          fi
        fi
        if [[ "$source_repo_target" -eq 1 ]]; then
          cp "$helpers_dir/$helper_name" "$scripts_dir/$helper_name"
        elif pi_repo_pins_helper_source "$target_dir"; then
          cp "$helpers_dir/$helper_name" "$runtime_dir/$helper_name"
          pi_normalize_installed_helper "$runtime_dir/$helper_name"
          if ! pi_preserve_existing_app_script "$scripts_dir/$helper_name" "$helpers_dir/$helper_name"; then
            pi_write_helper_wrapper "$scripts_dir/$helper_name" "$helper_name"
          fi
        else
          if ! pi_preserve_existing_app_script "$scripts_dir/$helper_name" "$helpers_dir/$helper_name"; then
            pi_write_helper_wrapper "$scripts_dir/$helper_name" "$helper_name"
          else
            mkdir -p "$scripts_dir/repo-harness"
            pi_write_helper_wrapper "$scripts_dir/repo-harness/$helper_name" "$helper_name"
          fi
        fi
      fi
    done
    pi_ensure_executable_if_apply "$mode" "$runtime_dir"/*.sh "$runtime_dir"/*.ts "$scripts_dir"/*.sh "$scripts_dir"/*.ts "$scripts_dir/repo-harness"/*.sh "$scripts_dir/repo-harness"/*.ts
    return 0
  fi

  for helper_name in $helper_names; do
    pi_write_helper_wrapper "$scripts_dir/$helper_name" "$helper_name"
  done
  pi_ensure_executable_if_apply "$mode" "$scripts_dir"/*.sh "$scripts_dir"/*.ts
}

pi_preserve_existing_app_script() {
  local output_file="$1"
  local source_file="$2"

  [[ -f "$output_file" ]] || return 1

  if cmp -s "$output_file" "$source_file"; then
    return 1
  fi

  if grep -Eiq '(repo-harness|claude-runtime-temp|Task Contract|Task Review|Deferred Goal Ledger|Workflow Contract|ContractWorktree|SprintBacklog|ArchitectureSync|ArchitectureDrift|BrainSync|CurrentStatus|\.ai/harness|\.claude/templates|tasks/contracts|tasks/reviews)' "$output_file"; then
    return 1
  fi

  return 0
}

pi_write_helper_wrapper() {
  local output_file="$1"
  local helper_name="$2"

  case "$helper_name" in
    *.ts)
      cat > "$output_file" <<EOF_WRAPPER_TS
#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const sourceRoot =
  process.env.REPO_HARNESS_SOURCE_ROOT ||
  process.env.AGENTIC_DEV_ROOT ||
  process.env.AGENTIC_DEV_SKILL_ROOT;
const command = sourceRoot && existsSync(join(sourceRoot, "src", "cli", "index.ts"))
  ? ["bun", join(sourceRoot, "src", "cli", "index.ts"), "run", "$(basename "$helper_name" .ts)"]
  : ["repo-harness", "run", "$(basename "$helper_name" .ts)"];

const result = spawnSync(command[0], [...command.slice(1), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(\`Missing repo-harness CLI for helper $(basename "$helper_name" .ts): \${result.error.message}\`);
  process.exit(1);
}

process.exit(result.status ?? 1);
EOF_WRAPPER_TS
      ;;
    *)
      local helper_id="${helper_name%.*}"
      cat > "$output_file" <<EOF_WRAPPER_SH
#!/bin/bash
set -euo pipefail

SOURCE_ROOT="\${REPO_HARNESS_SOURCE_ROOT:-\${AGENTIC_DEV_ROOT:-\${AGENTIC_DEV_SKILL_ROOT:-}}}"

if [[ -n "\$SOURCE_ROOT" && -f "\$SOURCE_ROOT/src/cli/index.ts" ]]; then
  if command -v bun >/dev/null 2>&1; then
    exec bun "\$SOURCE_ROOT/src/cli/index.ts" run $helper_id "\$@"
  fi
fi

if command -v repo-harness >/dev/null 2>&1; then
  exec repo-harness run $helper_id "\$@"
fi

echo "Missing repo-harness CLI for helper $helper_id" >&2
exit 1
EOF_WRAPPER_SH
      ;;
  esac
}

pi_normalize_installed_helper() {
  local helper_file="$1"
  [[ -f "$helper_file" ]] || return 0

  if [[ "$helper_file" == *.sh ]]; then
    perl -0pi -e '
      s#([A-Z_][A-Z0-9_]*)="\$\(cd "\$SCRIPT_DIR/\.\." && pwd\)"#${1}="\$(cd "\$SCRIPT_DIR/../../.." && pwd)"#g;
      s#if ([A-Z_][A-Z0-9_]*)="\$\(git -C "\$SCRIPT_DIR/\.\." rev-parse --show-toplevel 2>/dev/null\)"; then#if ${1}="\$(git -C "\$SCRIPT_DIR/../../.." rev-parse --show-toplevel 2>/dev/null)"; then#g;
      s#cd "\$SCRIPT_DIR/\.\."#if [[ "\$SCRIPT_DIR" == */.ai/harness/scripts ]]; then\n  cd "\$SCRIPT_DIR/../../.."\nelse\n  cd "\$SCRIPT_DIR/.."\nfi#g;
      s#git -C "\$SCRIPT_DIR/\.\."#git -C "\$SCRIPT_DIR/../../.."#g;
      s#\./scripts/#.ai/harness/scripts/#g;
      s#(\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\})/scripts/#$1/.ai/harness/scripts/#g;
      s#(?<![A-Za-z0-9_./-])scripts/#.ai/harness/scripts/#g;
    ' "$helper_file"
  elif [[ "$helper_file" == *.ts ]]; then
    perl -0pi -e '
      s#join\(SCRIPT_DIR, "\.\."\)#join(SCRIPT_DIR, "..", "..", "..")#g;
      s#join\(__dirname, "\.\."\)#join(__dirname, "..", "..", "..")#g;
      s#\./scripts/#.ai/harness/scripts/#g;
      s#(\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\})/scripts/#$1/.ai/harness/scripts/#g;
      s#(?<![A-Za-z0-9_./-])scripts/#.ai/harness/scripts/#g;
    ' "$helper_file"
  fi
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

pi_recovery_profile() {
  pi_env_value "REPO_HARNESS_RECOVERY_PROFILE" "$PI_RECOVERY_PROFILE_DEFAULT"
}

pi_state_profile() {
  pi_env_value "REPO_HARNESS_STATE_PROFILE" "$PI_STATE_PROFILE_DEFAULT"
}

pi_orchestration_profile() {
  pi_env_value "REPO_HARNESS_ORCHESTRATION_PROFILE" "$PI_ORCHESTRATION_PROFILE_DEFAULT"
}

pi_evaluation_profile() {
  pi_env_value "REPO_HARNESS_EVALUATION_PROFILE" "$PI_EVALUATION_PROFILE_DEFAULT"
}

pi_handoff_profile() {
  pi_env_value "REPO_HARNESS_HANDOFF_PROFILE" "$PI_HANDOFF_PROFILE_DEFAULT"
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

pi_external_tooling_hosts_json() {
  pi_env_value "REPO_HARNESS_EXTERNAL_TOOLING_HOSTS_JSON" "$PI_EXTERNAL_TOOLING_HOSTS_DEFAULT"
}

pi_external_tooling_gbrain_mcp() {
  pi_env_value "REPO_HARNESS_EXTERNAL_TOOLING_GBRAIN_MCP" "candidate-disabled"
}

pi_external_tooling_defaults_summary() {
  cat <<'EOF_EXTERNAL_TOOLING_DEFAULTS'
- Policy defaults: routing complex->gstack, simple->waza, knowledge->gbrain
- Hosts: claude-code, codex
- Mode: agent-readiness-required
- Detection: init-migrate
- Waza: Codex-first, managed skills think/hunt/check/health, stage upstream in ~/.agents/skills, sync verified copies into ~/.codex/skills
- Codex automation profile: required health/check/mermaid from ~/.codex/skills; do not vendor skill bodies
- gbrain MCP: candidate-disabled
- CodeGraph: required agent code-navigation readiness tool, target-aware MCP configure by explicit user command or authorized agent action, per-repo ignored .codegraph/ index; generated repos do not add it as a package dependency unless local policy opts in
- Auto-actions: never install, upgrade, serve, sync, or enable MCP automatically
EOF_EXTERNAL_TOOLING_DEFAULTS
}

pi_resolve_external_tooling_detector() {
  local repo_dir="$1"
  local fallback_script="${2:-}"
  local repo_detector="$repo_dir/.ai/harness/scripts/check-agent-tooling.sh"
  local legacy_repo_detector="$repo_dir/scripts/check-agent-tooling.sh"

  if [[ -n "$fallback_script" && -f "$fallback_script" ]]; then
    printf '%s' "$fallback_script"
    return 0
  fi

  if [[ -f "$repo_detector" ]]; then
    printf '%s' "$repo_detector"
    return 0
  fi

  if [[ -f "$legacy_repo_detector" ]]; then
    printf '%s' "$legacy_repo_detector"
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
  local check_tooling_updates="${REPO_HARNESS_CHECK_TOOLING_UPDATES:-${AGENTIC_DEV_CHECK_TOOLING_UPDATES:-0}}"
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

    if pi_should_preserve_reference_config "$ref_dir/$name" "$ref_assets_dir/$name"; then
      echo "[repo-harness] preserved user-authored reference config: docs/reference-configs/$name"
      continue
    fi

    pi_write_reference_config_stub "$ref_dir/$name" "$name" "$ref_assets_dir"
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

pi_should_preserve_reference_config() {
  local target_file="$1"
  local asset_file="$2"

  [[ -f "$target_file" ]] || return 1
  if [[ -f "$asset_file" ]] && cmp -s "$target_file" "$asset_file"; then
    return 1
  fi
  if grep -Fq "$PI_REFERENCE_CONFIG_STUB_MARKER" "$target_file"; then
    return 1
  fi
  local target_heading asset_heading
  target_heading="$(pi_reference_config_first_heading "$target_file")"
  asset_heading="$(pi_reference_config_first_heading "$asset_file")"
  if [[ -n "$asset_heading" && "$target_heading" == "$asset_heading" ]]; then
    return 1
  fi

  return 0
}

pi_reference_config_first_heading() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  sed -n 's/^# //p' "$file" | head -n 1
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
> **Source Command**: \`repo-harness docs path $doc_id\`

This repo keeps workflow facts and runtime artifacts locally under \`.ai/\`.
The full generic runtime guide is supplied by the installed repo-harness
package/user-level runtime so each repository does not need to refresh a full
copy of shared documentation.

Use:

\`\`\`bash
repo-harness docs path $doc_id
repo-harness docs show $doc_id
\`\`\`
EOF_REFERENCE_STUB
}

pi_policy_reference_config_names() {
  if pi_should_generate_full_docs; then
    printf '%s\n' $PI_FULL_REFERENCE_CONFIGS
    return 0
  fi

  printf '%s\n' $PI_MINIMAL_REFERENCE_CONFIGS
}

pi_json_string_array_from_lines() {
  local first=1
  local item

  while IFS= read -r item; do
    [[ -n "$item" ]] || continue
    if [[ "$first" -eq 0 ]]; then
      printf ', '
    fi
    first=0
    printf '"%s"' "$item"
  done
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
    if command -v bun >/dev/null 2>&1 && [[ -f "$target_dir/.ai/harness/scripts/capability-resolver.ts" ]]; then
      (cd "$target_dir" && bun .ai/harness/scripts/capability-resolver.ts list --format prefixes 2>/dev/null || true)
      return 0
    fi

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
      "workstream_dir": "tasks/workstreams/$domain/$name",
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
    },
    {
      "path": "tasks/workstreams/**/*.md",
      "priority": "high",
      "char_budget": 1200,
      "purpose": "capability-workstream"
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
    },
    {
      "path": "tasks/workstreams/**/*.md",
      "priority": "high",
      "char_budget": 1200,
      "purpose": "capability-workstream"
    }
EOF_CONTEXT_ENTRY
}

pi_write_harness_policy() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file="$target_dir/.ai/harness/policy.json"
  local default_file
  local merged_file

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file"
    return 0
  fi

  mkdir -p "$(dirname "$output_file")"
  default_file="$(mktemp)"
  merged_file="$(mktemp)"
  cat > "$default_file" <<EOF_POLICY
{
  "version": 1,
  "active_plan": {
    "marker_file": ".ai/harness/active-plan",
    "legacy_marker_file": ".claude/.active-plan",
    "directory": "plans",
    "archive_directory": "plans/archive",
    "glob": "plan-*.md",
    "active_worktree_marker_file": ".ai/harness/active-worktree",
    "source_of_truth": "per-worktree explicit marker with active-worktree owner; legacy Claude marker fallback only"
  },
  "tasks": {
    "todo_file": "tasks/todos.md",
    "current_status_file": "tasks/current.md",
    "lessons_file": "tasks/lessons.md",
    "research_dir": "docs/researches",
    "workstreams_dir": "tasks/workstreams",
    "contracts_dir": "tasks/contracts",
    "reviews_dir": "tasks/reviews",
    "notes_dir": "tasks/notes"
  },
  "prds": {
    "dir": "plans/prds",
    "template_file": ".claude/templates/prd.template.md",
    "statuses": ["Draft", "Approved", "Superseded"],
    "rule": "PRDs live in plans/prds as the upper planning layer. They decompose docs/spec.md intent into product direction, acceptance scenarios, module behavior, data model, performance targets, and developer handoff. Sprints reference PRDs through Source PRD and decompose them into ordered execution backlogs."
  },
  "sprints": {
    "dir": "plans/sprints",
    "active_marker_file": ".ai/harness/sprint/active-sprint",
    "template_file": ".claude/templates/sprint.template.md",
    "helper_script": "scripts/sprint-backlog.sh",
    "statuses": ["Draft", "Approved", "Executing", "Done", "Archived"],
    "rule": "PRDs live in plans/prds as the upper planning layer. Sprints live in plans/sprints as long-task execution backlogs; each sprint row is expanded with Waza \$think into a detailed plans/plan-*.md before the plan -> contract -> worktree flow; tasks/todos.md stays the deferred-goal ledger"
  },
  "reference_material": {
    "dir": "_ref",
    "mode": "external-ignored",
    "commit_policy": "never commit _ref contents",
    "rule": "use _ref as an occasional ignored external reference checkout cache for upstream/source comparison only; refresh from external sources instead of editing as product code; when it influences a decision, cite the source repo plus commit/tag and path in tasks/notes/ or docs/researches/"
  },
  "operations": {
    "dir": "deploy",
    "private_dir": "_ops",
    "tracked": ["deploy/README.md", "deploy/scripts/", "deploy/submissions/", "deploy/runbooks/", "deploy/release-checklists/", "deploy/sql/", "deploy/*.md", "deploy/env/.env.example"],
    "ignored": ["_ops/"],
    "rule": "commit deployment runbooks, submission materials, release checklists, helper scripts, ordered SQL files, and env examples under deploy/; keep deploy SQL in deploy/sql/ with 4-digit ascending prefixes; keep keys, tokens, real env values, provider state, artifacts, logs, and scratch files in ignored _ops/ only"
  },
  "context": {
    "profile": "$(pi_context_profile)",
    "map_file": ".ai/context/context-map.json",
    "capability_registry_file": ".ai/context/capabilities.json",
    "capability_resolver": "scripts/capability-resolver.ts",
    "capability_config": "scripts/capability-config.ts",
    "capability_match_rule": "longest-prefix; same-length ambiguity fails",
    "functional_block_selector": {
      "script": "scripts/select-agent-context-blocks.sh",
      "config_file": ".ai/context/agent-context-blocks.txt",
      "env": "REPO_HARNESS_CONTEXT_BLOCKS",
      "rule": "compatibility selector; capability registry is the source of truth"
    }
  },
  "harness": {
    "policy_file": ".ai/harness/policy.json",
    "checks_file": ".ai/harness/checks/latest.json",
    "handoff_file": ".ai/harness/handoff/current.md",
    "failure_log_file": ".ai/harness/failures/latest.jsonl",
    "events_file": ".ai/harness/events.jsonl",
    "architecture_events_file": ".ai/harness/architecture/events.jsonl",
    "runs_dir": ".ai/harness/runs",
    "helper_runtime_dir": ".ai/harness/scripts",
    "helper_compat_dir": "scripts",
    "helper_source": "package",
    "helper_package_dir": "assets/templates/helpers"
  },
  "architecture": {
    "index_file": "docs/architecture/index.md",
    "requests_dir": "docs/architecture/requests",
    "snapshots_dir": "docs/architecture/snapshots",
    "diagrams_dir": "docs/architecture/diagrams",
    "domains_dir": "docs/architecture/domains",
    "modules_dir": "docs/architecture/modules",
    "diagram_skill": "mermaid",
    "diagram_skill_source": "~/.codex/skills/mermaid",
    "vendoring_policy": "do-not-vendor-diagram-skill-assets",
    "freshness_gate": "advisory",
    "gate_min_severity": "medium",
    "pending_card_scope": "capability",
    "pending_block_begin": "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->",
    "pending_block_end": "<!-- END ARCHITECTURE PENDING REQUESTS -->",
    "queue_script": ".ai/harness/scripts/architecture-queue.sh",
    "contract_block_begin": "<!-- BEGIN ARCHITECTURE CONTRACT -->",
    "contract_block_end": "<!-- END ARCHITECTURE CONTRACT -->",
    "rule": "hooks record architecture queue cards and sync controlled local context blocks; agents author semantic snapshots and diagrams"
  },
  "workstreams": {
    "dir": "tasks/workstreams",
    "scope": "capability",
    "projection": "local-contract-active-pointer-and-current-slice",
    "todo_projection": "tasks/todos.md",
    "rule": "durable multi-session progress lives under tasks/workstreams/<domain>/<capability>; current plan execution lives in the plan Task Breakdown; tasks/todos.md records deferred goals only"
  },
  "information_lifecycle": {
    "notes": {
      "dir": "tasks/notes",
      "purpose": "task-local implementation decisions, deviations, tradeoffs, and open questions",
      "promotion": "archive on workflow close; promote only repeated or durable findings"
    },
    "evidence": {
      "latest": ".ai/harness/checks/latest.json",
      "snapshots_dir": ".ai/harness/runs",
      "purpose": "raw verification records used to audit notes, reviews, and future promotion"
    },
    "assets": {
      "sources": [".ai/harness/policy.json", ".ai/harness/workflow-contract.json", ".ai/hooks/", "scripts/", "docs/reference-configs/"],
      "promotion_rule": "only promote patterns after verified reuse across tasks or fixtures"
    },
    "memory": {
      "sources": ["docs/researches/", "tasks/lessons.md", "gbrain"],
      "rule": "memory is advisory; current repo state and evidence override summaries"
    },
    "external_knowledge": {
      "default_brain_path": "brain/<project>/*",
      "project_path": "brain/<project>/*",
      "manifest_file": ".ai/harness/brain-manifest.json",
      "drift_check": "scripts/check-brain-manifest.sh",
      "sync_script": "scripts/sync-brain-docs.sh",
      "hook_trigger": "PostToolUse Edit|Write for manifest entries with sync.direction=repo-to-brain",
      "rule": "external knowledge stores long-lived explanations, runbooks, and patterns only; repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
      "sync_rule": "only explicitly opted-in repo-to-brain manifest entries may be written to the default brain vault; pointer-only externalized stubs remain check-only"
    }
  },
  "handoff_resume": {
    "resume_packet_file": ".ai/harness/handoff/resume.md",
    "global_handoff_dir": "~/.codex/handoffs",
    "auto_start_new_session": false
  },
  "plan_capture": {
    "script": "scripts/capture-plan.sh",
    "sources": ["codex-plan-mode", "waza-think", "repo-harness-plan", "repo-harness-sprint"],
    "rule": "Codex Plan mode and Waza think planning should capture decision-complete plans into plans/plan-*.md; implementation approval then projects the active approved plan through scripts/plan-to-todo.sh; sprint backlog rows are long-task waypoints and should be expanded with \$think before capture/execution"
  },
  "planning": {
    "pending_orchestration_file": ".ai/harness/planning/pending.json",
    "source_of_truth": "transient host planning bridge only; plans/ and .ai/harness/active-plan remain authoritative"
  },
  "guards": {
    "edit_plan_gate": "enforce",
    "edit_plan_gate_modes": ["enforce", "advice", "off"],
    "rule": "pre-edit-guard blocks implementation edits (non-workflow paths) unless an active plan is Approved/Executing; prompt-layer plan gates are advisory routing only"
  },
  "sidecar_research": {
    "default": true,
    "output_dir": "docs/researches",
    "preferred_runners": ["subagent", "codex exec --json", "main-thread trace"],
    "spawn_decision": "main agent decides from task breadth, context impact, raw-log volume, and callable runner availability; do not ask the user for spawn confirmation",
    "fallback_runner": "main-thread trace",
    "main_thread_policy": "if spawning is not worthwhile or no sidecar runner is callable, perform bounded research in the main thread; consume conclusions and evidence paths, not raw logs"
  },
  "documentation": {
    "profile": "$(pi_documentation_profile)",
    "reference_source": "user-level-runtime-docs",
    "reference_stub_marker": "$PI_REFERENCE_CONFIG_STUB_MARKER",
    "reference_resolver": "repo-harness docs path <doc-id>",
    "required": ["docs/spec.md", "docs/architecture/index.md"],
    "on_demand": ["docs/brief.md", "docs/tech-stack.md", "docs/decisions.md", "docs/architecture.md", "docs/packages.md"],
    "reference_configs": [$(pi_policy_reference_config_names | pi_json_string_array_from_lines)],
    "rule": "create optional docs only when the agent has concrete repo evidence or the user asks; docs/reference-configs contains repo-local pointer stubs while full generic runtime docs live in the user-level/package repo-harness install"
  },
  "lsp_profiles": {
    "default": "$(pi_lsp_profile)",
    "selection": "functional-block-first",
    "rule": "use block-level LSP/tooling hints before broad repo assumptions"
  },
  "worktree_strategy": {
    "auto_on_conflict": true,
    "auto_for_contract_tasks": true,
    "branch_prefix": "codex/",
    "base_branch": "main",
    "worktree_dir_template": "../{{repo}}-wt-{{slug}}",
    "start_script": "scripts/contract-worktree.sh start --plan <plan-file>",
    "finish_script": "scripts/contract-worktree.sh finish",
    "cleanup_script": "scripts/contract-worktree.sh cleanup --slug <slug>",
    "conflict_signals": [
      "dirty_worktree_overlaps_task_files",
      "current_branch_not_suitable_for_task",
      "existing_changes_unrelated_but_would_block_review",
      "task_requires_clean_validation_surface"
    ],
    "validation_route": "waza:check",
    "merge_back": {
      "target": "main",
      "requires_clean_check": true,
      "preserve_unrelated_changes": true
    }
  },
  "upgrade": {
    "strategy_version": 1,
    "supported_legacy_versions": ["pre-tasks-first", "tasks-first-without-contract-manifest", "current-v1"],
    "action_classes": {
      "preserve": "keep user-authored hooks, ignored reference material, private operations state, secrets, and local env files unchanged",
      "archive": "move user-authored legacy workflow documents or checklists into archive/research surfaces before refresh",
      "reconfigure": "merge managed config defaults without overwriting explicit repo overrides",
      "remove": "delete only workflow-contract actions marked ownership=known_generated"
    },
    "cleanup": {
      "source": ".ai/harness/workflow-contract.json#migrations.upgrade.actions",
      "remove_only_ownership": "known_generated",
      "unknown_files": "preserve-or-archive",
      "custom_hooks": "preserve",
      "ignored_reference_material": "preserve",
      "local_operations_state": "preserve",
      "local_secrets": "preserve"
    },
    "reporting": {
      "inspector_field": "upgrade_plan",
      "dry_run_required": true
    }
  },
  "profiles": {
    "orchestration": "$(pi_orchestration_profile)",
    "evaluation": "$(pi_evaluation_profile)",
    "handoff": "$(pi_handoff_profile)",
    "recovery": "$(pi_recovery_profile)",
    "state": "$(pi_state_profile)"
  },
  "external_tooling": {
    "routing": {
      "complex": "gstack",
      "simple": "waza",
      "knowledge": "gbrain"
    },
    "hosts": $(pi_external_tooling_hosts_json),
    "mode": "agent-readiness-required",
    "detection": "init-migrate",
    "readiness_gate": "repo-harness run check-agent-tooling --host codex --strict-readiness",
    "waza": {
      "source_repo": "tw93/Waza",
      "source_url": "https://github.com/tw93/Waza.git",
      "managed_skills": ["think", "hunt", "check", "health"],
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills",
      "staging_cache_path": "~/.agents/skills",
      "sync_mode": "stage-upstream-then-copy-to-codex",
      "host_drift_policy": "report-per-host-version-staging-and-upstream-drift"
    },
    "codex_automation_profile": {
      "required_skills": ["health", "check", "mermaid"],
      "optional_skills": [],
      "mode": "codex-runtime-reference",
      "source": "~/.codex/skills",
      "routes": {
        "workflow_health": "waza:health",
        "review_gate": "waza:check",
        "architecture_diagram": "mermaid"
      },
      "vendoring_policy": "do-not-vendor-skill-body"
    },
    "diagram_design": {
      "skill_name": "mermaid",
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills/mermaid",
      "sync_mode": "external-installed-skill",
      "vendoring_policy": "do-not-vendor"
    },
    "gbrain": {
      "mcp": "$(pi_external_tooling_gbrain_mcp)"
    },
    "codegraph": {
      "package": "@colbymchenry/codegraph",
      "primary_host": "both",
      "install_mode": "target-aware-mcp",
      "codex_config_path": "~/.codex/config.toml",
      "claude_config_path": "~/.claude.json",
      "index_dir": ".codegraph",
      "readiness": "required-for-agent-code-navigation",
      "hook_policy": "do-not-block-hooks",
      "install_command": "bun add -g @colbymchenry/codegraph && repo-harness tools configure codegraph --target codex --location global",
      "project_init_command": "codegraph init -i .",
      "sync_command": "codegraph sync .",
      "vendoring_policy": "do-not-add-package-dependency"
    }
  },
  "agentic_development": {
    "routing": {
      "product_discovery": "gstack:office-hours",
      "complex_engineering_plan": "gstack:plan-eng-review",
      "design_plan": "gstack:plan-design-review",
      "small_or_medium_plan": "waza:think",
      "bug_or_regression": "waza:hunt",
      "post_implementation_review": "waza:check"
    },
    "due_diligence": {
      "levels": ["P1_GLOBAL_ARCHITECTURE", "P2_DATA_FLOW_TRACE", "P3_DESIGN_DECISION"],
      "explicit_report_required_for": ["plan-eng-review", "hunt", "risky_refactor", "deployment", "auth_payment_data", "shared_contract"]
    }
  },
  "enforcement": {
    "worktree_guard": "warn-by-default",
    "verification_gate": "contract-and-review",
    "completion_requires_checks": true
  }
}
EOF_POLICY

  if [[ -f "$output_file" ]]; then
    if ! pi_merge_json_defaults "$default_file" "$output_file" "$merged_file"; then
      cp "$default_file" "$merged_file"
    fi
  elif ! pi_merge_json_defaults "$default_file" "$default_file" "$merged_file"; then
    cp "$default_file" "$merged_file"
  else
    :
  fi

  mv "$merged_file" "$output_file"
  rm -f "$default_file"
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
    "hook runtime may sync explicitly opted-in repo-to-brain entries only; it must not query gbrain, MCP, or unregistered default brain paths"
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
      "script": "scripts/select-agent-context-blocks.sh",
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
    "tasks/current.md",
    "tasks/todos.md",
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

pi_root_context_content() {
  cat <<'EOF_ROOT_CONTEXT'
# Repo Agent Context

This is the root routing contract for Claude Code and Codex.

## Root Workflow Contract

- Keep sibling `CLAUDE.md` and `AGENTS.md` files aligned. Claude Code consumes `CLAUDE.md`; Codex consumes `AGENTS.md`.
- Treat `docs/spec.md` as stable product truth, `tasks/current.md` as a derived status snapshot, and `tasks/todos.md` as the deferred-goal ledger; current execution stays in the active plan's `## Task Breakdown`.
- Treat `docs/researches/`, `tasks/lessons.md`, and `.ai/harness/policy.json` as durable workflow context.
- Use `.ai/context/context-map.json` and `.ai/context/capabilities.json` to discover functional-block contracts.
- Do not infer local `CLAUDE.md` or `AGENTS.md` files from broad physical layouts such as `apps/*`, `packages/*`, or `services/*`.
- Put capability-specific ownership, entrypoints, and verification commands in explicitly selected functional-block contracts.
- Keep root context concise; route deep implementation detail into plans, task notes, research, workstreams, or architecture docs.
- Treat `_ref/` as ignored external reference material and `_ops/` as ignored local operations state.
- Prefer repo-local workflow artifacts over tool-specific chat memory.
EOF_ROOT_CONTEXT
}

pi_install_root_context_files() {
  local target_dir="$1"
  local mode="${2:-apply}"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install root CLAUDE.md/AGENTS.md files in $target_dir"
    return 0
  fi

  if [[ -f "$target_dir/AGENTS.md" && ! -f "$target_dir/CLAUDE.md" ]]; then
    cp "$target_dir/AGENTS.md" "$target_dir/CLAUDE.md"
    return 0
  fi

  if [[ -f "$target_dir/CLAUDE.md" && ! -f "$target_dir/AGENTS.md" ]]; then
    cp "$target_dir/CLAUDE.md" "$target_dir/AGENTS.md"
    return 0
  fi

  if [[ ! -f "$target_dir/CLAUDE.md" ]]; then
    pi_root_context_content > "$target_dir/CLAUDE.md"
  fi

  if [[ ! -f "$target_dir/AGENTS.md" ]]; then
    pi_root_context_content > "$target_dir/AGENTS.md"
  fi
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

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- Describe only the ownership, boundaries, stable entrypoints, and local verification commands for this functional block.
- Keep sibling `CLAUDE.md` and `AGENTS.md` files aligned. Claude Code consumes `CLAUDE.md`; Codex consumes `AGENTS.md`.
- Record the local LSP/tooling profile here when it differs from the repo default.
- Route deep implementation detail into nearby docs instead of inflating root agent context files.
- Treat `.ai/context/context-map.json` as the index of discoverable context files.
- Do not keep pushing context files deeper by default; add lower-level files only for a separately owned functional block with its own commands and invariants.
- Prefer repo-local workflow artifacts over tool-specific chat memory.
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
    echo "[dry-run] ensure harness policy/context/events/runs/worktrees/triage/planning in $target_dir"
    return 0
  fi

  mkdir -p \
    "$target_dir/tasks/notes" \
    "$target_dir/tasks/workstreams" \
    "$target_dir/.ai/context" \
    "$target_dir/.ai/harness/checks" \
    "$target_dir/.ai/harness/handoff" \
    "$target_dir/.ai/harness/scripts" \
    "$target_dir/.ai/harness/failures" \
    "$target_dir/.ai/harness/security" \
    "$target_dir/.ai/harness/planning" \
    "$target_dir/.ai/harness/architecture" \
    "$target_dir/.ai/harness/worktrees" \
    "$target_dir/.ai/harness/triage" \
    "$target_dir/docs/researches" \
    "$target_dir/docs/architecture/domains" \
    "$target_dir/docs/architecture/modules" \
    "$target_dir/docs/architecture/requests" \
    "$target_dir/docs/architecture/snapshots" \
    "$target_dir/docs/architecture/diagrams" \
    "$target_dir/.ai/harness/runs"

  [[ -f "$target_dir/.ai/harness/checks/latest.json" ]] || printf "{}\n" > "$target_dir/.ai/harness/checks/latest.json"
  [[ -f "$target_dir/.ai/harness/handoff/current.md" ]] || printf "# Harness Handoff\n\n> **Reason**: bootstrap\n" > "$target_dir/.ai/harness/handoff/current.md"
  [[ -f "$target_dir/.ai/harness/handoff/resume.md" ]] || printf "# Codex Resume Packet\n\n> **Reason**: bootstrap\n" > "$target_dir/.ai/harness/handoff/resume.md"
  [[ -f "$target_dir/.ai/context/capability-source-map.json" ]] || printf '{\n  "version": 1,\n  "capabilities": {}\n}\n' > "$target_dir/.ai/context/capability-source-map.json"
  [[ -f "$target_dir/.ai/harness/events.jsonl" ]] || : > "$target_dir/.ai/harness/events.jsonl"
  [[ -f "$target_dir/.ai/harness/architecture/events.jsonl" ]] || : > "$target_dir/.ai/harness/architecture/events.jsonl"
  [[ -f "$target_dir/.ai/harness/architecture/.gitkeep" ]] || : > "$target_dir/.ai/harness/architecture/.gitkeep"
  [[ -f "$target_dir/.ai/harness/failures/latest.jsonl" ]] || : > "$target_dir/.ai/harness/failures/latest.jsonl"
  [[ -f "$target_dir/.ai/harness/security/.gitkeep" ]] || : > "$target_dir/.ai/harness/security/.gitkeep"
  [[ -f "$target_dir/.ai/harness/scripts/.gitkeep" ]] || : > "$target_dir/.ai/harness/scripts/.gitkeep"
  [[ -f "$target_dir/.ai/harness/planning/.gitkeep" ]] || : > "$target_dir/.ai/harness/planning/.gitkeep"
  [[ -f "$target_dir/.ai/harness/worktrees/.gitkeep" ]] || : > "$target_dir/.ai/harness/worktrees/.gitkeep"
  [[ -f "$target_dir/.ai/harness/runs/.gitkeep" ]] || : > "$target_dir/.ai/harness/runs/.gitkeep"
  [[ -f "$target_dir/.ai/harness/triage/.gitkeep" ]] || : > "$target_dir/.ai/harness/triage/.gitkeep"
  [[ -f "$target_dir/tasks/workstreams/.gitkeep" ]] || : > "$target_dir/tasks/workstreams/.gitkeep"
  if [[ ! -f "$target_dir/docs/researches/README.md" ]]; then
    cat > "$target_dir/docs/researches/README.md" <<'RESEARCH_README_EOF'
# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files.

Use `YYYYMMDD-topic.md` names when chronology matters, or `<topic>.md` for
stable subject reports. Keep task-local implementation decisions in
`tasks/notes/`, and keep repeated correction-derived rules in `tasks/lessons.md`.
RESEARCH_README_EOF
  fi
  if [[ ! -f "$target_dir/tasks/current.md" ]]; then
    cat > "$target_dir/tasks/current.md" <<'CURRENT_STATUS_EOF'
# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: bootstrap -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: bootstrap
> **Source Branch**: main
> **Source Commit**: bootstrap
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bootstrap
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.
CURRENT_STATUS_EOF
  fi
  [[ -f "$target_dir/docs/architecture/domains/.gitkeep" ]] || : > "$target_dir/docs/architecture/domains/.gitkeep"
  [[ -f "$target_dir/docs/architecture/modules/.gitkeep" ]] || : > "$target_dir/docs/architecture/modules/.gitkeep"
  [[ -f "$target_dir/docs/architecture/requests/.gitkeep" ]] || : > "$target_dir/docs/architecture/requests/.gitkeep"
  [[ -f "$target_dir/docs/architecture/snapshots/.gitkeep" ]] || : > "$target_dir/docs/architecture/snapshots/.gitkeep"
  [[ -f "$target_dir/docs/architecture/diagrams/.gitkeep" ]] || : > "$target_dir/docs/architecture/diagrams/.gitkeep"
  if [[ ! -f "$target_dir/docs/architecture/index.md" ]]; then
    cat > "$target_dir/docs/architecture/index.md" <<'ARCHITECTURE_INDEX_EOF'
# Architecture Index

> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.

## Current Snapshot

- Latest snapshot: (none yet)
- Semantic diagram source: (none yet)
- Latest human diagram: (none yet)

## Architecture Drift Flow

- `.ai/harness/scripts/architecture-queue.sh` records architecture-sensitive edits as requests.
- `.ai/harness/scripts/archive-architecture-request.sh` archives handled requests after an agent records the resolution status and linked artifacts.
- `.ai/harness/scripts/context-contract-sync.sh` keeps only the controlled architecture block in functional-block `AGENTS.md` and `CLAUDE.md` files aligned.
- `.ai/harness/scripts/workstream-sync.sh` keeps durable multi-session progress under `tasks/workstreams/<domain>/<capability>/` and projects only pointers into local contracts.
- Semantic architecture diagrams live as Mermaid fenced blocks in the relevant module or snapshot Markdown.
- Human-readable architecture diagrams are optional `mermaid` HTML files in `docs/architecture/diagrams/` and should link back to the Markdown semantic source.

## Pending Requests

<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->
- (none)
<!-- END ARCHITECTURE PENDING REQUESTS -->

ARCHITECTURE_INDEX_EOF
  fi

  pi_write_capability_registry "$target_dir" "$mode"
  pi_write_harness_policy "$target_dir" "$mode"
  pi_write_brain_manifest "$target_dir" "$mode"
  pi_write_context_map "$target_dir" "$mode"
  pi_install_root_context_files "$target_dir" "$mode"
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

pi_merge_json_defaults() {
  local defaults_file="$1"
  local current_file="$2"
  local output_file="$3"
  local js_runtime

  js_runtime="$(pi_resolve_js_runtime || true)"
  if [[ -n "$js_runtime" ]]; then
    "$js_runtime" -e '
const fs = require("fs");
const [defaultsPath, currentPath, outputPath] = process.argv.slice(1);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const unionArrayPaths = new Set(["documentation.reference_configs"]);

function mergeDefaults(defaultsValue, currentValue, path = []) {
  if (Array.isArray(defaultsValue)) {
    const keyPath = path.join(".");
    if (Array.isArray(currentValue) && unionArrayPaths.has(keyPath)) {
      const result = [...currentValue];
      for (const item of defaultsValue) {
        if (!result.includes(item)) result.push(item);
      }
      return result;
    }
    return Array.isArray(currentValue) ? currentValue : defaultsValue;
  }

  if (isPlainObject(defaultsValue)) {
    const result = { ...defaultsValue };
    if (isPlainObject(currentValue)) {
      for (const [key, value] of Object.entries(currentValue)) {
        result[key] = Object.prototype.hasOwnProperty.call(defaultsValue, key)
          ? mergeDefaults(defaultsValue[key], value, [...path, key])
          : value;
      }
    }
    return result;
  }

  return currentValue === undefined ? defaultsValue : currentValue;
}

const defaultsJson = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
let currentJson = {};
try {
  currentJson = JSON.parse(fs.readFileSync(currentPath, "utf8"));
} catch (_error) {
  currentJson = {};
}

const merged = mergeDefaults(defaultsJson, currentJson);
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n");
' "$defaults_file" "$current_file" "$output_file"
    return $?
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$defaults_file" "$current_file" "$output_file" <<'PY_EOF'
import json
import sys

defaults_path, current_path, output_path = sys.argv[1:]

UNION_ARRAY_PATHS = {("documentation", "reference_configs")}

def merge_defaults(defaults_value, current_value, path=()):
    if isinstance(defaults_value, list):
        if isinstance(current_value, list) and path in UNION_ARRAY_PATHS:
            result = list(current_value)
            for item in defaults_value:
                if item not in result:
                    result.append(item)
            return result
        return current_value if isinstance(current_value, list) else defaults_value
    if isinstance(defaults_value, dict):
        result = dict(defaults_value)
        if isinstance(current_value, dict):
            for key, value in current_value.items():
                result[key] = merge_defaults(defaults_value[key], value, path + (key,)) if key in defaults_value else value
        return result
    return defaults_value if current_value is None else current_value

with open(defaults_path, "r", encoding="utf-8") as handle:
    defaults_json = json.load(handle)

try:
    with open(current_path, "r", encoding="utf-8") as handle:
        current_json = json.load(handle)
except Exception:
    current_json = {}

merged = merge_defaults(defaults_json, current_json)
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(merged, handle, indent=2)
    handle.write("\n")
PY_EOF
    return $?
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

  if [[ ! -f "$package_file" ]]; then
    project_name="$(basename "$target_dir" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
    project_name="${project_name:-project}"
    cat > "$package_file" <<EOF_PACKAGE
{
  "name": "$project_name",
  "private": true,
  "scripts": {
    "check:brain-manifest": "repo-harness run check-brain-manifest",
    "check:context-files": "repo-harness run check-context-files",
    "check:deploy-sql": "repo-harness run check-deploy-sql-order",
    "check:architecture-sync": "repo-harness run check-architecture-sync",
    "check:task-sync": "repo-harness run check-task-sync",
    "check:task-workflow": "repo-harness run check-task-workflow --strict",
    "sync:brain-docs": "repo-harness run sync-brain-docs --all"
  }
}
EOF_PACKAGE
    return 0
  fi

  js_runtime="$(pi_resolve_js_runtime || true)"
  if [[ -z "$js_runtime" ]]; then
    echo "[warn] no JavaScript runtime found; unable to inject task workflow scripts into $package_file" >&2
    return 0
  fi

  "$js_runtime" -e '
const fs = require("fs");
const file = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.private ??= true;
pkg.scripts ??= {};
pkg.scripts["check:brain-manifest"] = "repo-harness run check-brain-manifest";
pkg.scripts["check:context-files"] = "repo-harness run check-context-files";
pkg.scripts["check:deploy-sql"] = "repo-harness run check-deploy-sql-order";
pkg.scripts["check:architecture-sync"] = "repo-harness run check-architecture-sync";
pkg.scripts["check:task-sync"] = "repo-harness run check-task-sync";
pkg.scripts["check:task-workflow"] = "repo-harness run check-task-workflow --strict";
pkg.scripts["sync:brain-docs"] = "repo-harness run sync-brain-docs --all";
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$package_file"
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
  local scripts_source_dir="$3"
  local mode="${4:-apply}"
  local scripts_dir="$target_dir/.ai/harness/scripts"
  local factors_dir="$target_dir/tasks/factors"
  local cache_dir="$target_dir/.claude/.factor-cache/candidates"
  local registry_template="$factor_assets_dir/factor-registry.template.json"
  local hypothesis_template="$factor_assets_dir/factor-hypothesis.template.md"
  local report_template="$factor_assets_dir/factor-backtest-report.template.md"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install factor factory assets into $target_dir"
    return 0
  fi

  mkdir -p "$factors_dir/promoted" "$cache_dir" "$scripts_dir"

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

  local factor_script
  for factor_script in factor-lab-new.sh factor-lab-promote.sh factor-lab-reject.sh factor-lab-check.sh; do
    if [[ -f "$scripts_source_dir/$factor_script" ]]; then
      cp "$scripts_source_dir/$factor_script" "$scripts_dir/$factor_script"
      pi_normalize_installed_helper "$scripts_dir/$factor_script"
    fi
  done

  pi_ensure_executable_if_apply "$mode" "$scripts_dir"/factor-lab-*.sh
}

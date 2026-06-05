# Skill Benchmark Report

Latest iteration: `iteration-20260525-030242`

Workspace root: `/Users/chris/.claude/skills/repo-harness-skill-workspace`

Generated: 2026-05-24T19:02:47.223Z

## Quality Metrics

| Metric | Value |
| --- | ---: |
| full_test_count | 0 |
| dry_run_count | 60 |
| dry_run_ratio | 100.0% |
| grader_pass_rate | n/a (0/0) |
| effectiveness_authority | non_authoritative |

Effectiveness evidence is non-authoritative because this historical benchmark is an all dry-run sample.

## Command Matrix

| Agent | Profile | Command |
| --- | --- | --- |
| claude | with_skill | `claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions --add-dir /Users/chris/.claude/skills/project-initializer 'Initialize a new B2B internal tool with Vite, TanStack Router, docs/spec.md, harness workflow files, and concise CLAUDE.md/AGENTS.md for both Claude and Codex.'` |
| claude | without_skill | `claude -p --output-format text --no-session-persistence --permission-mode bypassPermissions --disable-slash-commands 'Initialize a new B2B internal tool with Vite, TanStack Router, docs/spec.md, harness workflow files, and concise CLAUDE.md/AGENTS.md for both Claude and Codex.'` |
| codex | with_skill | `codex exec -C /Users/chris/.claude/skills/repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-new-project --dangerously-bypass-approvals-and-sandbox -o /Users/chris/.claude/skills/repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-new-project/final-response.md --add-dir /Users/chris/.claude/skills/project-initializer 'Initialize a new B2B internal tool with Vite, TanStack Router, docs/spec.md, harness workflow files, and concise CLAUDE.md/AGENTS.md for both Claude and Codex.'` |
| codex | without_skill | `codex exec -C /Users/chris/.claude/skills/repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-new-project --dangerously-bypass-approvals-and-sandbox -o /Users/chris/.claude/skills/repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-new-project/final-response.md 'Initialize a new B2B internal tool with Vite, TanStack Router, docs/spec.md, harness workflow files, and concise CLAUDE.md/AGENTS.md for both Claude and Codex.'` |

## claude / with_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| initialize-new-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-new-project) |
| repair-agents-task-sync | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/repair-agents-task-sync) |
| migrate-legacy-repo | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/migrate-legacy-repo) |
| audit-workflow-drift | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/audit-workflow-drift) |
| codex-skill-factory-lifecycle | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/codex-skill-factory-lifecycle) |
| initialize-plan-g-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-plan-g-project) |
| route-existing-repo-init | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-existing-repo-init) |
| route-new-project-scaffold | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-new-project-scaffold) |
| route-legacy-migrate | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-legacy-migrate) |
| route-current-upgrade | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-current-upgrade) |
| route-harness-repair | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-harness-repair) |
| route-workflow-check | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-workflow-check) |
| route-repo-harness-plan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-plan) |
| route-repo-harness-review | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-review) |
| route-repo-harness-autoplan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-autoplan) |

### initialize-new-project

- Eval: `1`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-new-project](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-new-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Chooses a plausible core plan and explains the stack choice.
  - Includes docs/spec.md, tasks/todo.md, tasks/lessons.md, tasks/research.md, tasks/contracts/, tasks/reviews/, and .ai/harness/ in the generated workflow.
  - Treats docs/PROGRESS.md as milestone-only instead of the active execution log.

### repair-agents-task-sync

- Eval: `2`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/repair-agents-task-sync](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/repair-agents-task-sync)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Calls out repo-local task sync as the primary enforcement mechanism.
  - Treats plans/ as the plan catalog and the host-neutral active marker as the active selector instead of relying on docs/plan.md.
  - Updates the final response contract to mention changed tasks files.
  - Avoids treating hooks as the only source of enforcement.

### migrate-legacy-repo

- Eval: `3`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/migrate-legacy-repo](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/migrate-legacy-repo)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Replaces docs/TODO.md with tasks/todo.md as the primary task contract.
  - Installs docs/spec.md, tasks/reviews/, and .ai/harness/ as first-class harness artifacts.
  - Removes docs/plan.md compatibility pointers in favor of plans/ as the active-plan source of truth.
  - Adds repo-local task-sync enforcement such as scripts/check-task-sync.sh.
  - Updates migration guidance and scripts rather than only editing prose.
  - Installs a shared .ai/ hook layer and routes Claude hook settings through it.

### audit-workflow-drift

- Eval: `4`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/audit-workflow-drift](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/audit-workflow-drift)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Checks both Claude-specific hooks and cross-agent repo-local contracts.
  - Flags docs/PROGRESS.md misuse if it is acting as an execution log.
  - Flags duplicated active-plan state outside plans/ as workflow drift.
  - Flags missing docs/spec.md, tasks/reviews/, or .ai/harness/ as incomplete 3.0 migration.
  - Mentions migration or template updates when current files are out of sync with the skill.
  - Calls out when a repo only has .claude hook wiring but lacks the shared .ai/ automation layer.

### codex-skill-factory-lifecycle

- Eval: `5`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/codex-skill-factory-lifecycle](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/codex-skill-factory-lifecycle)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Reads .claude/.skill-factory-state.json to understand current pattern counts.
  - Uses AGENTS.md Skill Factory protocol to group lessons by theme.
  - Runs bash scripts/skill-factory-check.sh to inspect current state.
  - After the third session, both workflow and knowledge proposals reach pending status.
  - Adds evidence-aware proposal context including evidence score or correction count when reporting workflow proposal state.
  - Does not auto-create skills — proposals require explicit human promotion via skill-factory-create.sh.
  - Does not treat ordinary post-edit activity as optimization feedback.
  - Uses bash scripts/skill-factory-check.sh --record-feedback <slug> --signal <label> when explicit feedback is needed.

### initialize-plan-g-project

- Eval: `6`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-plan-g-project](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/initialize-plan-g-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Selects Plan G or explicitly identifies the AI quantitative trading preset.
  - Mentions the factor registry as the source of truth for factor lifecycle state.
  - Includes the factor-lab new/promote/reject/check commands in the generated workflow discussion.
  - Preserves the standard tasks-first workflow alongside factor research scaffolding.

### route-existing-repo-init

- Eval: `7`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-existing-repo-init](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-existing-repo-init)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats init as existing-repo adoption, not product scaffold creation.
  - Names repo-harness-init as the public command.
  - Keeps hook and docs initialization behind the migration engine.

### route-new-project-scaffold

- Eval: `8`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-new-project-scaffold](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-new-project-scaffold)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats scaffold as new project or module creation.
  - Uses plan catalog A-K instead of ad hoc stack guessing.
  - Attaches the repo-local workflow after product scaffold creation.

### route-legacy-migrate

- Eval: `9`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-legacy-migrate](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-legacy-migrate)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Preserves or archives user-authored legacy workflow docs.
  - Does not conflate migration with scaffold.
  - Uses the manifest-owned removal boundary.

### route-current-upgrade

- Eval: `10`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-current-upgrade](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-current-upgrade)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses upgrade for current harness refresh, not migration.
  - Reads manifest-owned upgrade actions.
  - Preserves private and user-local paths.

### route-harness-repair

- Eval: `11`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-harness-repair](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-harness-repair)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses repair only after recognizing a current harness surface.
  - Traces the failing workflow path before fixing.
  - Keeps the fix targeted to task sync, hooks, handoff, context, policy, or helpers.

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-workflow-check](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.

### route-repo-harness-plan

- Eval: `13`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-plan](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-plan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Keeps planning non-mutating by default.
  - Produces one recommended action path.
  - Separates plan output from implementation.

### route-repo-harness-review

- Eval: `14`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-review](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-review)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats review as plan-stage critique.
  - Covers product, engineering, design, and DevEx when relevant.
  - Keeps implementation separate from review.

### route-repo-harness-autoplan

- Eval: `15`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-autoplan](../repo-harness-skill-workspace/iteration-20260525-030242/claude/with_skill/route-repo-harness-autoplan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Runs the full planning and review sequence automatically.
  - Surfaces only material final decision gates.
  - Does not redirect into long interactive review unless automatic planning is unsafe.

## claude / without_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| initialize-new-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-new-project) |
| repair-agents-task-sync | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/repair-agents-task-sync) |
| migrate-legacy-repo | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/migrate-legacy-repo) |
| audit-workflow-drift | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/audit-workflow-drift) |
| codex-skill-factory-lifecycle | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/codex-skill-factory-lifecycle) |
| initialize-plan-g-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-plan-g-project) |
| route-existing-repo-init | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-existing-repo-init) |
| route-new-project-scaffold | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-new-project-scaffold) |
| route-legacy-migrate | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-legacy-migrate) |
| route-current-upgrade | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-current-upgrade) |
| route-harness-repair | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-harness-repair) |
| route-workflow-check | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-workflow-check) |
| route-repo-harness-plan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-plan) |
| route-repo-harness-review | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-review) |
| route-repo-harness-autoplan | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-autoplan) |

### initialize-new-project

- Eval: `1`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-new-project](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-new-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Chooses a plausible core plan and explains the stack choice.
  - Includes docs/spec.md, tasks/todo.md, tasks/lessons.md, tasks/research.md, tasks/contracts/, tasks/reviews/, and .ai/harness/ in the generated workflow.
  - Treats docs/PROGRESS.md as milestone-only instead of the active execution log.

### repair-agents-task-sync

- Eval: `2`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/repair-agents-task-sync](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/repair-agents-task-sync)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Calls out repo-local task sync as the primary enforcement mechanism.
  - Treats plans/ as the plan catalog and the host-neutral active marker as the active selector instead of relying on docs/plan.md.
  - Updates the final response contract to mention changed tasks files.
  - Avoids treating hooks as the only source of enforcement.

### migrate-legacy-repo

- Eval: `3`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/migrate-legacy-repo](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/migrate-legacy-repo)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Replaces docs/TODO.md with tasks/todo.md as the primary task contract.
  - Installs docs/spec.md, tasks/reviews/, and .ai/harness/ as first-class harness artifacts.
  - Removes docs/plan.md compatibility pointers in favor of plans/ as the active-plan source of truth.
  - Adds repo-local task-sync enforcement such as scripts/check-task-sync.sh.
  - Updates migration guidance and scripts rather than only editing prose.
  - Installs a shared .ai/ hook layer and routes Claude hook settings through it.

### audit-workflow-drift

- Eval: `4`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/audit-workflow-drift](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/audit-workflow-drift)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Checks both Claude-specific hooks and cross-agent repo-local contracts.
  - Flags docs/PROGRESS.md misuse if it is acting as an execution log.
  - Flags duplicated active-plan state outside plans/ as workflow drift.
  - Flags missing docs/spec.md, tasks/reviews/, or .ai/harness/ as incomplete 3.0 migration.
  - Mentions migration or template updates when current files are out of sync with the skill.
  - Calls out when a repo only has .claude hook wiring but lacks the shared .ai/ automation layer.

### codex-skill-factory-lifecycle

- Eval: `5`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/codex-skill-factory-lifecycle](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/codex-skill-factory-lifecycle)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Reads .claude/.skill-factory-state.json to understand current pattern counts.
  - Uses AGENTS.md Skill Factory protocol to group lessons by theme.
  - Runs bash scripts/skill-factory-check.sh to inspect current state.
  - After the third session, both workflow and knowledge proposals reach pending status.
  - Adds evidence-aware proposal context including evidence score or correction count when reporting workflow proposal state.
  - Does not auto-create skills — proposals require explicit human promotion via skill-factory-create.sh.
  - Does not treat ordinary post-edit activity as optimization feedback.
  - Uses bash scripts/skill-factory-check.sh --record-feedback <slug> --signal <label> when explicit feedback is needed.

### initialize-plan-g-project

- Eval: `6`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-plan-g-project](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/initialize-plan-g-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Selects Plan G or explicitly identifies the AI quantitative trading preset.
  - Mentions the factor registry as the source of truth for factor lifecycle state.
  - Includes the factor-lab new/promote/reject/check commands in the generated workflow discussion.
  - Preserves the standard tasks-first workflow alongside factor research scaffolding.

### route-existing-repo-init

- Eval: `7`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-existing-repo-init](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-existing-repo-init)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats init as existing-repo adoption, not product scaffold creation.
  - Names repo-harness-init as the public command.
  - Keeps hook and docs initialization behind the migration engine.

### route-new-project-scaffold

- Eval: `8`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-new-project-scaffold](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-new-project-scaffold)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats scaffold as new project or module creation.
  - Uses plan catalog A-K instead of ad hoc stack guessing.
  - Attaches the repo-local workflow after product scaffold creation.

### route-legacy-migrate

- Eval: `9`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-legacy-migrate](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-legacy-migrate)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Preserves or archives user-authored legacy workflow docs.
  - Does not conflate migration with scaffold.
  - Uses the manifest-owned removal boundary.

### route-current-upgrade

- Eval: `10`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-current-upgrade](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-current-upgrade)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses upgrade for current harness refresh, not migration.
  - Reads manifest-owned upgrade actions.
  - Preserves private and user-local paths.

### route-harness-repair

- Eval: `11`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-harness-repair](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-harness-repair)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses repair only after recognizing a current harness surface.
  - Traces the failing workflow path before fixing.
  - Keeps the fix targeted to task sync, hooks, handoff, context, policy, or helpers.

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-workflow-check](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.

### route-repo-harness-plan

- Eval: `13`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-plan](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-plan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Keeps planning non-mutating by default.
  - Produces one recommended action path.
  - Separates plan output from implementation.

### route-repo-harness-review

- Eval: `14`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-review](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-review)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats review as plan-stage critique.
  - Covers product, engineering, design, and DevEx when relevant.
  - Keeps implementation separate from review.

### route-repo-harness-autoplan

- Eval: `15`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-autoplan](../repo-harness-skill-workspace/iteration-20260525-030242/claude/without_skill/route-repo-harness-autoplan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Runs the full planning and review sequence automatically.
  - Surfaces only material final decision gates.
  - Does not redirect into long interactive review unless automatic planning is unsafe.

## codex / with_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| initialize-new-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-new-project) |
| repair-agents-task-sync | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/repair-agents-task-sync) |
| migrate-legacy-repo | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/migrate-legacy-repo) |
| audit-workflow-drift | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/audit-workflow-drift) |
| codex-skill-factory-lifecycle | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/codex-skill-factory-lifecycle) |
| initialize-plan-g-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-plan-g-project) |
| route-existing-repo-init | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-existing-repo-init) |
| route-new-project-scaffold | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-new-project-scaffold) |
| route-legacy-migrate | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-legacy-migrate) |
| route-current-upgrade | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-current-upgrade) |
| route-harness-repair | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-harness-repair) |
| route-workflow-check | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-workflow-check) |
| route-repo-harness-plan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-plan) |
| route-repo-harness-review | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-review) |
| route-repo-harness-autoplan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-autoplan) |

### initialize-new-project

- Eval: `1`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-new-project](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-new-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Chooses a plausible core plan and explains the stack choice.
  - Includes docs/spec.md, tasks/todo.md, tasks/lessons.md, tasks/research.md, tasks/contracts/, tasks/reviews/, and .ai/harness/ in the generated workflow.
  - Treats docs/PROGRESS.md as milestone-only instead of the active execution log.

### repair-agents-task-sync

- Eval: `2`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/repair-agents-task-sync](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/repair-agents-task-sync)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Calls out repo-local task sync as the primary enforcement mechanism.
  - Treats plans/ as the plan catalog and the host-neutral active marker as the active selector instead of relying on docs/plan.md.
  - Updates the final response contract to mention changed tasks files.
  - Avoids treating hooks as the only source of enforcement.

### migrate-legacy-repo

- Eval: `3`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/migrate-legacy-repo](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/migrate-legacy-repo)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Replaces docs/TODO.md with tasks/todo.md as the primary task contract.
  - Installs docs/spec.md, tasks/reviews/, and .ai/harness/ as first-class harness artifacts.
  - Removes docs/plan.md compatibility pointers in favor of plans/ as the active-plan source of truth.
  - Adds repo-local task-sync enforcement such as scripts/check-task-sync.sh.
  - Updates migration guidance and scripts rather than only editing prose.
  - Installs a shared .ai/ hook layer and routes Claude hook settings through it.

### audit-workflow-drift

- Eval: `4`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/audit-workflow-drift](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/audit-workflow-drift)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Checks both Claude-specific hooks and cross-agent repo-local contracts.
  - Flags docs/PROGRESS.md misuse if it is acting as an execution log.
  - Flags duplicated active-plan state outside plans/ as workflow drift.
  - Flags missing docs/spec.md, tasks/reviews/, or .ai/harness/ as incomplete 3.0 migration.
  - Mentions migration or template updates when current files are out of sync with the skill.
  - Calls out when a repo only has .claude hook wiring but lacks the shared .ai/ automation layer.

### codex-skill-factory-lifecycle

- Eval: `5`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/codex-skill-factory-lifecycle](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/codex-skill-factory-lifecycle)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Reads .claude/.skill-factory-state.json to understand current pattern counts.
  - Uses AGENTS.md Skill Factory protocol to group lessons by theme.
  - Runs bash scripts/skill-factory-check.sh to inspect current state.
  - After the third session, both workflow and knowledge proposals reach pending status.
  - Adds evidence-aware proposal context including evidence score or correction count when reporting workflow proposal state.
  - Does not auto-create skills — proposals require explicit human promotion via skill-factory-create.sh.
  - Does not treat ordinary post-edit activity as optimization feedback.
  - Uses bash scripts/skill-factory-check.sh --record-feedback <slug> --signal <label> when explicit feedback is needed.

### initialize-plan-g-project

- Eval: `6`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-plan-g-project](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/initialize-plan-g-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Selects Plan G or explicitly identifies the AI quantitative trading preset.
  - Mentions the factor registry as the source of truth for factor lifecycle state.
  - Includes the factor-lab new/promote/reject/check commands in the generated workflow discussion.
  - Preserves the standard tasks-first workflow alongside factor research scaffolding.

### route-existing-repo-init

- Eval: `7`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-existing-repo-init](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-existing-repo-init)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats init as existing-repo adoption, not product scaffold creation.
  - Names repo-harness-init as the public command.
  - Keeps hook and docs initialization behind the migration engine.

### route-new-project-scaffold

- Eval: `8`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-new-project-scaffold](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-new-project-scaffold)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats scaffold as new project or module creation.
  - Uses plan catalog A-K instead of ad hoc stack guessing.
  - Attaches the repo-local workflow after product scaffold creation.

### route-legacy-migrate

- Eval: `9`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-legacy-migrate](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-legacy-migrate)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Preserves or archives user-authored legacy workflow docs.
  - Does not conflate migration with scaffold.
  - Uses the manifest-owned removal boundary.

### route-current-upgrade

- Eval: `10`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-current-upgrade](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-current-upgrade)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses upgrade for current harness refresh, not migration.
  - Reads manifest-owned upgrade actions.
  - Preserves private and user-local paths.

### route-harness-repair

- Eval: `11`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-harness-repair](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-harness-repair)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses repair only after recognizing a current harness surface.
  - Traces the failing workflow path before fixing.
  - Keeps the fix targeted to task sync, hooks, handoff, context, policy, or helpers.

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-workflow-check](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.

### route-repo-harness-plan

- Eval: `13`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-plan](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-plan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Keeps planning non-mutating by default.
  - Produces one recommended action path.
  - Separates plan output from implementation.

### route-repo-harness-review

- Eval: `14`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-review](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-review)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats review as plan-stage critique.
  - Covers product, engineering, design, and DevEx when relevant.
  - Keeps implementation separate from review.

### route-repo-harness-autoplan

- Eval: `15`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-autoplan](../repo-harness-skill-workspace/iteration-20260525-030242/codex/with_skill/route-repo-harness-autoplan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Runs the full planning and review sequence automatically.
  - Surfaces only material final decision gates.
  - Does not redirect into long interactive review unless automatic planning is unsafe.

## codex / without_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| initialize-new-project | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-new-project) |
| repair-agents-task-sync | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/repair-agents-task-sync) |
| migrate-legacy-repo | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/migrate-legacy-repo) |
| audit-workflow-drift | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/audit-workflow-drift) |
| codex-skill-factory-lifecycle | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/codex-skill-factory-lifecycle) |
| initialize-plan-g-project | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-plan-g-project) |
| route-existing-repo-init | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-existing-repo-init) |
| route-new-project-scaffold | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-new-project-scaffold) |
| route-legacy-migrate | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-legacy-migrate) |
| route-current-upgrade | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-current-upgrade) |
| route-harness-repair | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-harness-repair) |
| route-workflow-check | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-workflow-check) |
| route-repo-harness-plan | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-plan) |
| route-repo-harness-review | dry_run | 0 / graders skipped | 0ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-review) |
| route-repo-harness-autoplan | dry_run | 0 / graders skipped | 1ms | 0 | [workspace](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-autoplan) |

### initialize-new-project

- Eval: `1`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-new-project](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-new-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Chooses a plausible core plan and explains the stack choice.
  - Includes docs/spec.md, tasks/todo.md, tasks/lessons.md, tasks/research.md, tasks/contracts/, tasks/reviews/, and .ai/harness/ in the generated workflow.
  - Treats docs/PROGRESS.md as milestone-only instead of the active execution log.

### repair-agents-task-sync

- Eval: `2`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/repair-agents-task-sync](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/repair-agents-task-sync)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Calls out repo-local task sync as the primary enforcement mechanism.
  - Treats plans/ as the plan catalog and the host-neutral active marker as the active selector instead of relying on docs/plan.md.
  - Updates the final response contract to mention changed tasks files.
  - Avoids treating hooks as the only source of enforcement.

### migrate-legacy-repo

- Eval: `3`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/migrate-legacy-repo](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/migrate-legacy-repo)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Replaces docs/TODO.md with tasks/todo.md as the primary task contract.
  - Installs docs/spec.md, tasks/reviews/, and .ai/harness/ as first-class harness artifacts.
  - Removes docs/plan.md compatibility pointers in favor of plans/ as the active-plan source of truth.
  - Adds repo-local task-sync enforcement such as scripts/check-task-sync.sh.
  - Updates migration guidance and scripts rather than only editing prose.
  - Installs a shared .ai/ hook layer and routes Claude hook settings through it.

### audit-workflow-drift

- Eval: `4`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/audit-workflow-drift](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/audit-workflow-drift)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Checks both Claude-specific hooks and cross-agent repo-local contracts.
  - Flags docs/PROGRESS.md misuse if it is acting as an execution log.
  - Flags duplicated active-plan state outside plans/ as workflow drift.
  - Flags missing docs/spec.md, tasks/reviews/, or .ai/harness/ as incomplete 3.0 migration.
  - Mentions migration or template updates when current files are out of sync with the skill.
  - Calls out when a repo only has .claude hook wiring but lacks the shared .ai/ automation layer.

### codex-skill-factory-lifecycle

- Eval: `5`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/codex-skill-factory-lifecycle](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/codex-skill-factory-lifecycle)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Reads .claude/.skill-factory-state.json to understand current pattern counts.
  - Uses AGENTS.md Skill Factory protocol to group lessons by theme.
  - Runs bash scripts/skill-factory-check.sh to inspect current state.
  - After the third session, both workflow and knowledge proposals reach pending status.
  - Adds evidence-aware proposal context including evidence score or correction count when reporting workflow proposal state.
  - Does not auto-create skills — proposals require explicit human promotion via skill-factory-create.sh.
  - Does not treat ordinary post-edit activity as optimization feedback.
  - Uses bash scripts/skill-factory-check.sh --record-feedback <slug> --signal <label> when explicit feedback is needed.

### initialize-plan-g-project

- Eval: `6`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-plan-g-project](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/initialize-plan-g-project)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Selects Plan G or explicitly identifies the AI quantitative trading preset.
  - Mentions the factor registry as the source of truth for factor lifecycle state.
  - Includes the factor-lab new/promote/reject/check commands in the generated workflow discussion.
  - Preserves the standard tasks-first workflow alongside factor research scaffolding.

### route-existing-repo-init

- Eval: `7`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-existing-repo-init](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-existing-repo-init)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats init as existing-repo adoption, not product scaffold creation.
  - Names repo-harness-init as the public command.
  - Keeps hook and docs initialization behind the migration engine.

### route-new-project-scaffold

- Eval: `8`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-new-project-scaffold](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-new-project-scaffold)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats scaffold as new project or module creation.
  - Uses plan catalog A-K instead of ad hoc stack guessing.
  - Attaches the repo-local workflow after product scaffold creation.

### route-legacy-migrate

- Eval: `9`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-legacy-migrate](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-legacy-migrate)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Preserves or archives user-authored legacy workflow docs.
  - Does not conflate migration with scaffold.
  - Uses the manifest-owned removal boundary.

### route-current-upgrade

- Eval: `10`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-current-upgrade](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-current-upgrade)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses upgrade for current harness refresh, not migration.
  - Reads manifest-owned upgrade actions.
  - Preserves private and user-local paths.

### route-harness-repair

- Eval: `11`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-harness-repair](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-harness-repair)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses repair only after recognizing a current harness surface.
  - Traces the failing workflow path before fixing.
  - Keeps the fix targeted to task sync, hooks, handoff, context, policy, or helpers.

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-workflow-check](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.

### route-repo-harness-plan

- Eval: `13`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-plan](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-plan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Keeps planning non-mutating by default.
  - Produces one recommended action path.
  - Separates plan output from implementation.

### route-repo-harness-review

- Eval: `14`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-review](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-review)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Treats review as plan-stage critique.
  - Covers product, engineering, design, and DevEx when relevant.
  - Keeps implementation separate from review.

### route-repo-harness-autoplan

- Eval: `15`
- Workspace: [../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-autoplan](../repo-harness-skill-workspace/iteration-20260525-030242/codex/without_skill/route-repo-harness-autoplan)
- Changed files: none
- Diff summary: no diff captured
- Agent status: dry_run (exit 0)
- Graders: skipped (0/0 passed)
- Final response excerpt: dry-run: no final response captured
- Expectations:
  - Runs the full planning and review sequence automatically.
  - Surfaces only material final decision gates.
  - Does not redirect into long interactive review unless automatic planning is unsafe.

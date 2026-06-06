# Skill Benchmark Report

Latest iteration: `iteration-20260606-050243-release-0-2-4`

Workspace root: `/Users/kito/Projects/repo-harness-workspace`

Generated: 2026-06-05T21:05:39.352Z

## Quality Metrics

| Metric | Value |
| --- | ---: |
| full_test_count | 1 |
| dry_run_count | 0 |
| dry_run_ratio | 0.0% |
| grader_pass_rate | 100.0% (4/4) |
| effectiveness_authority | authoritative |

Effectiveness evidence is authoritative for this benchmark run.

## Command Matrix

| Agent | Profile | Command |
| --- | --- | --- |
| codex | with_skill | `codex exec -C /Users/kito/Projects/repo-harness-workspace/iteration-20260606-050243-release-0-2-4/codex/with_skill/route-workflow-check --dangerously-bypass-approvals-and-sandbox -o /Users/kito/Projects/repo-harness-workspace/iteration-20260606-050243-release-0-2-4/codex/with_skill/route-workflow-check/final-response.md --add-dir /Users/kito/Projects/agentic-dev 'Check whether this repo-harness harness is ready to merge. Run the workflow gates, inspector, task sync, and migration dry-run and give me the release readiness verdict.'` |

## codex / with_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| route-workflow-check | success | 0 / graders pass | 175491ms | 0 | [workspace](../repo-harness-workspace/iteration-20260606-050243-release-0-2-4/codex/with_skill/route-workflow-check) |

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-workspace/iteration-20260606-050243-release-0-2-4/codex/with_skill/route-workflow-check](../repo-harness-workspace/iteration-20260606-050243-release-0-2-4/codex/with_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: success (exit 0)
- Graders: passed (4/4 passed)
- Final response excerpt: **Verdict: 不可合并** Route: `repo-harness-check`。我跑了要求的 workflow gates、inspector、`check-task-sync`、migration dry-run；没有修改 repo，`git status --short` 仍是干净的。 **P1: Map** 当前 repo 是一个薄 fixture，本体缺少 repo-local harness runtime：没有…
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.
- Grader results:
  - PASS files_exist: files_exist: final-response.md
  - PASS files_contain: files_contain: final-response.md =~ repo-harness-check
  - PASS files_contain: files_contain: final-response.md =~ check-task-sync
  - PASS files_contain: files_contain: final-response.md =~ migrate-project-template.*dry-run

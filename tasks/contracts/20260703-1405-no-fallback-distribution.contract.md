# Task Contract: no-fallback-distribution

> **Status**: Fulfilled
> **Plan**: plans/plan-20260703-1405-no-fallback-distribution.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-03 14:05
> **Review File**: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`
> **Notes File**: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`

## Goal

Systematize the No-Fallback rule (no compatibility fallbacks that re-derive an LLM/provider/authority-owned value with local rules/regexes) into repo-harness's CLAUDE.md/AGENTS.md initialization and distribution chain: single authoritative source in `assets/reference-configs/global-working-rules.md` (mirrored byte-for-byte into `docs/reference-configs/`), three distribution channels (existing-repo hook context, new-repo root template heredoc, global managed-block sync), a hardened managed-block merge with marker-pairing gate and legacy visibility, and an advisory drift signal for divergent root CLAUDE.md/AGENTS.md.

## Scope

- In scope: `assets/reference-configs/global-working-rules.md` + `docs/reference-configs/global-working-rules.md` (new section + dedup, byte-identical mirror); `src/cli/hook/minimal-change-context.ts` SESSION_CONTEXT bullet; `scripts/lib/project-init-lib.sh` `pi_root_context_content()` heredoc bullet (append-only within the heredoc region); `src/cli/commands/init.ts` (`renderGlobalRules` self-note, `mergeManagedBlock` marker-pairing gate + status enum, `writeGlobalContextFiles` status consumption); `scripts/inspect-project-state.ts` `root-agent-context-divergent` advisory drift signal; orphan template cleanup (`assets/templates/CLAUDE.md`, `assets/templates/AGENTS.md`); new test `tests/global-working-rules-distribution.test.ts`; targeted additions to `tests/minimal-change-context.test.ts`, `tests/cli/init.test.ts`, `tests/scaffold-parity.test.ts`, `tests/create-project-dirs.runtime.test.ts`; one authorized global refresh of `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` managed blocks.
- Out of scope: partials system changes; capability-paired drift detection; automatic legacy-no-marker file conversion; `policy.json` protected_concerns expansion; `init.ts:234` language-substitution regex no-op (recorded, not fixed); Waza `~/.claude/rules/anti-patterns.md` sync; unrelated pre-existing repo WIP (sprint-backlog helper migration files).

## Workflow Inventory

- Source plan: `plans/plan-20260703-1405-no-fallback-distribution.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260703-1405-no-fallback-distribution.review.md`
- Notes file: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260703-1405-no-fallback-distribution.contract.md
  - tasks/reviews/20260703-1405-no-fallback-distribution.review.md
  - tasks/notes/20260703-1405-no-fallback-distribution.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - assets/reference-configs/
  - assets/templates/CLAUDE.md
  - assets/templates/AGENTS.md
  - docs/reference-configs/
  - scripts/lib/project-init-lib.sh
  - scripts/inspect-project-state.ts
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260703-1405-no-fallback-distribution.notes.md
  tests_pass:
    - path: tests/global-working-rules-distribution.test.ts
  commands_succeed:
    - bun test
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

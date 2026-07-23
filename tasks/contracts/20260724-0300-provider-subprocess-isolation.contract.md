# Task Contract: provider-subprocess-isolation

> **Status**: Active
> **Plan**: plans/plan-20260724-0300-provider-subprocess-isolation.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-24 03:00
> **Review File**: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`
> **Notes File**: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The routing evaluator currently measures the operator's ambient Claude skill
registry instead of the case-local projected surface. That makes a costly
real-provider matrix invalid evidence. A second deferred isolation defect has
already been fixed but remains on the active Todo ledger, overstating open work.

## Goal

Make the Claude routing provider load project setting sources only, prove the
flag and route-extraction path with a deterministic fake provider, and retire
both resolved subprocess-isolation Todo rows without rerunning the 136-call
provider matrix.

## Scope

- In scope: `buildClaudeRoutingCommand` setting-source isolation; one focused
  regression guard in `tests/skill-routing-eval.test.ts`; removal of the
  routing-injection and verify-context-heisenbug Todo rows; durable notes and
  acceptance artifacts.
- Out of scope: changing Codex provider behavior; rerunning or regrading the
  frozen 136-invocation Phase B attempt; changing routing thresholds, corpus,
  aggregate selection, helper-source guards, installer semantics, or auth.
- Taste constraints: one official Claude CLI flag, no env-token handling,
  retries, fallback registry, compatibility path, or new abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if `claude -p --setting-sources project` still exposes
an ambient user skill or cannot invoke the case-local project skill while
default OAuth remains authenticated. The completed one-case probe falsified
both risks: ambient custom skills disappeared, `Skill(repo-harness-plan)` ran,
and the provider returned success for USD 0.03992.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/run-skill-routing-eval.ts` `buildClaudeRoutingCommand` omits `--setting-sources project`, so Claude's default user setting source contributes ambient user skills instead of making the case-local `.claude/skills` projection authoritative; the verify-context symptom was the already-fixed `REPO_HARNESS_HELPER_SOURCE_PATH` cross-helper leak from commit `8763ad5d` and its Todo is stale.
- repro: compare the Phase B `system.init.skills` evidence with a one-case `claude -p --setting-sources project` probe, then replay helper-scripts -> install-agent-fleet through `run-bounded-verifier-command.ts`; artifacts are under `.ai/harness/runs/20260724-0300-provider-subprocess-isolation/`.
- regression_guard: tests/skill-routing-eval.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260724-0300-provider-subprocess-isolation/pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260724-0300-provider-subprocess-isolation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`
- Notes file: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260724-0300-provider-subprocess-isolation.md
  - tasks/todos.md
  - tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md
  - tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md
  - tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md
  - scripts/run-skill-routing-eval.ts
  - tests/skill-routing-eval.test.ts
  - .ai/harness/runs/20260724-0300-provider-subprocess-isolation/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/run-skill-routing-eval.ts
    - tests/skill-routing-eval.test.ts
  artifacts_exist:
    - tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md
    - .ai/harness/runs/20260724-0300-provider-subprocess-isolation/pre-fix.log
  tests_pass:
    - path: tests/skill-routing-eval.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - git diff --check
```

## Acceptance Notes (Human Review)

- Functional behavior: Claude provider invocations include
  `--setting-sources project` before the prompt and still extract the invoked
  route from stream JSON.
- Edge cases: the Codex provider and built-in Claude skills are unchanged;
  provider errors remain fail-closed with no retry.
- Regression risks: future Claude CLI flag changes will fail the deterministic
  provider test and the real CLI probe rather than silently restoring ambient
  authority.

## Rollback Point

- Commit / checkpoint: branch `codex/provider-subprocess-isolation` from
  `ebd84982`.
- Revert strategy: revert the bounded package; no data or auth migration.

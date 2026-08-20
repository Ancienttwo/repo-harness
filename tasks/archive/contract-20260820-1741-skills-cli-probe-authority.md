> **Archived**: 2026-08-20 17:41
> **Related Plan**: plans/archive/plan-20260820-1717-skills-cli-probe-authority.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1741

# Task Contract: skills-cli-probe-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1717-skills-cli-probe-authority.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 17:18
> **Review File**: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`
> **Notes File**: `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`scripts/check-agent-tooling.sh` probed the Skills CLI through `bunx skills ls -g --json` under a 1500ms budget, while the real command needs tens of seconds. Every non-stubbed environment therefore reported `runtime_capabilities.skills_cli.status = timed-out` for a perfectly working installation, and the stubbed test asserted `available` — the diagnostic surface disagreed with reality in both directions. Downstream, `src/cli/commands/init-hook.ts` turns that status into a setup-check warning, so the false `timed-out` is what an agent or user reads when deciding whether the external skill bootstrap is healthy.

## Goal

Skills CLI reporting becomes opt-in, following the `--check-updates` / `stale_status: "not-checked"` precedent already in the same file. `detectWaza()` always resolves the `skills` binary from PATH with the same helper the other command capabilities use (`resolvePathCommand`) — that is cheap — and reports `missing` when it is absent. The `ls -g --json` call runs only under the new `--probe-skills-cli` flag, under a 45000ms budget, yielding `available` / `timed-out` / `unavailable`; the default run spawns nothing and reports `not-probed`. `runtime_capabilities.skills_cli` carries the resolved `path` and a `command` string naming the real probe. There is no bunx fallback: an unresolved binary stays `missing` rather than being re-probed through a second authority. `skillItems` stays empty whenever the probe did not run, matching today's real behaviour (the probe never once succeeded under the old budget), so nothing is compensated for.

Revision note (approved 2026-08-20): the plan's premise — that the ~38s cost came from `bunx` package resolution and a 15000ms budget on the resolved binary would fix it — was falsified during execution. The resolved binary itself measures 36.8s on this machine. The budget route would weld a pathological per-run cost into every default invocation and would still break on machines with more skills, so the opt-in route replaced it.

## Scope

- In scope: the `skills_cli` probe in `scripts/check-agent-tooling.sh` plus the `--probe-skills-cli` flag and usage line, the reported fields (`waza.skills_cli_status`, `waza.skills_cli_path`, `runtime_capabilities.skills_cli`), the `not-probed` classification in `src/cli/commands/init-hook.ts` `runtimeCapabilityStatus()`, the test fixtures that stub the probe on a stubbed PATH, and deletion of the closed `tasks/todos.md` ledger row.
- Out of scope: any bunx fallback path; other capability probes; the `bunx skills add` bootstrap in `src/cli/commands/global-runtime.ts`; Waza skill inspection logic beyond the probe source; wiring `--probe-skills-cli` into any caller or gate; `CLAUDE.md` / `AGENTS.md`.
- Taste constraints: fail-closed honest reporting over a second probe authority; `not-probed` must never escalate to a failure state; stay idiomatic with the file's existing helpers and its existing opt-in precedent rather than adding new capability fields. <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-1717-skills-cli-probe-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`
- Notes file: `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md
  - tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md
  - tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/check-agent-tooling.sh
  # Deterministic projection of the helper above, written by `bun run sync:helpers`
  # and gated by `bun scripts/sync-helper-sources.ts --check`.
  - assets/templates/helpers/check-agent-tooling.sh
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md
  tests_pass:
    - path: tests/check-agent-tooling.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

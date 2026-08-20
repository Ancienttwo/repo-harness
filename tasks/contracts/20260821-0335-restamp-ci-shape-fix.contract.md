# Task Contract: restamp-ci-shape-fix

> **Status**: Fulfilled
> **Plan**: plans/plan-20260821-0335-restamp-ci-shape-fix.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-21 03:50
> **Review File**: `tasks/reviews/20260821-0335-restamp-ci-shape-fix.review.md`
> **Notes File**: `tasks/notes/20260821-0335-restamp-ci-shape-fix.notes.md`

## Goal

`tests/architecture-projection-restamp-cli.test.ts` drain-shape lock passes on clean runners: the fixture no longer leaves the manifest tracked-dirty, so the disabled-provider legacy cascade (which requires repo-harness on PATH) is never entered. Main CI green.

## Root Cause Evidence

- root_cause: fixture wrote empty policy (provider disabled) + dirty manifest; `src/cli/commands/architecture-projection.ts:45-50` routes disabled drains through the legacy cascade per changed path; `src/cli/hook/mutation-observed.ts:855-858` fails when repo-harness is not resolvable via PATH/REPO_HARNESS_CLI.
- repro: strip `~/.bun/bin` from PATH, run the test file → 2 pass / 1 fail with "legacy architecture cascade runner is unavailable".
- regression_guard: tests/architecture-projection-restamp-cli.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/prefix-20260821-0335-restamp-ci-shape-fix.log

## Exit Criteria (verified 2026-08-21)

- Plain and PATH-scrubbed runs: 3 pass / 0 fail each.
- `bun run check:type` exit 0.
- Main CI run 32409656130 on 01920840: success.

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/architecture-projection-restamp-cli.test.ts
  tests_pass:
    - path: tests/architecture-projection-restamp-cli.test.ts
  commands_succeed:
    - bun run check:type
```

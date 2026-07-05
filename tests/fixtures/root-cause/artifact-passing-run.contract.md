# Task Contract: root-cause-fixture-artifact-passing-run

> **Status**: Active
> **Task Profile**: bugfix
> **Owner**: fixture

## Why

Shared root-cause gate fixture (see tests/fixtures/root-cause/expected-results.ts): proves
a pre_fix_failure_artifact that is actually a captured PASSING run (containing the
literal substring "0 fail" and `PRE_FIX_EXIT=0`) is rejected, so a naive "fail" substring
match cannot be gamed by a passing run whose own summary text happens to contain "fail".

## Goal

Exercise the root-cause gate's PRE_FIX_EXIT=0 rejection path.

## Scope

- In scope: tests/fixtures/root-cause/ fixture content only.
- Out of scope: everything else in the repository.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `tests/fixtures/root-cause/regression-guard.test.ts:11` isNonEmptyLabel unconditionally returned true, so an empty label was treated as non-empty.
- repro: `bun test tests/fixtures/root-cause/regression-guard.test.ts` failed on the unfixed code with `expect(isNonEmptyLabel("")).toBe(false)` receiving `true`.
- regression_guard: tests/fixtures/root-cause/regression-guard.test.ts
- pre_fix_failure_artifact: tests/fixtures/root-cause/pre-fix-failure-passing-run.log

## Allowed Paths

```yaml
allowed_paths:
  - tests/fixtures/root-cause/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  tests_pass:
    - path: tests/fixtures/root-cause/regression-guard.test.ts
```

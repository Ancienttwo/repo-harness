# Test-name risk-floor repair

> **Status**: Complete
> **Substantive Change SHA256**: `sha256:1c2e19f47a21ceca6238e3d8b592ebeb289afda018e08b5c59376f9cb18dc7b0`

## Scope

Owned paths: src/core/workflow/profile.ts, tests/harness-runtime-profiles.test.ts,
tests/runtime-profile-enforcement.test.ts and docs/researches/2026-09-05-test-name-risk-floor.md.
Isolated branch: codex/test-name-risk-floor, base 78bb1716.
No changes to the pre-existing dirty verification-scope work in main.

## Root Cause Evidence

- root_cause: strictCategoriesFor treats a test scenario basename as a strict ownership signal.
- repro: bun test tests/harness-runtime-profiles.test.ts tests/runtime-profile-enforcement.test.ts --test-name-pattern 'test basename|test names do not|test-name risk'
- regression_guard: 12 cases cover JS/TS suffixes, Windows separators, additive scan, medium scope, production/directory/capability/operation floors and real CLI/PreEdit admission.
- pre_fix_failure_artifact: the command above failed 12 cases before profile.ts changed; expected lite/standard but received strict:auth (or the corresponding strict category). After the fix: 12 passed, 35 assertions.

## Decision

Exclude only recognized test basenames from path-token classification. Preserve
all independent strict signals and path counts. This is bounded policy repair;
no content inference, compatibility fallback, policy disabling or Stop change.
Durable reading entrypoint: docs/researches/2026-09-05-test-name-risk-floor.md.

## Verification

- `bun test tests/harness-runtime-profiles.test.ts tests/runtime-profile-enforcement.test.ts tests/change-assessment.test.ts`: 107 pass, 0 fail, 295 assertions (10.25 seconds).
- `bun run check:type`: pass in the isolated worktree.
- Root integrity: deploy SQL order, architecture sync (blocking 0, provider ready), strict task workflow, project-state inspection and init dry-run passed.
- Task-sync initially requested the exact substantive digest; bound above for final validation. No waiver or guard setting changed.
- Quick diff review: 12 source lines plus focused tests; both production callers share the policy. Directory, production-file, capability, operation, explicit-override and unknown-input protection retained. No second classifier found.
- Coverage is sufficient for this pure policy boundary and its state/hook consumers; no full suite or provider evaluation required. Existing user dirty changes are not used as verification evidence.
- Runtime activation is separate: this source commit does not replace the globally installed package or alter downstream project policy.

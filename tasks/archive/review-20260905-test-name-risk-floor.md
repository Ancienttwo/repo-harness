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
- Global runtime activation completed with explicit user approval. Candidate was built from the previously installed 0.18.0 package plus `eb287895:src/core/workflow/profile.ts`; npm tarball comparison and post-install file hashes both show exactly two changed files: that classifier and `dist/hook-entry.js`. Previous verification-scope repairs remain byte-identical.
- Installed hook SHA256: `7e3eb08aaa5789410703b7f8220c7abd18b4336bed8d94ec70878091d416c563`.
- Candidate and installed CLI/hook smokes: original test path alone -> lite / hook exit 0; four-file scope -> standard / hook exit 2 without required plan; auth-directory test -> strict / hook exit 2 without required contract. No guard settings changed.
- Actual `aip-main-open` installed CLI readback for the original target path with its branch diff: standard. `repo-harness doctor --json`: 12 ok, 0 warn, 0 fail, 1 not applicable; both host adapters ready.
- Existing duplicate repo-harness keys in Bun global package/lock manifests emitted package-manager warnings; installation succeeded. That pre-existing configuration issue was not repaired in this slice.
- Package version remains 0.18.0; no registry publish, git push or downstream policy change. A baseline rollback tarball was retained in the activation scratch directory.

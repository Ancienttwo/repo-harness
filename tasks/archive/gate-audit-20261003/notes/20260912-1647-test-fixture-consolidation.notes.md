# Implementation Notes: test-fixture-consolidation

> **Status**: Review
> **Plan**: plans/plan-20260912-1647-test-fixture-consolidation.md
> **Substantive Change SHA256**: `sha256:35333a233bd2f4735f687c9c79169c5687856031ce04077d4cdf5c8fe7baf812`

## Decisions and boundaries

- `tests/helpers/repo-fixture.ts` owns canonical temporary workspace paths, raw process status/output, five authority-variable exclusions, private HOME per cwd unless explicitly supplied, Git setup/commit and synchronous callback cleanup. Test deadlines remain at their existing boundary; no retries or seed caching.
- Workflow-specific builders stay in `tests/helpers/helper-script-fixture.ts`. Packaged helper copying and source/runtime linking are preserved. Fewer definitions do not mean fewer fixture builds or subprocesses.
- Ten equivalent synchronous `withTempRepo` definitions now use one owner. Six generic `run` definitions, including the removed monolith, now use the common process fixture. Remaining wrappers select different commands, environment, cwd defaults or return contracts; their semantics are not interchangeable.
- Six existing owners receive monolith cases: architecture-queue, archive-evidence-gates, capability-resolver, check-task-sync, merge-gate, and unit/helper-projection-drift. Other script boundaries get their own files. Cross-script cleanup/journal compositions and stale-base regression keep independent fixtures.
- Journal synchronous/async wrappers retain realpath normalization. An attempted extraction into the raw-path evidence fixture exposed two macOS path-identity failures; that extraction was withdrawn and both original cases passed. No product fix or baseline defect is claimed.
- The ambient-root child now invokes `tests/new-plan.test.ts` and asserts `1 pass`, so a missing child test cannot count as success.
- Merge-gate child processes moved from inheriting `process.env` to the shared `sandboxEnv` plus a private temporary HOME per working directory. The change is the whole authority-variable exclusion set, not HOME alone; an explicit HOME override stays authoritative.
- `tests/verify-sprint-rebase-base-guard.test.ts` keeps its own fixture. Its `runHelper` deletes a different exclusion set (`REPO_HARNESS_NODE_BIN`, `REPO_HARNESS_DIFF_BASE`, `HARNESS_DIFF_BASE`, `GITHUB_BASE_REF`) and pins `REPO_HARNESS_TARGET_REPO_ROOT` to the fixture, and its `git` wrapper throws on non-zero status instead of returning raw status. Revisit when the shared fixture models a caller-supplied exclusion set and a throwing Git variant.
- `tests/contract-worktree-single-publication.test.ts` keeps its own fixture. Its `run` injects `REPO_HARNESS_BUN_BIN` and `REPO_HARNESS_WORKFLOW_STATE_LIB` per call and excludes `REPO_HARNESS_GIT_BIN`, which the shared `sandboxEnv` blocklist does not model. Revisit when a second consumer needs the same injection contract.
- `tests/contract-worktree-closeout-journal.test.ts` keeps its own `withTempRepo`/`withTempRepoAsync`. Extraction into the raw-path evidence fixture failed on macOS `/var` versus `/private/var` path identity and was withdrawn. Now that `withTempRepo` builds through `tmpWorkspace` and is realpath-normalized, that extraction can be re-examined; the async variant still has no shared owner.

## Coverage and measured limits

- Pinned base: `f3ec4525`. The original helper suite passed 155 cases / 1960 assertions in 134.12 seconds on this host. Dynamic matrices remain intact.
- Final affected inventory preserves 395 test expressions: 394 unchanged modulo import aliases; one child-invocation update plus a non-empty execution assertion. No missing or additional cases. Original top-level case/loop relocation map is under `.ai/harness/runs/test-fixture-consolidation/`.
- All 39 affected test files passed independently: 421 cases, 4035 assertions. The final per-file table and logs are in `final-file-evidence.json` under that run directory. Formatting/import-only changes reuse their behavior-identical runs; changed environment consumers and the merged archive owner were reverified.
- Longest relocated file: verify-sprint, 57.03 seconds; verify-contract, 22.73 seconds; check-task-workflow, 16.01 seconds. These are local observations, not hosted CI timings. Existing merged-owner cases add work to the focused total, so that total is not a like-for-like speedup denominator.
- No serial full-suite speedup or effective parallel scheduling is claimed. C2 immutable seeds and B sharding remain outside this slice. Hosted full-suite CI and its before/after per-file comparison remain pending.
- This branch remains based on its pinned commit. Main and its local WIP were not rewritten. New files represent script ownership boundaries and the shared process/workflow fixtures. No repository dependency was added; temporary TypeScript tooling outside the repository verified import and case relocation.

## Evidence and delivery boundary

- `.ai/harness/runs/test-fixture-consolidation/coverage-preservation.json`
- `.ai/harness/runs/test-fixture-consolidation/final-file-evidence.json`
- `.ai/harness/runs/test-fixture-consolidation/integrity-results.json`
- `.ai/harness/runs/test-fixture-consolidation/typecheck-final.log`
- Local checks are not an AcceptanceReceipt or hosted CI acceptance. The worktree is ready for that separate delivery boundary; this task does not claim a commit, push, PR, merge or hosted speedup.

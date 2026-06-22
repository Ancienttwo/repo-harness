# Implementation Notes: pr17-review-freshness-failclosed

> **Status**: Active
> **Plan**: plans/plan-20260622-1651-pr17-review-freshness-failclosed.md
> **Contract**: tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md
> **Review**: tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md
> **Last Updated**: 2026-06-22 16:51
> **Lifecycle**: notes

## Design Decisions

- One principle ties P1-1 and P1-4: a modern rubric (v1+) binds strictly; only an artifact with **no** rubric-version line keeps the legacy warn-only path. Missingness alone is never read as legacy. Both gates read the *top-of-file* rubric version (`workflow_review_rubric_version`) as the driver, not the section's own version, so a peer that omits its fingerprint under a v1 review still fails.
- P1-2 root cause is in the shell, not the TS default. `workflow_current_review_fingerprint_json` now passes `--base "$(workflow_target_branch)"`; the TS `buildImplementationDiffFingerprint` keeps its `HEAD` default for direct/diagnostic API use and tests, and already fails closed (`status: unknown`) when the resolved base ref does not exist. Fixing the runtime call site rather than removing the default avoided gratuitously breaking the single-branch direct-API tests.
- P1-3 degraded propagation: `gitRun` returns `{ok,text}` so a command failure is distinguishable from a legitimately empty result. A `FingerprintCtx.degraded` flag accumulates across status/diff/untracked reads; any failure → `status: unknown`. A successful empty patch hashes to `hashText('')`, a failure to `hashUnknown(label)` + degraded — never the same.
- P1-3 untracked content: replaced the `>1 MiB → metadata only` skip with full sha256 over content up to a 64 MiB ceiling; above the ceiling or on read failure the fingerprint is degraded (fail-closed), not silently skipped. Chose `readFileSync` + ceiling over `git hash-object`/streaming to keep the sha256 chain consistent and the CLI fully synchronous.
- P1-3 path parsing: `git status --porcelain=v1 -z` and `git diff --name-status -z`, parsed by NUL via `splitNul(Buffer)`, so non-ASCII / quoted / whitespace pathnames survive verbatim and their content is actually observed. Rename/copy source tokens are consumed so they are not mis-read as the next entry.
- P2 is coupled to P1-2: once the branch diff is `target...HEAD` over implementation paths, `branch_diff_hash` carries the committed implementation content, so raw `head_rev` was dropped from the hashed fingerprint payload (still returned as an informational field). An operational-only commit (review/check artifacts, all excluded) no longer churns the fingerprint.

## Re-review Of f7b45ca (2 Residual P1s)

A re-review of the fixed head `f7b45ca` confirmed the original 4 P1s are closed but found 2 residual fail-open paths the first pass missed. Both verified against real code/CLI before fixing.

- **P1-A — malformed/unsupported rubric downgraded to legacy.** `workflow_review_freshness_status` and `workflow_external_acceptance_status` gated their strict behaviour on `[[ "$rubric" =~ ^[0-9]+$ ]] && (( rubric >= 1 ))`. A present-but-unsupported value (`invalid`, `0`, future versions, or quote/space garbage) fell through to the lenient legacy path, which also disabled the external-acceptance fingerprint binding — re-opening the F1/F2 stale-acceptance attack. Worse, both call sites trimmed the value with `xargs`, which *fails and emits nothing* on an unbalanced quote, silently collapsing a malformed rubric to "absent" (legacy). Fix: a single `workflow_review_rubric_class` classifier (`absent` | `1` | `malformed`) with parameter-expansion trimming (no xargs). `malformed` fails closed in both freshness (new `malformed_schema` state) and external acceptance. `absent` is rejected by **external acceptance** — the binding authority every Done/finish/verify gate enforces (`workflow_external_acceptance_status`) — while freshness keeps `absent` on the advisory `legacy_missing` warn path; external backstops it, so a rubric-less review is still blocked at every gate (see decision below). Manual Override (honoured before the rubric check in external acceptance) is the escape hatch for a genuine pre-rubric artifact; an upgrade repo re-runs /check to record a supported rubric. `workflow_review_metadata_field` now stops at the first `## ` heading so a section-level `> **field**:` line can never be read as top-of-file metadata. Done gate `*)` blocks `malformed_schema`; `stop-orchestrator.sh` nudge adds `malformed_schema` (non-blocking).
- **P1-B — fingerprint `status: ok` collisions for special git paths.** `src/cli/hook/diff-fingerprint.ts` ran every git call without `--literal-pathspecs`, so a discovered filename that looks like pathspec magic (leading `:`, e.g. `:(icase)x`) was re-interpreted as a pattern and its content dropped from the hash. `untrackedContentHash` used `statSync`/`existsSync`, which follow symlinks (missing a retarget to a same-content file, skipping dangling links) and ignore the executable bit (a chmod becomes the committed 100755/100644 mode). `splitNul` decoded pathnames lossily, so two distinct non-utf-8 names could collide. Fix: `--literal-pathspecs` on both git wrappers; `lstatSync` with explicit symlink-target / executable-bit / file-type modelling and fail-closed (`degraded`) on special nodes; `splitNul` marks `degraded` on a non-round-trippable utf-8 token. All four cases verified at the CLI (pathspec/symlink/exec confirmed flipping fingerprints; non-utf-8 unit-tested via `splitNul` since macOS/APFS rejects such filenames).

Tradeoffs: kept the per-path `git status` re-run in `untrackedContentHash` (now correct under `--literal-pathspecs`) rather than threading the pre-parsed untracked set through `buildDiffFingerprint`'s public signature — smaller blast radius. Restricted the supported rubric set to exactly `1` (the only version that exists); a future `2` now fails closed (forces a tooling upgrade or Manual Override) rather than being silently treated as v1. Did not add duplicate-field rejection: with first-match-in-header + malformed-is-fail-closed, a duplicate/conflicting rubric cannot produce a more-lenient outcome.

Decision (absent-rubric leniency) — owner-approved 2026-06-22: f7b45ca deliberately kept an `absent` rubric on the warn-only legacy path. The re-review showed that is the same fail-open class as a malformed rubric (strip the rubric line → external binding skipped). The owner chose to close it. Implemented at the **external-acceptance gate**: a rubric-less review can no longer pass external acceptance, and external is enforced by every gate that matters — prompt-guard Done, `contract-worktree.sh finish`, `ship-worktrees.sh`, and `verify-sprint.sh` all call `workflow_external_acceptance_status`/`_pass`; none call freshness. Freshness keeps `absent` as an advisory `legacy_missing` warn (in the Done gate, external runs right after and blocks it), which avoids redundant churn and keeps the model "external acceptance is the rubric authority." Escape for a genuine pre-rubric artifact: Manual Override (honoured before the rubric check) or re-run /check. Cost: a repo upgrading from <0.8.0 with stale rubric-less `tasks/reviews/*.review.md` files needs a one-time /check or Manual Override. Test consequence: `workflow-state-lib` external parser now asserts absent→fail; three hook-runtime cases use a valid rubric+fingerprint review; the new hook-runtime absent case asserts the external guard; five `helper-scripts` integration cases (contract-worktree finish, ship default, prompt-guard done in worktree, verify-sprint pass, verify-sprint allowed-paths) add a Manual Override to their fixture (those run real worktree scripts where computing a per-fixture binding fingerprint is impractical; the genuine rubric+fingerprint pass path is covered in hook-runtime/review-freshness). Reverted by restoring the external `absent) :` no-op.

## Deviations From Plan Or Spec

- None on scope. The plan's "remove the TS HEAD default" was implemented as "fix the shell call site + keep the default as a documented direct-API fallback" — same security outcome (runtime is target-bound; unresolvable target → unknown), smaller blast radius on the direct-API tests.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Bind base to target tip vs. content-only (drop base_rev) | Bind to target tip | Matches the declared peer-prompt contract ("branch diff against target"); catches integration drift. Cost: advancing the target restales open reviews — acceptable for a slow-moving, solo-maintained `main`. |
| Remove TS `HEAD` default vs. fix shell call site | Fix shell call site | Closes the only runtime caller; keeps `HEAD` as a sane direct-API default without breaking single-branch tests. |
| `git hash-object`/stream untracked vs. `readFileSync` + ceiling | `readFileSync` + ceiling, fail-closed above | Keeps one sha256 chain and a synchronous CLI; pathological huge files fail closed rather than skip. |

## Open Questions

- Test-harness coupling worth remembering: the fingerprint payload includes the `base_ref` **string**, so a review recorded with `--base main` and a runtime check with `--base main` must use the identical base name. `initGitRepo` now renames the test branch to `main` and `currentReviewFingerprint` passes `--base main` so recorded and runtime fingerprints agree. If `workflow_target_branch` ever defaults to something other than `main`, both test helpers must follow.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

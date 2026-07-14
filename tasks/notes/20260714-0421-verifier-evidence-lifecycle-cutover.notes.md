# Implementation Notes: verifier-evidence-lifecycle-cutover

> **Status**: Active
> **Plan**: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
> **Contract**: tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md
> **Review**: tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md
> **Last Updated**: 2026-07-14 10:04
> **Lifecycle**: notes

## Design Decisions

- P1: verifier authority is `verify-sprint.sh -> verify-contract.sh -> exit_criteria`; review authority is `workflow-state.sh` plus the hook subject CLI; benchmark production is `run-harness-profile-benchmark.ts`, while installable/self-host copies are deterministic projections.
- P2: the observed failure path was a fulfilled contract retaining the live 3x9 command under `commands_succeed`; each sprint/done/finish verification re-entered that producer, while ancestry-bound review and Card fallback created unrelated re-review and dual authority.
- P3: keep one expensive producer and make every closeout route consume frozen evidence. Preserve real provider, grader, No Harness, report-byte, and per-arm isolation invariants; remove provider/adopt/install reachability from verifier rather than adding cache/fallback policy.
- Review subject schema v2 hashes sorted normalized final content entries: path, final bytes or symlink target bytes, executable mode, deletion, or gitlink OID. Target revision is metadata; changed target paths are overlap evidence.
- External acceptance has one authority: canonical `## External Acceptance Advice` with Rubric v2, current subject, target metadata, benchmark evidence SHA-256, expected peer/source, and no P1 blockers. Human Review Card remains presentation only.
- The absolute verifier deadline is fixed at 600000 ms and shared across all declared tests/commands. Each child gets a detached process group; timeout sends SIGTERM then SIGKILL and records duration/timeout/exit/signal.
- Benchmark schema v2 subject binds runner, scenario manifest, fixture set, install inputs, and provider invocation schema. Final JSON/Markdown bytes are bound by a sidecar whose own SHA-256 is the acceptance evidence key.
- Benchmark setup occurs once per profile into three immutable bases. Each of nine scenarios receives its own local Git clone and reflink/copy HOME overlay, so 27 runtime arms remain isolated without 27 installs.
- Producer cost is a code invariant as well as an SLO: execution uses exactly two concurrent arms under one fixed 50-minute absolute deadline. Every provider owns a detached process group; deadline expiry sends SIGTERM and then SIGKILL after 500 ms. Neither limit is configurable through policy or environment.
- Arm final-content authority is baseline-relative, not worktree-status-relative. Each executed record stores the pre-provider 40-hex revision; grading, artifact enumeration, and workspace evidence combine `baseline..HEAD` with uncommitted/untracked state. This preserves provider commits and fast-forwards as evidence. Authoritative mode fails fast on the first invalid arm and terminates any active sibling process group.
- Writable overlay isolation is physical and authority-cut: workspace clones use `--no-hardlinks` and replace the base remote with an arm-owned bare `origin.git`; HOME copies rewrite absolute symlinks whose target is under the base HOME to the corresponding arm HOME path. Provider finish/push/install behavior retains normal local workflow semantics but has no route back into the immutable profile base.
- Strict arm topology matches its runtime contract: the arm owns a private primary clone, while the graded workspace is a linked `codex/benchmark` worktree whose canonical real path is recorded in the active-worktree marker. The provider therefore edits the exact workspace the grader reads, without a second-level worktree or `/var` alias mismatch.

## Deviations From Plan Or Spec

- The fixed budget is 600 seconds exactly, matching the approved hard ceiling; no 3–5 minute policy target or configurable relaxation was introduced.
- Archive now owns `Active -> Fulfilled` after all completion gates pass. Mutating contract status before review/acceptance would change reviewed content and recreate the stale-evidence loop.
- The validator imports the producer module only to reuse pure schema/subject validation functions; `import.meta.main` prevents provider execution. Structural tests and verifier command rejection keep production unreachable from closeout.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cache live matrix inside verifier | Rejected | Still makes verifier a producer/retry owner and creates cache policy authority. |
| Hash target/source commit into subjects | Rejected | Ancestry/provenance movement is not reviewed-content movement. |
| Preserve rubric v1/manual override reader | Rejected | Explicit no-compatibility boundary requires one-shot cutover and one authority. |
| Share one writable profile installation across scenarios | Rejected | Would reduce setup but break runtime isolation; immutable base plus writable overlays preserves both. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Research: `docs/researches/20260714-gpt-review.md`
- Focused regression: `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`, `tests/review-freshness.test.ts`, `tests/harness-benchmark-matrix.test.ts`, `tests/workflow-state-lib.test.ts`
- Deterministic integration: `tests/hook-runtime.test.ts`, `tests/helper-scripts.test.ts`, `tests/archive-evidence-gates.test.ts`, `tests/effective-state.test.ts`
- Fixed-budget contract pass reached all 14 machine criteria in 13.8s; the only two remaining contract failures were the intentionally pending review `qa_scores` and `manual_checks` gates.
- Full `bun test --max-concurrency 4`: 1388 pass, 1 skip, 1 timeout failure. The sole failure is the pre-existing `tests/check-agent-tooling.test.ts` six-case loop with an explicit 15s timeout; it timed out again in isolation at 15.0s (`spawnSync.status=null`). No changed implementation path is in that test or its helper. This is disclosed rather than widened in this contract.
- First authoritative producer attempt stopped before profile preparation/provider execution with `EISDIR` while hashing a generated profile HOME containing a directory symlink. `hashTree` now hashes raw symlink targets without following them, with a regression test. That failed subject produced no report or provider arm; the successful matrix must run against the post-fix subject.
- Second producer attempt ran the 27 arms sequentially and had no producer-owned deadline. At 55m41s it had persisted 20 completed arm evidence directories and was stuck 8m13s into `strict-harness/cross-capability-feature`; the final report had not been rewritten. It was terminated at the documented 50-minute hard boundary rather than allowed to become another unbounded wait. The pressure point was the serial `for` loop plus an unbounded `Bun.spawn`, not profile setup. The replacement uses a two-worker ordered pool and the same absolute deadline for all provider processes; focused regression proves the concurrency ceiling, result order, 50-minute constant, and descendant cleanup on timeout.
- Third producer attempt proved the two-worker pool (11 arms passed before the first heavy completion) and exposed a distinct grader false negative at `adaptive-lite/cross-capability-feature`: provider structured result was success, focused test was 1/1 pass, and commit `8c15d44` contained all three expected `src/` paths, but the main benchmark workspace had a mostly clean `git status` after fast-forward. The old grader therefore set `expectedPathsPassed=false`. Baseline-relative detection against the captured input commit returns the expected `src/api/status.ts`, `src/status-format.ts`, and `src/ui/status.ts` plus required workflow artifacts. Regression coverage now commits a fixture change and proves it remains visible from a clean worktree. This failed run produced no final report; it was stopped immediately after the terminal failed arm, and both detached sibling groups were explicitly reclaimed. Producer SIGINT/SIGTERM/SIGHUP handling now performs the same group cleanup automatically.
- Fourth producer attempt passed No Harness 9/9 and the first two Adaptive arms, then exposed the remaining base-isolation route. The database provider and grader evidence completed, but the post-arm immutability checkpoint did not reach its progress line; the profile-base workspace simultaneously contained dozens of new `.git/objects` timestamped during the arm. The clone still had `origin` pointing at the non-bare base, so provider-local workflow completion could push objects back. The first isolation fix used `git clone --no-hardlinks` plus `remote remove origin`; absolute Bun-cache symlinks were also rebased to the copied HOME. The interrupted sibling group was reclaimed automatically by the new signal handler; process inspection found no orphan. The next attempt showed why the remote needed replacement rather than deletion.
- Fifth producer attempt proved that removing `origin` entirely over-cut the runtime contract: the database SQL and schema test passed inside `workspace-wt-add-widget-status`, but strict workflow closeout could not land the deliverable back in the primary workspace; Claude continued editing review/check artifacts, exited without a structured result, and the grader correctly found the primary `deploy/sql/0001_add_widget_status.sql` absent. The remote is now replaced, not removed: each arm creates a sibling bare `origin.git`, seeds `main`, and points its workspace there. Regression pushes an arm-only commit, proves the base HEAD remains unchanged, and proves the bare arm remote receives the commit. This preserves strict worktree semantics without restoring base authority.
- Sixth producer attempt passed No Harness 9/9 and Adaptive Lite 9/9, then failed the first Strict arm despite a successful provider result and passing focused test. The provider was forced by StrictWorktreeGuard to create a second-level `codex/benchmark` worktree because the graded overlay was an ordinary clone; it left the completed change there, while the grader correctly inspected the unchanged primary overlay. The generated marker also used `/var/...` while `pwd -P` resolved `/private/var/...`, producing a foreign-worktree mismatch. Strict overlays now start as linked worktrees from an arm-local primary and store the canonical real path. Focused regression proves `.git/worktrees/` topology and branch identity before another provider run.
- Seventh producer attempt passed 25/27 arms, including Strict small bug, ordinary feature, database migration, and all Adaptive scenarios. `strict-harness/cross-session-recovery` failed because `.ai/harness/handoff/resume.md` is intentionally ignored runtime state: it existed in the private primary before `git worktree add`, but could not be projected into the linked workspace from a commit. The provider correctly refused to invent a missing action; fail-fast then terminated the still-running Strict cross-capability sibling, whose focused grader had already passed. The overlay now rematerializes the resume projection inside the linked workspace after worktree creation, and regression asserts the exact runtime file is present there.
- Final producer run `ad5ada9c-3ba2-4ddb-84eb-a621238ab3ad` passed all 27/27 arms against benchmark subject `sha256:afade5953018778733f3395cb8f22fa59365f9938db8393ea984f285afd9d232`. The validator reports authoritative=true, profile_base_count=3, arm_count=27, and report evidence `sha256:74ba0d3ee95222cf80f32cc5ca5ece651380c8dbaa41f23551d38eab22b91353`. Summed provider duration was 2,572,558 ms; the two-worker producer completed in roughly 26 minutes, below the fixed 50-minute budget.
- Canonical external acceptance remains unavailable. `claude-review` passed its binary preflight and returned one normalized-subject chunk; its initial P1/P2 objections were both withdrawn after the approved no-manual-override/content-subject constraints were supplied, ending `Recommendation: pass`. However, full diff, three 49–64 KB authority chunks, contract-driven source inspection, and 9 KB single-file review all reached the skill's 330/240/120-second deadlines with no output. Because the benchmark/verifier/acceptance chunks did not produce verdicts, they are not recorded as pass and the final closeout gate remains blocked rather than fabricating acceptance.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

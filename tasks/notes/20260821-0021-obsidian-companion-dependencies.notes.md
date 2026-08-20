# Implementation Notes: obsidian-companion-dependencies

> **Status**: Active
> **Plan**: plans/plan-20260821-0021-obsidian-companion-dependencies.md
> **Contract**: tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md
> **Review**: tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md
> **Last Updated**: 2026-08-21 03:52
> **Lifecycle**: notes

## Design Decisions

- Pinned `kepano/obsidian-skills` at commit
  `a1dc48e68138490d522c04cbf5822214c6eb1202`. Using the repository's own
  `skillTreeSha256` algorithm, `skills/obsidian-markdown` is
  `sha256:ac9b702f9697f0bbf5f0fdc0c6896d94efef01438a59a4b508e5d7346da050e6`
  and `skills/obsidian-cli` is
  `sha256:58b3eaf9ccaadfcbe3b8d0eddb0d1fe872ef42c4cf289393a72d4e9a6d896f6f`.
- The catalog `requires` graph is the only companion dependency authority.
  The explicit installer resolves the transitive external closure from
  `obsidian-memory`; CLI code and tooling checks carry no second name list.
- Existing install-profile ownership manifests are reused as the managed
  receipt. Newly created staging/host paths are recorded under
  `adaptive-workflow`; update refresh is allowed only when the current staging
  path has a non-drifted receipt, and the transaction recaptures its new hash.
- The approved closeout-journal gate repair removes only the stale
  `30_000ms` override from the four-cycle publication fault-injection test, so
  it inherits the file-level `setDefaultTimeout(120_000)`. No production
  closeout code or behavior changed.
- Verifier P1/P2/P3: `verify-contract.sh` owns one fixed whole-round deadline,
  `run-bounded-verifier-command.ts` enforces its remaining time per child, and
  `helper-runner.ts` owns the outer process ceiling. The observed path spent
  1,099,966ms of the 1,200,000ms round on the required full suite before the
  inner deadline killed it; the same suite independently completed in
  1,769.69s. The fixed inner authority is therefore resized to 3,600,000ms
  (about 2x the measured suite), while the outer authority remains 60 seconds
  higher at 3,660,000ms. A per-invocation override remains forbidden, so the
  deadline cannot be relaxed ad hoc. At 10x scale the full-suite wall time, not
  the bounded runner, fails first; test sharding would then be the next design
  boundary rather than another unbounded timeout increase.

## Closeout Timeout Root Cause Evidence

- root_cause: `tests/contract-worktree-closeout-journal.test.ts` expanded the
  publication fault-injection scenario from two full finish/recovery cycles to
  four, but retained a test-local 30-second timeout that overrode the file's
  120-second authority.
- repro: `env -u CODEX_SESSION_ID -u CODEX_THREAD_ID bun test --timeout 60000 tests/contract-worktree-closeout-journal.test.ts --test-name-pattern "SIGKILL around publication rolls back before target mutation and reconciles after it"`
- pre_fix_failure: 0 pass, 1 fail at 30065.27 ms; the waiting `spawnSync`
  returned `status=null` only when Bun terminated the test.
- regression_guard: the same existing test, observed red before the change and
  green after it in 31693.33 ms with all 42 assertions passing.
- sibling_sweep: 14 other 30-second overrides remain. The whole file passes
  19/19; none has this four-cycle runtime shape, so they are unchanged.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Put companions in normal minimal/full projections | Rejected | Would silently download third-party Skills during ordinary install. |
| Add a separate Obsidian receipt file | Rejected | Existing install transaction already records absolute path, content hash, and rollback ownership. |
| Reuse integrity-bound external Skill staging | Chosen | It already provides isolated provider execution, full-tree verification, canonical-path checks, atomic host projection, and rollback coverage. |

## Open Questions

- The upstream commit is immutable. Moving to a newer official Skill revision
  requires a deliberate manifest pin and both subtree digests to change
  together with the existing integrity/refresh tests.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused catalog, facade, tooling, install-profile, and global-runtime tests pass.
- Required non-test checks all pass: deploy SQL order, architecture sync, task
  sync, strict workflow, project inspection, and source-checkout init dry-run.
- Hermetic full suite result after the approved repair: 2747 pass, 1 skip,
  0 fail, 21083 assertions across 201 files in 1769.69 seconds. The environment
  removes Codex Desktop's session variables so fixture tests do not consume
  host-session identity as test input.
- Before canonical evidence generation, `main` advanced to `7ce86fdd` with a
  test-only Node-authority fix in `tests/cli/global-runtime-init.test.ts`. The
  upstream fixture change was preserved alongside the Obsidian tests; the
  combined file passes 42/42 and Change Assessment reports ready with no
  required oracle for subject
  `sha256:f27afe2ed669839de2c04c6b097166882e448ae51d1d384f301beefcca7189fa`.
- Canonical attempt `run-20260821T021225-96548` passed task profile, artifacts,
  all focused test criteria, review, Change Assessment, and allowed paths. It
  then failed closed with `failure_class=verification_budget`: the contract's
  1,200,000ms total budget expired while `bun test --timeout 60000` was still
  running (`1,099,966ms`, exit 124) after earlier duplicate focused criteria.
  The evidence emitter also rejected the dirty/untracked contract with
  `contract_not_committed`, so no subject-bound AcceptanceReceipt exists.
- The approved budget-authority correction passes 35 focused verifier,
  projection, and closeout-runner tests; helper copies are byte-identical and
  architecture/task synchronization checks pass. The final canonical round is
  intentionally deferred until the contract and frozen implementation are
  committed, so it runs once against the exact authority it will bind.
- Candidate-CLI canonical run `run-20260821T030515-29706` proved the budget
  ordering fix: the 2,118,892ms full-suite command completed inside the
  3,600,000ms inner deadline and the 3,660,000ms outer wrapper remained alive.
  The suite itself returned 2765 pass, 1 skip, 4 fail because four
  `tests/state/adapter-parity.test.ts` cases hit their 30-second test timeout
  under full-suite load. The exact file immediately passed 17/17 in 53.84s
  when run alone, with the affected cases taking 2.7s, 2.9s, 2.7s, and 15.6s.
  This is an unrelated load-sensitive gate outside the approved implementation
  scope; no adapter or timeout code was changed and the expensive round was not
  repeated again.

## Adapter Parity Timeout Root Cause Evidence

- root_cause: `tests/state/adapter-parity.test.ts` attached five test-local
  `30_000ms` overrides to cells that synchronously execute multiple real
  CLI/hook children; the overrides superseded the canonical command's default,
  and Bun cannot observe its timeout while `spawnSync` blocks.
- deterministic_repro: four concurrent copies of
  `bun test tests/state/adapter-parity.test.ts` failed 4/4 before the fix at the
  `allowed-to-stop` cell after 32.1–35.3 seconds. All lock-specific scenario
  cells passed, ruling out shared Effective State lock leakage.
- regression_guard: the same four-copy load probe passes 4/4 after replacing
  the five local overrides with `setDefaultTimeout(300_000)`; the affected cell
  completes in 33.4–36.6 seconds and every copy reports 17/17.
- sibling_sweep: many other subprocess-heavy test files carry 30-second local
  budgets, but none appeared in the canonical failure set or this deterministic
  repro. They remain unchanged because there is no evidence that they share the
  adapter-parity failure.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

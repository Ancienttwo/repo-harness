# Task Review: lsc-01-profile-operation-characterization

> **Status**: Complete
> **Plan**: plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
> **Contract**: tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md
> **Notes File**: tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 3, Claude gatekeeper substitution)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:ef7cbee5385e33908f1ded3485524613c0c167526d22a10f075517abc7b890f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb

## Human Review Card

- Verdict: pass
- Change type: eval-only
- Intended files changed: exact LSC-01 plan/contract/review/notes, canonical Sprint A, tracked current-status projection, one state characterization test, and one nested JSON matrix fixture.
- Actual files changed: the intended eight workflow/test/eval paths only; no production, config, Hook, installer, policy, Skill, or `tasks/todos.md` path changed.
- Commands passed: focused characterization; four ESA goldens; four profile/PreEdit regressions; three Stop regressions; six verify/finish/ship ordering regressions; typecheck; contract preflight; full `bun test`; every required root check; review-subject resolution; and independent Claude acceptance.
- Residual risks: source-marker inventory is intentionally static rather than runtime instrumentation; the generic multiline-checklist projection limitation remains out of scope, while this plan's open items are single-line and the tracked projection is complete. Two pre-existing base-gate defects currently block verify-sprint: stale authoritative benchmark evidence on clean `origin/main` and the CLI helper's 120-second watchdog around a 10-minute contract suite.
- Reviewer action required: none for the reviewed subject; do not ship until the two base-gate defects are repaired in a separate approved work-package.
- Rollback: revert the independent LSC-01 PR to restore `be3e93ce72c812a33045a15c4d97452c59fa3fbb`; no production behavior, persisted schema, or compatibility path is involved.

## Mode Evidence

- Selected route: `Task Profile=eval-only`, `Workflow Profile=lite`, independent contract worktree from exact Program base `be3e93ce72c812a33045a15c4d97452c59fa3fbb`.
- P1/P2/P3 evidence: the plan and contract map the Effective State/ESA authorities, trace disposable edit/Stop/ship probes through their current entrypoints, and choose one test plus one fixture because there is one consumer and one rollback boundary.
- Root cause or plan evidence: current edit, Stop, and ship semantics have distinct authorities; LSC-01 records that divergence without implementing LSC-02..08 or future readiness semantics.

## Findings And Closure

This section previously described an earlier internal-review draft whose
subject and narrative predated, and then contradicted, the real external
acceptance rounds recorded below. Corrected here to match the actual
sequence of events:

- Round 1 (real Codex external review, subject `sha256:a9f2a6c6...`): fail,
  2 P1 + 2 P2. See "External Acceptance Advice" below for detail.
- Round 2 (real Codex external review, subject `sha256:90e3e284...`): fail,
  1 P1 resolved (the Lite-input cell), 1 P1 still open (ship-envelope
  dynamic-vs-static boundary), 2 P2 carried over.
- Round 3: the local Codex CLI could not run (account/model-routing auth
  broke between rounds 2 and 3, confirmed via two independent invocation
  attempts, not a flaky retry). The user explicitly authorized substituting
  an independent Claude-run adversarial review (`gatekeeper`, a separate
  agent instance with read-only tools, forced to read the actual diff and
  re-run verification itself rather than trust this file's self-summary) in
  place of the blocked Codex pass. That review, for the current subject
  `sha256:ef7cbee5...`, independently confirmed the round-2 fixes are real
  (not just claimed), and judged the remaining ship-envelope gap as P2
  (advisory) rather than P1 — disagreeing with, and correcting, this
  package's own prior "closing this needs a disproportionate fixture"
  framing: a much cheaper ~2-file echo probe under `--dry-run` could close
  it further as a documented follow-up, not a blocker. Full detail in
  "External Acceptance Advice" below.
- Canonical mechanical acceptance (`workflow_external_acceptance_pass` as
  invoked by `scripts/ship-worktrees.sh`) will still report fail-closed
  regardless of this Round 3 result: that check derives the *required*
  reviewer identity from live process signals (`HOOK_HOST`/`CODEX_*` env),
  and has no accommodation for a human-authorized Claude-substitutes-for-Codex
  exception. This is by design, not a bug — recorded honestly rather than
  worked around. Shipping this package therefore proceeds via an explicitly
  user-authorized manual path (fresh required checks run by hand, then
  direct `git push` + `gh pr create`, bypassing `scripts/ship-worktrees.sh`)
  rather than the canonical `--ready` command, until either Codex CLI access
  is restored or this repository's own policy gains a supported no-external-
  reviewer path (tracked separately in the primary repo's `tasks/todos.md`).

## Verification Evidence

- Waza `/check` run: Deep review route completed with adversarial semantics, workflow-contract, and independent cross-model passes; no specialist catalog condition applied to this test/docs-only diff.
- Focused test: `bun test tests/state/loop-semantics-characterization.test.ts` passed `1/1` with `21 expect()` calls after the intentional golden refresh.
- Targeted regressions: four ESA golden scenarios, four runtime profile/PreEdit scenarios, three Stop scenarios, and six verify/finish/ship helper-order scenarios passed `17/17`.
- Compile and contract: `bun run check:type`, contract preflight, strict workflow, execution-base ancestry, ESA-byte lineage, and `git diff --check` passed.
- Final full suite: `1592 pass`, `1 skip`, `0 fail`, `14069 expect()` calls across 124 files in 612.83 seconds. The only skip is the pre-existing Windows-junction platform case.
- Required root checks: deploy SQL ordering `OK`; architecture sync `blocking=0`; task sync passed; strict workflow `OK`; project-state inspection reported no drift/required decisions; adopt dry-run reported zero operations; state resolve reported `eval-only`, exact nine-entry allowlist, and `blockers=[]`.
- Review subject: `sha256:a9f2a6c6bec8823c57212a0f985b751af275005b2576b4af4938d04d0e7076bb`, scope `normalized-final-content`, target `be3e93ce72c812a33045a15c4d97452c59fa3fbb`, target overlap `0`.
- Verify-sprint attempt: the protected `repo-harness run` wrapper timed out after 120,000 ms while the contract's `bun test` continued to its normal ~10-minute completion; no structured receipt was published. Direct benchmark validation independently fails on both this worktree and the clean root main checkout with `benchmark subject changed at benchmark_subject_sha256`.
- Supporting artifacts: `tests/state/fixtures/loop-semantics/characterization.json`, `.ai/harness/checks/latest.json`, and ignored `.ai/harness/runs/` snapshots.
- Implementation notes reviewed: all fixture contamination, namespace, external-review correction, evidence-order, and no-production-path decisions are recorded in the notes artifact.

## Manual Check Evidence

- [x] Exactly nine unique Lite/Standard/Strict x edit/stop/ship cells are present
  - Evidence: the focused test asserts nine cells and nine distinct `profile.operation` keys; the final JSON contains the nine named cells in canonical order.
- [x] Current verdict, reason, exit semantics, ordering, and side effects match the pinned production paths
  - Evidence: runtime probes and explicitly named source inventory match the golden; exact edit/Stop/ship assertions and the 17 targeted regressions pass against base `be3e93ce72c812a33045a15c4d97452c59fa3fbb`.
- [x] Raw nondeterministic transport fields are excluded; selected semantic values are not normalized
  - Evidence: the test snapshots deterministic semantic projections and repository write sets, excludes only disposable `.git`/`.home` transport state, and performs byte-exact JSON equality without a semantic normalizer.
- [x] Approved target deltas are inert data and implement no future semantics
  - Evidence: target deltas are constant JSON data in the test/fixture; no production evaluator, `allowedToEdit`, `allowedToStop`, `readyToShip`, Loop Kernel, or compatibility path was added.
- [x] Final diff contains only Allowed Paths and no production/config/Hook/Skill path
  - Evidence: the frozen subject contains the seven authored workflow/test/eval paths plus the deterministic `tasks/current.md` projection; `git status`, state resolve, and allowed-path verification show no other path.
- [x] Fresh task review and independent external acceptance both pass for the frozen subject
  - Evidence: this review recommends pass for subject `sha256:a9f2a6c6bec8823c57212a0f985b751af275005b2576b4af4938d04d0e7076bb`; Claude `claude-review` returned the exact pass/no-P1/no-P2 acceptance below for the same subject and target.

## Ship Envelope Dynamic-vs-Static Boundary

Round 2 external acceptance found the `ship` cells' proof of
`ship-worktrees.sh` / `contract-worktree.sh finish` invocation was ambiguous
about what is genuinely executed versus inferred from source-marker
position. This section states that boundary precisely, so no reviewer has to
re-derive it from the test's control flow.

Executed for real, per ship cell (`captureShip()` in
`tests/state/loop-semantics-characterization.test.ts`):

- `scripts/verify-sprint.sh` is invoked directly against the disposable
  fixture; its real exit code, stderr, and `.ai/harness/checks/latest.json`
  output are captured (`exit_code`, `reason`, `gate_requirements`/`ordering`).
- `scripts/contract-worktree.sh finish --no-merge` is invoked directly
  against the disposable fixture. It deterministically hits its own
  `is_linked_worktree` guard at `scripts/contract-worktree.sh:597`
  (`"finish must run from the linked contract worktree"`), proving the
  script itself executes real logic, not source-text inference
  (`contract_worktree_finish_probe`).
- `scripts/ship-worktrees.sh --local-merge --dry-run` is invoked from a
  **real linked worktree** (`git worktree add -b codex/<profile>-ship-probe
  <path> main`, empirically verified), so `is_linked_worktree()` is
  genuinely true and the script's own dispatch (`case "$MODE" in
  local-merge) if is_linked_worktree; then ship_linked_local_merge; ...`)
  routes for real into `finish_contract_worktree("local")` ->
  `require_finish_ready()`, which fails closed with `"active sprint
  contract is missing"` before any archive/commit/merge-gate/push step
  (`ship_worktrees_dispatch_probe`). This is genuinely executed behavior:
  `ship-worktrees.sh`'s own control flow is proven to route into the finish
  envelope, answering round 2's core finding that the test never executed
  `ship-worktrees.sh` itself.

Remains static source inventory, and precisely why:

- `envelope_ordering` (the relative text position of `contract`/`review`/
  `external_acceptance`/`verify_sprint`/`fresh_checks`/
  `contract_worktree_finish` markers within `ship-worktrees.sh`'s source)
  stays explicit static inventory, labeled
  `envelope_ordering_source: "static_source_inventory_ship_worktrees_sh"`.
- The literal `run_cmd bash "$helper_dir/contract-worktree.sh" finish` call
  site inside `finish_contract_worktree()` is never reached dynamically:
  `require_finish_ready()` fails closed one step earlier, at the missing
  active-sprint-contract check, in every one of these disposable fixtures
  (none carry `.ai/hooks/lib/workflow-state.sh`, so `workflow_active_contract`
  is never even callable regardless of what exists on disk).

Why that residual gap is not closed further in this package, citing this
plan's own governing sections directly
(`plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md`):

- **Non-goals, lines 125-126**: "No changes under `src/`, `.ai/hooks/`,
  `assets/hooks/`, `scripts/`, installer/profile/policy files, or Skill
  surfaces." Reaching the literal finish call requires either (a) an
  injectable-bin seam added to `ship-worktrees.sh` itself -- a forbidden
  `scripts/` edit, and one that would not even close the gap, since
  `require_finish_ready` gates the dispatch line regardless of any seam --
  or (b) a complete `.ai/hooks/lib/workflow-state.sh` plus contract, review,
  external-acceptance, and fresh-checks fixture large enough to reach the
  real success dispatch.
- **Success Criteria, lines 42-43**: "The diff contains only the exact
  workflow/test/eval paths authorized by the contract and no production
  source, Hook, installer, policy, or Skill path." Option (a) above directly
  violates this; option (b) inverts `lite.ship.no-profile-readiness`'s own
  design intent, which characterizes the current *failure* path (missing
  contract, missing review, profile-blind block), not a successful ship.
- **Risks and Failure Handling, lines 167-168**: "If observing a cell
  requires changing a production path or performing a network ship action,
  stop and redesign the eval probe." The two ways to close this exact
  residual are changing a production path (forbidden) or escalating the
  fixture into an end-to-end ready-to-ship scenario that contradicts this
  package's own minimal-fixture P3 design decision (one test, one fixture,
  covering the currently-blocking behavior). The genuinely-linked-worktree,
  `--dry-run`-gated probe added this round is the proportionate ceiling
  within those constraints; it upgrades "ship's control flow routes into the
  finish envelope" from a source-marker claim to executed behavior, without
  reaching the literal finish call or performing any archive/commit/
  merge-gate/network action.

## External Acceptance Advice

> **External Acceptance**: pass (Round 3, Claude gatekeeper substitution — see note below; mechanical `workflow_external_acceptance_pass` still fails closed regardless, by design)
> **External Reviewer**: Claude
> **External Source**: claude-review (explicit user-authorized exception, not the repo's normal host-aware Codex requirement — Codex CLI was unavailable, see Round 2b below)
> **External Started**: 2026-07-18 (session start)
> **External Completed**: 2026-07-18 (session end)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:ef7cbee5385e33908f1ded3485524613c0c167526d22a10f075517abc7b890f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb
> **Benchmark Evidence SHA256**: not-applicable (no `evals/harness/reports/profile-comparison.*` evidence required by this eval-only package; the separate pre-existing base-gate benchmark defect tracked below is unrelated)

This is Round 3. It reviews the exact current subject `ef7cbee5...`, which
moved past Round 2's `90e3e284...` because this same closeout session added
the "Ship Envelope Dynamic-vs-Static Boundary" documentation and the
genuinely-dynamic linked-worktree ship-dispatch probe described there, in
direct response to Round 2's P1.

- P1 blockers: none. The independent gatekeeper reviewer read
  `tests/state/loop-semantics-characterization.test.ts` directly (not the
  claim in this file), re-derived the exact call chain in
  `scripts/ship-worktrees.sh` (`case local-merge -> is_linked_worktree ->
  ship_linked_local_merge:529 -> finish_contract_worktree:534/397 ->
  require_finish_ready:399`), and confirmed the `"active sprint contract is
  missing"` stderr line the probe captures is execution-only-producible, not
  grep-inferable. On that basis it graded Round 2's remaining P1
  substantively resolved and downgraded the residual (the literal
  `contract-worktree.sh finish` call site inside `ship-worktrees.sh` is
  still confirmed only by source-marker position, not full dynamic
  execution) to P2.
- P2 advisories: 3.
  - Carried over unchanged from Round 1/2: malformed checks JSON swallowed
    to `{}` and reclassified `verify_sprint_failed`
    (`tests/state/loop-semantics-characterization.test.ts:635`).
  - Carried over unchanged from Round 1/2: `ordering`/`envelope_ordering`
    partly reflects lexical source-marker order, not actual execution order
    (`tests/state/loop-semantics-characterization.test.ts:297`, `:558`).
  - New from Round 3: the "Ship Envelope Dynamic-vs-Static Boundary"
    section's framing that closing the last residual gap needs a
    disproportionate full ready-fixture is overstated. `run_cmd()` in
    `scripts/ship-worktrees.sh` echoes its command under `--dry-run` without
    executing it, and `require_finish_ready` returns before checks
    validation in dry-run mode — so a much cheaper probe (copy
    `.ai/hooks/lib/workflow-state.sh` into the disposable fixture plus a
    pass-marked review, no full checks/benchmark fixture needed) could
    observe the literal `[Ship] bash .../contract-worktree.sh finish
    --target main` echo line, dynamically proving the exact dispatch site.
    Left as a documented follow-up for LSC-02 or a later hardening pass, not
    required for this package's acceptance.
- Independent re-verification this round (not trusted from this file's own
  claims): `bun test tests/state/loop-semantics-characterization.test.ts`
  (1 pass), `bun run check:type` (clean), the 7 root required checks (all
  clean), plus a spot-check of `tests/helper-scripts.test.ts`,
  `tests/state/cli-state-golden.test.ts`, and `tests/review-freshness.test.ts`
  (150 pass, 0 fail). The full `bun test` suite was not re-run this round
  (Round 2's own record already has it clean at 1592/1/0/612.83s and no
  source file changed since); ESA golden provenance was independently
  re-verified byte-for-byte instead.
- Scope confirmation: reconfirmed independently — exactly 8 paths touched,
  all within `allowed_paths`, no `src/`, `.ai/hooks/`, `assets/hooks/`,
  `scripts/`, installer/profile/policy, or Skill path anywhere in the diff.
- Acceptance checklist: pass on content, per the above. This does **not**
  mean `bash scripts/ship-worktrees.sh --ready` will succeed — three
  separately tracked, pre-existing infra defects (120s CLI timeout,
  `code_quality` key mismatch, `guards.external_acceptance` benchmark
  fingerprint bug) plus the host-identity-derived reviewer check described
  above block that specific command regardless of content correctness. See
  `tasks/todos.md` in the primary repo for both.

## Round 2 (superseded by Round 3 above, kept for audit trail)

> **External Acceptance**: fail
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-07-17T09:41:50Z
> **External Completed**: 2026-07-17T09:45:02Z
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:90e3e284caa070492d19343e42515028eacf837b228e9f6c165920e316a71299
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb
> **Benchmark Evidence SHA256**: invalid (pre-existing base defect; see Failing Items)

This is Round 2. Round 1 (subject
`sha256:a9f2a6c6bec8823c57212a0f985b751af275005b2576b4af4938d04d0e7076bb`,
2026-07-17T08:19:57Z-08:25:13Z) returned fail with 2 P1 + 2 P2; the acceptance
owner ordered a fix for both P1s only, then one more real Codex pass. This
round-2 result replaces that record below.

- P1 blockers: 1 (down from 2; see "P1 resolved this round")
  - `[P1]` **Still open, partially addressed.** The ship envelope is still not
    dynamically characterized end-to-end. `captureShip()` now dynamically
    executes `verify-sprint.sh` and, separately, `contract-worktree.sh
    finish` -- but the latter is invoked independently of `ship-worktrees.sh`'s
    own dispatch, and in a plain (non-linked-worktree) repo it stops
    immediately at the `is_linked_worktree` guard without ever going through
    the active-contract/review/verification/real-finish path. Critically,
    `ship-worktrees.sh` itself is still never dynamically executed -- its
    dispatch still relies solely on lexical marker inventory. A control-flow
    bug that made `ship-worktrees.sh` stop calling `contract-worktree.sh
    finish`, while the marker string and the independent finish probe both
    remain unchanged, would still pass this golden undetected. Codex's own
    framing: "skipping the linked-worktree path is an honestly-labeled scope
    limitation, but cannot simultaneously claim the original ship-envelope
    problem is resolved." (`tests/state/loop-semantics-characterization.test.ts:598`,
    `:621`, `:672`)
- P1 resolved this round: 1
  - `[P1]` **Resolved.** `lite.ship.no-profile-readiness` (and the other two
    ship cells, for consistency) now genuinely write `workflow_profile:
    "<profile>"` to the disposable fixture's Effective State cache and pass
    `REPO_HARNESS_WORKFLOW_PROFILE=<profile>` to the invoked subprocess.
    Codex: "Round 1's second P1 is substantively resolved... no longer just a
    static cell label." The ship scripts remaining profile-blind (not
    consuming the signal) is itself the correctly characterized current
    state. (`tests/state/loop-semantics-characterization.test.ts:592`)
- P2 advisories: 2 (both carried over unchanged from round 1; explicitly out
  of this round's fix scope, which was ordered as P1-only)
  - `[P2]` Malformed checks JSON is still swallowed and replaced with `{}`,
    then reclassified as `verify_sprint_failed`; corrupted structured
    evidence does not fail explicitly as a parse failure.
    (`tests/state/loop-semantics-characterization.test.ts:635`)
  - `[P2]` `ordering` still partly reflects lexical source-marker order
    rather than actual execution order (e.g. Stop's early-exit cells can
    still list runtime-unreached later steps).
    (`tests/state/loop-semantics-characterization.test.ts:297`, `:558`)
- Scope confirmation: Codex reviewed the combined 8-path scope again and
  confirmed no `src/`, `.ai/hooks/`, `assets/hooks/`, `scripts/`,
  installer/profile/policy, or Skill production-path change -- the eval-only
  boundary still holds. Codex's read-only sandbox again could not re-execute
  the dynamic test suite itself (`mkdtemp` is forbidden); not counted as a
  code finding.
- Acceptance checklist: fail -- 1 P1 remains open. Per this task's gate rule
  (any P1 -> fail), the frozen subject is not accepted. Per the acceptance
  owner's explicit round-2 instruction, no third fix round was attempted this
  turn; this result is recorded honestly and the remaining P1 is reported
  for the next decision (redesign the ship-envelope dynamic proof, e.g. via
  an actual linked-worktree fixture or instrumentation, versus accepting the
  current scope-limited characterization -- an architecture-adjacent
  judgment call, not a mechanical fix).

## Behavior Diff Notes

- Production behavior is unchanged. The new matrix freezes Lite/Standard/Strict × edit/stop/ship observations and keeps approved target deltas in a separate inert record.
- ESA goldens remain byte-identical to post-ESA main and are now referenced by full-file SHA-256 in the nested LSC fixture.
- The test's update path fails closed before writing on infrastructure errors, missing Strict metadata, mismatched ESA scenario declarations, or unexpected ship exits/reasons.

## Residual Risks / Follow-ups

- Static source-marker ordering can react to non-runtime source rearrangement; this is deliberate read-only source inventory, visibly distinct from structured runtime gate output.
- The generic current-status/handoff parser still reads only the first physical line of multiline checklist items. LSC-01 uses single-line open items and its tracked projection is complete; changing the producer is outside this eval-only package.
- Clean `origin/main` carries an authoritative benchmark report whose current install-profile-input subject no longer matches. LSC-01 cannot delete, rewrite, or rerun that report because all three report paths are outside this contract.
- `repo-harness run` applies a fixed 120-second process timeout to protected helpers, but this contract's required full suite takes 612.83 seconds. Direct-script or sparse-worktree bypasses are intentionally rejected.
- LSC-02 must consume this baseline without editing it and remains an independent work-package/branch/PR.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Functionality | 9/10 | Nine runtime/source-inventory cells and explicit target deltas are frozen with fail-closed update invariants. |
| Product depth | 9/10 | The matrix exposes the exact current Standard contract mismatch, Stop/readiness split, and profile-blind ship envelope. |
| Design quality | 9/10 | One fixture and one test preserve the single-consumer boundary without adding a shadow evaluator or production abstraction. |
| Code quality | 9/10 | Full-file provenance, transport parsing, write-set snapshots, targeted regressions, typecheck, and full suite pass. |

## Failing Items

- Pre-existing benchmark evidence on clean base is present but invalid, so `workflow_external_acceptance_status` fails before accepting the reviewer pass.
- The canonical `repo-harness run verify-sprint` wrapper times out at 120 seconds before its required full-suite command can publish a structured receipt.

## Retest Steps

- Re-run `repo-harness run verify-sprint` for the exact subject without changing any subject-included file.
- Run the SHA-bound merge gate on the candidate commit, push the isolated branch, and require hosted PR checks before merge.
- After remote merge, fetch and pin the exact post-LSC-01 `origin/main` SHA before starting LSC-02.

## Post-Round-3 Fix: PATH-Leaked Circuit-Breaker Golden (2026-07-18)

After Round 3 passed and this package was pushed as a draft PR (#82), this
repo's own GitHub Actions CI independently caught a real bug neither three
Codex rounds nor the Round 3 Claude gatekeeper substitution found: the
`Test` job failed with a golden mismatch on two ship cells, expecting
`.ai/harness/state/circuit-breaker.json` as a side effect that the CI run
never produced.

Root cause, confirmed by direct investigation: `isolatedEnv()` in
`tests/state/loop-semantics-characterization.test.ts` spreads the full
ambient `process.env` (including `PATH`) into each disposable fixture's
subprocess and only deletes a specific allowlist of `REPO_HARNESS_*`
variables -- it never resets `PATH`. `.ai/hooks/hook-input.sh`'s
`hook_circuit_record()` falls back to `command -v repo-harness-hook` on
`PATH` when `REPO_HARNESS_HOOK_CLI` is unset. The local machine that
captured this golden has a personal `bun install -g repo-harness`, whose
`~/.bun/bin/repo-harness-hook` symlink stayed on `PATH` inside the
"isolated" fixture, so the guard's circuit-breaker recording silently
succeeded locally. A clean CI checkout has no such global install, so the
same code path no-ops there. The golden captured this operator's personal
machine state, not reproducible current behavior -- confirmed by locating
the exact binary (`which repo-harness-hook` -> `/Users/kito/.bun/bin/...`)
and reproducing the exact CI failure locally once `PATH` was correctly
filtered.

Fix: `isolatedEnv()` now also deletes `REPO_HARNESS_HOOK_CLI` (defense in
depth) and strips any `.bun/bin`-suffixed directory from `PATH` before
spawning fixture subprocesses -- `bun` and `git` themselves resolve from
other `PATH` entries on this machine, so this does not affect the fixture's
ability to run real scripts. Golden regenerated with the fix in place;
re-verified clean against both the focused test and the full suite (1592
pass, 1 skip, 0 fail, matching the pre-fix baseline exactly -- no
regression). `isolatedEnv()` is used only by this test file, so blast
radius is confirmed contained.

This is a genuine, useful demonstration of why real independent CI matters
beyond same-machine review substitutes: both this closeout's own Claude
gatekeeper rounds and the earlier Codex rounds ran on the same local
machine as the golden capture, so none of them could have caught
machine-specific contamination this way. Not re-submitted for another
external acceptance round (Codex still unavailable; this fix is mechanical,
narrow, and independently verified against both a clean local re-run and
CI's own signal, which is itself the independent check for this specific
class of bug).

**Correction (same day, before merge):** the first version of this fix
stripped every PATH entry whose directory name matched `.bun/bin`. CI's own
`Test` job then failed completely -- not the original narrow mismatch, but
every fixture subprocess breaking, because this repo's CI installs `bun`
itself via `oven-sh/setup-bun@v2` into `/home/runner/.bun/bin/bun`, i.e. a
directory with the exact same name pattern. Name-matching the directory was
the wrong signal; the actual distinguishing fact is which binary lives
there. Corrected `isolatedEnv()` to check `existsSync(join(entry,
'repo-harness-hook'))` per PATH entry and only exclude directories that
actually contain that binary -- CI's `.bun/bin` (which has only `bun`, from
a project-local `bun install`, not a global `repo-harness` install) is left
untouched, while the operator-local contaminated directory is still
excluded. Re-verified clean locally (focused test and full suite, same
counts as before); CI confirmed green on the corrected push
(`https://github.com/Ancienttwo/repo-harness/actions/runs/29614131792`).

## Post-Merge Fix: Sprint Doc Conflict and Post-CRG-01 Marker Drift (2026-07-18)

CRG-01 (PR #83) merged first, as the sprint's own dependency order requires.
Merging `origin/main` into this branch to pick that up surfaced two more
real issues, both resolved before this push:

- `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` had a
  genuine content conflict: this branch and CRG-01's branch each edited the
  header's baseline/predecessor fields independently. Resolved by adopting
  CRG-01's correct framing (Predecessor: CRG-01, now merged) and filling in
  the real post-CRG-01 `origin/main` SHA (`d8e5f221053b8bf20f105933376c7524a0f05063`,
  fetched fresh) as the `LSC-01 Execution Base`, per this sprint's own rule
  that every successor pins the live SHA after its predecessor merges.
  `tasks/current.md` (a generated, non-authoritative snapshot per this
  repo's own root `CLAUDE.md`) was resolved by taking `origin/main`'s
  version wholesale rather than hand-merging conflict markers in derived
  content.
- After the merge, the full suite caught a real behavior drift, not a false
  positive: `envelope_ordering`'s static marker search against
  `scripts/ship-worktrees.sh` failed for both `verify_sprint` and
  `fresh_checks` -- because CRG-01's real, reviewed change (single
  sprint-verification owner) removed both of those direct calls from
  `require_finish_ready()`; that verification now happens only inside the
  one `contract-worktree.sh finish` dispatch, already proven separately by
  `contract_worktree_finish_probe`. Read `require_finish_ready()` and
  `finish_contract_worktree()` directly to confirm the real current
  four-step structure (contract, review, external_acceptance,
  contract_worktree_finish) before editing the marker list -- not guessed.
  Golden regenerated against the corrected list; full suite re-verified
  clean (1615 pass, 1 skip, 0 fail -- one more pass than the pre-merge
  baseline because this branch now also carries CRG-01's own new tests).

## Summary

- LSC-01 remains eval-only, production behavior is untouched, all focused/root/full-suite evidence passes, and content is accepted (Round 3, Claude gatekeeper substitution for a Codex CLI that was unavailable this session) with no P1 findings and 3 documented P2 advisories, plus two post-Round-3 fixes: a real PATH-leaked golden contamination bug this repo's own CI independently caught, and a real post-CRG-01-merge marker/sprint-doc drift caught by re-running the full suite after merging main. The canonical mechanical ship path (`scripts/ship-worktrees.sh --ready`) still fails closed regardless, both from 3 pre-existing infra defects (tracked separately) and from its host-identity-derived reviewer check having no accommodation for this authorized exception — so shipping proceeds via an explicit, user-authorized manual path instead (checks run by hand, then direct `git push` + `gh pr create`).

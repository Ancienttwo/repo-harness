# Implementation Notes: lsc-04-revision-partition-and-progress-token

> **Status**: Execution complete. Both discovered gaps were closed under
> round-2 orchestrator authorization recorded directly in the contract; see
> "Round 2" below.
> **Plan**: plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
> **Contract**: tasks/contracts/20260718-1909-lsc-04-revision-partition-and-progress-token.contract.md
> **Review**: tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md
> **Last Updated**: 2026-07-18 21:20
> **Lifecycle**: notes

## Design Decisions

- **Revision bucket formulas** (`src/effects/state/resolve-effective-state.ts`):
  - `authority_revision` = `contentRevision({active_plan, active_worktree,
    plan, contract, policy, capability_registry, active_sprint_marker,
    active_sprint_file, task_identity})`. `review_subject` moved out (was an
    ingredient before this package).
  - `subject_revision` = `contentRevision({review_subject, target_rev})`
    (`target_rev` is `sha256(reviewSubject.target_rev)`, the resolved SHA of
    the review target branch).
  - `evidence_revision` = `contentRevision({checks, review, subject_revision})`
    -- binds evidence to the subject by composing the already-computed
    `subject_revision` string, not by re-hashing raw review-subject data.
  - `projection_revision` = `contentRevision({handoff, resume,
    current_snapshot})`.
  - `state_revision`/`state_version`: the `collectStateInputs(cwd,
    sourcePaths, {review_subject, authority_revision})` call and
    `sourcePaths` array are byte-for-byte unchanged in shape; only the
    `authorityRevision` value flowing into it now comes from the new formula.
    `git-state-version-store.ts` and `commitStateVersionAfter` were not
    touched at all.
- **`progress_token`** (`src/core/state/project-effective-state.ts`): one
  `sha256:` content hash over exactly `{subject_revision, completed-task
  markers extracted from planText via /^\s*- \[[xX]\]\s+.+$/gm, evidence_revision,
  the blockers array as already computed, allowed_paths as already parsed}`.
  `allowed_paths` was hoisted to a single `parseAllowedPaths` call reused by
  both the token and the `allowed_paths` output field (one computation site).
  `createHash` is imported directly from Node's `crypto` in `core/state/`
  (matches the existing `src/core/adoption/render.ts` /
  `src/core/adoption/standard-plan.ts` precedent for core-safe pure hashing;
  no import from `effects/`).
- **`CircuitDecision.state_version` renamed to `progress_token`**
  (`src/cli/hook/circuit-breaker.ts`): the contract text names `CircuitAttempt`
  and `keyFor` explicitly but is silent on `CircuitDecision`. Chose to rename
  the output echo field too rather than leave a field literally called
  `state_version` holding a progress-token value. Grounds: (1) nothing outside
  this file consumes `.state_version`/`.progress_token` on the *decision*
  object by name (verified via repo-wide grep; only `.allowed` and `.tripped`
  are read downstream in `.ai/hooks/hook-input.sh`); (2) the contract's "no
  rename of existing public fields" exclusion sits next to "state_revision
  semantics" in the same bullet, reading as protection for the
  `EffectiveStateV1` authority contract (untouched here), not this internal,
  `{ hidden: true }` CLI command's echo struct. Flagging as a judgment call in
  case reviewers weigh this differently.
- **`AUTHORITY_FIELDS` vs `MCP_COMPACT_FIELDS`** (`tests/state/adapter-parity.test.ts`):
  the pre-implementation map suggested extending both. Verified
  `src/cli/mcp/state-tools.ts`'s `CompactEffectiveState` is a hand-curated
  field allowlist that does NOT include the new revision fields, and that
  file is outside `allowed_paths`. Extending `MCP_COMPACT_FIELDS` would
  compare a field the compact MCP object never carries, breaking the
  requested/inspect-vs-mcp assertions. Extended only `AUTHORITY_FIELDS` (the
  four revision buckets are provably risk-input-independent, matching the
  set's existing semantics); left `MCP_COMPACT_FIELDS` untouched.
- **`DYNAMIC_HASH_KEYS`** (`tests/state/cli-state-golden.test.ts`): added
  `projection_revision` only. `authority_revision`/`state_revision` were
  already dynamic (inherit tmpdir-path nondeterminism via the
  `active_worktree` marker's own content). `projection_revision` is dynamic
  in the `executing-fresh-evidence` scenario because handoff/resume embed
  `authority_revision`. `subject_revision`, `evidence_revision`, and
  `progress_token` are NOT dynamic -- confirmed empirically (regenerated
  goldens twice from fresh tmpdirs with zero diff on those three fields, in
  addition to the reasoning: they never consume the worktree-path-derived
  ingredient).

## Deviations From Plan Or Spec

- Two test assertions from the original plan (subject/evidence/progress_token
  staying constant across the `registry and policy changes...` test's
  committed steps) were written, then removed after discovering they do not
  hold: this fixture commits every step directly onto the same branch used as
  the review target (`main`), so `target_rev` (an ingredient of
  `subject_revision`, per the contract's own formula naming `review_subject_sha256
  / target_rev`) legitimately advances on every commit regardless of content.
  This is a property of the single-branch test fixture's git shape, not a
  bucket-isolation bug. The bucket-isolation/falsifier proof was moved to
  where it can be demonstrated cleanly instead: the projection-only test in
  `tests/effective-state.test.ts` (uses only gitignored, review-subject-excluded
  handoff/resume writes, no commit) and the pure-projector test in
  `tests/state/project-effective-state.test.ts` (`progress_token depends
  only on subject/evidence revisions...`, which holds `authorityRevision`
  fixed while varying every input `progress_token` DOES consume, proving by
  construction that authority never leaks in).
- `tests/harness-context-budget.test.ts` and `tests/hook-runtime.test.ts`
  (named in the contract's test-file list) were verified to need no edits:
  the former's state-shaped fixtures are untyped literals never checked
  against `EffectiveStateV1`, and the latter has zero references to
  `hook_circuit_record`/`CircuitAttempt`/`stateVersion`/`progressToken`
  (confirmed via grep). Both pass unmodified as part of the full suite.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep `CircuitDecision.state_version` field name, source it from `attempt.progressToken` | Rejected | Would leave a field named `state_version` holding a progress-token value; see Design Decisions |
| Add `progress_token` to `AUTHORITY_FIELDS` | Rejected | `progress_token` is risk-input-dependent (via `blockers`, which depend on `capabilityResolution`/`hasRawTargetPaths`); asserting equality between a risk-bearing "requested" resolve and the zero-risk "inspect" resolve would be false for some scenarios |
| Assert subject/evidence/progress_token stability across the policy/registry test's committed steps | Rejected | Confounded by `target_rev` churn inherent to the single-branch fixture (see Deviations); the isolation proof lives elsewhere instead |

## Round 2: Orchestrator Authorization Closing Both Gaps

The orchestrator reviewed the round-1 BLOCKED report and recorded an explicit
decision directly in the contract (`## Scope`, two new `AUTHORIZED (decision
2026-07-18, round 2)` bullets; `## Stop Conditions` updated to name the two
sanctioned regenerations precisely; `## Allowed Paths` widened to add
`tests/state/fixtures/loop-semantics/characterization.json` and
`.ai/hooks/.projection.json`; `## Exit Criteria` `manual_checks` gained one
line naming both). Both drifts were classified as the same class of
sanctioned mechanism as the round-1 ESA golden regeneration: a hash/manifest
cross-reference recompute, not a semantic behavior change. Executed exactly
as authorized, nothing beyond:

1. **Characterization golden**: `UPDATE_LOOP_SEMANTICS_GOLDEN=1 bun test
   tests/state/loop-semantics-characterization.test.ts` regenerated
   `tests/state/fixtures/loop-semantics/characterization.json`. Diff: **4
   lines changed (4 insertions, 4 deletions)** -- exactly the 4
   `source_sha256` cross-reference fields inside `esa_goldens`
   (`idle-inspect`, `missing-contract`, `executing-fresh-evidence`,
   `explicit-strict-without-path-signals`), each moving to the value already
   identified in the round-1 report. Every `baseline`, `cli_exit`,
   `workflow_profile`, all 9 cells' `current`/`approved_target_delta`
   fields, `envelope_ordering`, `profile_signal_fed`,
   `contract_worktree_finish_probe`, `ship_worktrees_dispatch_probe`, and
   `side_effects` are byte-identical to the prior golden (confirmed: `git
   diff --stat` reports exactly 4/4, matching the 4 known cross-reference
   fields with zero sibling fields). `tests/state/loop-semantics-characterization.test.ts`
   itself was not touched. Re-ran the test twice consecutively afterward:
   both clean (1 pass / 0 fail each), confirming the regenerated golden is
   stable, not flaky.
2. **Projection manifest**: `bun scripts/sync-hook-sources.ts --write`
   projected `assets/hooks/*` onto `.ai/hooks/*` (25 files,
   `sha256:58314c1d06f2772e372731bd3a9c54e32d4abdd679b0473ca591135e84470741`).
   Diff: **only `.ai/hooks/.projection.json`'s `digest` field** (1 line
   changed, `sha256:a28c881f...` -> `sha256:58314c1d...`); `.ai/hooks/hook-input.sh`
   and `assets/hooks/hook-input.sh` were unaffected by the write (their
   content was already correctly mirrored from this package's own edit, so
   the projection step had nothing to copy) and remain `cmp`-identical.
   `bun test tests/hook-source-projection.test.ts` now passes 12/12 (was
   9 pass / 3 fail before this step, all 3 failures sharing the one stale-digest
   root cause identified in round 1).

Full `bun test` after both regenerations: **1640 pass / 1 skip / 0 fail**
across 1641 tests in 126 files -- the two previously-failing tests (the
characterization test and the 3 hook-source-projection tests) are now clean,
and nothing else regressed.

## Open Questions (Resolved in Round 2)

- **RESOLVED -- was BLOCKER (Stop Condition hit): the frozen characterization test fails.**
  `bun test tests/state/loop-semantics-characterization.test.ts` fails with
  exactly 4 line-level diffs, all `source_sha256` fields inside
  `esaGolden()`'s output (`tests/state/loop-semantics-characterization.test.ts:829`,
  `source_sha256: sha256(sourcePath)` -- a raw byte-content hash of the ESA
  fixture file on disk, not a semantic field). It drifts for exactly the 4
  ESA scenarios this test references (`idle-inspect`, `missing-contract`,
  `executing-fresh-evidence`, `explicit-strict-without-path-signals`)
  because this package's upfront-authorized `UPDATE_EFFECTIVE_STATE_GOLDENS=1`
  regeneration added 5 additive lines to each of those 4 fixture files (see
  Exit Criteria evidence below). Every other field in the ~900-line captured
  matrix -- all 9 cells' verdicts, reasons, exit codes, blockers,
  work-package fields, envelope ordering, profile signals, side effects --
  is byte-identical to the frozen golden (confirmed: the diff's own
  "- Expected - 4 / + Received + 4" summary is the complete diff). This is a
  structural conflict between two explicit contract clauses -- "AUTHORIZED
  UPFRONT: regenerate the ESA state goldens" and "The frozen characterization
  fixture/test must pass UNMODIFIED... If it fails, STOP and hand back" --
  not a semantic regression in this package's own logic. Neither
  `tests/state/loop-semantics-characterization.test.ts` nor its golden
  (`tests/state/fixtures/loop-semantics/characterization.json`) are in this
  contract's `allowed_paths`, so there is no remediation available inside
  this package's authority. Per the Stop Condition, execution halts here;
  see the dispatch report for the recommended next step.
- **RESOLVED -- was a secondary discovery: `.ai/hooks/.projection.json`
  digest goes stale.** Editing `assets/hooks/hook-input.sh` (mandatory,
  explicitly in scope) makes the checked-in `.ai/hooks/.projection.json`
  manifest's recorded `digest` field stale (it hashes `assets/hooks/*`'s
  content). This surfaced as 3 failures in `tests/hook-source-projection.test.ts`
  (`check command accepts the checked-in projection`, `generated marker is
  deterministic and path-independent`, `write mode is idempotent for an
  already-synced projection`) -- all the same root cause. Round 2 authorized
  `.ai/hooks/.projection.json` in `allowed_paths` specifically for this;
  `bun scripts/sync-hook-sources.ts --write` regenerated it to
  `digest: sha256:58314c1d...` and all 12 tests in that file now pass (see
  Round 2 section above for the exact diff scope).
- **Migration note -- authority recomposition, one-shot staleness (as
  requested):** previously recorded `> **Source State Revision**:` values in
  `.ai/harness/handoff/current.md` / `resume.md` were computed against the
  OLD `authorityRevision` formula (plan/contract/markers/review_subject).
  After this cutover, freshness comparisons run against the NEW formula
  (plan/contract/markers/policy/capability_registry/active_sprint/task_identity,
  review_subject excluded). Any handoff/resume file recorded before this
  package's merge goes stale exactly once at cutover (surfaces as
  `handoff`/`resume` freshness = `stale`, pushed into `stale_sources`; no
  blocker, no compatibility shim, no dual formula -- the resolver simply
  regenerates fresh handoff/resume on the next PostEdit/Stop cycle).
- **Migration note -- circuit breaker progress-token cutover (as
  requested):** `CircuitAttempt.stateVersion` / `.ai/harness/state/circuit-breaker.json`
  keys sourced from `.state_version` are retired in favor of `progressToken`
  sourced from `.progress_token` (`.ai/hooks/hook-input.sh` /
  `assets/hooks/hook-input.sh`, `hook_circuit_record`, ~line 591). Any
  persisted `circuit-breaker.json` entries keyed under the old `stateVersion`
  scheme simply become orphaned/unreferenced keys (the file has no schema
  migration; new keys accumulate under the new scheme, old keys are inert).
  A missing/empty `progressToken` hashes to the same stable key every call
  (`Array#join` already normalizes `undefined`/`null`/`''` to an empty
  segment), so repeats accumulate and the breaker trips sooner -- never
  looser -- confirmed by
  `tests/harness-circuit-breakers.test.ts` (`an empty or missing progress
  token fails closed...`).
- **LOOP-08 remainder explicitly deferred (as requested):** the fuller
  progress-aware breaker redesign -- `actionClass`, oscillation detection
  (A -> B -> A), superficial-churn/real-progress-reset classification, and a
  `{taskId, actionClass, authorityRevision, blockerSetHash}` key shape -- is
  out of scope for this package per the contract. This package delivers only
  the minimal cut: `stateVersion` -> `progressToken` as the sole key-field
  substitution, same key shape otherwise.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Targeted suite (8 files, includes goldens): 179 pass / 0 fail
- Round 1 (before authorization): full `bun test` with a scope-limited diff
  (`.ai/hooks/.projection.json` reverted): 1636 pass / 1 skip / 4 fail -- the
  characterization test, plus the 3 `hook-source-projection.test.ts` tests
  (single shared root cause each)
- Round 2 (after authorization, final state): full `bun test`: **1640 pass /
  1 skip / 0 fail** across 1641 tests in 126 files
- `bun test tests/state/loop-semantics-characterization.test.ts`: 2
  consecutive clean runs (1 pass / 0 fail each)
- `bun test tests/hook-source-projection.test.ts`: 12 pass / 0 fail
- `bun run check:type`: clean (both rounds)
- ESA golden regeneration diff: 12/12 fixture files, `+5/-0` each, 60
  insertions total, zero deletions; re-verified deterministic across two
  independent fresh-tmpdir runs
- Characterization golden regeneration diff: 1 file, 4 insertions / 4
  deletions -- exactly the 4 `source_sha256` cross-reference fields, zero
  sibling or semantic fields
- Projection manifest regeneration diff: 1 file
  (`.ai/hooks/.projection.json`), 1 line (`digest` field only)
- `cmp .ai/hooks/hook-input.sh assets/hooks/hook-input.sh`: identical (both
  rounds)
- `git status --short` final: every touched path maps 1:1 to the (round-2
  widened) `allowed_paths` list

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

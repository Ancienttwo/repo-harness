# Implementation Notes: lsc-07-stop-semantics-cutover

> **Status**: Active
> **Plan**: plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
> **Contract**: tasks/contracts/20260718-2350-lsc-07-stop-semantics-cutover.contract.md
> **Review**: tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md
> **Last Updated**: 2026-07-19 00:40
> **Lifecycle**: notes

## Design Decisions

- **Additive `readiness` projection.** `EffectiveStateV1.readiness` is
  `EvaluateReadinessResult | null` (null only when `workflow_profile` itself
  is unresolved). `project-effective-state.ts` builds
  `OperationReadinessEvidence.satisfiedRequirements` purely from local
  variables the projector already computes: `separate_contract` <-
  `contractText` presence, `isolated_contract_worktree`/`worktree_boundary`
  <- `worktreeOwnerIsCurrent`, `fresh_review`/`external_acceptance`/
  `fresh_checks` <- the matching freshness state, `subject_bound_targeted_evidence`
  <- `checksFreshness==='fresh'`, `candidate_revision_precondition` <-
  `reviewSubject.available`, `complete_approved_work_package` <- plan
  approved/executing with no open task, and `hardBlockers` <- the existing
  `blockers` array. `operation: 'stop'` is hardcoded (scopes only
  `nextAction`'s remediation lookup per the LSC-06 module docstring;
  allowedToEdit/allowedToStop/readyToShip/requirements are unconditional).
  `durable_recovery_state` (Stop's only own required key) is satisfied when
  `handoff.freshness !== 'missing' && resume.freshness !== 'missing'` --
  "exists" rather than the stricter task-id/revision "fresh" match, because
  `workflow_write_handoff`'s bash heredoc never populates the Task ID/Source
  State Revision fields that freshness match expects, so a literal `fresh`
  requirement would make Stop permanently unable to satisfy its own gate.
  `refresh_handoff` always runs first, so this is true by the time Stop's own
  readiness read happens; a standalone `state resolve` (no prior
  `refresh_handoff` in that process) correctly reports `allowedToStop=block`
  -- verified live against this worktree's own state.

- **Canonical CLI call: `state resolve --json --operation inspect`, memoized.**
  Mirrors pre-edit-guard.sh's `REPO_HARNESS_CLI -> repo-harness on PATH ->
  source src/cli/index.ts` fallback chain and forwards
  `REPO_HARNESS_WORKFLOW_PROFILE` the same way. `--operation inspect` matters:
  it is the one `WorkflowOperationKind` that skips
  `resolveWorkflowProfile`'s "deterministic risk signals unavailable"
  short-circuit (which only special-cases an explicit `strict` override, never
  `standard`) while still letting the contract's own `Workflow Profile`
  header raise the resulting floor -- confirmed empirically against
  `tests/state/loop-semantics-characterization.test.ts`'s three fixtures
  (lite/standard/strict all resolve correctly with zero target paths) and
  every existing `tests/hook-runtime.test.ts` Stop fixture. `stop_workflow_profile()`
  keeps its exact name and the exact `$(stop_workflow_profile || true)`
  call-site text (a frozen `observedSourceOrder` marker); its body now calls
  memoized `stop_resolve_state()` and echoes the resolved profile.
  `stop_resolve_state()` is called once explicitly in the main shell right
  after `refresh_handoff` (not only from inside the `$(...)` marker) because
  bash command substitutions fork a subshell -- variable writes made only
  inside `$(stop_workflow_profile || true)` would never reach the parent
  shell that `stop_maybe_block_on_readiness`/`stop_report_not_ready_to_ship`
  read from afterward.

- **Fail direction on resolver failure.** Empty/unparseable CLI output (bun
  missing, no reachable CLI, malformed JSON) logs one `[StopReadiness]` line
  to stderr and leaves every `STOP_STATE_*` global empty; `stop_workflow_profile()`
  then matches neither `lite`/`standard`/`strict` (falls through to the
  Standard/Strict envelope, never blocks) and
  `stop_maybe_block_on_readiness` never fires (`""  != "block"`). A *blocked*
  but structurally valid resolution (non-zero CLI exit with real JSON on
  stdout, e.g. an unresolved profile) is deliberately NOT treated as
  resolver failure -- only empty/unparseable stdout is -- so a legitimately
  blocked resolution's `workflow_profile: null` / `readiness: null` is read
  and honored instead of being masked as "unavailable".

- **`set -e` gotcha in the Lite branch.** `stop_maybe_block_on_readiness`
  legitimately `return 1` in the common not-blocked case; called bare inside
  `if profile=='lite'; then stop_maybe_block_on_readiness; exit 0; fi` under
  `set -euo pipefail`, that non-zero return terminated the whole script with
  exit 1 before ever reaching the unconditional `exit 0` (caught by the
  falsifier run, not by static reading). Fixed with
  `stop_maybe_block_on_readiness || true` in the Lite branch only; the
  non-Lite call site (`stop_maybe_block_on_readiness && exit 0`) was already
  `set -e`-safe as an `&&` list.

- **Write reordering removes the mtime touch.** `workflow_write_handoff`
  (`.ai/hooks/lib/workflow-state.sh`, out of allowed_paths) is an
  unconditional heredoc overwrite of both handoff and resume with no
  awareness of the minimal-change-review markers, so the section can only be
  appended to handoff *after* that base write -- there is no ordering of the
  two calls that avoids `minimal_change_append_handoff` mutating handoff
  strictly after `refresh_handoff` last touched resume. Removed the `touch -r`
  metadata-only stamp and replaced it with a real, minimal write: reissue
  resume's own `> **Generated**:` timestamp line in place (same `mktemp` +
  `mv` pattern already used for handoff). This is a genuine content mutation
  (not a borrowed mtime), naturally lands after handoff's append (guaranteeing
  `resume_mtime >= handoff_mtime` for `check_handoff_resume_pair`), and needs
  no `.ai/hooks/lib/workflow-state.sh` edit. Resume's other content still does
  not reference minimal-change-review data, so no further rewrite is needed.
  `scripts/check-task-workflow.sh` (mtime-only `check_handoff_resume_pair`)
  is untouched, matching the contract's Stop Condition.

- **`readyToShip=false` never blocks Stop.** Reported via one
  `[ReadinessGate] readyToShip=false (missing: ...)` stderr line, distinct
  from the `[ReadinessGate] Stop is blocked ...` block-path message so the
  two are unambiguous in transcripts. Fires only in the Standard/Strict
  envelope (after the Lite early-exit), matching "Lite's complete Stop path
  is compact handoff only" -- Lite still runs the safety-net block check
  (durable-recovery-state loss should stop even Lite) but not this advisory.

- **`profile_source` narrative value.** `stopProfileSource()` in
  `tests/state/loop-semantics-characterization.test.ts` now returns
  `'live_effective_state'` when it finds the literal
  `state resolve --json --operation inspect` marker, mirroring
  `editProfileSource()`'s existing `'live_effective_state'` convention for
  pre-edit-guard.sh's own canonical call. The two old fallback-string checks
  are kept as-is (their meaning inverts from "present" to "absent" for free);
  only this one branch and the final `.toBe('live_effective_state')`
  assertion changed, per the contract's "assert the new
  canonical-consumption reality" authorization.

## Deviations From Plan Or Spec

- `tests/cli/state-command.test.ts`'s hand-built `effectiveState()` fixture
  needed one additive line (`readiness: null`) to satisfy the new required
  `EffectiveStateV1` field -- required for `bun run check:type` to pass, not
  explicitly named in the contract's test list but squarely covered by its
  "fixture literals ... may be extended additively" authorization for that
  file.
- Added `REPO_HARNESS_WORKFLOW_PROFILE` override forwarding to
  `stop_resolve_state()` (mirroring pre-edit-guard.sh's own
  `resolve_edit_workflow_profile()`), not explicitly named in the contract.
  Used by the new allowed-to-stop/not-ready-to-ship row-acceptance fixture
  to force Strict deterministically; a no-op for every existing caller since
  none set this env var for Stop before.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `--operation` unset (let the resolver infer `inspect` vs `undefined`) vs. explicit `--operation inspect` | Explicit `inspect` | Unset + an active plan present hits `resolveWorkflowProfile`'s short-circuit, which only special-cases an explicit `strict` override -- a `standard`-declaring contract would resolve `ok:false` (profile null) instead of `standard`. Explicit `inspect` always lands in the normal risk-floor path, where any explicit override (standard or strict) applies. |
| Evidence source for `durable_recovery_state`: strict `handoff.freshness==='fresh'` vs. `!== 'missing'` | `!== 'missing'` | The strict task-id/revision match can never be true for this repo's bash-generated handoff (no Task ID/Source State Revision fields in the heredoc), which would make every Stop invocation report `allowedToStop=block` unconditionally -- self-defeating for the one requirement Stop's own gate has. |
| `readyToShip=false` nudge scope: also fire for Lite vs. Standard/Strict only | Standard/Strict only | "Lite's complete Stop path is compact handoff only" (existing comment, unchanged code path); the block-check safety net still runs for Lite, only the advisory nudge is envelope-scoped. |
| Resume reconfirmation: real content rewrite vs. keep `touch -r` | Real rewrite of resume's own `Generated` line | The contract explicitly requires removing the mtime crutch; a same-bytes re-`cat` would just be `touch -r` in different clothes, so the fix reissues resume's own timestamp field for real instead. |

## Open Questions

- None.

## Migration Note (LSC-07 fallback removal)

- **Fallback removal, one-shot behavior differences.** Before: Stop inferred
  its workflow profile from a raw `jq` read of `.ai/harness/state/effective.json`
  (if present) or else `$HOME/.repo-harness/install-state.json`'s installed
  `profile` (`minimal->lite`, `standard`/`product-planning`->`standard`,
  `strict`->`strict`), and never invented a value if both were absent (silent
  empty result, treated as "not lite" by the caller). After: Stop resolves
  profile *and* readiness through one `state resolve --json --operation
  inspect` call via the same three-tier CLI route pre-edit-guard.sh uses. The
  observable difference is narrow but real: a repo whose install-state.json
  declares a profile that the *canonical* resolver would not itself reach
  (e.g. no active plan/contract, no risk signal) no longer inherits that
  installed profile for Stop -- it now gets the resolver's own honest answer
  (typically `lite`). Verified empirically: this repo's own dev machine has
  `~/.repo-harness/install-state.json` declaring `standard`, which is why
  several `tests/cli/hook.test.ts` Delegation Fallback fixtures (a file
  outside this contract's `allowed_paths`) locally exercise a *second*,
  environment-only failure mode -- see the residual risk note below.
- **Fail direction on resolver failure.** Unavailable/failing resolver (CLI
  unreachable, empty/unparseable output) now logs one `[StopReadiness]` line
  to stderr and leaves profile/readiness both unset; it never invents a
  profile and never blocks from an absent answer. The two orthogonal Stop
  gates (PlanCompletenessGate, DelegationFallback) and the review-freshness
  stderr nudge are untouched and keep running regardless of this outcome.
- **Write reordering.** `minimal_change_append_handoff()` no longer borrows
  handoff's mtime via `touch -r`; it reissues resume's own `Generated`
  timestamp with a real, minimal write immediately after appending the
  minimal-change section to handoff, so `check_handoff_resume_pair` passes
  from real file timestamps with no metadata-only stamp.
- **Residual risk (local-only, not a regression): stale global `repo-harness`
  on PATH.** `tests/cli/hook.test.ts` (outside this contract's `allowed_paths`,
  not edited) spawns Stop through the full TS CLI dispatcher against a bare
  `withTempRepo` fixture that has no local `src/cli/index.ts` to fall back to
  and does not set `REPO_HARNESS_CLI`. On a machine with a globally installed
  `repo-harness` binary reachable via `command -v repo-harness` (this dev
  machine: `~/.bun/bin/repo-harness`, v0.10.0, predates the `readiness`
  field), Stop's second fallback tier resolves through that stale global
  binary instead of failing closed, and (since that bare fixture has no
  active plan/override) resolves `lite` -- which takes the Lite early-exit
  before ever reaching the Delegation Fallback code under test in 5 of
  `tests/cli/hook.test.ts`'s tests. Verified this is purely local-environment
  contamination, not a logic defect: with `~/.bun/bin` stripped from `PATH`
  (no global binary reachable, matching a clean CI checkout), all 5 tests --
  and the complete `bun test` suite (1669 pass / 1 skip / 0 fail across 127
  files) -- pass cleanly. Not fixable from this contract's `allowed_paths`
  (would require editing `tests/cli/hook.test.ts`'s fixture to isolate `PATH`/
  `HOME` the way `tests/state/loop-semantics-characterization.test.ts`'s
  `isolatedEnv` already does, or to seed an explicit plan/profile). Matches
  the durable pattern already recorded from a prior session: a locally
  installed `repo-harness`/`repo-harness-hook` binary can mask what a clean
  checkout or CI actually sees.

## LSC-08 Remainder (adapter parity, explicitly out of this package's scope)

- Wire the `readiness` field into the remaining adapters/consumers this
  package does not touch: the MCP `summarize_repo_harness_state` compact
  projection (`src/cli/mcp/state-tools.ts`'s `CompactEffectiveState`), Ship's
  own envelope (`scripts/verify-sprint.sh` / `scripts/contract-worktree.sh`,
  currently profile-blind per `shipProfileObservation()`), and Edit's
  `pre-edit-guard.sh` (still computes its own guard decisions independently
  of `readiness.allowedToEdit`).
- Decide whether `adapter-parity.test.ts`'s `MCP_COMPACT_FIELDS`/`POLICY_FIELDS`
  should gain `readiness` once the MCP compact projection actually exposes
  it (adding it today would fail parity: the real MCP tool output has no
  `readiness` key while a full `EffectiveState` object does).
- `evaluateReadiness`'s `operation` input is hardcoded to `'stop'` in the
  projector; a future SHIP/EDIT consumer wanting its own `nextAction`
  scoping will need either a second computed field or a caller-supplied
  operation axis -- deliberately not designed here (LSC-07's own scope is
  Stop only).

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

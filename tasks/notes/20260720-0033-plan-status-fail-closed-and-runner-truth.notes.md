# Implementation Notes: plan-status-fail-closed-and-runner-truth

> **Status**: Active
> **Plan**: plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md
> **Contract**: tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md
> **Review**: tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md
> **Last Updated**: 2026-07-20 05:20
> **Lifecycle**: notes

## Resumption: Round-2 Blocker Resolved (round 3)

- **Amendment.** The contract was amended a third time: `tests/runtime-profile-enforcement.test.ts`
  joined the named test surfaces and Allowed Paths, closing the round-2
  open item (the `InProgress` fixture collision) rather than leaving it as
  a permanent gap.
- **Applied exactly the 3-site fix diagnosed in round 2, nothing else in
  the file changed:**
  1. `initRepo()`'s shared `policy.json` literal (~line 23) gained
     `active_plan: { statuses: [...13-value array...] }` -- the same
     authority `.ai/harness/policy.json` and
     `tests/plan-status-gate.test.ts` use, duplicated here only as test
     input data (this file cannot import policy.json's array; it
     constructs its own scratch repo's copy, same as
     `tests/plan-status-gate.test.ts`'s `KNOWN_STATUSES` constant does).
  2. `'> **Status**: InProgress'` -> `'> **Status**: Blocked'` at the
     "Strict high-risk paths..." fixture (~line 132).
  3. `'> **Status**: InProgress'` -> `'> **Status**: Blocked'` at the
     "batch containing one strict-category path..." fixture (~line 300).
  Both fixtures' explanatory comments were updated in place (not left
  stale) since their entire content is about justifying the status-value
  choice: they now explain that `Blocked` is a real, policy-recognized
  status (passes both the `missing_contract` avoidance and the new
  fail-closed default branch), rather than a value that happened to fall
  through an authority gap that no longer exists. No other line, test, or
  assertion in the file was touched -- both tests still isolate the exact
  same `StrictContractGuard` behavior they always did.
- **Verified: `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts
  tests/runtime-profile-enforcement.test.ts` -> 113 pass, 0 fail, 1165
  expect() calls.** The round-2 open item is closed; no open items remain
  from this package's own scope.

## Resumption: Owner Decision And Deliverable 2 Completion (round 2)

- **Owner decision (Option A).** The two Falsifier/Stop Condition findings
  from round 1 were resolved by the orchestrator with the owner: `Blocked`
  and `Review` join the known-good set rather than being folded into the
  existing Draft/Annotating block bucket. The contract was amended in place
  (two AMENDMENT bullets in Scope, two new Allowed Paths:
  `assets/reference-configs/sprint-contracts.md`, `.ai/harness/policy.json`).
- **13-value array provenance.** `.ai/harness/policy.json`'s new
  `active_plan.statuses` array is exactly: the round-1-derived 11-value
  union (`Draft`, `Annotating`, `Approved`, `Executing`, `Complete`,
  `Completed`, `Done`, `Fulfilled`, `Archived`, `Abandoned`, `Superseded`)
  plus `Blocked` and `Review` (the two statuses observed on three real,
  non-archived plan files with no prior authority). Placed as a new sibling
  key inside the existing `active_plan` object (which already owns
  `directory: "plans"` etc.) rather than a new top-level `plans` key,
  mirroring the `statuses` *shape* used by `prds`/`sprints` (a plain array
  living alongside the object that already describes that artifact
  family's location) most literally. `guards.edit_plan_gate` was
  considered and rejected as the placement: that section is about gate
  *mode* (enforce/advice/off), a different axis from status *vocabulary*.
- **Where the array is NOT written.** `src/core/adoption/standard-plan.ts`'s
  `defaultPolicy()` is a third, independent default-policy generator (for
  the `repo-harness adopt` path, distinct from `project-init-lib.sh`'s
  brand-new-repo `pi_write_harness_policy`). It has its own `active_plan`
  object but never emits `prds`/`sprints` `statuses` arrays at all -- so it
  is not "where prds/sprints statuses are already emitted," the coordinator's
  named target. It is also outside Allowed Paths. Left untouched; the only
  parity assertion between the two default-policy sources
  (`tests/create-project-dirs.runtime.test.ts:388-389`) covers
  `agentic_development.routing` specifically, not `active_plan`, so no
  regression risk from leaving it alone.
- **Missing-array fail-closed rationale.** `plan_status_known_values()`
  (new, in `assets/hooks/pre-edit-guard.sh`) reads
  `.ai/harness/policy.json`'s `active_plan.statuses[]` via `jq` and prints
  one status per line; it does not distinguish *why* the result is empty
  (missing file, missing `jq` binary, missing key, or an empty array) --
  every one of those collapses to "the authority is unavailable," which the
  caller treats as fail-closed with a distinct message
  ("Plan-status authority unavailable ... policy.json ... missing, empty,
  or unreadable") and `failure_class: missing_artifact`, separate from the
  "status not in the known set" message (`failure_class: state_violation`).
  This was a deliberate simplification: distinguishing the four underlying
  causes would need more logic in the guard for no behavioral benefit (all
  four require the same fix: restore the array), and the guard must not
  carry a second hardcoded list to reason about *why* jq returned nothing.
  Verified live: both "key absent" and "policy.json file absent entirely"
  fixtures produce the same authority-unavailable block
  (`tests/plan-status-gate.test.ts`).
- **One authority, no hardcoded list in the guard.** The three legacy
  scattered lists (`pre-edit-guard`'s own `Draft|Annotating` case arm,
  `validate_plan_transition`, `plan_terminal_status`) are untouched per the
  amendment -- converging them is explicitly follow-up work. The NEW default
  branch reads exclusively from `plan_status_known_values()`, which reads
  exclusively from `policy.json`; no status string is hardcoded a second
  time anywhere in the new code path.
- **Stop-2 resolution.** `docs/reference-configs/sprint-contracts.md` and
  `assets/reference-configs/sprint-contracts.md` were renamed together
  (`tool_calls` -> `runner_invocations`) with an identical edit to both,
  keeping them byte-identical (`tests/sprint-backlog.test.ts`'s "sprint
  asset parity" test reverified green). Also fixed the same line's stale
  claim that unenforceable budget dimensions are merely "advisory in the
  run manifest" -- that described the pre-fix silent-noop behavior this
  whole package removes; it now names the real enforce-or-reject split
  (`wall_time_minutes` mechanically enforced, `tokens` rejected at
  preflight).
- **New Stop Condition instance found while implementing Deliverable 2
  (unresolved, requires an Allowed-Paths amendment or a direct fix outside
  this dispatch): `tests/runtime-profile-enforcement.test.ts` has two
  fixtures (lines ~122 and ~287) that set an active plan's `Status` to the
  literal string `InProgress`, with a code comment explaining this was
  deliberately chosen as a status outside `{Draft, Annotating, Approved,
  Executing}` specifically *to exploit* pre-edit-guard.sh's old fail-open
  behavior on anything else -- isolating a `StrictContractGuard` assertion
  from an unrelated `missing_contract` blocker tied to Approved/Executing.
  2 of 113 tests in that file now fail
  (`bun test tests/runtime-profile-enforcement.test.ts`: 111 pass, 2 fail).
  This is not a defect in the new guard logic: the fixture's own status
  word is exactly the class of "plausible-looking but unrecognized" string
  the fix exists to catch.
  **Precise root cause (verified against the actual failure output, not
  assumed):** the block that actually fires is the *authority-unavailable*
  branch, not the *unrecognized-status* branch --
  `"...could not be checked against plan-status authority:
  .ai/harness/policy.json is missing, unreadable, or has no
  active_plan.statuses array."` This file's shared `initRepo()` helper
  (line ~23) writes a minimal policy.json (`{ hook_source, worktree_strategy
  }`) with no `active_plan.statuses` key at all, so *any* status reaching
  the new default branch in this file -- not just `InProgress` -- would
  currently hit "authority unavailable" first. The complete, verified-
  sufficient fix is therefore two parts at three sites, all in this one
  file: (1) add `active_plan: { statuses: [...13-value array...] }` to the
  shared `initRepo()`'s policy.json literal (one edit, benefits all 26
  tests in the file uniformly -- safe because no currently-passing test in
  the file exercises a status reaching the new branch, so none could be
  relying on the array's absence); (2) rename `InProgress` -> `Blocked` (or
  any known status outside `{Draft, Annotating, Approved, Executing}`) at
  the two specific fixture sites (~122, ~287). None of this changes either
  test's intent -- both still isolate the exact same `StrictContractGuard`
  assertion via a plan status that is real/current but not Draft/Annotating/
  Approved/Executing. This file is not in this contract's Allowed Paths, so
  the fix was not applied here; reported instead of silently editing
  outside scope or silently weakening the (correct) new guard behavior to
  make the old fixture pass.

## Design Decisions

- **Falsifier grep result (full observed `> **Status**:` inventory).** Ran the
  falsifier before any edit: `grep -rhoE '^> \*\*Status\*\*: .*' plans/` (active
  + `plans/archive/`) plus the equivalent for `tasks/contracts/`. Full plans/
  inventory (archive + active combined): Archived(46), Executing(37),
  Approved(12), Done(10), Draft(9), Complete(8), Completed(5), Superseded(4),
  Blocked(2), Review(1), Fulfilled(1), Abandoned(1). Restricting to
  non-archived `plans/*.md` (the population that can actually sit behind
  `.ai/harness/active-plan`) narrows to: Approved(10), Blocked(2), Complete(7),
  Completed(4), Draft(8), Executing(37), Fulfilled(1), Review(1).
- **Known-set authority I derived from, and why it is fragmented.**
  `get_plan_status` (`assets/hooks/lib/workflow-state.sh:260`) is a bare
  awk extractor with no enum of its own. Its callers encode the "known" plan
  statuses in three places that never share code: (1)
  `assets/hooks/pre-edit-guard.sh:238`'s own `Draft|Annotating` case arm
  (pre-existing, unchanged); (2) `validate_plan_transition` in the same
  `workflow-state.sh` file, whose case arms only ever mention `Draft`,
  `Annotating`, `Approved`, `Executing`; (3) `plan_terminal_status()` in
  `scripts/check-task-workflow.sh:371` (`Complete|Completed|Done|Fulfilled|
  Archived|Abandoned|Superseded`) plus that same script's inline
  `"$plan_status" == "Approved" || "$plan_status" == "Executing"` check.
  `.ai/harness/policy.json` has a formal `"statuses": [...]` array for `prds`
  and `sprints` but **none for plans** -- confirming the gap is structural,
  not an oversight in my search. Neither `workflow-state.sh` nor
  `check-task-workflow.sh` is in this contract's Allowed Paths, so even if I
  wanted to centralize these into one cross-file authority I could not (and
  Scope only asked for a change inside `pre-edit-guard.sh`).
- **Deliverable 2 (pre-edit-guard.sh fail-closed default) NOT implemented --
  Falsifier/Stop Condition hit, reported per contract instruction.** Union of
  the three fragments above = 11 known statuses (Draft, Annotating, Approved,
  Executing, Complete, Completed, Done, Fulfilled, Archived, Abandoned,
  Superseded). Real, currently non-archived `plans/*.md` files use two
  statuses outside that union: `Blocked` (2 files:
  `plan-20260711-0219-codex-native-role-model-override.md`,
  `plan-20260711-1034-chatgpt-coding-mcp-live-canary.md`) and `Review` (1
  file: `plan-20260529-0004-capability-context-cli-hook.md`). Neither string
  appears in `validate_plan_transition`'s case arms, `plan_terminal_status`,
  `.ai/harness/policy.json`, or any `docs/reference-configs/` lifecycle
  description -- there is no code or doc authority that already knows them.
  `validate_plan_transition` is a denylist of specific bad transitions, not
  an allowlist, so nothing in the existing transition guard actually forbids
  a human from writing `Blocked` by hand; both hits read as deliberate,
  human-authored pause signals, not typos. Per the contract's Falsifier
  ("if statuses appear that the status authority does not know, stop and
  report -- the authority list, not the guard, needs the decision first")
  and Stop Condition ("Stop if the known-good plan-status set cannot be
  derived from one existing authority without inventing a second list"), I
  stopped on this one deliverable rather than picking an interpretation
  unilaterally. The two live resolutions are materially different results,
  not just an enumeration nit: (a) add `Blocked`/`Review` to the fail-closed
  bucket (same treatment as an unrecognized status), or (b) add them to the
  existing `Draft|Annotating` block-with-today's-message bucket (since a
  Blocked/Review plan arguably should not silently allow edits either, but
  the correct *reason* to surface differs from "unrecognized/possibly
  corrupted"). Both are defensible; neither is provably what the repo owner
  intended, and shipping the wrong one on a P0 correctness package trades
  one fail-open/fail-wrong-message bug for another. `tests/plan-status-gate.md`
  fixtures were not created for the same reason.
  Everything else in Deliverables 1/3/4/5/6 has zero dependency on this
  question and was completed and verified.
- **Deliverable 1 (prompt-guard-decision.ts `unknown` branch) is unrelated to
  the blocked question above and was implemented.** `PROMPT_GUARD_PLAN_STATES`
  is a small closed 8-value TS union (`none|stale_marker|foreign_worktree|
  draft|annotating|approved|executing|unknown`); the bash caller
  (`assets/hooks/prompt-guard.sh:434`) already buckets *any* status besides
  the four literal names into `unknown` via a `case ... *) ... unknown` arm
  -- classification was never in question, only the resulting *action*. The
  `unknown` execution-table row moved from `() => 'allow'` (four intents) to
  `() => decideDraftPlanAction(intent)`, exactly mirroring what `annotating`
  already does. This was the smallest change that satisfies "conservative
  advisory/orientation action": it reuses an existing action
  (`plan_status_not_approved_block` / `plan_capture_draft_advice`) and
  existing bash rendering rather than inventing a new `PromptGuardAction`
  member, new message, or new bash case arm. Confirmed advisory-only:
  `render_prompt_guard_action` in `assets/hooks/prompt-guard.sh` exits 0 on
  every branch (comment at line 969-971) -- the hard block still lives only
  at the edit boundary, which for `unknown` remains the Deliverable-2 gap
  above (today's pre-edit-guard.sh silently allows implementation edits
  when the active plan's status is anything other than Draft/Annotating).
- **contract-run.ts rejection-message design.** Each of the three
  unenforceable constraints (`tokens`, `network`, `writable_paths`) gets its
  own issue string naming the exact field path (`budget.tokens`,
  `permission_scope.network`, `permission_scope.writable_paths`), the
  observed value, *why* it can't be honored ("contract-run has no
  token-budget enforcement mechanism" / "cannot restrict network access
  beyond the inherited environment" / "does not enforce a writable-path
  boundary narrower than allowed_paths"), and the fix (set to
  null/'inherited'/empty). All non-null/non-default constraints are
  collected together (not fail-fast on the first one) so one preflight run
  surfaces every problem in the contract at once, matching the existing
  `baseIssues`/`rootCauseIssues` concatenation pattern. The retired
  `tool_calls` field gets a distinct `failure_class`
  (`legacy_delegation_field`, vs `unenforceable_delegation_constraint` for
  the other three) because the remediation is different in kind (rename the
  key vs. change/remove the value) and because silently parsing `tool_calls`
  as an absent `runner_invocations` would drop the author's intended limit
  without any signal -- worth a sharper, separately-labeled failure than a
  generic constraint rejection.
- **wall_time_minutes enforcement mechanism.** Rides the existing bounded
  process runner (`scripts/run-bounded-verifier-command.ts`, invoked as a
  sibling via `SCRIPT_DIR` so it resolves correctly from both the canonical
  `scripts/contract-run.ts` and the projected
  `assets/templates/helpers/contract-run.ts`) rather than adding a bare
  `spawnSync({timeout})`: the bounded runner's SIGTERM-then-SIGKILL,
  process-group-aware termination is what actually reaps descendants a
  shell-spawned worker/verifier command may leave behind, which
  `spawnSync`'s native `timeout` (kills only the immediate child, no
  process-group semantics) does not guarantee. One shared deadline is
  computed once per `run` (not per child) and passed to both the worker and
  verifier `runChild` calls, bounding the whole delegated task's wall clock
  rather than each child individually, matching how
  `verify-contract.sh` computes one `verification_deadline_ms` for its
  whole pass. Trade-off accepted: routing through the bounded runner merges
  stdout+stderr into one log file (the wrapper's own process-group kill
  logic needs a single stream) instead of the unbounded path's separate
  stdout/stderr files; no existing test asserted on that separation, and a
  `timed_out` field plus a distinct `wall_time_exceeded` failure_class were
  added so a deadline miss reads as a named enforcement outcome instead of a
  generic `worker_failed`/`verifier_failed`. Verified live (not just
  type-checked): a worker with `sleep 10` under `wall_time_minutes: 0.03`
  (~1.8s) was actually SIGTERM'd before it could write its output file or
  finish sleeping (see `tests/contract-run.test.ts`'s
  "run enforces wall_time_minutes..." test and the manual scratch probe
  recorded in this session: `worker.bounded-result.json` showed
  `"signal":"SIGTERM"`, empty stdout, and no leftover `sleep` process).
- **`docs/reference-configs/sprint-contracts.md` prose left unrenamed --
  second, narrower Stop Condition hit.** This file is one of the three docs
  named in Scope for the rename ripple and its `budget: ... tool_calls ...`
  sentence is genuinely stale after this change (it also still describes the
  pre-fix "otherwise advisory" silent-noop semantics). It is NOT edited here:
  `assets/reference-configs/sprint-contracts.md` is a byte-identical mirror
  enforced by `tests/sprint-backlog.test.ts`'s "sprint asset parity" test
  (`toBe()` against the two files' raw content), and that mirror path is
  outside this contract's Allowed Paths, as is `tests/sprint-backlog.test.ts`
  itself. There is no `sync:*` command that projects `docs/reference-configs/`
  -> `assets/reference-configs/` (only `sync:hooks` and `sync:helpers` exist,
  neither targets this pair). Editing only the `docs/` side would desync the
  pair and fail that parity test -- a regression in a test outside this
  contract's named surfaces, which Stop Conditions explicitly forbid.
  `docs/reference-configs/contract-brief-example.md` and
  `contract-brief-example-bugfix.md` have no such mirror (confirmed: no
  matching filenames under `assets/reference-configs/`) and were renamed
  normally, including fixing `contract-brief-example.md`'s
  `network: off` -> `network: inherited` (it is exercised by contract-run.ts's
  own "golden example contract brief passes its own preflight gate" test, so
  `off` would have started failing preflight under the new enforce-or-reject
  behavior).
- **`tests/helper-scripts.test.ts:3852`'s `tool_calls: 20` left as-is.** That
  fixture belongs to "verify-contract should ignore delegation metadata
  before exit criteria" -- the test's own point is that `verify-contract.sh`
  never parses the Delegation Contract block at all, so the literal field
  name inside it is inert for that test regardless of spelling. Scope's
  "tests/helper-scripts.test.ts (+ where it pins the old name)" qualifier
  reads as covering only assertions that actually depend on the name; this
  one does not, so it was left untouched rather than making an unrequested
  edit.
- **Golden outcome (round 1, before Deliverable 2): unchanged, not
  regenerated.** `bun test tests/hook-runtime-characterization.test.ts`
  passed clean (1 pass, 0 fail, 14 expect() calls) with no diff against the
  frozen golden. Expected: Deliverable 2 was not yet implemented; the
  `prompt-guard-decision.ts` change only touches the `unknown` bucket's
  action mapping, which the characterization fixture repo's plan statuses
  do not appear to exercise; `contract-run.ts` is an unrelated code path.
- **Golden outcome (round 2, after Deliverable 2): still unchanged, not
  regenerated.** Re-ran `bun test tests/hook-runtime-characterization.test.ts`
  after implementing the `pre-edit-guard.sh` fail-closed default branch: 1
  pass, 0 fail, 14 expect() calls, no diff. Confirmed by reading the
  fixture builder (`tests/hook-runtime-characterization.test.ts:162-186`
  `buildFixtureRepo()`), not just by the test passing: it writes only a
  bare git repo, a copied `.ai/hooks/`, and an empty
  `.ai/harness/workflow-contract.json` -- no `docs/spec.md`, no
  `.ai/harness/policy.json`, no `.ai/harness/active-plan` marker, no plan
  file at all. For the `PreToolUse.edit` route (`src/example.ts`), the
  missing `docs/spec.md` trips the pre-existing `SpecGuard` check inside
  `run_edit_plan_gate` before the function ever reaches the
  `gate_status`/`case` logic my new default branch lives in, so the new
  code path is structurally unreachable by this fixture regardless of
  `WORKFLOW_PROFILE` resolution -- not a coincidence, a direct consequence
  of the fixture never getting far enough to hit it. No
  `UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN=1` regeneration was needed
  or run in either round.

## Deviations From Plan Or Spec

- (round 1, resolved in round 2) Deliverable 2 was initially not
  implemented pending an owner decision on the known-status authority --
  see Falsifier finding above. The owner resolved it (Option A: `Blocked`/
  `Review` join the known-good set via a new `.ai/harness/policy.json`
  `active_plan.statuses` array) and the contract was amended with two new
  Allowed Paths; Deliverable 2 is now fully implemented (see "Resumption"
  section above) and no longer a deviation.
- (round 1, resolved in round 2) `docs/reference-configs/sprint-contracts.md`
  was initially left unedited because its byte-parity mirror
  (`assets/reference-configs/sprint-contracts.md`) and the parity test
  (`tests/sprint-backlog.test.ts`) were both outside Allowed Paths. The
  contract was amended to add the mirror file to Allowed Paths; both files
  were renamed together in round 2 and the parity test stays green. No
  longer a deviation.
- (round 2, resolved in round 3) `tests/runtime-profile-enforcement.test.ts`
  had two fixtures (`InProgress` plan status, ~lines 122 and 287) plus a
  shared `initRepo()` policy.json fixture (~line 23) with no
  `active_plan.statuses` key; together these depended on
  pre-edit-guard.sh's old fail-open behavior on any non-Draft/Annotating
  status. The contract was amended to add this file to Allowed Paths; the
  3-site fix diagnosed in round 2 (`active_plan.statuses` added to
  `initRepo()`, both `InProgress` sites renamed to `Blocked`) was applied
  in round 3 -- see the round-3 "Resumption" section above. `bun test
  tests/hook-runtime.test.ts tests/hook-contracts.test.ts
  tests/runtime-profile-enforcement.test.ts` is 113/113. No longer a
  deviation.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Guess a known-status resolution for `Blocked`/`Review` and ship Deliverable 2 anyway | Rejected | Falsifier and a Stop Condition both explicitly name this exact scenario as an owner decision, not an executor judgment call; the two live resolutions produce materially different user-facing behavior |
| Route `wall_time_minutes` through bare `spawnSync({timeout})` instead of the bounded runner | Rejected | Does not reap the whole process group; the Stop Condition explicitly frames this as "ride the existing bounded runner ... [not] new process machinery" |
| Hand-edit `assets/reference-configs/sprint-contracts.md` to keep the mirror in sync | Rejected | Outside Allowed Paths; would itself violate the "edit only Allowed Paths" hard constraint even though it would restore a *different* test's parity |
| Add a new `PromptGuardAction` for the `unknown` branch instead of reusing `decideDraftPlanAction` | Rejected | Reusing the existing draft/annotating advisory path is the smaller diff, needs no new bash rendering, and already matches "conservative advisory/orientation action" |
| Place the new `statuses` array under `guards` instead of `active_plan` | Rejected | `guards` configures gate *mode* (enforce/advice/off); `active_plan` already owns the plans/ location fields `prds`/`sprints` mirror with their own `statuses` arrays -- same shape, same axis |
| Silently swap `InProgress` -> `Blocked` in `tests/runtime-profile-enforcement.test.ts` to keep it green | Rejected | File is outside this contract's Allowed Paths; editing it without authorization would violate the same hard constraint that gated the sprint-contracts.md and policy.json work until the contract was amended |
| Weaken the new default branch (e.g. skip it under `WORKFLOW_PROFILE=strict`) to avoid preempting `StrictContractGuard` | Rejected | Not a real fix -- `InProgress` is exactly the "plausible but unrecognized" class of status the fix exists to catch; narrowing the guard's applicability to dodge one test would reintroduce a fail-open gap for that profile |

## Open Questions

- (Resolved in round 3: `tests/runtime-profile-enforcement.test.ts` was
  added to Allowed Paths and the 3-site fix was applied; 113/113.)
- Should `docs/reference-configs/sprint-contracts.md` and
  `assets/reference-configs/sprint-contracts.md` gain a `sync:*` command (or
  the parity test move) so this class of doc update does not keep hitting
  the Allowed-Paths wall in future packages? (Resolved for this package by
  the Stop-2 Allowed-Paths amendment, but the structural gap remains.)
- Follow-up (explicitly out of scope per the amendment): converge the three
  legacy scattered plan-status lists (`pre-edit-guard`'s own
  `Draft|Annotating` arm, `validate_plan_transition`, `plan_terminal_status`)
  into projections of `.ai/harness/policy.json`'s `active_plan.statuses`,
  so there is truly one authority repo-wide instead of one authority for
  the new fail-closed branch plus three untouched legacy copies.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Ship-Boundary CI Fix (round 4)

Full-suite CI failed on `tests/state/loop-semantics-characterization.test.ts`
(`standard.edit` cell: expected allow/exit 0, got PlanStatusGuard/exit 2) — a
coverage gap: no dispatch round ran `tests/state/`. Root cause: `prepare()`
fixture repos carry no `.ai/harness/policy.json`, so the new
authority-unavailable branch fires. Guard ordering (`plan_gate` before
`strict_contract`) means every non-lite edit cell traverses the status case.
Fix (contract AMENDMENT, ship-boundary): fixture gains a minimal policy with
only `active_plan.statuses` (13 values, copied from the live authority) —
adopted repos always carry the policy file, so the omission was fixture
minimalism, not frozen semantics. Frozen characterization JSON came back
byte-identical (21/21 expects, no regeneration). `state-concurrency`'s single
local ENOENT was classified as host-load flake: passes on main and on
re-run in this worktree, and CI never failed it.

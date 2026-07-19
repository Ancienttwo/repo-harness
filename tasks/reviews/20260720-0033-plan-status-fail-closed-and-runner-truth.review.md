# Task Review: plan-status-fail-closed-and-runner-truth

> **Status**: Complete
> **Plan**: plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md
> **Contract**: tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md
> **Notes File**: tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-20 (Round 1 acceptance after three implementation rounds; external slot per standing chain instruction)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:a774794dabca6fe5d07c378ee625ab1d6db7d0742cd4173d77466b4762bbcdd1
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a1481a866ba3c1fddee73f4baf1cfebe169381bb

## Human Review Card

- Verdict: pass
- Change type: code-change (deliberate behavior change: fail-open → fail-closed; parity was explicitly not the criterion)
- Intended files changed: the two audited P0 fixes — fail-closed plan-status
  authority (policy array + guard default branch + prompt-layer advisory)
  and truthful runner constraints (wall-time enforcement, unenforceable-
  constraint rejection, `runner_invocations` rename) — plus the rename
  ripple across templates/scaffolds/docs mirrors and the envelope.
- Actual files changed: 27 files (+882 −108), every one inside Allowed
  Paths across all three implementation rounds (two contract amendments
  recorded in Scope). Forbidden surfaces empty-diff: `runtime.ts`,
  `route-registry.ts`, `src/core/loop/`, `src/effects/loop/`, the HRD-01
  characterization test and golden. Historical contracts and the research
  audit text not rewritten.
- Commands passed: group A 187 pass / 0 fail (prompt-guard-decision,
  contract-run, helper-scripts, plan-status-gate ×21, characterization);
  hook group 113 pass / 0 fail; sprint-backlog parity 23 pass; broad
  `tests/cli/` 431 pass / 1 pre-existing win32 skip / 0 fail; `check:type`,
  `check:hooks`, `check:helpers`, `check:state-boundaries` green — all in
  both the worker and the independent gatekeeper session. Live probes:
  unknown status `Bananas` → exit 2 structured block; `Blocked` → exit 0;
  empty statuses array → exit 2 authority-unavailable; sleep-10 worker
  SIGTERM'd under a 1.8s `wall_time_minutes` deadline (`wall_time_exceeded`).
- Residual risks: (1) post-merge, re-running `contract-run preflight`
  against older non-archived contracts still carrying `tool_calls` fails
  closed — intended one-shot semantics ("records, do not rewrite"); no
  workflow re-runs preflight on closed contracts, but operators should know.
  (2) The three legacy status lists (`Draft|Annotating` case arms,
  `validate_plan_transition`, `plan_terminal_status`) remain deferred
  convergence targets — recorded follow-up, not this slice. (3) The
  prompt-layer unknown-status advisory reuses draft wording; the edit-layer
  message carries the exact repair path.
- Reviewer action required: none for the reviewed subject; ship as an
  independent PR against `main` from base `8254b239`.
- Rollback: revert the single PR; guard, policy array, parser, templates,
  docs mirrors, and test fixtures revert as one unit; no data migration.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/plan-status-fail-closed-and-runner-truth` from exact execution
  base `8254b239` (post-HRD-02 close plus P0 promotion), sequenced between
  HRD rows per the contract header.
- P1/P2/P3 evidence: plan Problem section carries the 2026-07-20 source
  re-verification (file:line) of both audit P0s; contract Design Decisions
  pin edit-layer-hard/prompt-layer-advisory, enforce-or-reject, one-shot
  rename, and golden handling.
- Root cause or plan evidence: falsifier-first — the pre-edit status
  inventory found `Blocked`×2/`Review`×1 on real plans outside every code
  authority, exactly the designed stop; the owner decision (policy.json
  `active_plan.statuses`, 13 values) resolved it before the guard was
  written.

## Verification Evidence

- Waza `/check` run: orchestrator session 2026-07-20; scope on target
  across three rounds, hard stops 0, key diffs read directly (guard
  authority functions, fail-closed branches, rejection machinery).
- Commands run: the full battery above; independent gatekeeper re-ran all
  suites plus live fixture probes and the isolated wall-time kill test;
  `pi_write_harness_policy` invoked live to prove default emission.
- Manual checks: see Manual Check Evidence below.
- Supporting artifacts: `tests/plan-status-gate.test.ts` (21 fixtures
  including per-status pass-through and both authority-unavailable
  closures); mirror byte-identity proven by `cmp` on all four pairs.
- Implementation notes reviewed: yes — falsifier inventory, authority
  provenance, both Stop Condition write-ups and resolutions, rejection-
  message design, bounded-runner choice, golden structural reasoning.
- Run snapshot: `.ai/harness/checks/latest.json` (verify-contract, this
  worktree).

## Manual Check Evidence

- [x] Every non-null delegation constraint is enforced or rejected at preflight
  - Evidence: `wall_time_minutes` mechanically enforced via the bounded runner (sleep-10 worker killed in 2.35s under a 1.8s deadline, `failure_class: wall_time_exceeded`); `runner_invocations` limit enforced via `consume()`; non-null `tokens`, non-`inherited` `network`, non-empty `writable_paths` rejected with `unenforceable_delegation_constraint` naming each constraint; legacy `tool_calls` rejected with `legacy_delegation_field`. Negative probes run in-session with exit 1 and named messages.
- [x] Characterization golden outcome is documented as unchanged or one-shot regenerated with the exact cell delta
  - Evidence: unchanged — `git diff 8254b239..a1481a86 -- tests/fixtures/loop-runtime/characterization.json` is empty; structural reason verified twice (fixture repo writes only README.md, so SpecGuard terminates the PreToolUse.edit cell before the new branch is reachable) and recorded in the notes file.

## External Acceptance Advice

> **External Acceptance**: waived (user standing instruction for the continuous chain run, 2026-07-20)
> **External Reviewer**: none — Codex quota remains exhausted until 2026-08-16 (verified on HRD-01, `codex exec` refused by provider usage limit); no second AI host available
> **External Source**: user waiver (actor: kito; standing in-session instruction 2026-07-20; precedent: `5b3a2693` and the HRD-01/HRD-02 waivers). Substitute internal evidence: fresh-context Claude gatekeeper PASS with live probes, plus merge-gate and CI at the ship boundary
> **External Started**: 2026-07-20
> **External Completed**: 2026-07-20 (waiver recorded; not a Codex review)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:a774794dabca6fe5d07c378ee625ab1d6db7d0742cd4173d77466b4762bbcdd1
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a1481a866ba3c1fddee73f4baf1cfebe169381bb
> **Benchmark Evidence SHA256**: not_applicable

- P1 blockers: none. Gatekeeper verdict PASS — scope fit (27 files all in
  allowed paths), full battery re-run independently, live fail-closed
  probes, wall-time kill verified end-to-end (absolute-epoch deadline
  convention cross-checked against `run-bounded-verifier-command.ts:111`
  and `verify-contract.sh:633`), single-authority hard stop held (guard
  reads only the policy array), all four mirror pairs byte-identical.
- P2 advisories: todos timestamp churn (cosmetic); legacy-`tool_calls`
  contracts fail preflight post-merge (intended, operational note);
  prompt-layer advisory wording reuses draft phrasing; full `bun test`
  deferred to the CI ship boundary.
- Acceptance checklist: audit slice-1 clauses all hold — unknown/malformed
  blocks ✓ (matrix + live probe), every non-null constraint enforced or
  rejected ✓, safety tests green ✓; falsifier chain: inventory → owner
  decision → 13-value authority; observed values ⊂ authority, so the block
  cannot fire on this repo's healthy history ✓; fail-open survivors in the
  plan-status gate: none ✓.

## Behavior Diff Notes

- Deliberate behavior changes, each fixture-pinned: unknown/malformed plan
  status now blocks implementation edits (was: silent pass-through);
  prompt-layer unknown bucket now advises conservatively (was: allow ×4);
  `wall_time_minutes` now kills over-deadline runners (was: parsed no-op);
  unenforceable non-null constraints now fail preflight (was: silent);
  `tool_calls` now errors (was: the live field name). Known-good statuses,
  Draft/Annotating gating, lite-profile scope-outs, and advice/off modes
  unchanged.

## Residual Risks / Follow-ups

- Converge the three legacy status lists into projections of the policy
  authority (deferred follow-up, not this slice).
- Operational note on legacy-`tool_calls` contracts above.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both audit P0s closed with live-probe evidence; falsifier chain executed as designed |
| Product depth | 9/10 | Authority-unavailable itself fails closed; per-status matrix; end-to-end kill test |
| Design quality | 9/10 | Single authority honored (zero hardcoded list in the guard); enforce-or-reject honesty; three-round stop discipline |
| Code quality | 8/10 | Clean; prompt-layer advisory wording nit and deferred list convergence noted |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/cli/prompt-guard-decision.test.ts tests/contract-run.test.ts tests/helper-scripts.test.ts tests/plan-status-gate.test.ts tests/hook-runtime-characterization.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/runtime-profile-enforcement.test.ts && bun run check:type && bun run check:hooks && bun run check:helpers && bun run check:state-boundaries`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md --strict`

## Summary

- The two audited P0 correctness defects are closed: plan-status authority
  is a single 13-value policy array with fail-closed enforcement at the
  edit boundary (authority-unavailable included), and every delegation
  constraint is now either mechanically enforced or rejected under the
  honest `runner_invocations` name with no alias. Three implementation
  rounds, two contract amendments, owner decision on the status authority,
  gatekeeper PASS with live probes. Fit to ship as an independent PR from
  base `8254b239`; HRD-03 pins the post-merge SHA.

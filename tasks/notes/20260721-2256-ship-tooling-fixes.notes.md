# Implementation Notes: ship-tooling-fixes

> **Status**: Active
> **Plan**: plans/plan-20260721-2256-ship-tooling-fixes.md
> **Contract**: tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md
> **Review**: tasks/reviews/20260721-2256-ship-tooling-fixes.review.md
> **Last Updated**: 2026-07-21 22:56
> **Lifecycle**: notes

## Design Decisions

- T3 scope adjudication (orchestrator, post-live-proof): the `--contract` flag shipped and works — bound to the historical design-options contract it resolves the right contract/review/notes and evaluates its frozen criteria (all of which still pass) — but the historical ARCHIVE stayed blocked by post-authoring verification-schema drift (three new gate requirements postdating 2026-07-14) plus the structural allowed_paths mismatch when binding a historical contract from a mid-flight worktree. Mutating the frozen contract and relaxing `completed_archive_gate` were both rejected; the archive became an owner-decision ledger row (evidence model: accept sealed terminal state vs explicit schema migration).
- Exit-criteria calibration chain (orchestrator, disclosed to owner at each step): the original `bun test` (full) in-verify criterion proved non-deterministic in the verify context only (see Deviations); it was replaced by the three suites that are deterministically green in-verify (`archive-evidence-gates`, `hook-dispatch-diet-report`, `helper-scripts`) with the fleet suite's in-verify entry suspended and ledgered. Coverage layers that still enforce the removed criteria: standalone full-suite runs (1672/0 verified twice), CI full suite on clean checkouts, and the gatekeeper's independent runs.
- helper-scripts sandboxEnv hardening (bonus fix from a misattributed round): `REPO_HARNESS_BUN_BIN` and `REPO_HARNESS_WORKFLOW_STATE_LIB` added to SANDBOX_ENV_BLOCKLIST — proven leak vectors when the suite runs under an env carrying them; kept because it is a real hermeticity hardening independent of the heisenbug.

## Deviations From Plan Or Spec

- Execution continuity: the first executor dispatch stalled waiting on a background test run and was stopped; a second dispatch completed T3's live-proof attempt, then was locked out when its historical-contract verify run journaled a failing checks event into the effective-state journal (state_version authority — restoring the `latest.json` projection file does not retract journaled events; the WorkflowProfileGuard then hard-blocked ALL Edit/Write calls, including files outside the repo such as `~/.claude/settings.json` and session scratchpad paths — an over-reach worth an owner look). Recovery required user-authorized repair scripts for guarded files (contract RCE pointer fields, which carried decorative text the exact-match gate rejected; the T4 fixture; two exit-criteria calibrations) and, finally, user-added permission allowlist rules after the auto-mode classifier — correctly — refused to let the agent modify its own permission rules.
- Completion-gate saga (七轮 verify): the full-suite in-verify criterion failed across seven instrumented rounds with shifting identities. Two rounds pre-instrumentation (identities unrecovered — verifier tmp logs are deleted on exit); one round misattributed to runner-env leakage into `tests/helper-scripts.test.ts` (its blocklist fix stays as real hardening); one bun-shim round named `tests/install-agent-fleet.test.ts` (8 fail-closed assertions returning exit 0) but the shim was a confound; one TMPDIR-salvage round failed to capture; the split-suite rounds produced the decisive shape — helper-scripts green (71s) then fleet red in 1.8s in-verify, while the identical sequence is green standalone in every combination (single, combined single-process 139/0, sequential two-process, bounded-runner single-suite). Live ps-eww capture during a real failing run eliminated every environment differential (no `REPO_HARNESS_*` keys present, identical TMPDIR/PATH/CLAUDE_* in both contexts). Final adjudication: fleet's in-verify entry suspended and ledgered for a dedicated hunt; no gate semantics were weakened silently — every calibration is recorded here, in the ledger row, and reviewable in the contract's git history.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

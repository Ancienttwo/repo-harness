# Task Review: hrd-01-loop-event-protocol-and-runtime-characterization

> **Status**: Complete
> **Plan**: plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md
> **Contract**: tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md
> **Notes File**: tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-19 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:68119c75169b39c1976c7b6cd0b3eba4a62c94309001a4f58a72d082f5efa8a1
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 4b6db231ca4bb4f52d58e7319ebbcbd1a8ae3b71

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: pure `LoopEvent`/`LoopEventResult` protocol module
  with a total 11-tuple route mapping, its totality/purity test, the
  per-route runtime characterization harness and frozen golden for all 11
  public routes, the HRD-01 execution-base pin in the sprint header, and the
  HRD-01 workflow envelope.
- Actual files changed: 10 files (+1616 −2), all within allowed_paths — 4 new
  deliverable files, 4 envelope files, the one-line sprint header pin, and a
  timestamp-only `tasks/todos.md` touch from start-task tooling. Production
  paths (`.ai/hooks/`, `assets/hooks/`, `src/cli/hook/runtime.ts`,
  `src/cli/hook/route-registry.ts`, `scripts/`) have empty diffs; no
  existing test or golden changed value.
- Commands passed: `bun test tests/loop-event-protocol.test.ts
  tests/hook-runtime-characterization.test.ts` → 5 pass / 0 fail /
  42 expects; `bun run check:type` clean; `bun run check:state-boundaries`
  OK (109 files); `bun run check:hooks` projection OK
  (sha256:98540230…, byte-identical to pre-package state); gatekeeper
  re-ran the same battery independently plus a determinism double-run of the
  characterization test with a clean golden afterward.
- Residual risks: `PostToolUse.always` → `command_observed` is a modeling
  compromise under the fixed 8-kind union (trace route observes all tools);
  the fixture repo is deliberately minimal-adoption, so the frozen baseline
  characterizes that environment (PreToolUse.edit freezes a real SpecGuard
  block, exit 2); each route is characterized on one host with
  `host_exercised` recorded as data. All three recorded in the notes file as
  successor context for HRD-02..09.
- Reviewer action required: none for the reviewed subject; ship as the
  independent HRD-01 PR against `main` from base `4f4666ef`.
- Rollback: revert the independent HRD-01 PR; the package adds four
  deliverable files plus envelope and touches no production path — no
  migration to unwind.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/hrd-01-loop-event-protocol-and-runtime-characterization` from exact
  execution base `4f4666ef` (post-sprint-planning push).
- P1/P2/P3 evidence: the calibrated contract bounds the row to
  protocol + characterization only (zero consumers, no cutover), pins the
  normalization limit to path/time/PID, and routes the sprint-header pin
  through this branch per the LSC successor-pin precedent.
- Root cause or plan evidence: falsifier-first — the three least-obvious
  route cells (`PostToolUse.always`, `SubagentStart.context`,
  `SubagentStop.quality`) mapped onto the 8 audit kinds with zero
  host-specific branches before the harness was built
  (`src/core/loop/loop-event-protocol.ts:132-144`).

## Verification Evidence

- Waza `/check` run: standard depth, orchestrator session 2026-07-19; scope
  on target, hard stops 0, advisories 2 (recorded under Residual risks).
- Commands run: the contract battery above, re-run in the review session
  (5 pass / 0 fail; check:type / check:state-boundaries / check:hooks all
  green), then `repo-harness run verify-contract --strict` → 10/13 PASS with
  the 3 review-gate items pending exactly this card.
- Manual checks: "Evaluator review file recommends pass" — this card,
  Recommendation: pass. "Diff outside the four new files touches only workflow envelope artifacts and the sprint header pin" —
  confirmed via `git diff 4f4666ef..4b6db231 --stat` per-file readback.
- Supporting artifacts: `tests/fixtures/loop-runtime/characterization.json`
  (11 routes, `execution_base: 4f4666ef…`, schema
  `repo-harness-loop-runtime-characterization.v1`).
- Implementation notes reviewed: yes — route→kind rationale, subprocess
  capture architecture, PATH-stub classify-not-log-argv design, jq
  non-normalization decision, determinism engineering, minimal-fixture
  choice.
- Run snapshot: `.ai/harness/checks/latest.json` (verify-contract, this
  worktree).

## External Acceptance Advice

> **External Acceptance**: waived (user override, one-shot for HRD-01 only)
> **External Reviewer**: none — cross-model Codex review was attempted 2026-07-20 (`codex exec` read-only, session 019f7b29-251b-71a1-a971-7902871d098e) and refused by the provider usage limit (quota exhausted until 2026-08-16); no second AI host was available, the exact solo-operator gap already recorded in `tasks/todos.md`
> **External Source**: user waiver (actor: kito, decided 2026-07-20 in-session; precedent: `5b3a2693` external-acceptance waiver). Substitute internal evidence retained below: fresh-context Claude gatekeeper PASS plus merge-gate PASS and CI 8/8 on PR #94
> **External Started**: 2026-07-20
> **External Completed**: 2026-07-20 (waiver recorded; not a Codex review)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:68119c75169b39c1976c7b6cd0b3eba4a62c94309001a4f58a72d082f5efa8a1
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 4b6db231ca4bb4f52d58e7319ebbcbd1a8ae3b71
> **Benchmark Evidence SHA256**: not_applicable

- P1 blockers: none. Verdict PASS — scope fit (10 files all in allowed
  paths, production surfaces empty-diff), full battery re-run
  independently, determinism double-run with clean golden, zero consumers
  confirmed by grep, totality via typechecked tuples plus live-`ROUTES`
  cross-check, `LoopEvent` union matches audit §6 verbatim.
- P2 advisories: (1) `LoopEventResult` omits the audit draft's
  state/readiness/contextPacket/checkpoint fields — conforms to this
  contract's In-scope list; HRD-02 is the natural extension point.
  (2) One host per route in the baseline (`host_exercised` as data); full
  host×route parity is deferred to cutover rows that claim host-agnostic
  parity. (3) Fixture builds `.ai/hooks` from `assets/hooks/`; `check:hooks`
  confirms that projection matches the live runtime, so the baseline
  characterizes the shipped source of truth.
- Acceptance checklist: scope ✓, verification ✓, determinism ✓,
  falsifier survived ✓ (host carried as event data, zero host-specific
  branches), behavior-inertness ✓.

## Manual Check Evidence

- [x] Diff outside the four new files touches only workflow envelope artifacts and the sprint header pin
  - Evidence: `git diff 4f4666ef..4b6db231 --stat` per-file readback — 4 new deliverable files, 4 workflow envelope files, the one-line sprint header pin, and a timestamp-only `tasks/todos.md` tooling touch; `.ai/hooks/`, `assets/hooks/`, `src/cli/hook/runtime.ts`, `src/cli/hook/route-registry.ts`, and `scripts/` all have empty diffs.

## Behavior Diff Notes

- Behavior-inert package: no production path changed; the frozen fixture is
  new evidence, not a behavior change. The recorded baseline itself is the
  deliverable: per-route script sequence, child-invocation counts
  (SessionStart 23 git + 3 CLI; Stop 28 git + 2 CLI + 8-path write set),
  decision/exit codes (PreToolUse.edit exit 2 SpecGuard block), and
  durable-write sets for all 11 routes at `execution_base 4f4666ef`.

## Residual Risks / Follow-ups

- The three P2 advisories above, all recorded in the notes file as HRD-02..09
  successor context. No open blocker.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Acceptance line fully held; verified twice (worker + independent gatekeeper) |
| Product depth | 8/10 | Baseline captures blocking and heavyweight routes, not just happy paths |
| Design quality | 9/10 | Purity proven by subprocess test; determinism engineered at input side, not normalized after |
| Code quality | 9/10 | Typed totality, no second route authority, normalization tightly scoped with named constants |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/loop-event-protocol.test.ts tests/hook-runtime-characterization.test.ts && bun run check:type && bun run check:state-boundaries && bun run check:hooks`
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md --strict`

## Summary

- HRD-01 delivers the host-neutral LoopEvent protocol (pure, zero
  consumers, total over the 11 public routes) and freezes the current
  runtime baseline as characterization fixtures. Review pass + independent
  gatekeeper acceptance pass; fit to ship as the independent HRD-01 PR from
  base `4f4666ef`.

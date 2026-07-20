# Implementation Notes: hrd-06-stop-handler-slim

> **Status**: Active
> **Plan**: plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
> **Contract**: tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md
> **Review**: tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md
> **Last Updated**: 2026-07-21 01:10 (implementation and internal verification complete; external acceptance pending)
> **Lifecycle**: notes

## Pre-Enumeration Gate (read-only `explorer` sweep, FINDINGS: COMPLETE)

`assets/hooks/stop-orchestrator.sh` (812 lines; `.ai/hooks/` copy byte-identical)
responsibilities by line range, in execution order:

1. `refresh_handoff()` (597-600, called 768) — unconditional handoff+resume write, BEFORE state resolution.
2. `stop_resolve_state()` (633-716) — memoized `state resolve --json --operation inspect` subprocess; parses `.workflow_profile` and `.readiness.{allowedToStop,readyToShip,nextAction}`; never calls `evaluateReadiness()` itself.
3. Lite early-exit (774-777) — readiness gate only, then exit.
4. `stop_maybe_block_on_readiness && exit 0` (730-734, called 779) — first/highest-precedence block path.
5. `stop_report_not_ready_to_ship` (739-742, called 780) — stderr-only, never blocks.
6. Minimal-change review refresh + handoff append (234-302, called 782-783) — SECOND write to handoff+resume (`resume_file`/`resume_tmp_file`, 279-296).
7. Review-freshness stderr nudge (785-794) — non-blocking.
8. Plan-completeness gate (25-172, called 796-807) — second-precedence block path; writes `.ai/harness/planning/plan-completeness.json` signature.
9. Delegation fallback block (304-595, called 809-812) — third/lowest-precedence block path; reads/writes `.ai/harness/delegation/{latest.json,turns/<scope>.json}` + a hand-rolled non-reclaiming `${latest}.lock` (408-594 documents 5 rounds of lock-race iteration — read before touching).

Route: `route-registry.ts:140-144`, still `scripts: ['stop-orchestrator.sh']`.
Runtime dispatch today is two-step (`runtime.ts:422-448`): TS
`consumePendingPostEditEvents()` unconditionally first, then the generic
script loop spawns the bash script — deliberately excluded from
`scriptsRun`/telemetry to keep the HRD-01 golden byte-stable.

HRD-02 collector (`state-input-collector.ts:61-93`) has no Stop-shaped
getter today — only `getSessionEffectiveState()` (SessionStart) and
`getPreEditEffectiveState()` (HRD-03). Verified this session:
`session-context.ts:201-206`'s own doc comment says the SessionStart
collector interface deliberately excludes any Effective State getter, and
`runtime.ts:116-178`'s `effectiveStateSessionSection()` does its own
separate `state resolve --json` subprocess call, rendering a
`SessionContextSection`-shaped (UI) result, not a full `EffectiveState`.
This is why Stop needs its own new getter rather than reusing
`getSessionEffectiveState()`.

"LSC-07 shared readiness" = `EvaluateReadinessResult` from
`operation-readiness.ts:269-310`'s `evaluateReadiness()`, projected onto
`EffectiveStateV1.readiness` by `project-effective-state.ts:293-341`
(imported/called at lines 10, 330 — confirming the module docstring at
`operation-readiness.ts:19-20` claiming "no consumer imports this module
yet" is stale and needs correcting, per the acceptance line).

Call-site classification (LIVE vs HISTORICAL) and doc/test ripple surface:
see the full explorer transcript this session for the complete ~68-reference
list (route-registry.ts, runtime.ts, 8+ test files including
`tests/cli/hook.test.ts`'s ~13 hits across ~8 tests, both characterization
goldens, five README translations, two reference-config docs + mirrors,
`docs/architecture/index.md`, `docs/architecture/modules/runtime-harness/hook-adapters.md`).
Two items explicitly flagged as pre-existing gaps NOT in this row's scope:
`scripts/repo-harness.sh` (already ledgered in `tasks/todos.md` for HRD-09)
and `hook-adapters.md`'s broader staleness beyond its Stop-specific
paragraph/Mermaid edge (leftover from HRD-03/04/05, not this row's to fix).

## Design Review: Codex P1-P3 proposal + deep-reasoner (Opus) adversarial verification

Codex (independent peer engineer, same worktree) proposed the P1 architecture
(single `runStopHandler()`, new collector getter, journal flush inside the
handler, `StopProjectionBatch.commit()` once) and four P3 design decisions
(new Stop getter; race-test seam instead of source-splicing; defer
`scripts/repo-harness.sh`; docs ripple limited to Stop-live-surface). The
orchestrator independently verified two of Codex's claims via codegraph
before trusting them (getSessionEffectiveState's concrete shape; the
todos.md residue ledger for `scripts/repo-harness.sh`) — both checked out.

An orchestrator-dispatched `deep-reasoner` (Opus, full tool access, read the
actual code rather than reasoning abstractly) then ran an adversarial review
against Codex's plan and found one gap the orchestrator had already caught
independently (precedence not stated) plus three more, all evidence-backed:

1. **Precedence not stated explicitly** — confirmed via direct read of
   `stop-orchestrator.sh:761-812`; Codex's plan lists the three checks as a
   flat sequence. Additionally: `minimal_change_reason_suffix` is empty at
   readiness-block time (blocks before the review step) but populated for
   plan/delegation blocks — the three block paths are not interchangeable.
2. **Write-before-resolve ordering — the sharpest finding.** `refresh_handoff`
   (768) runs before `stop_resolve_state` (769) in the base script.
   `durable_recovery_state` is `required` in all three profiles
   (`artifact-requirement-policy.ts:86,98,113`), satisfied only when
   handoff/resume freshness isn't `missing`
   (`project-effective-state.ts:327`). Codex's "one batched commit" framing,
   read naturally, suggests resolve-then-commit-at-the-end — which would
   invert this and produce a false block on a repo's first-ever Stop. Codex's
   plan never mentions this ordering constraint.
3. **Batched-commit write-set unverifiable as stated** — the golden's
   `write_set` is a deduped-by-path set
   (`tests/fixtures/loop-runtime/characterization.json:254-263`), so it
   cannot distinguish "written once" from "written twice to the same path"
   (handoff is written both at `refresh_handoff` AND again at the
   minimal-change append). "Commit exactly once" needs either a write-count
   proof or an explicit reconciliation, not just an assertion.
4. **Cross-boundary lock protocol underspecified** — `latest.json`'s lock is
   shared with two bash scripts that SURVIVE this cutover
   (`subagent-start-context.sh`, `codex-delegation-advisor.sh`); Codex's plan
   names "bounded retry, no stale reclaim" but omits the in-lock scope
   re-check (both branches), release-token-match, and
   `delegationScope`/`firstString` byte-parity requirements the existing
   cross-writer test (`tests/cli/hook.test.ts:2491`) already proves and which
   must keep passing once the writer is ported.

Confirmed safe / not gaps: (a) no hidden second `evaluateReadiness()` call
risk — `readiness` is computed once inside the pure projector as part of one
`resolveEffectiveState`, reading `state.readiness` afterward is a free field
access; (b) the ~30-edit-file / ~68-reference-enumeration size split is
realistic against HRD-04 (~40 paths) / HRD-05 (25 files) precedent; (c) the
docstring fix is correctly scoped and behavior-inert.

All five findings are folded into this contract's Scope/Stop
Conditions/Falsifier/Exit Criteria — implementation must satisfy them, not
just the P1/P3 prose.

## Design Decisions

- New `getStopEffectiveState()` getter on `StateInputCollector`, `operationKind: "inspect"` — not a reuse of `getSessionEffectiveState()` (see Pre-Enumeration Gate above for why).
- Gate precedence ported as an explicit ordered short-circuit (readiness > plan-completeness > delegation), not a flat check list.
- Handoff+resume write happens before the single Stop Effective State resolution, matching the base script's ordering exactly.
- `StopProjectionBatch.commit()` owns exactly four recovery targets: handoff current, resume packet, workflow handoff-refresh event, and run summary. An injected write observer proves each is touched at most once per Stop.
- The old post-resolution minimal-change append into handoff/resume is retired as an explicit projection-only delta. The canonical minimal-change report, stderr diagnostics, and plan/delegation reason suffix remain authoritative; no second recovery projection rewrite remains.
- `getStopEffectiveState()` uses the collector's zero-argument `once()` memoizer because Stop has no target-path input.
- Delegation lock: keep the existing bounded-retry/no-stale-reclaim latest-pointer mechanism verbatim. The distinct same-scope scoped-state transaction risk is recorded as an independent `tasks/todos.md` deferred goal; HRD-07 covers only the circuit-breaker lock.
- Race test: injectable barrier seam replaces source-splicing; competing writer in the test stays a real spawned process, not an in-process mock.
- `scripts/repo-harness.sh` and `hook-adapters.md`'s broader staleness: left untouched, per the todos.md ledger / HRD-09 sweep assignment.

## Deviations From Plan Or Spec

- Approved projection-only delta from the bash implementation: remove the second minimal-change handoff/resume rewrite so the accepted one-batch/one-write invariant is real. This does not change Stop decisions, exit codes, canonical minimal-change evidence, or the plan/delegation suffix behavior.
- The first implementation pass made the four-target projection too compact and dropped `workflow_write_handoff()` fields that are recovery evidence (active sprint row, todo source plan, recent command trace, checks `run_file`, supersedes, and the real pending Task Breakdown item). The deep `/check` pass rejected that as an unapproved semantic contraction. The final projection restores those filesystem-derived fields and the historical `workflow_write_handoff v1` resume marker. For a completed plan it deliberately emits a conservative `/check` next step instead of duplicating the full `workflow_next_action()` acceptance/checks/merge authority: the first attempted shadow port could falsely recommend `contract-worktree finish` on a primary `main` checkout. Canonical workflow gates remain the only finish authority.
- The final TS writer strengthens the retired shell's path boundary: every concrete projection/delegation target is re-checked after path composition, existing ancestors and targets must not be symlinks, foreign-worktree active-plan markers are ignored, and direct-handler exceptions become a controlled `script-failed` result. This is fail-closed validation, not a compatibility path.
- Event append keeps the existing cross-process `evt-<basename>` lock namespace and thresholds so it remains serialized with SessionStart rotation and surviving bash event writers.

## Implementation + Review Evidence

- `src/cli/hook/stop-handler.ts` now owns the full Stop order: HRD-05 journal flush -> exact four-target recovery projection -> one memoized `getStopEffectiveState()` -> readiness/lite/diagnostic/minimal-change/plan/delegation short-circuits.
- `runtime.ts` reads inherited fd0 once for the full CLI path, records `stop-handler` telemetry, preserves Claude decision stdout / Codex success suppression, and converts projection faults to the same controlled nonzero dispatch result the retired subprocess path exposed.
- `StopProjectionBatch.commit()` touches handoff, resume, event stream, and run summary exactly once before resolution. Handoff/resume use per-file atomic temp+rename; the event uses the shared event lock and one append; the run summary uses atomic temp+rename.
- The delegation port preserves base `stop-orchestrator.sh:408-594`: fixed `latest.json.lock`, one `wx` marker write, `{pid,token,acquired_at}`, 2s/25ms bounded retry, no reclaim, token-matched release, scoped state write outside the shared-pointer lock, and in-lock `scope_id` re-check before `latest.json` replacement. `delegationScope` stays byte-semantic with the surviving writers: `turn_id > run_id > session_id > sha1(trim(transcript_path)) > env session`.
- Deep-review corrections are covered by new tests for projection-field preservation, completed-plan no-false-finish guidance, foreign worktree ownership, symlink containment, malicious run-id containment, and controlled projection failure, in addition to the required precedence/write-count/fresh-first-Stop and real cross-process lock tests.

## Residual Boundary

- The security specialist identified a same-scope lost-update schedule already present in the base protocol: Stop and `subagent-start-context.sh` both read/replace the scoped `turns/<scope>.json` outside `latest.json.lock`, so overlapping same-scope processes can lose either `spawned` or `fallback_used`. HRD-06 does not introduce this shape and its contract explicitly requires porting the existing protocol. Fixing it correctly requires changing at least the surviving bash writer plus the TS writer together; doing so here would violate the HRD-06 Allowed Paths and stage boundary. HRD-07's authoritative sprint row actually covers the circuit breaker's different lock, so this risk is now owned by a new explicit `tasks/todos.md` deferred-goal row rather than being mislabeled as HRD-07 scope. Its exit boundary is a real two-process same-scope fixture plus one transaction that re-checks eligibility and preserves both monotonic fields.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse `getSessionEffectiveState()` for Stop vs. add a new getter | New getter | SessionStart's concrete resolution returns a UI-rendering shape (`SessionContextSection`), not a full `EffectiveState`; Stop's gates need the richer object |
| Resolve-then-commit-at-end vs. write-before-resolve | Write-before-resolve | `durable_recovery_state` requires handoff/resume freshness to already be non-missing at resolve time; inverting the order false-blocks a fresh repo's first Stop |
| Redesign delegation scoped-state writes as one cross-writer transaction now vs. port as-is | Port as-is | A correct fix must change both Stop and the surviving SubagentStart writer; that exceeds this contract's allowed paths. The independent risk is recorded in `tasks/todos.md`; HRD-07 covers only the circuit-breaker lock |
| Mock the competing writer in the migrated race test vs. keep a real spawned process | Real spawned process | The test's entire point is proving cross-process concurrency safety; an in-process double cannot prove that |
| Preserve the second minimal-change handoff append vs. enforce one recovery projection write | Enforce one write | The report file is already canonical; duplicating it into handoff creates a second authority projection and contradicts the accepted transaction boundary |
| Reuse `onceWith` with a dummy Stop argument vs. zero-argument memoization | `once()` | Stop resolution has no per-call input, so a dummy argument would create false API shape |

## Open Questions

- None before implementation. Any newly discovered live path outside `allowed_paths` triggers the contract stop condition.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

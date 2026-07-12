# Implementation Notes: bdd2-phase-e3-scoring-authority

> **Status**: Complete
> **Plan**: plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md
> **Contract**: tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md
> **Review**: tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md
> **Last Updated**: 2026-07-13 04:50
> **Lifecycle**: notes

## Design Decisions

- E3 is a direct current-authority cut; the runner accepts only the E3 manifest.
- The tracked E3 corpus contains 120 redacted E2 full/normalized responses plus their
  original hashes, while ignored E2 runs remain provenance input rather than required
  clean-checkout state.
- Proposal-only outcome scores cannot judge filesystem artifacts. I3, if enabled,
  derives artifact delta only from before/after inventories.
- Primary disagreement resolution is a frozen fresh holistic adjudicator score. It
  never unions, averages, or mechanically selects primary fields.
- Evidence compliance counts unsupported assertions as violations and records explicit
  limitations separately without penalizing them.

## Deviations From Plan Or Spec

- The first S3 transport attempt was rejected before any score was returned because
  the response schema used `const` without the provider-required explicit string
  `type`. The empty/partial ignored run was discarded and authority was resealed as
  revision r2 before held-out scoring. No score or decision existed under r1.
- The r2 preflight exposed a second provider-schema restriction: `uniqueItems` is not
  accepted in structured output schemas. Runtime validation already enforces unique
  correction operations, so the unsupported JSON Schema keyword was removed and the
  still-unscored authority was resealed as r3.
- The r3 S3 run produced only an incomplete, unrevealed score directory before one
  model response echoed the wrong opaque packet id. The incomplete run had no run
  manifest or decision and was discarded. R4 freezes a maximum of three attempts for
  model responses; only a schema-valid response with the exact packet id can become a
  locked score.
- S3 completed validly under r4. The first EB3/EI3 attempts then failed before a
  complete adapter score run because the runner parsed the Markdown appendix as JSON.
  Partial adapter directories had no run manifest or decision and were discarded.
  The adapter-only authority was resealed as r5 with the frozen appendix delivered as
  text; the completed S3 r4 evidence remains immutable.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Regenerate E2 intervention outputs | Reject | The defect was scoring authority, not the frozen intervention. |
| Reuse old owner-proxy scores | Reject | Their aggregation semantics were not sealed. |
| Rescore frozen output with fresh isolated reviewers | Use | Corrects only the invalid layer while preserving intervention evidence. |
| Keep E2 and E3 parsers active | Reject | Current authority must remain singular and fail closed. |

## Open Questions

- None. The E3 gate is terminal for the current treatments; any future BDD² direction
  requires a new product thesis and new intervention, not another scoring revision.

## Recorded Results

- S3: `Kill` — 50% unsupported-expansion reduction, but four new paired P0/P1
  protected-concern regressions.
- EB3: `Kill` — five closure wins and zero losses, but below the six-win threshold and
  with one unsupported retry-policy/feature-need inference.
- EI3: `Kill` — one win, three losses, and one unsupported lower-friction assertion.
- I3: `Defer — gated-not-run` because S3 and both adapters failed their gates.
- Final authority freezes each tracked result and the original score-manifest hash;
  raw ignored score runs remain independently validateable after closeout.
- Final cross-model review found three merge-blocking authority gaps: credential
  delivery did not reassert an absolute Codex binary, normalized outcomes were only
  self-hashed rather than re-derived, and tracked terminal evidence was not exercised
  by `bun test`. E3 now fails closed on the Codex command, reconstructs every
  normalized outcome from its frozen full response plus source task, structurally
  validates source provenance, and reproduces all three `Kill` decisions in tests.
- The same review identified unused numeric correction-cost authority that did not
  match the reviewers' free-form correction descriptions. The dead cost table was
  removed instead of inventing a post-hoc metric; correction descriptions remain
  diagnostic and do not affect the sealed gate.
- Cross-model re-review then found two remaining provenance gaps. Corpus provenance
  now resolves each source commit, hashes the historical E2 manifest from Git, and
  verifies its sealed freeze id. Adapter treatment coordinates also must match the
  exact tracked appendix hash before their evidence scores are accepted. The same
  patch handles model-transport `stdin` errors without crashing the concurrent batch
  and removes a redundant path-only test.
- The final narrow re-review found no remaining provenance or appendix-binding issue;
  its sole P2 was missing regression coverage for early child-stdin closure. The JSON
  transport boundary is now directly testable, and the new test forces an early
  close with a large input to prove rejection instead of an unhandled process error.
- Rebasing onto the current `origin/main` exposed two pre-existing harness-kernel test
  assertions outside the E3 diff: the CLI diet smoke required non-empty SessionStart
  context even though inert zero-context is an explicit passing contract, and the
  prompt-guard test pinned a retired call-site spelling rather than the live Strict
  routing branches. The verification-boundary closeout widens only to those two tests
  and aligns their assertions with the already-shipped runtime behavior; no hook or
  product behavior changed.
- The same rebase exposed one missing deterministic projection from the harness-kernel
  merge: `docs/reference-configs/hook-operations.md` had advanced while its packaged
  asset copy had not. The asset was mirrored byte-for-byte so the existing brain and
  adoption drift gates pass; this is projection repair, not a new BDD² behavior.
- Contract closeout keeps the 1216-pass full `bun test` as root/review evidence rather
  than re-running it inside the generic helper, whose process boundary is capped at
  120 seconds. Free-form manual statements were also removed from `manual_checks`
  because that verifier supports only its evaluator-review check; the same invariants
  are enforced by E3 contract tests, hash validation, and the completed review card.
- `check-task-workflow --strict` remains a required root closeout check and passes with
  terminal markers cleared. It is not duplicated inside `verify-sprint`: that helper
  temporarily requires the terminal plan marker in order to resolve the contract,
  while the strict workflow check correctly rejects a terminal plan left active.
- GitHub CI initially failed the new source-provenance gate because the Test job used
  the checkout action's shallow default and therefore could not resolve the sealed E2
  source commit. The Test job now fetches full history, and an E3 contract test pins
  that requirement. The validator remains fail-closed; no shallow-history bypass or
  compatibility fallback was introduced.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

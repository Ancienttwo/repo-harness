# Implementation Notes: closeout-single-acceptance-authority

> **Status**: Active
> **Plan**: plans/plan-20260721-0601-closeout-single-acceptance-authority.md
> **Contract**: tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md
> **Review**: tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md
> **Last Updated**: 2026-07-21 13:42
> **Lifecycle**: notes

## Design Decisions

- The only semantic authority is a strict host-owned `AcceptanceReceipt`. It
  binds the normalized subject, contract policy, goal, verification evidence,
  target/reviewed paths, reviewer identity, and typed disposition.
- Review Markdown is a deterministic receipt projection. No active closeout path
  parses Recommendation, Human Review Card, rubric prose, or the retired
  External Acceptance Advice section.
- `merge-gate` is provider-free. It verifies the receipt and seals exact
  base/head/full-diff bytes plus declared deterministic lifecycle movement.
- Reviewer identity is frozen by the contract JSON. `user_waiver` stays distinct
  from `external_pass`, requires contract permission, and binds the contract
  owner as actor.
- A target-base advance reuses acceptance only when reviewed-path overlap is
  zero; semantic subject movement and overlapping target movement fail closed.
- The first authorized Claude route did not produce a disposition: `fable`
  returned quota exhaustion and the one allowed `opus` fallback timed out after
  330 seconds. Its recoverable transcript still identified two concrete
  post-freeze defects, both fixed before refreezing the subject: an undefined
  `receipt.head_sha` reference in `verifySeal`, and archive-envelope bytes that
  invalidated the contract authority fingerprint after deterministic archive.

## Deviations From Plan Or Spec

- The two originally proposed cuts were implemented as one atomic authority
  cutover so no steady-state dual-read compatibility path exists.
- The first full-suite run ended with 1758 pass / 1 platform skip / 2 static doc
  parity failures. Both stale source-doc assertions were corrected and their
  complete focused files then passed 31/31; the 11-minute suite was not repeated
  because only Markdown parity changed afterward.
- The incomplete Claude transcript was treated as FAIL/unavailable, never as an
  `external_pass`; no AcceptanceReceipt was written from partial output.
- Before recording the owner waiver, `origin/main` advanced through the
  solo-operator acceptance package and overlapped six reviewed paths. The
  candidate was rebased onto `d61d153e`; its host-dependent prose policy was
  intentionally retired at this authority cutover because the contract now
  freezes reviewer identity and typed `user_waiver` covers the explicit owner
  exception without reviving a second parser or host-derived reviewer rule.
- The waiver bound to `sha256:6b6b184c...` was not reused after that overlap.
  The rebased semantic subject is frozen independently before any new receipt.
- Base integration widened `allowed_paths` by exactly
  `src/effects/state/resolve-effective-state.ts` so the superseded
  `external_acceptance.solo_operator` validator is removed with its retired
  prose authority instead of surviving as a dead compatibility surface.
- The first real receipt projection exposed a section-replacement bug that the
  fixture had not covered: projecting twice duplicated the receipt and left the
  template's `unavailable` body in place. The matcher now replaces exactly one
  complete Markdown section through the next level-two heading or EOF, and the
  regression test projects twice to prove idempotence and sibling preservation.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep prose parsing during migration | Reject | It would preserve two authorities and violate the approved cutover. |
| Reinvoke Claude from merge-gate | Reject | Existing semantic acceptance already binds the subject; closeout needs only an exact local seal. |
| Re-review on every target advance | Reject | Zero-overlap movement changes topology, not the accepted semantic subject. |
| Disable host safety approval | Reject | The one private-diff transfer remains subject to Codex/host approval. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused acceptance/seal tests: `bun test tests/acceptance-receipt.test.ts tests/merge-gate.test.ts` -> 7 pass.
- Post-review regression rerun: the expanded acceptance/archive/seal suite passes
  9/9, including deterministic archive authority and post-freeze HEAD movement.
- Post-rebase overlap regression: the receipt, seal, workflow-state, hook,
  scaffold, init, state, archive, and closeout-guardrail targeted set passes.
- Hook runtime: `bun test tests/hook-runtime.test.ts` -> 71 pass.
- Workflow/helper/install surface: 219 pass before retired fixture deletion;
  `tests/workflow-state-lib.test.ts` then passed 12/12 with no retired skips.
- Full suite: 1758 pass / 1 platform skip / 2 stale Markdown parity failures;
  affected suites reran 31/31 after the documentation sync.
- Type/helper/hook projections: `bun run check:type`, `bun run check:helpers`,
  and `bun run check:hooks` all pass.
- Repository checks: deploy SQL, architecture sync, task sync, local strict
  workflow check, state inspection, and adopt dry-run all pass.
- Environment note: the PATH-installed pre-cutover CLI cannot dispatch the new
  helper; the source CLI passes the strict workflow check. No global install was
  mutated in this package.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

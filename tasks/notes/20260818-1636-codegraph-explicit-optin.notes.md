# Implementation Notes: codegraph-explicit-optin

> **Status**: Active
> **Plan**: plans/plan-20260818-1636-codegraph-explicit-optin.md
> **Contract**: tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md
> **Review**: tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md
> **Last Updated**: 2026-08-18 16:36
> **Lifecycle**: notes

## Design Decisions

- Falsifier ran clean before editing: `rg -n "profileEnablesCodegraph" src/ tests/` found only the two
  `src/cli/index.ts` call sites (lines 285, 383) and `tests/install-profiles.test.ts`. No fixture or
  generated-repo test depended on the size heuristic, so the delete had no hidden consumer.
- `spawnSync` was imported at `src/cli/installer/install-profile.ts:17` and used only by the deleted
  `git ls-files` branch, so the import went with it.
- The new `tooling.codegraph.enabled` key in `.ai/harness/policy.json` is placed immediately before
  `external_tooling`. `tooling` is a distinct top-level key from the pre-existing `external_tooling`
  (Waza/host readiness); they were not merged because `profileEnablesCodegraph` reads the
  `tooling.codegraph.enabled` path literally and `external_tooling` has an unrelated schema.
- The large-repo regression test builds a real 2,100-file git index rather than mocking `git ls-files`.
  Mocking would only prove the mock is unused; a real oversized repo proves size is no longer a signal.
  Cost is ~1s, and the surrounding test already carries a 30s timeout.

## Deviations From Plan Or Spec

- The existing test title `Minimal CodeGraph stays conditional while Full enables it` was renamed to
  `CodeGraph enablement is explicit: full profile or policy opt-in, never repo size`. Both original
  assertions are preserved verbatim; only the now-false word "conditional" left the title.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep the size heuristic behind a policy flag | Rejected | Reintroduces the dual-authority shape the contract removes; policy opt-in already covers the intent. |
| Mock `git ls-files` for the large-repo test | Rejected | Proves nothing about the deleted branch once the call site is gone. |
| Add three separate `test()` blocks | Rejected | The three semantics are one invariant; one test keeps the failure message pointed at the invariant. |

## Open Questions

- `tests/install-profiles.test.ts > CLI dry-run and state query expose machine-readable profile authority`
  failed once (exit 1 from the `install --dry-run --json` subprocess) on the first full-file run, then
  passed on re-run and in the full `bun test` sweep. The failing test does not touch
  `profileEnablesCodegraph`; the worktree had no `node_modules` at that point, which is the likely cause.
  Flagged rather than fixed — out of scope for this contract.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260811-1659-mutation-observed-in-repo-qualifier.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: mutation-observed-in-repo-qualifier

> **Status**: Active
> **Plan**: plans/plan-20260811-1659-mutation-observed-in-repo-qualifier.md
> **Contract**: tasks/contracts/20260811-1659-mutation-observed-in-repo-qualifier.contract.md
> **Review**: tasks/reviews/20260811-1659-mutation-observed-in-repo-qualifier.review.md
> **Last Updated**: 2026-08-11 16:59
> **Lifecycle**: notes

## Design Decisions

- Gate placement: extended the existing empty-path non-qualifying branch in `runMutationObserved` instead of changing `normalizeFilePath`/`getFilePath`. The normalize helper is a verbatim shell port; keeping it byte-stable and gating at the single caller is the smaller, port-faithful change.
- Qualifier semantics come from `canonicalRepoRelativePath` (fail-closed: `..` segments, symlink escapes, and out-of-repo absolutes all return `null`). Deliberately gate-only — the in-repo `filePath` value passed to advisories/journal is unchanged, so existing journal `changed_paths` encodings stay byte-identical.
- Pre-fix RED evidence at `.ai/harness/evidence/pre-fix-mutation-observed-in-repo-qualifier.log` (`PRE_FIX_EXIT=1`, 2 fail on unfixed code); post-fix 20/20 pass.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Gate inside `normalizeFilePath` (return '' for out-of-repo) | Rejected | Would silently change the shared shell-port contract other callers may re-port; caller-side gate keeps the port verbatim |
| Rewrite `filePath` to the canonical value for in-repo paths | Rejected | Changes observable journal `changed_paths` for edge encodings; qualification-only keeps existing tests and consumers byte-stable |

## Open Questions

- None. Digest ignore-contract convergence and 0.14.2 publish readback are explicitly out of scope (independent release gates per the 2026-08-11 cross-review); this fix removes poison events only and does not by itself prove legitimate events auto-drain end to end.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

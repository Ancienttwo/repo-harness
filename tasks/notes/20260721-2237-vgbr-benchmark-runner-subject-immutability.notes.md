# Implementation Notes: vgbr-benchmark-runner-subject-immutability

> **Status**: Active
> **Plan**: plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
> **Contract**: tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md
> **Review**: tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md
> **Last Updated**: 2026-07-21 22:37
> **Lifecycle**: notes

## Design Decisions

- Capture `source_commit` and every `benchmarkSubject()` component before any
  pack or profile preparation; those initial values remain report authority.
- Produce one external `npm pack --ignore-scripts` tarball and hash-check it
  before each harness-profile consumer.
- Install the tarball into each isolated `BUN_INSTALL`, then invoke the
  installed CLI for `adopt` and `install --no-cli`; never execute product setup
  from the authoritative source checkout.
- Assert commit and per-component subject equality after profile preparation
  and after all arms.  A mismatch writes no report.
- Preserve report protocol v2; no new compatibility or fallback authority.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| One external packed artifact | Use | Reuses the release file set and avoids copying `.git`, ignored state, or `node_modules`. |
| Full checkout copy | Reject | Creates a second ambiguous package selection boundary and copies unrelated state. |
| Normalize or restore file modes | Reject | Hides producer mutation instead of preventing it. |
| Add CLI install-spec compatibility input | Reject | Expands product CLI authority when the runner can install its artifact directly. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Prior invalid attempt: branch `codex/vgbr-post-hrd-baseline-recovery`, commit
  `40a33be4`, run id `19aadbf4-ac7f-434f-8ed0-60d1433c311d`.
- Pre-fix regression artifact:
  `.ai/harness/runs/vgbr-benchmark-runner-subject-immutability-pre-fix.log`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

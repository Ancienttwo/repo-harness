# Implementation Notes: review-convergence-source-sync

> **Status**: Active
> **Plan**: plans/plan-20260719-0432-review-convergence-source-sync.md
> **Contract**: tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md
> **Review**: tasks/reviews/20260719-0432-review-convergence-source-sync.review.md
> **Last Updated**: 2026-07-19 04:32
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

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

## Drift direction decision (2026-07-19)

Installed host copies were newer than `assets/` sources (claude-review fable pin + opus retry from 2026-07-15; codex-review 1800s budget from the cross-model review budget lesson), so sync direction is installed -> assets, verbatim. `claude-plan` is Codex-host-only by design (Codex asking Claude); it joins CROSS_REVIEW_SKILLS rather than a new list because the install mechanism is identical, with step label `external-brain skill claude-plan`. The Review Trigger Discipline block also went into `assets/reference-configs/global-working-rules.md`; note the template has separate pre-existing drift (installed `~/.codex/AGENTS.md` carries a Sufficiency and Stop Boundaries section absent from the template) left untouched as user-owned divergence.

## Ship blocked (2026-07-19)

`contract-worktree finish` is blocked at the external acceptance gate by two environmental preconditions, both verified:

1. Codex quota exhausted (`codex exec` → "usage limit … try again at Aug 16"; ChatGPT-plan auth, no API-key fallback configured). codex-review cannot produce the acceptance record.
2. Benchmark evidence is stale against the current benchmark subject on clean main too (`bun scripts/validate-harness-profile-benchmark.ts --report evals/harness/reports/profile-comparison.json --require-authoritative` → "benchmark subject changed at benchmark_subject_sha256"), so the acceptance benchmark binding fails for every finish repo-wide, independent of this diff.

Side finding: the globally installed package's `validate-harness-profile-benchmark` helper is broken (missing module `./run-harness-profile-benchmark` in the packaged copy); the repo-local script works.

Resume: restore Codex availability, regenerate benchmark evidence on the merge target, run codex-review, record `## External Acceptance Advice` with the then-current subject fingerprint, then `repo-harness run contract-worktree finish` from this worktree. All local verification is green (tsc, 40/40 targeted tests, adopt dry-run 0 ops, asset↔installed byte parity).

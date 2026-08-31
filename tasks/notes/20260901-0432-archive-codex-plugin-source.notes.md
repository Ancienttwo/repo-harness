# Implementation Notes: archive-codex-plugin-source

> **Status**: Active
> **Plan**: plans/plan-20260901-0432-archive-codex-plugin-source.md
> **Contract**: tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md
> **Review**: tasks/reviews/20260901-0432-archive-codex-plugin-source.review.md
> **Last Updated**: 2026-09-01 04:35
> **Lifecycle**: notes

## Design Decisions

- Receipt identity is valid only when it exactly matches the source frozen in the contract's parsed acceptance policy.
- `codex-review` and `codex-plugin` are both current protocol-2 sources for different hosts; neither is accepted as an unbound compatibility alias.

## Deviations From Plan Or Spec

- The globally installed `repo-harness run archive-workflow` continued using its packaged unfixed helper during local development. The working-tree helper was therefore invoked directly for the pre-install archive proof; install dry-run remains part of final verification.
- ArchContext classified the post-archive source-tree delta as a `verified-flow-proof-changed` proof-only candidate. After CodeGraph became ready, the generated manifest converged and the exact signal was retired through proof reconciliation rather than semantic acceptance; `docs/architecture/` remains in scope for that provider-owned manifest projection.
- The first literal-replacement implementation passed local tests but the official Codex plugin review found it would break the Claude-host `codex-review` route. The final implementation instead reuses `parseAcceptancePolicy` and `acceptancePolicySource` and rejects source-policy mismatches.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Accept both source names without policy binding | Rejected | It creates dual semantic authority and lets mismatched projections appear valid. |
| Replace the source literal globally | Rejected | It repairs Codex-host archival by breaking the Claude-host route. |
| Bind identity to parsed contract policy | Selected | It preserves both intentional routes while keeping one authority and failing closed. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Protocol-2 preparation: `bash scripts/verify-sprint.sh --prepare-acceptance` passed with 17/17 contract checks after architecture projection converged to `noop`.
- Root-cause record: `DEBUG.md`
- Pre-fix failure: `tasks/notes/20260901-0432-archive-codex-plugin-source.pre-fix.log`
- Sealed archive result: `plans/archive/plan-20260901-0205-external-source-binding-wp2.md` and its `tasks/archive/*-20260901-0439-*` family.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

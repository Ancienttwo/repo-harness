# Implementation Notes: think-scan-init-hook

> **Status**: Completed
> **Plan**: plans/plan-20260613-0328-think-scan-init-hook.md
> **Contract**: tasks/contracts/20260613-0328-think-scan-init-hook.contract.md
> **Review**: tasks/reviews/20260613-0328-think-scan-init-hook.review.md
> **Last Updated**: 2026-06-13 04:03
> **Lifecycle**: notes

## Design Decisions

- Keep `first-principles-guard.sh` diff-only and advisory-only in the existing `PostToolUse.edit` slot, so complexity hints never block safety or deliberate architecture work.
- Keep `anti-simplification.sh` as a thin compatibility wrapper for stale installed copies and tests while making `first-principles-guard.sh` the canonical guard.
- Mirror hook and reference-doc changes across `.ai/` self-host runtime and `assets/` generated-install surfaces in the same slice.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep compatibility wrapper | Accepted | Avoids breaking stale references while moving semantics to the new canonical guard. |
| Blocking complexity gate | Rejected | The heuristics are review prompts, not correctness checks. |
| SessionStart/global prompt | Rejected | The guard is useful only against a concrete edit diff. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused hook tests: `bun test tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/cli/route-registry.test.ts`
- Workflow gate: `bash scripts/check-task-workflow.sh --strict`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

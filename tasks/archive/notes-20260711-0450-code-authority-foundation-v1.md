> **Archived**: 2026-07-11 04:50
> **Related Plan**: plans/archive/plan-20260711-0139-code-authority-foundation-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260711-0450

# Implementation Notes: code-authority-foundation-v1

> **Status**: Active
> **Plan**: `plans/plan-20260711-0139-code-authority-foundation-v1.md`
> **Contract**: `tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md`

## Design Decisions

- Explicit one-shot migration is permitted; steady-state compatibility and dual authority are forbidden.
- The repository remains one package; no current consumer justifies a workspace boundary.
- ArchContext and CodeGraph remain advisory/read-model tooling.
- The source-projection abstraction is limited to hook and helper projection.
- MCP repo identity, ignore policy, and path/symlink/containment guards moved as one internal authority boundary; public MCP tool schemas and exports did not change.
- Retired static host-adapter templates were deleted because typed installers are the supported adapter authority; migration-only cleanup of those old filenames remains explicit and operator-invoked.
- The stale No-Fallback and ArchContext bridge artifacts were moved through a one-shot tracked-data migration with outcome `Superseded`, not `Completed`. Their historical implementation evidence remains intact, but the new current-evidence archive gate cannot honestly recreate acceptance evidence after later commits; this plan now owns the authoritative closeout and no steady-state bypass was added.

## Deviations From Plan Or Spec

- Historical workflow closeout used the approved one-shot migration rule and a truthful non-completion outcome instead of weakening `archive-workflow` with a legacy compatibility path or manufacturing completion evidence.
- Independent review found that fallible refresh, reindex, and sprint-backfill operations could leave archives partially moved. The archive and contract-worktree paths now snapshot the affected workflow authority and restore it on failure; focused tests prove live-state preservation and successful retry.
- Independent review found that projection root or parent symlinks could redirect writes. The shared projection primitive now validates every ancestor and canonical containment, with explicit no-outside-write regressions.

## Tradeoffs Considered

- A broad monorepo or language rewrite was rejected because it does not match the current release boundary.
- Public MCP rollout cleanup and adoption apply cutover stay in separate breaking work-packages.

## Open Questions

- None blocking for CO-00 through CO-08.

## Promotion Candidates

- Promote repeated authority/fallback corrections to `tasks/lessons.md` only after final review confirms they are general.

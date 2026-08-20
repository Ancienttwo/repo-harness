> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260529-0004-capability-context-cli-hook.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1617

# Implementation Notes: capability-context-cli-hook

> **Status**: Active
> **Plan**: plans/plan-20260529-0004-capability-context-cli-hook.md
> **Contract**: tasks/contracts/capability-context-cli-hook.contract.md
> **Review**: tasks/reviews/capability-context-cli-hook.review.md
> **Last Updated**: 2026-05-29 00:04
> **Lifecycle**: notes

## Design Decisions

- Default path is queue-first: `PostEdit` records requests under ignored `.ai/harness/capability-context/`, and `SessionStart` injects a reminder. Hooks never spawn an LLM or write semantic positioning.
- `repo-harness capability-context sync` owns the semantic `CAPABILITY CONTEXT` block. `context-contract-sync.sh` keeps owning only the architecture contract block, so the two controlled blocks can coexist without fighting.
- Target contract files derive from `prefixes[0]`: directories receive `<prefix>/AGENTS.md` and `<prefix>/CLAUDE.md`, file prefixes receive files in their dirname, and root file prefixes stay at root.
- `.ai/context/capability-source-map.json` is tracked configuration, while `.ai/harness/capability-context/` is ignored runtime queue state.

## Deviations From Plan Or Spec

- `--auto-fill-positioning` writes a deterministic registry-derived manifest fallback when explicitly requested. It does not call a sidecar LLM by default because this repo has no stable host-agnostic agent exec contract; the hook boundary remains zero-LLM.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| PostEdit background spawn | Rejected | It would make every edit path quota/PATH/concurrency dependent. |
| Queue + SessionStart | Chosen default | It reuses existing `spawn_recommended` signal without moving LLM work into hooks. |
| Deterministic auto-fill manifest | Chosen experimental fallback | It gives an explicit, reviewable draft path without hidden runtime dependencies. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

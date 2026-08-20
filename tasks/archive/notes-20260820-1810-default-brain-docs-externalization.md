> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: default-brain-docs-externalization

> **Status**: Active
> **Plan**: user-approved chat plan
> **Contract**: (none)
> **Review**: verified with local checks
> **Last Updated**: 2026-05-25
> **Lifecycle**: notes

## Design Decisions

- Externalize long-form optional `docs/reference-configs` content to `icloud/brain/agentic-dev/*`.
- Keep repo-local stubs for discoverability and keep required minimal docs in the repo.
- Keep Hook runtime independent from gbrain, iCloud, MCP, and local brain availability.
- Track externalized stubs with `.ai/harness/brain-manifest.json` and validate them with `scripts/check-brain-manifest.sh`.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete optional docs entirely | Rejected | Existing README/tests and full-doc profile still benefit from stable repo pointers. |
| Make hooks query gbrain/default brain | Rejected | Hook execution must remain offline and repo-local. |
| Copy external docs without repo stubs | Rejected | Agents need local discovery paths and conflict resolution must prefer repo state. |

## Open Questions

- None.

## Evidence Links

- Default brain vault: `icloud/brain/agentic-dev/*`
- Checks: `.ai/harness/checks/latest.json`
- Brain manifest: `.ai/harness/brain-manifest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote the default-brain external knowledge split only after generated repo checks, brain manifest checks, and migration dry-run stay green.

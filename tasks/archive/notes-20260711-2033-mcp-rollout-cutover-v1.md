> **Archived**: 2026-07-11 20:33
> **Related Plan**: plans/archive/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260711-2033

# Implementation Notes: mcp-rollout-cutover-v1

> **Status**: Active
> **Plan**: plans/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Contract**: tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md
> **Review**: tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md
> **Last Updated**: 2026-07-11 15:20 +0800
> **Lifecycle**: notes

## Design Decisions

- `McpPolicy.generalRepo` and its six controls were removed instead of being
  defaulted on. The existing `workspaceReader` capability now determines whether
  the general repo tool set is published.
- The registry remains the sole mutation authority: discovery publishes the
  complete general tool schema, while `assertRepoWriteEnabled` rejects calls for
  `read_only` records and keeps revision, path, and ignore checks unchanged.
- CodeGraph is metadata only. Visible, unindexed files are served through the
  existing guarded filesystem implementation; `INDEX_UNAVAILABLE` remains only
  a refresh/index-adapter failure, not a content-read authorization result.
- Direct workspace tools and workflow tools remain explicit, bounded APIs. The
  ambiguous workspace `search_text` fallback and workflow-to-general-repo
  bridge were deleted, so neither route silently switches implementation.
- `mcp setup` drops retired local `rollout` data when it rewrites config. The
  server does not read rollout config or environment variables.
- General-repo identity deliberately does not promote an explicit workspace
  root or `allowedRoots` into a registered record. An unregistered root can use
  only the separately named workspace tools; it has no `repo_id` and cannot
  reach registry-scoped `read_file` or mutation APIs.
- Invalid local MCP configuration now fails closed instead of being interpreted
  as absent configuration, so a malformed file cannot silently enable the
  workspace-reader profile.

## Deviations From Plan Or Spec

- Review hardening added `src/cli/mcp/general-repo-access/authority.ts` to the
  contract's allowed paths. It was required to keep the existing registry
  authority rather than introducing a second root-derived identity path.
- Workflow closeout adds `tasks/archive/` and the derived `tasks/current.md`
  to allowed paths before archival. The archive helper writes both as its
  prescribed deterministic projection; this does not expand the MCP product
  scope.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Retain rollout booleans with permanently-on defaults | Rejected | Leaves a second authorization/configuration authority and a rollback path. |
| Hide mutation schemas for read-only sessions | Rejected | Server tool discovery cannot infer one selected repo; registry `accessMode` remains the single call-time authority. |
| Delete all workspace and workflow tools | Rejected | They retain distinct, explicitly named bounded semantics; only their hidden fallback/bridge paths were retired. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused MCP suite: 75 pass / 0 fail / 918 assertions (`bun test
  tests/cli/mcp-stdio.test.ts tests/cli/mcp.test.ts
  tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-setup.test.ts
  tests/cli/mcp-tools.test.ts tests/cli/mcp-policy.test.ts
  tests/cli/mcp-http.test.ts`).
- Full repository suite: 1126 pass / 1 platform skip / 0 fail / 11,437
  assertions across 97 files (`bun test --parallel=4 --no-orphans`).
- Required repository gates passed: deploy SQL order, architecture sync, task
  sync, project-state inspection, self-migration dry-run, and `git diff --check`.
- Independent architecture and security re-reviews found and then verified the
  fixes for root-derived general-repo identity and malformed-config fallback;
  the final re-review reported no remaining P1/P2 finding.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

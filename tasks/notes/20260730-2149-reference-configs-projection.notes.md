# Implementation Notes: reference-configs-projection

> **Status**: Active
> **Plan**: plans/plan-20260730-2149-reference-configs-projection.md
> **Contract**: tasks/contracts/20260730-2149-reference-configs-projection.contract.md
> **Review**: tasks/reviews/20260730-2149-reference-configs-projection.review.md
> **Last Updated**: 2026-07-30 21:49
> **Lifecycle**: notes

## Design Decisions

### Stacked base

Branch is stacked on `codex/cli-init-rename`. At execution start `origin/codex/cli-init-rename`
was still at `a43c4abe`, identical to the merge-base, so no rebase was needed. Plan line numbers
come from `main@095dcb06`; every edit site was located by content instead.

### harness-overview.md re-unification (plan decision 2)

Divergence confirmed before the copy: docs side 224 lines, assets side 194. The decisive evidence
for calling this time drift rather than an intentional audience split was
`assets/reference-configs/harness-overview.md:173`, which still described
`agent-context-blocks.txt` / `REPO_HARNESS_CONTEXT_BLOCKS` / nested context files as "migration
inputs or compatibility fallbacks only" — wording the repo's own no-fallback rule has since
retired and the docs side had already dropped. An intentional split would not regress a retired
term on the shipped side. Content therefore came from docs, address moved to assets.

H1 and lead paragraph are identical on both sides, so `repo-harness docs show harness-overview`
(resolves the assets path, title asserted in `tests/cli/docs.test.ts`) is unaffected.

### Falsifier result

The contract's falsifier asks whether any of the 23 pairs legitimately needs to diverge. Before
any edit, a full `cmp` sweep over all 23 reported exactly one difference (`harness-overview.md`).
After the single re-unification copy, `bun run check:reference-configs` passed on all 23 with
zero further content edits. No undiagnosed divergence exists, so the projection premise holds.

### Projection direction and docs-only files

`assets/reference-configs/` is the source, `docs/reference-configs/` the generated projection.
The projection is one-directional: docs additionally holds 7 docs-only files (chatgpt-coding-mcp,
contract-brief-example, contract-brief-example-bugfix, general-repo-mcp, install-profiles,
loop-engine-cutover-gate, loop-engine-nl-decision-table) that never ship in assets. The tool
ignores them and must never delete them; the loop test asserts this docs-only set stays non-empty
and disjoint from the source inventory, so a future "clean up extras" change to the tool fails a
test instead of silently deleting docs.

`tests/reference-configs-projection.test.ts` reads the filesystem directly rather than importing
`scripts/sync-reference-configs.ts`. Importing the tool would make the test restate the tool's own
logic; reading the tree keeps it an independent second guard, which matters because `bun test` is
the first required check while the tool only runs under check-ci.

### Negative verification (fail-closed proof)

Appended a `<!-- drift probe -->` comment to `docs/reference-configs/git-strategy.md`, uncommitted:

```
$ bun run check:reference-configs
[reference-configs] content drift: docs/reference-configs/git-strategy.md
[reference-configs] Edit assets/reference-configs/<doc>.md, then run bun run sync:reference-configs.
CHECK_EXIT=1

$ bun test tests/reference-configs-projection.test.ts
(fail) reference-configs projection > every assets/reference-configs doc has a byte-identical ...
 1 pass  1 fail
```

After restoring the file both went green and the projection digest returned to the pre-probe
value `sha256:8953d34d...c714d1`, confirming the probe left no residue.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Loop test imports the sync tool's inventory helper | Rejected | Would restate the tool's logic instead of guarding it independently |
| Sync tool deletes unknown files in docs/reference-configs | Rejected | Would destroy the 7 legitimate docs-only files; projection stays one-directional |

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

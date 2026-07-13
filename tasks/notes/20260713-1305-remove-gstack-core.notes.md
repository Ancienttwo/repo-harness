# Implementation Notes: remove-gstack-core

> **Status**: Active
> **Plan**: plans/plan-20260713-1305-remove-gstack-core.md
> **Contract**: tasks/contracts/20260713-1305-remove-gstack-core.contract.md
> **Review**: tasks/reviews/20260713-1305-remove-gstack-core.review.md
> **Last Updated**: 2026-07-13 13:48
> **Lifecycle**: notes

## Design Decisions

- Parent agent is the only product/architecture/complex-plan/design-plan lifecycle owner. `geju` is invoked before capture to open the frame; the accepted thesis, proof point, and falsifier are frozen into the plan and contract.
- The direct route value is `parent-agent:geju`. It is a semantic owner + framing-method declaration, not an external provider selection.
- `external_tooling.routing` no longer owns the complex lane. It keeps only genuinely external simple/knowledge routes; complex planning lives under `agentic_development.routing`.
- The tooling report deletes its gstack JSON/text surface and install/update probes. No replacement alias or deprecated field is retained.
- Adoption uses the removed `external_tooling.routing.complex` provider declaration as one-shot migration data. Only planning routes whose provider prefix matches that declaration are rewritten; unrelated custom routes and due-diligence additions survive, while the removed declaration is deleted in the same transaction. Hand-trimmed policies that already deleted the declaration are treated as post-cutover custom configuration rather than guessed at through a retired provider literal.
- Historical plans, archived tasks, and dated research may retain the retired name as provenance; the active-surface regression test intentionally excludes those evidence stores.
- The independent kernel-optimization plan was confirmed present and dirty only in `/Users/kito/Projects/repo-harness-wt-harness-kernel-optimization-phase2`; this work-package does not touch it.

## Deviations From Plan Or Spec

- The initial adoption implementation unconditionally replaced the three planning routes and the full explicit-report array. Claude external review correctly identified that this would erase post-cutover user customizations on unrelated future adoption runs. The final implementation keys the canonical rewrite to the removed `external_tooling.routing.complex` schema field and adds TypeScript plus shell-runtime preservation fixtures.
- The captured plan initially contained two identical `## Task Breakdown` sections. They were consolidated before progress projection.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep gstack optional | Reject | The provider name would remain embedded in canonical semantics and could still block the lifecycle. |
| Add a gstack alias/fallback | Reject | User explicitly authorized complete removal with no compatibility path. |
| Parent agent + `geju` | Use | One lifecycle owner works on Claude and Codex; `geju` improves direction without owning execution. |
| Rewrite historical evidence | Reject | Provenance is non-executable and rewriting it would destroy truthful history. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused post-review suite: `bun test tests/retired-planning-provider.test.ts tests/check-agent-tooling.test.ts tests/cli/adoption-plan.test.ts tests/create-project-dirs.runtime.test.ts --max-concurrency 4` — 50 pass, 0 fail.
- Full suite after review fixes: `bun test --max-concurrency 4` — 1241 pass, 1 skip, 0 fail, 10907 expectations across 111 files.
- TypeScript: `bun run check:type` passed.
- Required gates passed: deploy SQL order, architecture sync advisory with 0 blocking, task sync, project-state inspection with no drift, and adoption dry-run with 125 operations / 21 planned / 104 skipped.
- All seven source/mirror parity checks passed; the active-surface retired-term scan returned zero matches.
- Claude review round 1: one P1 and three P2 findings. All were resolved: preservation fixtures and schema-marker migration for the P1; hermetic fake-git assertion, single task breakdown, and all-regular-file regression scanning for the P2s.
- Claude review round 2: no P1 and three P2 findings. The migration now rewrites only routes whose provider prefix matches the removed complex-provider declaration and derives due-diligence label migration from those routes; a mixed custom/legacy fixture covers both TS and shell paths. The impossible `tools.gstack` init-hook fixture was renamed to a neutral planner fixture, and the active-surface scan now fails loudly on symlinks or other non-regular entries.
- Claude review round 3: no P1 and two P2 findings. Retired report labels now map to their exact route keys (`product_discovery`, `complex_engineering_plan`, or `design_plan`) instead of collapsing to the complex lane; explicit-report prose now matches the default machine list. A Python-only fixture forces the fallback branch and asserts byte parity with the primary runtime plus the mixed-route migration result.
- Claude final acceptance re-read the current migration, prose, and Python-only fixture and returned no P1 and no P2 findings. The post-fix focused suite passed 37/37 and typecheck remained clean.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

# Implementation Notes: runtime-docs-user-level

> **Status**: Complete
> **Plan**: plans/plan-20260613-0236-runtime-docs-user-level.md
> **Contract**: tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md
> **Review**: tasks/reviews/20260613-0236-runtime-docs-user-level.review.md
> **Last Updated**: 2026-06-13 03:18
> **Lifecycle**: notes

## Design Decisions

- Runtime docs authority is `assets/reference-configs` in the installed
  repo-harness package, exposed through `repo-harness docs`.
- Downstream `docs/reference-configs/*.md` files are pointer stubs with a stable
  marker and resolver commands, not full copied prose.
- Existing project-specific reference docs are preserved when their top-level
  heading does not match the managed repo-harness doc.
- `.ai/harness/*`, `.ai/context/*`, checks, handoff, events, policy, and helper
  runtime snapshots remain repo-local.
- Retired `AGENTS.md` and `CLAUDE.md` from the reference-doc asset/docs surface
  because they are functional-block context templates, not runtime docs, and no
  code references them there.

## Deviations From Plan Or Spec

- No implementation deviation from the approved docs-externalization boundary.
- Additional retirement: removed duplicate package publishing of
  `docs/reference-configs/`; package runtime docs resolve from
  `assets/reference-configs` only.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep full docs in generated repos | Rejected | Preserves old refresh burden. |
| Move `.ai/harness` state user-level | Rejected | Violates repo-local policy/check/handoff source of truth. |
| User-level/package docs plus repo stubs | Chosen | Smallest boundary change that removes copied runtime prose. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused tests:
  `bun test tests/cli/docs.test.ts tests/workflow-contract.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts`
- Full suite: `bun test`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

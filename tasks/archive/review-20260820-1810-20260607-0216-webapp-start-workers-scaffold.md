> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260607-0216-webapp-start-workers-scaffold.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: webapp-start-workers-scaffold

> **Status**: Completed
> **Plan**: plans/plan-20260607-0216-webapp-start-workers-scaffold.md
> **Contract**: tasks/contracts/20260607-0216-webapp-start-workers-scaffold.contract.md
> **Notes File**: tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-07 02:54
> **Recommendation**: pass

## Mode Evidence

- Selected route: Waza `/check` review-then-ship for local contract worktree diff.
- P1 map: Scaffold authority is split across `assets/plan-map.json`, `assets/initializer-question-pack.v4.json`, `scripts/assemble-template.ts`, `assets/project-structures/`, partials/templates, docs, and regression tests.
- P2 trace: Plan C now resolves `webappRenderingDefaults.defaultModel=start-workers`; `assembleTemplate()` loads question-pack rendering model metadata, merges Start/Workers structure and tech-stack variables, processes partial conditionals, and emits generated CLAUDE/AGENTS/docs output.
- P3 decision: Keep A-K plan codes stable and model Start/Workers as an overlay so Plan B stays client-only, Plan C owns SEO/SSR React webapps, and Plan D/E can reuse the same webapp deployment guidance.

## Verification Evidence

- Waza `/check` run: local Codex `/check` in `codex/webapp-start-workers-scaffold`.
- Commands run:
  - `git diff --check` -> pass
  - `bun test tests/plan-map-consistency.test.ts tests/initializer-question-pack.test.ts tests/output-parity.test.ts tests/scaffold-parity.test.ts tests/unit/webapp-start-workers-scaffold.test.ts` -> 51 pass / 0 fail
  - `bun test` -> 579 pass / 6 skip / 0 fail
- Manual checks:
  - Confirmed no new Plan code was introduced; plan catalog remains A-K.
  - Confirmed Plan C output uses one `apps/web` Start/Workers frontend and no default `apps/marketing` + `apps/web` split.
  - Confirmed Plan B output remains client-only and does not include Start SSR structure.
  - Confirmed focused failure was fixed by de-duplicating Start/Workers project-structure injection.
- Supporting artifacts: `assets/project-structures/tanstack-start-workers.txt`, `tests/unit/webapp-start-workers-scaffold.test.ts`
- Implementation notes reviewed: `tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md`
- Run snapshot: `.ai/harness/runs/run-20260607T025555-42360-20260607-0216-webapp-start-workers-scaffold.json`

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: local-check
> **External Source**:
> **External Started**: 2026-06-07T02:21:00+0800
> **External Completed**: 2026-06-07T02:54:00+0800

- P1 blockers: unavailable
- P2 advisories: none
- Acceptance checklist: pass via local focused and full repository verification
- Manual Override: external reviewer was not available in this runtime; local `/check` review plus focused regression tests and full `bun test` cover the scaffold contract acceptance surface.

## Behavior Diff Notes

- Adds `webappRenderingModel` metadata to initializer question-pack v4.
- Makes Plan C default to TanStack Start + Vite + Cloudflare Workers for React SEO/SSR webapps.
- Adds Start/Workers project structure showing `/` SSR/public route, `/app` client-only route, Worker assets, and `wrangler deploy`.
- Updates Cloudflare/release/docs guidance so Pages/static surfaces are explicit non-default choices for Start SSR apps.

## Residual Risks / Follow-ups

- No immediate follow-up blocker. Real Cloudflare deployment remains out of scope for this scaffold contract.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Contract behavior is covered by focused and full tests. |
| Product depth | 8/10 | Guidance captures the intended SaaS SEO/SSR plus workspace split without implementing a real app. |
| Design quality | 8/10 | Overlay model preserves existing catalog shape and generated-output budgets. |
| Code quality | 9/10 | Small scoped changes, regression tests, and duplicate-injection fix included. |

## Failing Items

- None after local `/check` fixes.

## Retest Steps

- Re-run: `bun test tests/plan-map-consistency.test.ts tests/initializer-question-pack.test.ts tests/output-parity.test.ts tests/scaffold-parity.test.ts tests/unit/webapp-start-workers-scaffold.test.ts`
- Re-check: `bun test`

## Summary

- Pass. The scaffold now recommends a single TanStack Start + Cloudflare Workers `apps/web` frontend for React webapps that need public SEO/SSR plus an authenticated workspace, while preserving client-only Vite as Plan B and keeping backend Workers as separate authority only when needed.

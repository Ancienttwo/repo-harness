# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-07-13 12:36
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Interactive `codex` `/agent` check confirming the six `.codex/agents/*.toml` load on cli 0.141.0 | No automatable introspection surface on this codex-cli version (C2 smoke inconclusive, not failing) | Fleet TOMLs are schema-valid but end-to-end recognition unproven | First interactive Codex session in this repo |
| BDD² revival (new product thesis + new intervention) | Phase E3 delivered terminal decisions: inline Shape, the Browser Evidence Adapter, and the ImageGen Prototype Adapter are all `Kill`; see `docs/researches/20260713-bdd2-phase-e-closeout.md` | Current treatments are closed as product candidates; their screenshots, prototypes, and evaluation appendices are retained only as historical evidence, not as evaluation candidates to rescore | Owner states a new product thesis and a new intervention, then opens a new eval-only work-package; the I3 implementation pilot and Phase P stay gated behind that new work-package, not behind another rescoring of the killed treatments |
| Skill facade convergence 20 -> <=5 (delete 15 facade dirs, migrate content to root-skill `references/`, rewrite README x5 + `docs/reference-configs/agentic-development-flow.md` + mirror, migrate ~15 eval scenarios in `evals/evals.json` + fixtures, rewrite `tests/action-command-skills.test.ts` / `tests/evals-contract.test.ts`, update `docs/architecture/modules/public-surface/{action-commands,root-router}.md`, fix dangling `repo-harness-autoplan` recommendation at `prompt-guard.sh:749` and kept-facade cross-refs) | Phase D pre-delete audit (2026-07-13) found facade names wired 3-4x deeper than the plan's estimate, and the `references/` deliverable sits outside this contract's allowed_paths; plan's own re-sequence clause fired | Discovery surface stays at 20 skill dirs until the follow-up ships; retirement plumbing (D1) lands now so the future deletion cannot hard-block installs | Open a dedicated work-package with allowed_paths covering `references/`, README x5, `docs/reference-configs/`, `assets/reference-configs/`, `evals/`, and the two content-contract tests; D1 plumbing merged is the precondition |

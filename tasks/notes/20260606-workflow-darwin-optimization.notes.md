# Implementation Notes: workflow-darwin-optimization

> **Status**: Implemented
> **Plan**: user-provided Workflow Darwin Optimization Plan
> **Contract**: (none)
> **Review**: (none)
> **Last Updated**: 2026-06-06 00:00 +0800
> **Lifecycle**: notes

## Design Decisions

- Preserved the existing tasks-first plus contract-worktree model. The changes add validation gates and clearer readiness evidence without changing `repo-harness init`, `update`, `scaffold`, or `ship` public semantics.
- Made handoff recovery fail closed on active plan discovery. `codex-handoff-resume.sh` now reports `(none)` when no active marker exists instead of restoring the latest historical plan.
- Added static Darwin gates to the public action command skill facades. The gate checks failure-mode branches, blacklists, runtime-neutral wording, and explicit checkpoints for high-risk commands.
- Kept readiness yellow flags advisory unless they prove missing hard requirements. Waza staging drift, gbrain warnings, and non-authoritative dry-run eval evidence must be reported; missing CodeGraph or missing Codex `health/check/mermaid` remain hard failures.
- Made eval benchmark summaries distinguish evidence authority from sample output. Dry-run-heavy summaries are marked non-authoritative instead of being counted as dim8 effectiveness proof.

## Deviations From Plan Or Spec

- No npm publish or gbrain DB repair was performed. The initial implementation slice was limited to the self-host repo workflow and its installed asset/template surfaces; the follow-up readiness closeout synced Waza staging into Codex because the tooling report exposed a concrete, bounded drift repair command.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Treat stale `tasks/current.md` as a hard gate | Rejected | It is a tracked orientation snapshot, not active authority. Checks and docs should point to refresh commands instead of blocking ordinary work. |
| Convert readiness yellow flags into CI failures | Rejected | The plan explicitly keeps Waza/gbrain drift advisory while requiring visible reporting and release-filing rationale. |
| Add a new public handoff command | Rejected | Existing `prepare-codex-handoff.sh` can remain the public entrypoint once it refreshes current and resume coherently. |

## Evidence Links

- Targeted helper/hook tests: `bun test tests/helper-scripts.test.ts tests/hook-runtime.test.ts` -> 153 pass, 0 fail.
- Targeted skill/eval/readme tests: `bun test tests/action-command-skills.test.ts tests/run-skill-evals.test.ts tests/readme-dx.test.ts` -> 22 pass, 0 fail.
- Brain sync: `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/agentic-development-flow.md`; `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/harness-overview.md`.
- Workflow gates: `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, and `bash scripts/migrate-project-template.sh --repo . --dry-run` all passed.
- Full closeout: `bun test` -> 567 pass, 6 skip, 0 fail; `bash scripts/check-deploy-sql-order.sh` -> pass.
- Readiness yellow closeout: synced Waza `think`/`hunt`/`check`/`health` plus shared rules from `~/.agents` to `~/.codex`, verified with `diff -qr`/`cmp -s`, and confirmed `bash scripts/check-agent-tooling.sh --host both --json` reports Waza synced.
- gbrain yellow closeout: updated `scripts/check-agent-tooling.sh` to probe `gbrain doctor --json --fast` first; current result is parseable `status = warnings`, `health_score = 95`, with only the fast-mode DB connection warning accepted in `deploy/release-checklists/260606-repo-harness-workflow-darwin-readiness.md`.
- Readiness targeted tests: `bun test tests/check-agent-tooling.test.ts tests/helper-scripts.test.ts` -> 64 pass, 0 fail.
- Readiness workflow gates after handoff refresh: `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/migrate-project-template.sh --repo . --dry-run`, and `git diff --check` all passed.
- Skill eval authority closeout: `bun run benchmark:skills -- --agent codex --profile with_skill --eval route-workflow-check --iteration darwin-fulltest-route-fix` -> 1 full test, 0 dry-run records, 4/4 graders; `evals/benchmark.md` now reports `effectiveness_authority = authoritative`.
- Eval authority contract promotion: release filings, verification architecture, README verification, and `repo-harness-check` now distinguish full-test authoritative evidence from dry-run smoke and missing eval evidence; `bun test tests/action-command-skills.test.ts tests/readme-dx.test.ts tests/evals-contract.test.ts` -> 24 pass, 0 fail.

## Promotion Candidates

- Promote the handoff/resume pair invariant into durable workflow guidance only after it proves stable in one downstream migration or release flow.
- Promote eval authority metrics into release checklist templates after the first release filing consumes the yellow-flag fields.

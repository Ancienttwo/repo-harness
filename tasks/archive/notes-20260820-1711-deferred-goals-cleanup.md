> **Archived**: 2026-08-20 17:11
> **Related Plan**: plans/archive/plan-20260820-1629-deferred-goals-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1711

# Notes: deferred-goals-cleanup

- Slice 3 reclassification: the ledger's single "5000ms timing-flake class" row was three distinct mechanisms (root-cause-prover, controlled-load reproduction, 2026-08-20). Members fixed here: runner-timeout entrypoint contract (CLI `--timeout` is the only mechanism that applies past the first test file on Bun 1.3.14 — verified for both `jest.setTimeout` and `setDefaultTimeout` preloads) and the orchestration deadline fixture's virtual-clock value leaking into `spawnSync`'s real kill timer. Member 1 (check-agent-tooling 1500ms bunx probe vs ~38s measured reality) is a product-semantics decision, rewritten as its own ledger row instead of patched.
- Removed `tests/setup-timeout.ts` and the bunfig `timeout` key rather than keeping them beside the CLI flag: both are silently ineffective and would misrepresent the timeout authority (one source of truth).
- Pre-fix failure artifact for the timeout contract guard: `tasks/notes/20260820-timeout-contract.pre-fix.log` (PRE_FIX_EXIT=1, captured on unfixed tree by the diagnosis pass).
- Deviation from plan: slices 1-2 were first executed by subagents against the main worktree before PlanStatusGuard surfaced the missing active plan; changes were ported here via patch and main was restored. The parallel session's WIP in main (v0.5 refactor plan deletions) was excluded from the port.
- Machine note: the local `~/.nvm/versions/node/v24.18.0` shim must outlive this merge until a release containing the widened candidate list is installed globally; deleting it earlier breaks the installed runtime's finish gate.

# Projection profile alignment notes

P1/P2/P3 and authorized boundaries are in the plan. ArchContext policy selects registry ownership; projection discovery is a separate consumer of explicit output targets. The existing source-exclusion branch remains unchanged because its restricted grammar does not resolve this contract mismatch.

Pre-fix regressions: producer initializer ID mismatch (0 pass/1 fail) and provider profile discovery (0 pass/3 fail). Provider failures expose required responsibilities, omitted deprecated capability targets and accepted backslash target. Immutable command transcript is in the parent session; logs are in the ArchContext task worktree `_ops/remaining-issues/issue225/pre-fix-*.log`.

Current focused checks: ArchContext model-store initializer/validation 29 pass, 120 assertions; provider/orchestration 72 pass, 389 assertions. Paired initialized-model proof, both typechecks and all required integrity checks subsequently passed. Installed-runtime/formal acceptance remains pending. No ownership registry semantics or dependencies changed.

> **Substantive Change SHA256**: `sha256:62766174d7f726942413cfe54deacd4a81691ee78edfc1b0645982b841f462e6`

## 2026-09-26 takeover verification

The consumer source remains `d0972eced8dd426dd20c2591c168f718b7895ef9`, based on current remote main `fd6bec20a1db705e60cf8e61f129c121c6c19b0b`. With Bun 1.4.2 and `TMPDIR=$PWD/node_modules/.cache/issue225-temp`, the two existing provider/orchestration files pass 79 tests and 433 assertions. The canonical `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260926-0007-archctx-projection-profile.contract.md --strict` passes all 13 criteria (11 executable checks plus task-profile/evidence declarations). No product or test source changed during this verification.

Formal `verify-sprint --prepare-acceptance` remains blocked before acceptance freeze: the local worktree has no CodeGraph index, and the provider reports `codeGraphStatus: unavailable`, `human-action-required`, and `verified-flow-proof-changed`. Model digest is unchanged; no architecture acceptance or receipt was fabricated. Index creation is awaiting the Owner decision required by the repository instructions. The historical ArchContext ADR/root writer obstruction is now resolved in its separate candidate; consumer publication/adoption and both repositories' formal acceptance remain open.

Draft PR #454's first Governance run exposed a stale pre-rebase substantive-change digest. Refresh the binding against the actual PR base `fd6bec20`, rather than weakening task-sync. The initial local contract pass used its default diff boundary, so it did not establish this PR-base binding. Draft mode intentionally defers the full hosted test matrix and keeps Required / CI non-passing until the PR is ready.

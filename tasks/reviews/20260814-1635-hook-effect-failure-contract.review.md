# Task Review: hook-effect-failure-contract

> **Status**: Failed
> **Plan**: plans/plan-20260814-1635-hook-effect-failure-contract.md
> **Contract**: tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md
> **Notes File**: tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-14 18:18
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending-global-verification
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: b2fd1379a5eca9e18eee011482f59fb9cfd27954

## Human Review Card

- Verdict: fail
- Change type: code-change | delegated-run
- Intended files changed: 17 contract-allowed source, test, architecture, and workflow artifacts.
- Actual files changed: 17; no path escaped `allowed_paths`.
- Commands passed: focused hook suite, typecheck, deploy SQL, architecture sync, task sync, strict workflow check, inspect, init dry-run, diff check.
- Residual risks: canonical architecture projection requires ten generated capability documents outside Allowed Paths; two unrelated full-suite terminal blockers remain after shard isolation.
- Reviewer action required: do not issue AcceptanceReceipt until both global gates are closed or formally adjudicated.
- Rollback: discard the isolated `codex/hook-effect-failure-contract` worktree branch; primary dirty WIP is untouched.

## Mode Evidence

- Selected route: delegated implementation followed by read-only gatekeeper review.
- P1/P2/P3 evidence: static handler contracts -> runtime tracker -> handler-owned durable effects -> additive telemetry; concrete Stop fault/retry paths were exercised at every phase.
- Root cause or plan evidence: the plan translates disposer discipline into retry confluence for append-only hook artifacts.

## Verification Evidence

- Waza `/check` run: represented by four independent gatekeeper passes; implementation findings were corrected until no code finding remained.
- Commands run: `bun run check:type`; focused four-file hook suite; full `bun test`; required architecture/task/deploy/inspect/init gates.
- Manual checks: Allowed Paths inventory, public hook result stability, telemetry non-authority, latest-Stop A -> B -> A semantics, bounded overflow reconciliation.
- Supporting artifacts: this review, implementation notes, plan, and contract.
- Implementation notes reviewed: yes.
- Run snapshot: focused `59 pass / 0 fail / 260 expects`; the two formerly red environment-probe files pass hermetically at `54 pass / 0 fail / 274 expects`. Full hermetic retries were terminated by the host with exit 137 (default and single concurrency) or 143 (`--parallel=1`) before summary output, with no assertion failure observed before termination.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: gatekeeper
> **Source**: local-read-only-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending-global-verification
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: b2fd1379a5eca9e18eee011482f59fb9cfd27954
> **Verification Evidence SHA256**: unavailable
> **Issued At**: unavailable

- Summary: Receipt intentionally withheld because contract-required global verification did not reach a terminal summary in this host.
- Findings: one global verification blocker and one canonical projection blocker; no remaining focused code finding.

## Behavior Diff Notes

- Only mutation-observed and Stop declare effect contracts; absent contracts remain uninstrumented.
- Runtime failure telemetry distinguishes unknown, partial, complete, and reconcile-required effects without changing public hook result vocabulary.
- Stop retry compares the latest semantic Stop in a bounded 1 MiB reconciliation window; uncertainty fails closed.
- The timestamp-free key binds the complete stable recovery context and typed evidence, including review/notes and policy-derived paths; repo-root and current time are excluded because log scope and retry semantics already fix them.
- Handler-ID metric special cases are replaced by the declared contract.

## Residual Risks / Follow-ups

- The previously reported six failures were ambient-environment pollution, not source regressions: unsetting `REPO_HARNESS_NODE_BIN` and `REPO_HARNESS_SOURCE_ROOT` makes both owning files green.
- Sharded reruns isolated two unrelated terminal blockers: `closeout-runner-guardrails.test.ts` prints eight passes then exits 137; the benchmark packed-artifact reuse case times out after 60 seconds with the spawned `bun add -g` still returning `exitCode=null`. Permission- and load-sensitive failures elsewhere passed on isolated rerun.
- From current `main`, the package-local canonical provider still returns `human-action-required` and wants the manifest plus eleven capability documents because the shared flow proof changed. Ten generated documents are outside Allowed Paths, so a partial apply is forbidden.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Focused behavior and failure matrix pass; global gate remains incomplete. |
| Product depth | 9/10 | Implements retry confluence and explicit reconcile-required overflow. |
| Design quality | 9/10 | Two-handler optional contract; no generic transaction or retry scheduler. |
| Code quality | 9/10 | Typecheck and focused tests pass; multiple gate findings were fixed. |

## Failing Items

- `bun test`: no single green terminal summary; two unrelated isolated blockers remain as described above.
- canonical `architecture-projection plan --changed-path docs/architecture/modules/runtime-harness/hook-adapters.md`: `human-action-required`, with ten required generated documents outside Allowed Paths.

## Retest Steps

- Repair/adjudicate the two existing terminal test blockers, then rerun `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test` in CI.
- Revise a separate projection work package to own the provider's complete eleven-capability generated refresh; then regenerate the AcceptanceReceipt and rerun the final gate.

## Summary

- The scoped implementation is code-review clean and focused-green, but this contract is not fulfilled because its mandatory global verification and canonical projection gates are unresolved.

# Task Review: codex-native-agent-authority

> **Status**: Pending
> **Plan**: plans/plan-20260811-1344-codex-native-agent-authority.md
> **Contract**: tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md
> **Notes File**: tasks/notes/20260811-1344-codex-native-agent-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-11 18:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:eb6ac6f835b312f1440f2d6507208530ec00aabccdeebdb66da285e01e97e721
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f2b1d84f5f15b0ea4f73545bbfccd68c358dc180

## Human Review Card

- Verdict: pass for the source work-package; external acceptance remains pending.
- Change type: code-change.
- Intended files changed: native Codex delegation runtime, installer/config retirement, policy and contract-template projections, readiness checker, generated mirrors, focused tests, release/reference/architecture docs, and the matching workflow artifacts under the contract Allowed Paths.
- Actual files changed: 44 normalized implementation paths plus 6 excluded workflow paths; review subject `sha256:eb6ac6f835b312f1440f2d6507208530ec00aabccdeebdb66da285e01e97e721`, target `f2b1d84f`.
- Commands passed: full `bun test` (2311 pass / 1 skip / 0 fail); focused hook, checker, installer, session, Stop, scaffold, helper, README, and parity suites; strict contract verification (23 pass / 0 fail, contract `Fulfilled`); typecheck; hook/helper/reference projection checks; packaged tarball install smoke; deploy SQL order; architecture sync; strict workflow check; project inspector; init dry-run.
- Residual risks: the installed global `repo-harness-hook` is still package 0.14.1 from before this worktree, so the source cutover is not active on this machine until the package is refreshed after merge. Codex officially documents per-agent `model_reasoning_effort`, but `SubagentStart` does not expose the effective effort; runtime effort remains `configured_unverified` by design.
- Reviewer action required: record the contract's configured external acceptance or an explicit waiver after the final subject is committed; refresh the installed package only after merge/release approval.
- Rollback: revert this single work-package to restore the pre-cutover App-thread/fallback and delegation-mode surfaces. No global install or external state was changed by this worktree.

## Mode Evidence

- Selected route: Waza `/check` deep code review (500+ changed lines, installer/hook/policy/runtime evidence surface).
- P1/P2/P3 evidence: the captured plan maps fleet authoring/projection, typed hook routing, policy seeds, installer state, and readiness evidence; traces `/delegate` -> advisor -> native `spawn_agent(agent_type)` -> official `SubagentStart` -> bounded pointer/observation -> strict checker; selects native role identity as the single runtime authority.
- Root cause or plan evidence: older flat Codex V2 could not select per-role models, so repo-harness used App threads. Live Codex 0.147 accepted `agent_type` and official events observed `explorer` on Luna and `deep-reasoner` on Terra, falsifying the old transport assumption while leaving effort readback unavailable.

## Verification Evidence

- Waza `/check` run: deep review with architecture and security specialists plus assumption, composition, cascade, and abuse passes. Findings were re-read against the current diff and fixed: anchored slash-command authorization, race-safe dedicated evidence locking, writer/checker and source/template schema parity, no historical evidence revival, strict `unverified` failure, missing-identity negative evidence, current-scope retention capped at 32, and native evidence independence from advisor state.
- Commands run: `bun test`; focused suites for every changed runtime and projection; `repo-harness run verify-contract --contract tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md --strict`; `bun run check:type`; `bun run check:hooks`; `bun run check:helpers`; `bun run check:reference-configs`; `bun run smoke:tarball-install`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `repo-harness run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`; `git diff --check`.
- Manual checks: searched current runtime, installer, generated seeds, templates, and active reference docs for retired `delegation.mode`, App-thread, `codex-exec`, main-thread fallback, `DelegationFallback`, and fallback-state authorities. Remaining hits are explicit retirement statements, historical append-only artifacts, sidecar-research policy, or the independent generic contract-run transport vocabulary.
- Supporting artifacts: `.ai/harness/runs/` live canary cache (ignored), `/tmp/repo-harness-native-authority-bun-test.log` full-suite log, and the direct hook-to-checker regression in `tests/check-agent-tooling.test.ts`.
- Implementation notes reviewed: yes.
- Run snapshot: no committed run snapshot was generated by the source review; full command evidence is recorded above and in the ignored runtime cache/log paths.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: kito
> **Reviewed Subject SHA256**: sha256:b927b1944c348c2c32f70ee4030609c26a24b745406a0a58402d2b9958da09e9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e922c27099365c7e7f259df508fa46cf6c6260c1
> **Verification Evidence SHA256**: sha256:4efe7173aa7df981010d7d07f53bda0b263153786113594cc6e436f9d5cfd791
> **Issued At**: 2026-08-11T11:29:29.185Z

- Summary: Contract owner explicitly waived the configured Claude second review after its CLI authentication failed; accepts the bounded residual risks recorded in the review.
- Findings: none

## Behavior Diff Notes

- Codex fleet dispatch now has one identity/lifecycle authority: native `spawn_agent` with the exact installed `agent_type` and `fork_turns="none"`. App threads, `codex-exec`, and main-thread fleet fallback are not authorized.
- `/delegate` and `/parallel` are prompt-start typed commands only. Natural-language hook inference, SessionStart standing authorization, and installer-managed `delegation.mode` are removed without a compatibility reader.
- Every official `SubagentStart` writes advisor-independent role/model evidence under a dedicated lock. The pointer selects only the current scope, observations are capped at 32, missing fields create durable `unverified` evidence, and strict readiness fails on every non-verified aggregate.
- Agent TOMLs continue to pin `model_reasoning_effort` as documented by OpenAI. The checker verifies only official `agent_type`/`model` readback and records effort as `configured_unverified`.
- Generated task contracts select only `subagent` and `fallback: null`; Stop no longer synthesizes a second dispatch instruction.

## Residual Risks / Follow-ups

- Deployment gap: source and packaged smoke are green, but the currently installed global hook predates this branch. Do not claim the new authority is live until a reviewed merge/release refreshes the global package.
- Evidence boundary: Codex exposes configured/requested reasoning effort but no effective effort field in `SubagentStart`; no runtime verification claim is possible without a future official field.
- Intent binding: official evidence proves the role/model that actually started, not that an orchestrator chose the role the user intended. The native spawn call remains the request authority; no shadow prompt parser was added.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Live cross-model routing and direct hook-to-checker behavior are proven; effective effort remains intentionally unverified. |
| Product depth | 9/10 | Removes all competing Codex fleet authorities and closes negative/stale evidence paths instead of adding another fallback. |
| Design quality | 9/10 | One authored fleet source, deterministic projections, one native runtime identity, bounded current-scope evidence, fail-closed readiness. |
| Code quality | 9/10 | Race-safe writes, separate locks, bounded retention, source/template drift checks, full suite and packaged install smoke pass. |

## Failing Items

- External AcceptanceReceipt is not recorded; this blocks the configured acceptance/merge gate, not the fulfilled contract verification or source-review recommendation.
- Global installed runtime is intentionally unchanged and therefore does not yet execute this worktree's hook bundle.

## Retest Steps

- Re-run: `bun test`; `bun run smoke:tarball-install`; root required checks from `AGENTS.md`.
- Re-check: `bun src/cli/index.ts review-subject --format json`; helper/reference projection checks; one post-install native explorer/deep-reasoner canary followed by `repo-harness run check-agent-tooling --host codex --strict-readiness`.

## Summary

- Source review passes. Codex native `agent_type` now owns fleet selection, official `SubagentStart` evidence proves per-role model routing independently of advisor state, and non-verified evidence fails closed without a second runner. Per-agent effort remains configured through official TOML but cannot be runtime-verified from the current official hook payload. Contract closeout awaits external acceptance or waiver and a later approved package refresh.

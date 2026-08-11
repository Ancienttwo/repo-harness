# Task Review: managed-toolchain-reconciliation-ship-fixes

> **Status**: Pass
> **Plan**: plans/plan-20260811-1124-managed-toolchain-reconciliation-ship-fixes.md
> **Contract**: tasks/contracts/20260811-1124-managed-toolchain-reconciliation-ship-fixes.contract.md
> **Notes File**: tasks/notes/20260811-1124-managed-toolchain-reconciliation-ship-fixes.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-11 12:48
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:6b3e8538454524af983808aef43b28e2b09669430e58d404b76ec27a7ae09572
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f2b1d84f5f15b0ea4f73545bbfccd68c358dc180

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: managed runtime reconciliation, ArchContext model/projection, CI runtime pin, downstream adoption ignores, tests, and synchronized workflow/docs assets.
- Actual files changed: 75 files within the contract Allowed Paths.
- Commands passed: two full local `check:ci`/`check:release` gates, strict contract verification, Node24 AXR6, architecture/task/workflow gates, and targeted runtime/provider/orchestration tests.
- Residual risks: Waza/Mermaid remain mutable third-party sources only when the operator explicitly opts in with `--with-external-skills`.
- Reviewer action required: none; user explicitly waived the unavailable Claude review and final PR CI remains mandatory before merge.
- Rollback: revert the candidate commit series; no npm publish, tag, GitHub Release, or live host refresh is included.

## Mode Evidence

- Selected route: Waza `/check` deep review plus independent security, architecture, adversarial, skeptic, and final gatekeeper review. The first final gatekeeper pass was superseded by a later FAIL on caller-PATH Node provenance; the repaired final subject then received gatekeeper PASS.
- P1/P2/P3 evidence: map covers CLI update, package closure, host projection, ArchContext provider/model, downstream adoption, and CI; trace proves old CLI install -> packaged candidate readback -> fail-closed host projection; decision keeps mutable providers explicit and removes unauthenticated approval authority.
- Root cause or plan evidence: destructive reinstall, partial mutation, mutable default provider refresh, stale first-invocation updater, and raw accepted-change identifiers were reproduced before repair.

## Verification Evidence

- Waza `/check` run: deep whole-diff review completed; after the caller-PATH Node provenance correction, the gatekeeper returned PASS for subject `sha256:6b3e8538...09572`.
- Commands run: post-fix `bun run check:release` (2324 pass, 1 skip, 0 fail), `bun run check:type`, targeted Bun tests, Node24 `scripts/axr6-stop-host-cycle.ts`, architecture/task/workflow checks, repository inspection, init dry-run, strict contract verification, and `verify-sprint`.
- Manual checks: immutable target overlap is empty; CI jobs pin Node 24; historical skill version remains 0.4.0; raw accepted-change flags are absent; default update does not invoke external providers.
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/runs/run-20260811T124648-35362-20260811-1124-managed-toolchain-reconciliation-ship-fixes.json`, the final gatekeeper PASS, and the typed user-waiver grant. The receipt is regenerated after prepared evidence binds the final subject.
- Implementation notes reviewed: yes.
- Run snapshot: post-fix release and strict contract verification pass; final prepared evidence and receipt are projected immediately after this review update.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:6b3e8538454524af983808aef43b28e2b09669430e58d404b76ec27a7ae09572
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: f2b1d84f5f15b0ea4f73545bbfccd68c358dc180
> **Verification Evidence SHA256**: sha256:295e24955f14b8d523181a042bf0c2272b5182ef03c3c6a0529478c8d1e33306
> **Issued At**: 2026-08-11T05:45:22.083Z

- Summary: User explicitly instructed to skip Claude review after the Claude CLI weekly limit blocked external review; gatekeeper PASS and final check:release evidence remain required.
- Findings: none

## Behavior Diff Notes

- Ordinary `repo-harness update` now preserves the known-good CLI, verifies the exact ArchContext closure through the installed candidate, and stops before host mutation on mismatch.
- Mutable Waza/Mermaid refresh is explicit-only. Architecture projection apply requires the full base model while capability status remains valid for nodes-only repositories.
- Caller-authored architecture acceptance flags are removed; no fake ChangeSet/event identifiers can advance semantic refresh.
- Protected closeout helpers ignore caller PATH/runtime hints, discover Node only from fixed system/NVM/GitHub-toolcache installation roots, retain a minimal child PATH, and pass one independently revalidated Node 24 executable to the ArchContext provider.

## Residual Risks / Follow-ups

- Explicit external-skill refresh still consumes mutable upstream providers. An immutable revision plus tree-digest distribution protocol remains a separate, explicitly out-of-scope work package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Exact closure, first-invocation handoff, no-cli, and failure paths are covered. |
| Product depth | 9/10 | Release behavior and downstream adoption are coherent; immutable external-skill distribution remains out of scope. |
| Design quality | 9/10 | Capability and projection authorities are separated and fail closed. |
| Code quality | 10/10 | Full CI/release, package smoke, targeted regression tests, and architecture fixed point passed. |

## Failing Items

- None.

## Retest Steps

- Re-run: `PATH=/Users/ancienttwo/.nvm/versions/node/v24.18.0/bin:$PATH bun run check:release`.
- Re-check: PR CI on Node 24 and the final `origin/main` ancestry before merge.

## Summary

- PASS. The caller-PATH Node authority finding is repaired, full release and strict contract verification pass, and the final gatekeeper approved the normalized subject; typed waiver projection and PR CI remain mechanical gates.

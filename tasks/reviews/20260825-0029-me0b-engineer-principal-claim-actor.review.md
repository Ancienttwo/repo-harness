# Task Review: me0b-engineer-principal-claim-actor

> **Status**: Pass
> **Plan**: plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
> **Contract**: tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md
> **Notes File**: tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-25 02:27
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: restricted Engineer MCP/OAuth boundary, principal/receipt effects, architecture projections, focused tests, and workflow evidence named by the contract.
- Actual files changed: 47 contract-allowed paths across ArchContext, generated architecture docs, MCP/Engineer core and effects, tests, and workflow artifacts.
- Commands passed: full 3053-test repository suite; focused Engineer/OAuth/HTTP suites; typecheck; architecture, task, SQL, state-inspection, and init dry-run gates.
- Residual risks: P0 remains single-host/user-level state; mapping lock contention and linear authorization enumeration are accepted scale limits, not correctness fallbacks.
- Reviewer action required: none.
- Rollback: revert the isolated ME-0B work-package; generic Fleet, Lease, WorkEnvelope, Publication, and Acceptance schemas were not changed.

## Mode Evidence

- Selected route: strict architecture/security review plus adversarial composition and real transport readback.
- P1/P2/P3 evidence: P1 maps OAuth/HTTP, MCP exact dispatch, user-level mapping, Git-common-dir Binding/receipt, and canonical Fleet/Lease authorities. P2 traces verified bearer → authorization ID → mapping → live Binding → Fleet Claim/WorkEnvelope → immutable receipt, including own-Claim compensation. P3 keeps the carrier, Binding, Lease, and provenance authorities separate so no second identity or task state machine exists.
- Root cause or plan evidence: Approved ME-0B PRD and captured work-package plan; accepted ArchContext change set and fixed-point projection.

## Verification Evidence

- Waza `/check` run: deep diff review completed; two carrier/path hardening gaps were fixed, and the acceptance projection additionally forced the acquire stage onto a non-truncated exact-selector boundary before the final subject.
- Commands run: `bun run check:type`; `bun test --timeout 60000`; contract focused suite; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; state inspector; init dry-run.
- Manual checks: CLI help exposes operator principal commands but no CLI acquire; Engineer profile exposes exactly `engineer_status` and `engineer_acquire`; stdio and non-OAuth HTTP carriers fail closed.
- Supporting artifacts: accepted architecture projection, `.ai/harness/checks/latest.json`, and `.ai/harness/runs/`.
- Implementation notes reviewed: yes.
- Run snapshot: final AcceptanceReceipt preparation run.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:0e8ce0e682271ebd683676882ec546b8a79c67849b7516d7214ebe6b9878b388
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e13bb3fd68592172fbda2d236b3e78f7474e3136
> **Verification Evidence SHA256**: sha256:5ab19a922a1eb17a3f4f9ca65ecd06b9ac5b970f097f4ff5d39210e9d75f0d19
> **Issued At**: 2026-08-24T19:15:26.470Z

- Summary: Architecture Acceptance approved; authenticated Engineer principal, exact MCP acquire flow, immutable ClaimActor receipt, and fail-closed carrier/store boundaries verified with no remaining P0-P3 findings.
- Findings: none

## Behavior Diff Notes

- Adds one OAuth-only `engineer` MCP profile with a distinct scope and authorization-bound session ownership; it creates no coding runtime and exposes no generic tools.
- Adds canonical per-authorization principal mapping, live ME-0A Binding revalidation, immutable ClaimActorReceipt publication, and a wrapper over existing Fleet acquire.
- Receipt failure re-reads exact Claim ID/generation and invokes the existing release authority only for that Claim; foreign replacement is retained and reported.

## Residual Risks / Follow-ups

- Deliberate P0 scale limit: the user-level mapping store has one lock and list operations are linear. The two-canary single-host scope does not justify a second index or database authority.
- Provider Thread remains nullable observation, not authentication. Provider adapters and remote Worker Host remain deferred children.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Frozen acceptance scripts and failure matrix pass. |
| Product depth | 9/10 | Complete P0 carrier/provenance slice; later Provider/Worker layers remain intentionally deferred. |
| Design quality | 10/10 | Authorities remain separated and generic Fleet/Lease schemas are unchanged. |
| Code quality | 10/10 | Exact-key protocols, fail-closed stores, typed errors, focused fault injection, and full-suite coverage. |

## Failing Items

- None.

## Retest Steps

- Re-run: commands listed in the contract `Exit Criteria` plus `bun test --timeout 60000`.
- Re-check: `repo-harness run verify-sprint --prepare-acceptance`, record the frozen Codex disposition, then final `repo-harness run verify-sprint`.

## Summary

- Pass. No P0/P1/P2/P3 findings remain on the final subject; the two review-discovered gaps are covered by regression tests.

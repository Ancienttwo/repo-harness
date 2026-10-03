# Approved plan edit readiness

> **Status**: Approved
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Substantive Change SHA256**: `sha256:0fbac13222186380dac4ce0e7f381a05fa939af5b2c73a81b993daf333e99df4`

User approved fixing the guard that blocks AiphaBee implementation. P1: one projector produces the work-package fact for the shared readiness evaluator. P2: an approved plan with an open task fails Standard edit because execution completion is required. Missing text incorrectly passes the same predicate. P3: retain approval authority and all ship requirements; expose planning approval to edit only. No policy matrix or characterization fixture changes.

## Task Breakdown

- [x] Reproduce open-task edit failure and missing-content false approval.
- [x] Fix the projector/evaluator and verify completion plus fresh evidence still gates ship.
- [x] Run 59 focused tests and TypeScript checks.
- [x] Run repository integrity checks and install the locally built package; record the unrelated architecture projection gap below.
- [x] Verify the affected AiphaBee edit using the installed CLI/hook.

Installed from locally packed `/tmp/repo-harness-0.18.0.tgz`; source projector and built hook byte-match the installed files. Actual AiphaBee Standard edit resolves allow, ship resolves block, and askTerminalQuote.ts was created through the hook. The later multi-file API edit correctly selects Strict and requires a contract/worktree; it is not the original bug.

Checks: 59 tests, typecheck, deploy SQL order, task workflow, task sync with bound diff, project-state inspection and init dry-run passed. Architecture sync remains blocked by pre-existing job `job-87d87ef2b2309532d4e769a2` (deferred-goal-ledger reconciliation, unrelated paths). One normal drain attempt timed out after 118102 ms and retained retry-pending; no queue or acceptance state was bypassed. Source changes remain uncommitted; no registry release claimed.

Rollback: revert the three source/test changes and reinstall registry version 0.18.0. This local correction is not a registry release. Durable rationale: docs/researches/2026-09-07-approved-plan-edit-readiness.md.

## Local WIP save requested on 2026-09-08

The owner requested committing the local WIP. Current focused tests and typecheck pass; project-state, task-workflow, deploy-SQL and init dry-run pass. The pre-existing pending architecture projection still blocks complete acceptance. This commit preserves the readiness changes and session transfer snapshot; it does not claim release or a resolved architecture queue.

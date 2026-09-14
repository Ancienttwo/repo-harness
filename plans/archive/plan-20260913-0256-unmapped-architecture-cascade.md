# Plan: Skip unmapped automatic capability context events

> **Status**: Done
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Real CLI legacy cascade and command-layer invalid-authority coverage
> **Rollback Surface**: Revert the isolated capability-context diff
> **Workflow Profile**: standard
> **Substantive Change SHA256**: `sha256:cb3120789f6e1a5f3b51fd9351cbf09a4f67d05f55c80859db80abf74d1624a5`

## Goal
Allow automatic architecture events for canonically unmapped paths to finish the legacy cascade without creating capability-context requests. Preserve strict errors for registry corruption, unknown real IDs and explicit CLI path requests.

## P1 / P2 / P3
The authority is scripts/capability-resolver.ts readRegistry/findMatch. architecture-queue records an umbrella root card for pnpm-workspace.yaml, then processArchitectureCascade calls capability-context request. That command attempts findCapabilityById(root) and aborts the path, retaining the batch offset. Return the existing skipped status only for automatic synthetic-root or ID-less events whose canonical match is unmapped. Keep all other errors, existing architecture cards, locks and cursor writes unchanged. At 10x volume the subprocess cost remains; throughput changes are outside scope.

## Scope
Owner: codex/unmapped-architecture-cascade in repo-harness-wt-unmapped-cascade. Files: src/cli/commands/capability-context.ts, tests/cli/capability-context.test.ts, tests/architecture-drift.test.ts, tasks/lessons.md. No downstream writes, package release, provider configuration or document migration.

## Task Breakdown
- [x] Trace canonical ownership and reproduce synthetic-root rejection before changing production source.
- [x] Add regression coverage in existing command and drift suites; implement the automatic-event skip.
- [x] Run focused coverage, required integrity checks and a standard review; record any release boundary.

## Root Cause Evidence
- root_cause: runCapabilityContextRequest treats the queue synthetic root ID as a registered capability, aborting processArchitectureCascade.
- repro: bun test tests/cli/capability-context.test.ts --test-name-pattern 'automatic unmapped'
- regression_guard: the automatic unmapped event test plus real CLI drain with an ArchContext-owned mapped tail.
- pre_fix_failure_artifact: `.ai/harness/runs/unmapped-cascade-pre-fix.log`: both new guards failed on original production source; the valid ArchContext fixture stopped at pnpm-workspace.yaml with capability-context exit 1.

## Verification Plan
Focused: bun test tests/cli/capability-context.test.ts tests/architecture-drift.test.ts tests/architecture-drift-recovery.test.ts. New unit coverage distinguishes skipped automatic events from invalid authority; real CLI coverage verifies the subprocess and cursor boundary with the actual helpers. Expected under one minute, no provider calls. Required integrity checks follow AGENTS.md, plus bun run check:type. Do not run the full suite locally without an uncovered integration risk.

## Acceptance
The real CLI crosses pnpm-workspace.yaml, advances the cursor to the frozen HEAD, keeps the root architecture card and queues only sdk-sdk-root. Invalid authority still fails closed. Existing dirty main files stay untouched. Local validation does not establish released runtime or downstream queue completion.

## Promotion Gate
- **Merge/PR unit**: One upstream unmapped-event command repair with its regression guards.
- **Rollback surface**: Revert only this isolated worktree diff.
- **Verification boundary**: Real CLI to shell helpers to canonical registry to durable cursor; branch guards below that boundary.
- **Review/acceptance boundary**: Local check against this plan; release and downstream drain are separate from local verification.
- **High-risk surface**: Preserve errors for malformed authority and never write the cursor directly.
- **Why not checklist row**: Independent cross-capability verification boundary with no existing active plan.

## Evidence Contract
- **State/progress path**: This plan; durable lesson in tasks/lessons.md.
- **Verification evidence**: .ai/harness/runs/unmapped-cascade-*.log and this session's command exit statuses.
- **Evaluator rubric**: Scoped check of skip eligibility, untouched failure paths, subprocess entrypoint, mapped-tail queue and cursor completion.
- **Stop condition**: Regression guards and required checks pass; report unreleased/downstream boundary.
- **Rollback surface**: Revert the source and test diff; preserve unrelated main WIP.

## Local Disposition
The original source failed both added guards. The fixed source passed the 40 cases in the three focused files, typecheck, and all nine required repository-integrity commands. Command stdout and JSON both expose skipped with exit zero. Quick check covered the full five-file diff, the two automatic callers (legacy cascade and refresh consumer), and explicit/invalid request paths. No additional reviewer or full suite was needed for this 11-line command change.

The implementation and test subject remains based on a6f5de37. Raw execution output stays in the ignored runs directory. No release, global runtime installation, downstream queue drain, historical queue cleanup or document migration was performed. The patch remains uncommitted in the isolated worktree for inspection. The durable rule is promoted to tasks/lessons.md.

Out-of-scope observation: source CLI `run --help` reports `unknown: evidence-gc` in the help-group registry check; that surface is unchanged by this patch. Direct capture-plan helper execution and every required verification command completed successfully. No unrelated repair was attempted.

> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-1239-loop-engine-05-contract-run-pilot.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: loop-engine-05-contract-run-pilot

> **Status**: Complete
> **Plan**: plans/plan-20260612-1239-loop-engine-05-contract-run-pilot.md
> **Contract**: tasks/contracts/20260612-1239-loop-engine-05-contract-run-pilot.contract.md
> **Notes File**: tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 12:48
> **Recommendation**: pass

## Mode Evidence

- Selected route: contract-level helper slice under the active sprint.
- P1/P2/P3 evidence: runtime boundary is repo-local helper `scripts/contract-run.ts`; caller supplies explicit child commands; existing `contract-worktree.sh finish` remains the authoritative done gate.
- Root cause or plan evidence: backlog row 5 requires worker/verifier delegation without changing hook routing, scheduler behavior, or prompt-intent classification.

## Verification Evidence

- Waza `/check` run: represented by `verify-contract.sh` / `verify-sprint.sh` gates for this contract.
- Commands run:
  - `bun test tests/contract-run.test.ts`
  - `bun test tests/bootstrap-files.test.ts tests/migration-script.test.ts tests/workflow-contract.test.ts`
- Manual checks: confirmed `contract-run.ts` keeps parent orchestration to prompt/manifest/child-command execution and verifier prompt includes only the contract `exit_criteria`.
- Supporting artifacts: `scripts/contract-run.ts`, `assets/templates/helpers/contract-run.ts`, `tests/contract-run.test.ts`, `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`.
- Implementation notes reviewed: `tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md`.
- Run snapshot: `tests/contract-run.test.ts` creates a temp contract, runs fake worker/verifier children, then runs `scripts/verify-contract.sh --strict --read-only` against that contract.

## Execution Log

| Path | Result | Review quality note |
|------|--------|---------------------|
| Single-session baseline | Parent implements and writes review directly | Fast, but mixes implementation and evaluation in one role. |
| `contract-run` pilot | Worker child writes the contract artifact; verifier child writes the review; `verify-contract.sh` validates the review as the done gate | Review is narrower and more auditable because the verifier prompt contains only `exit_criteria`; budget overrun skips the next child before execution. |

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-12 12:47 +08
> **External Completed**: 2026-06-12 12:47 +08

- P1 blockers: none
- P2 advisories: provider-specific Claude/Codex child spawning remains out of scope; callers must pass explicit commands.
- Acceptance checklist:
  - pass: `contract-run` has worker and verifier child roles via `CONTRACT_RUN_ROLE`.
  - pass: verifier prompt is built from the contract `exit_criteria` block.
  - pass: budget overrun exits with `failure_class: "budget_exceeded"` and skips the next child command.
  - pass: pilot fixture reaches `verify-contract.sh --strict --read-only` with `failed=0`.

## Behavior Diff Notes

- Adds a new repo-local helper and manifest/install parity only.
- Does not change `.ai/hooks`, prompt guard, sprint backlog routing, or `contract-worktree.sh finish`.

## Residual Risks / Follow-ups

- Budget accounting is currently child-command count based. Token and tool telemetry can be added after a real provider runner exists.
- Child commands are explicit shell commands supplied by the parent process; this is intentional for the pilot and should not be fed untrusted contract text.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Meets row 5 helper, verifier, budget, and pilot gate requirements. |
| Product depth | 7/10 | Establishes the minimal delegation primitive without provider lock-in. |
| Design quality | 7/10 | Keeps runner behavior explicit and file-backed. |
| Code quality | 8/10 | Covered by temp-repo orchestration tests plus manifest/install parity tests. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/contract-run.test.ts`.
- Re-check: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-1239-loop-engine-05-contract-run-pilot.contract.md --strict --read-only`.

## Summary

- Row 5 is ready for contract verification. The helper creates worker/verifier prompts, runs explicit child commands, records a manifest, enforces budget before child execution, and has a contract-verifiable pilot fixture.

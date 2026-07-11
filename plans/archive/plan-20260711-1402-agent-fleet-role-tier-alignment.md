# Plan: Agent fleet role-tier alignment

> **Status**: Archived
> **Created**: 20260711-1402
> **Slug**: agent-fleet-role-tier-alignment
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Fleet generation tests, helper parity, installed-host readback, and root required checks.
> **Rollback Surface**: Revert the generator/golden/doc changes and reinstall the prior managed fleet.
> **Task Contract**: `tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md`
> **Task Review**: `tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md`
> **Implementation Notes**: `tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md`

## Agentic Routing

- Selected route: sequential bounded implementation in an isolated worktree
- Routing reason: the mapping, golden file, mirrors, and tests form one ordered authority chain and should not be edited concurrently.
- Due diligence:
  - P1 map: upstream Fable frontmatter is converted by `scripts/install-agent-fleet.sh`; the template helper mirrors it, `.codex/agents/*.toml` is the golden output, and tests/docs project the mapping.
  - P2 trace: `fast-worker.md` (`sonnet`/`max`) -> `MODEL_EFFORT_MAP` -> `generateToml` -> `~/.codex/agents/fast-worker.toml`; `--force` replaces a local drifted copy.
  - P3 decision rationale: map the execution role to Sol/high, leave Terra/medium for the separately installed read-only explorer, and explicitly avoid claiming this changes GPT-5.6 V2 runtime role selection.

## Workflow Inventory

- Active plan: `plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md`
- Sprint contract: `tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md`
- Sprint review: `tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md`
- Implementation notes: `tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: contract `allowed_paths`
- Concurrency rule: this worktree owns this plan; unrelated worktrees remain untouched.
- Execution isolation: `/Users/kito/Projects/repo-harness-worktrees/agent-fleet-role-tier-alignment`

## Scope

- In scope: generated Codex `fast-worker` model/effort/description and workspace-write sandbox, generator and template parity, golden/test/doc projections, workflow closeout, local installed readback, and corrective enforcement of the Bun runtime floor across shell, PowerShell, and CLI-driven public install/update entrypoints.
- Out of scope: native V2 role selection, explorer fleet management, Claude source semantics, delegation triggers, CLI upgrades, provider changes, or compatibility aliases.

## Task Breakdown

- [x] Change the deterministic `sonnet/max` Codex projection to Sol/high.
- [x] Update the golden `fast-worker` TOML and exact tests/docs projections.
- [x] Run focused and root verification.
- [x] Force-install the verified fleet locally and read back the effective files.
- [x] Complete review and workflow closeout.

## Evidence Contract

- **State/progress path**: this plan and its contract/review/notes files.
- **Verification evidence**: focused Bun tests, helper `cmp`, required checks, and local TOML readback.
- **Evaluator rubric**: one authority mapping, mirrored helper parity, exact generated output, no runtime-routing claim.
- **Stop condition**: stop if Claude fleet semantics must change or if the generator cannot preserve exact golden output.
- **Rollback surface**: generator mapping, mirrored helper, golden TOML, tests, docs, and local installed file.

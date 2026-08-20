# Plan: Windows Protected Helper Platform Contract

> **Status**: Archived
> **Created**: 20260820-2347
> **Slug**: windows-protected-helper-platform-contract
> **Planning Source**: codex-plan
> **Orchestration Kind**: codex-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`; after execution revert branch `codex/windows-protected-helper-platform-contract` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md`
> **Task Review**: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`
> **Implementation Notes**: `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`
- Sprint contract: `tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md`
- Sprint review: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`
- Implementation notes: `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-2347-windows-protected-helper-platform-contract.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md`
- Review file: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`
- Implementation notes file: `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`; after execution revert branch `codex/windows-protected-helper-platform-contract` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md`, `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`, and `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`; after execution revert branch `codex/windows-protected-helper-platform-contract` or the explicitly reviewed diff.

## Captured Planning Output

# Goal

Make the four protected workflow helpers executable on native Windows without trusting caller `PATH`, `HOME`, helper-source overrides, or arbitrary Bash distributions. `repo-harness install`/`update` must pin one explicit Git-for-Windows toolchain into host-owned configuration, and normal protected-helper dispatch must fail closed when that contract is absent, malformed, moved, or incomplete.

# Success Criteria

- On Windows, an explicit install/update ceremony discovers and validates Git for Windows (`git.exe`, `bash.exe`, `usr/bin`) plus the native system-tools directory, then records their canonical absolute paths in the OS account's `~/.repo-harness/config.json` without discarding sibling user fields.
- `acceptance-receipt`, `merge-gate`, `contract-worktree`, and `ship-worktrees` run through the recorded contract and ignore caller `PATH`, `HOME`, `REPO_HARNESS_SOURCE_ROOT`, and runtime binary overrides.
- The protected child environment uses the platform path delimiter, native temporary directory, pinned Bun/Git/Bash paths, Git-for-Windows POSIX tools, and a trusted `taskkill.exe` directory for supervised process-tree cleanup.
- Missing, malformed, symlinked, cross-installation, or incomplete Windows contracts produce an actionable fail-closed error; there is no runtime `PATH` fallback.
- Windows CI executes a real Git-for-Windows protected-helper smoke, while platform-neutral tests cover schema/path validation and caller-injection resistance.
- Source helpers and `assets/templates/helpers` mirrors remain byte-identical where required; README and architecture documentation state the platform contract and prerequisites.

# Scope

- `src/cli/runtime/helper-runner.ts` and a dedicated protected-helper platform-runtime module.
- Windows host-runtime configuration during `repo-harness install`/`update`.
- Protected process-supervisor environment propagation needed to keep `taskkill` out of caller `PATH` authority.
- `acceptance-receipt` and `merge-gate` consumption of the runner-pinned Git/path contract, including packaged mirrors.
- Focused unit, CLI, package-mirror, and Windows matrix verification.

# Non-Scope

- Rewriting `contract-worktree.sh` or `ship-worktrees.sh` in TypeScript/PowerShell.
- Installing Git for Windows, jq, gh, WSL, Cygwin, MSYS2, or a package manager.
- Supporting arbitrary user-selected Bash distributions or silently accepting per-run binary overrides.
- Fixing the separately reported initialize lease, health cold path, or stale workspace list issues.

# P1 · Architecture Map

Entry is CLI/MCP `runHelper`; `helper-runner.ts` owns protected-helper resolution, packaged-source authority, bounded supervision, and child environment construction. Host install/update owns durable machine configuration. Git for Windows supplies Bash plus the POSIX utilities consumed by the two shell helpers. `acceptance-receipt.ts` and `merge-gate.ts` are TypeScript protected helpers but still cross the same Git authority. `process-runner.ts`/`process-supervisor.ts` own timeout and Windows process-tree termination. Authoritative mirrors are `scripts/*` and `assets/templates/helpers/*`; docs authority is the workflow-engine contract-assets module.

# P2 · Concrete Trace

During explicit install/update, the trusted ceremony resolves `git.exe` and `taskkill.exe` from the operator environment, derives and validates the matching Git-for-Windows root, probes the runtime, and atomically persists the exact contract. Later `repo-harness run contract-worktree ...` resolves the target repo with the pinned Git, selects the packaged helper, constructs a sanitized platform-native environment, launches pinned Bash under the supervisor, and lets nested helper calls inherit only the recorded toolchain. Any contract/readback failure stops before helper execution or repository mutation.

# P3 · Design Decision

Treat install/update as the only PATH-based discovery ceremony and the host config as runtime authority. Do not probe caller PATH during protected dispatch. Require Bash/Git/POSIX tools to share one Git-for-Windows root so replacing only `bash.exe` cannot widen trust. Preserve the existing packaged-helper and process-supervision invariants. At 10x scale, repeated contract validation is bounded local I/O; the first operational failure is host toolchain relocation after a Git upgrade, which intentionally requires rerunning `repo-harness update` rather than a compatibility fallback.

# Verification

- Focused protected-runtime and run-helper tests.
- Real Windows Git-for-Windows smoke in the existing OS matrix.
- Typecheck, helper mirror checks, full test suite, root required checks, `init --dry-run`, package dry-run, and strict contract verification.
- External semantic acceptance before merge because this changes a protected execution/trust boundary.

# Rollback

Revert the runtime-contract module, helper-runner/process-supervisor wiring, helper Git-env changes and mirrors, install/update projection, CI test, and docs as one publication unit. Existing Windows config data is inert after rollback; no repository state migration is performed.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add and capture the pre-fix Windows protected-runtime regression.
- [x] Implement strict host contract discovery, persistence, and runtime validation.
- [x] Route all four protected helpers and process supervision through the pinned platform toolchain.
- [x] Add real Windows CI smoke, mirror checks, and platform-contract documentation.
- [ ] Run focused/full verification, external acceptance, and workflow closeout.

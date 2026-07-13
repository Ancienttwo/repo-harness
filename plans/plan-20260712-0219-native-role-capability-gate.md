# Plan: Native Role Capability Gate

> **Status**: Executing
> **Created**: 20260712-0219
> **Slug**: native-role-capability-gate
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Codex native role/model selection claims become valid only after stable SubagentStart metadata matches the configured custom-agent profile.
> **Rollback Surface**: Revert the hook, tooling-report, tests, and reference-doc changes; no user data or persistent schema migration is involved.
> **Spec**: `docs/spec.md`
> **Research**: OpenAI Hooks and Subagents documentation plus the `codex-cli 0.144.1` native canary recorded in the predecessor blocked worktree.
> **Task Contract**: `tasks/contracts/20260712-0219-native-role-capability-gate.contract.md`
> **Task Review**: `tasks/reviews/20260712-0219-native-role-capability-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260712-0219-native-role-capability-gate.notes.md`

## Agentic Routing

- Selected route: Waza `/think` lightweight planning, then sequential main-thread implementation.
- Routing reason: the design is one ordered state path; parallel writers would overlap hook state and tooling-report semantics.
- Due diligence:
  - P1 map: `codex-delegation-advisor.sh` creates the repo-owned delegation state, `subagent-start-context.sh` receives Codex's stable `agent_type` and `model` fields, and `check-agent-tooling.sh` reports readiness from that state. Asset hook copies are deterministic product mirrors.
  - P2 trace: eligible prompt -> advisor writes scoped state and an evidence-directory pointer -> Codex starts children -> SubagentStart supplies authoritative `turn_id`, `agent_id`, `agent_type`, and `model` -> hook resolves the schema-authoritative TOML `name` and atomically writes one observation per child -> tooling deterministically aggregates all siblings -> strict readiness exposes the result.
  - P3 decision rationale: use the official hook payload rather than version checks, task-name inference, or unstable transcript parsing. Preserve native delegation; only block claims that lack matching runtime evidence.

## Workflow Inventory

- Active plan: `plans/plan-20260712-0219-native-role-capability-gate.md`
- Sprint contract: `tasks/contracts/20260712-0219-native-role-capability-gate.contract.md`
- Sprint review: `tasks/reviews/20260712-0219-native-role-capability-gate.review.md`
- Implementation notes: `tasks/notes/20260712-0219-native-role-capability-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: contract `allowed_paths`
- Concurrency rule: one sequential implementation stream because the hook and report share one state contract.
- Execution isolation: `/Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate` on `codex/native-role-capability-gate`.

## Approach

### Strategy

1. Mark each eligible delegation state as requiring runtime role-routing evidence; advisor text must distinguish responsibility labels from verified custom-agent selection.
2. On SubagentStart, consume only official `turn_id`, `agent_id`, `agent_type`, and `model` fields. Enumerate project then user TOMLs, select by the schema-authoritative `name`, validate required profile fields, require a model only on the selected profile, and atomically record one digest-bound observation per child.
3. Surface deterministic per-delegation aggregation in `check-agent-tooling.sh`. Keep configuration presence separate from runtime routing. `--strict-readiness` fails after authoritative negative, invalid, malformed, or config-drift evidence, but not when no canary has run; an empty reset retains the latest completed canary.
4. Mirror changed hook sources and cover verified, default-role, model-mismatch, and no-evidence cases.

### Trade-offs

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Infer support from CLI version or TOML presence | Small | Repeats the false-positive behavior already falsified | Reject |
| Scan Codex rollout JSONL | Observes `agent_role` | Transcript format is explicitly unstable and reads unrelated personal session state | Reject |
| Use stable SubagentStart `agent_type` and `model` | Official runtime authority, repo-scoped, no dependency | Cannot verify reasoning effort because the hook does not expose it | Choose |

## Detailed Design

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `.ai/hooks/codex-delegation-advisor.sh` | Modify | Require runtime evidence and stop presenting task-role labels as model-selection proof. |
| `assets/hooks/codex-delegation-advisor.sh` | Mirror | Keep product hook source synchronized. |
| `.ai/hooks/subagent-start-context.sh` | Modify | Record authoritative role/model routing evidence in scoped delegation state. |
| `assets/hooks/subagent-start-context.sh` | Mirror | Keep product hook source synchronized. |
| `.ai/hooks/.projection.json` | Regenerate | Refresh the deterministic hook-source projection marker. |
| `scripts/check-agent-tooling.sh` | Modify | Report native role-routing evidence and fail strict readiness on authoritative negative evidence. |
| `assets/templates/helpers/check-agent-tooling.sh` | Mirror | Keep the distributed helper byte-identical to the self-host source. |
| `tests/cli/hook.test.ts` | Modify | Verify default, matching custom-role, and model-mismatch state transitions. |
| `tests/check-agent-tooling.test.ts` | Modify | Verify no-evidence advisory plus strict negative/verified behavior. |
| `docs/reference-configs/external-tooling.md` | Modify | Document configuration readiness versus runtime role-routing readiness. |
| `assets/reference-configs/external-tooling.md` | Mirror | Keep the distributed external-tooling reference byte-identical. |
| Workflow artifacts | Create/update | Track scope, decisions, checks, review, and closeout. |

This work-package touches more than eight files only because repo-owned hook sources have mandatory asset mirrors and workflow artifacts are part of the repository contract. It adds no service, dependency, public API, or migration.

### Data Flow

`UserPromptSubmit` -> scoped delegation state with an evidence-directory pointer -> `SubagentStart(turn_id, agent_id, agent_type, model)` -> TOML enumeration by authoritative `name` -> atomic per-child observation -> deterministic worst-status aggregation -> tooling report / strict gate.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Default agents are misreported as custom-role failures | Medium | Medium | Apply the negative gate only to advisor-created state that explicitly requires role routing. |
| Project and user agent files disagree | Low | High | Follow Codex project-then-user lookup and validate the file's `name` exactly. |
| Malformed TOML or hook metadata creates a guessed result | Low | High | Use `Bun.TOML.parse`, bounded field validation, and strict-failing `invalid`; never echo rejected raw fields. |
| Sibling starts race or overwrite negative evidence | Medium | High | Create evidence paths concurrency-safely, key atomic observation files by the hash of official `turn_id + agent_id`, and aggregate all siblings with negative/invalid precedence. |
| Old canary survives a TOML change | Medium | High | Bind every selected-profile observation to the exact TOML SHA-256 and invalidate drift or deletion during readiness checks. |
| Hook mirror drift | Low | Medium | Run the existing hook source synchronization check. |

## Task Contracts

- Contract file: `tasks/contracts/20260712-0219-native-role-capability-gate.contract.md`
- Review file: `tasks/reviews/20260712-0219-native-role-capability-gate.review.md`
- Implementation notes file: `tasks/notes/20260712-0219-native-role-capability-gate.notes.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-0219-native-role-capability-gate.contract.md --strict`

## Handoff

- Run focused hook/tooling tests first, then root required checks.
- Review the exact state schema and ensure strict readiness distinguishes missing evidence from negative evidence.
- Finish through the isolated worktree without absorbing primary-worktree changes.

## Promotion Gate

- **Merge/PR unit**: one atomic role-routing truthfulness gate across runtime capture, reporting, tests, and operator documentation.
- **Rollback surface**: pure code and documentation revert; ignored runtime evidence remains disposable.
- **Verification boundary**: synthetic official hook-payload tests plus focused tooling-report tests and root required checks.
- **Review/acceptance boundary**: reviewer confirms no version inference, transcript parsing, or false model/effort claims.
- **High-risk surface**: strict readiness behavior changes after authoritative negative evidence.
- **Why not checklist row**: hook runtime and strict-readiness semantics form an independently reviewable behavior boundary with a direct rollback.

## Evidence Contract

- **State/progress path**: `tasks/current.md`, this plan, its contract, notes, and review.
- **Verification evidence**: focused Bun tests, hook mirror check, full root required checks, and strict contract verification.
- **Evaluator rubric**: truthful authority selection, fail-closed malformed input, regression safety, and no new dependency or unstable transcript coupling.
- **Stop condition**: stop if the released SubagentStart payload does not expose both `agent_type` and `model`, or if truthful detection requires reading Codex transcript internals.
- **Rollback surface**: revert this work-package commit; no external state rollback is required.

## Task Breakdown

- [x] Project the approved plan into its contract and exact allowed paths.
- [x] Add runtime role-routing evidence to the advisor/SubagentStart state path and mirror hooks.
- [x] Add tooling report and strict negative-evidence gate.
- [x] Add focused regression tests and operator documentation.
- [ ] Close the worktree: it is rebased onto and matches `origin/main` (`7b6ba87`) directly, independent of the primary checkout's local `main`; run `verify-sprint` against this branch to evaluate the diff basis before merge.

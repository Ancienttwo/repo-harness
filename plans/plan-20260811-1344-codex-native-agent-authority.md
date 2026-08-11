# Plan: Codex Native Agent Authority Cutover

> **Status**: Executing
> **Created**: 20260811-1344
> **Slug**: codex-native-agent-authority
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Codex 0.147 native agent_type canary plus focused hook/policy tests and root required checks
> **Rollback Surface**: Revert the single work-package branch to restore the pre-cutover thread-first delegation contract
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md`
> **Task Review**: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260811-1344-codex-native-agent-authority.md`
- Sprint contract: `tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md`
- Sprint review: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`
- Implementation notes: `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260811-1344-codex-native-agent-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260811-1344-codex-native-agent-authority.md`.

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
- Contract file: `tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md`
- Review file: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`
- Implementation notes file: `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260811-1344-codex-native-agent-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single work-package branch to restore the pre-cutover thread-first delegation contract
- **Verification boundary**: Codex 0.147 native agent_type canary plus focused hook/policy tests and root required checks
- **Review/acceptance boundary**: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260811-1344-codex-native-agent-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md`, `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`, and `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single work-package branch to restore the pre-cutover thread-first delegation contract

## Captured Planning Output

# Codex Native Agent Authority Cutover

## Thesis

Codex custom-agent identity and lifecycle must have one runtime owner: the live native `agent_type` surface. `agents/fleet/*.md` remains the single authored persona source and deterministically projects to Codex TOML, while repo-harness owns only explicit authorization guidance, bounded guards, and runtime evidence. The old Codex App thread-first ladder and natural-language intent parser encode a pre-0.147 platform limitation and must be removed in the same work-package.

## Confidence

- **Confidence level**: high for persona selection and hook execution; medium for model routing; intentionally unverified for reasoning effort.
- **Why not certain**: Codex 0.147 accepted `agent_type` and loaded the explorer output contract in this live session, but `SubagentStart` still does not expose reasoning effort and current role/model evidence is coupled to advisor-created delegation state.

## Why

The current repo projects seven fleet roles into `~/.codex/agents/*.toml`, but its Codex guidance still prefers `codex_app__create_thread` and degrades through native spawn, `codex-exec`, and the main thread. That ladder was justified by Codex 0.144.1, whose flat MultiAgentV2 schema lacked `agent_type`. Codex 0.147 now exposes and accepts `agent_type`; two live explorer children loaded the repo-owned `FINDINGS:` contract, while repo-harness `SubagentStart` and `SubagentStop` hooks fired normally. Keeping thread identity, prompt persona, and native agent identity alive together would preserve dual authority.

The live trace also exposed a separate defect: the user explicitly asked the agents to divide the work, but `UserPromptSubmit.delegation` emitted zero bytes because `delegationTrigger()` did not recognize that phrasing. Expanding multilingual regexes would create more shadow parsing. Authorization should instead come from the user turn, applicable AGENTS.md, or an explicit skill/command; runtime evidence should start from the authoritative `SubagentStart` event even when no advisor state exists.

## P1: Architecture Map

- Persona authority: `agents/fleet/*.md` -> `scripts/install-agent-fleet.sh` -> `~/.claude/agents/*.md` and `~/.codex/agents/*.toml`.
- Codex prompt guidance: `src/cli/hook/subagent-handler.ts#runDelegationAdvisor` and `src/cli/hook/session-context.ts#codexDelegationAutoContext`.
- Runtime observation and guard: `SubagentStart.context`, `SubagentStop.quality`, delegation state, and `scripts/check-agent-tooling.sh`.
- Policy projections: `.ai/harness/policy.json`, `scripts/lib/project-init-lib.sh`, `scripts/ensure-task-workflow.sh`, and the packaged helper mirror.
- User-facing global auto-mode surface: `src/cli/commands/delegation-mode.ts`, install CLI wiring, validators, docs, and tests.
- Out of scope: Claude Task/Agent transport, fleet persona content/model mapping, Codex plugin packaging, MCP goal transport, contract-run execution semantics outside delegation policy projection.

## P2: Concrete Trace

1. Codex loads the repo and fires `SessionStart.default`.
2. The current user asks for a multi-agent division; `UserPromptSubmit.delegation` runs but emits no context because the prompt does not match the handwritten regex vocabulary.
3. The parent calls native `spawn_agent` with `agent_type=explorer` and bounded `fork_turns`; Codex selects the installed role and starts the child.
4. `SubagentStart.context` fires and injects the execution boundary, but without advisor-created state it cannot persist role/model evidence.
5. The child follows the repo-owned explorer output protocol and returns; `SubagentStop.quality` fires.
6. A third start is rejected by the existing two-agent circuit breaker, proving guard authority remains independent of transport selection.

Pressure points: pre-spawn semantic regex inference, thread-first policy wording, and post-spawn evidence's dependency on pre-created advisor state.

## P3: Design Decision

Use native `agent_type` as the only Codex fleet transport and identity authority. Preserve explicit bounded guardrails and the complete self-contained dispatch packet, but delete automatic standing authorization, natural-language trigger inference, thread-first identity, and runner fallbacks. A native schema/profile mismatch fails closed; it does not select a second runner.

At 10x agent usage, the first failure in the current design is evidence drift: natural-language authorization, thread metadata, TOML profiles, and native role observations can disagree. The cutover prevents that by making the native event the runtime source of truth and every repo artifact a deterministic projection or observation.

## Falsifier

Before the authority cutover, run a fresh Codex 0.147 native canary for `explorer` and `fast-worker` with `fork_turns=none`. Stop the work-package without changing runner policy if the live spawn schema lacks `agent_type`, either `SubagentStart` reports `agent_type=default` or a model mismatch, the child fails to load its role output contract, or the hook cannot persist evidence from the native event. Missing reasoning-effort readback is not a falsifier; it must remain explicitly `configured_unverified` and must never be claimed as runtime-verified.

Cheapest proof point: one read-only explorer spawn plus one disposable-write fast-worker spawn whose official hook events and role outputs are captured without advisor pre-seeding.

## Goal

Cut repo-harness over to a single Codex-native `agent_type` authority, remove the obsolete thread/fallback and automatic semantic-delegation authorities, and make native SubagentStart evidence self-sufficient.

## In Scope

- Make Codex delegation guidance native `spawn_agent`/`agent_type`-first and fail closed when the requested role cannot be honored.
- Remove Codex App thread, `codex-exec`, and sequential main-thread fallback from the Codex fleet contract and every downstream seed/mirror.
- Retire `delegation.mode=auto` from the global install/config surface and SessionStart injection; preserve explicit mode only.
- Reduce prompt-hook activation to typed explicit `/delegate` or `/parallel` commands; do not infer authorization from natural language.
- Allow `SubagentStart` to initialize scoped runtime evidence when no UserPromptSubmit advisor state exists, using only official event fields and installed TOML identity.
- Report model routing from official hook evidence and reasoning effort as configured but unverified.
- Update focused tests, reference docs, architecture modules, task workflow artifacts, and changelog where required by touched authority.

## Out of Scope

- Changing Claude delegation behavior or agent Markdown bodies.
- Adding Codex plugin/marketplace packaging.
- Adding compatibility aliases, automatic migration shims, alternate runners, or shadow parsers.
- Claiming reasoning-effort runtime verification without an official field.
- Refactoring general contract-run or MCP process execution.

## Task Breakdown

- [x] Slice 1: add the native 0.147 canary/evidence path and prove role/model observation without advisor state; stop on the Falsifier.
- [x] Slice 2: cut policy, advisor, SessionStart, installer configuration, seeds, mirrors, and docs to explicit native `agent_type` authority; delete retired auto/thread/fallback paths.
- [x] Slice 3: finish focused tests and parity/drift checks, update architecture/task projections, run repo-harness-check and the root required checks.

## Stop Conditions

- The native canary triggers any Falsifier condition.
- Completing the cutover would require modifying Codex itself or preserving two steady-state runner authorities.
- A second out-of-scope failure appears during verification.
- Three fix/reverify rounds fail for the same issue.

## Verification

- Focused: `bun test tests/subagent-handler.test.ts tests/session-context.test.ts tests/cli/install.test.ts tests/create-project-dirs.runtime.test.ts` plus any new native-evidence tests.
- Parity: `cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh` and `cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`.
- Runtime: Codex 0.147 explorer/fast-worker native canary followed by `repo-harness run check-agent-tooling --host codex --strict-readiness`.
- Root gates: `bun test`; deploy SQL order; architecture sync; task sync; strict workflow check; project inspector; init dry-run.
- Review route: `repo-harness-check`, then the contract's configured external acceptance once.

## Workflow Inventory

- Active plan before capture: none; expected captured path `plans/plan-*-codex-native-agent-authority.md`.
- Expected execution artifacts: matching `tasks/contracts`, `tasks/reviews`, and task-local notes only for non-obvious deviations.
- Deferred ledger: `tasks/todos.md`; remove or update the stale interactive Codex agent-readiness row only if the runtime canary fulfills it.
- Runtime evidence: `.ai/harness/checks/latest.json` and `.ai/harness/runs/`; durable conclusions go to the review and architecture/reference docs.
- Allowed-path owner: the generated task contract.
- Isolation rule: `plan-to-todo` owns a `codex/codex-native-agent-authority` contract worktree; unrelated main-worktree changes are never absorbed.

## Promotion Gate

- **Merge/PR unit**: one atomic authority cutover across runtime code, policy seeds, tests, and documentation.
- **Rollback surface**: revert the work-package branch to restore the pre-cutover thread-first contract.
- **Independent verification boundary**: native runtime canary plus focused tests and full root gates.
- **Review/acceptance boundary**: one Waza `/check`-style review and the contract's single external acceptance authority.
- **High-risk surface**: cross-host delegation policy and user-level install configuration; Claude behavior must remain unchanged.
- **Why not a checklist row**: the change removes a public configuration mode and switches the Codex runner authority, so it needs isolated rollback and acceptance.

## Next Action

Run `repo-harness-check` after implementation and focused verification, then finish the contract worktree through the configured acceptance gate.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Slice 1: add the native 0.147 canary/evidence path and prove role/model observation without advisor state; stop on the Falsifier.
- [x] Slice 2: cut policy, advisor, SessionStart, installer configuration, seeds, mirrors, and docs to explicit native `agent_type` authority; delete retired auto/thread/fallback paths.
- [x] Slice 3: finish focused tests and parity/drift checks, update architecture/task projections, run repo-harness-check and the root required checks.

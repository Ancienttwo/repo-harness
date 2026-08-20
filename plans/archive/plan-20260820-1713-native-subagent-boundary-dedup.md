# Plan: Native Subagent Context Single Ownership and Boundary De-dup

> **Status**: Archived
> **Created**: 20260820-1713
> **Slug**: native-subagent-boundary-dedup
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Composed-stack exactly-once tests per decision-table row plus before/after static token measurement and required checks
> **Rollback Surface**: Single revert of the work-package branch restores prior injection sites; no data migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md`
> **Task Review**: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`

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

- Active plan: `plans/plan-20260820-1713-native-subagent-boundary-dedup.md`
- Sprint contract: `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md`
- Sprint review: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
- Implementation notes: `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1713-native-subagent-boundary-dedup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1713-native-subagent-boundary-dedup.md`.

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
- Contract file: `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md`
- Review file: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
- Implementation notes file: `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1713-native-subagent-boundary-dedup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert of the work-package branch restores prior injection sites; no data migration
- **Verification boundary**: Composed-stack exactly-once tests per decision-table row plus before/after static token measurement and required checks
- **Review/acceptance boundary**: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: (required before projection)

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1713-native-subagent-boundary-dedup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md`, `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`, and `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert of the work-package branch restores prior injection sites; no data migration

## Captured Planning Output

# Native Subagent Context Single Ownership and Boundary De-dup

## Goal

Each Codex native-child runner path has exactly one runtime injection owner for the EXECUTION_BOUNDARY anti-extras clause. A contract-bound writable child sees the boundary exactly once (owned by `SubagentStart.context`); read-only children and no-contract children see zero implementation boundary; generated personas and delegation-advisor context carry none.

## Why

`docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md:115` — canonical text is 841 bytes (~211 tokens); persona + SubagentStart repeats ~422 tokens per child, up to ~633 with contract-bound advisor context. `docs/researches/20260820-model-infra-harness-boundary.md` ranks this the highest-value harness-owned static-prefix cost.

Verified current state (2026-08-20, read-only explorer pass):

- `runSubagentStart` injects the boundary unconditionally — no gating on contract state or child writability (`src/cli/hook/subagent-handler.ts:773,787-793`).
- All 7 generated `.codex/agents/*.toml` personas end with the same 4-paragraph boundary; the read-only explorer persona (`sandbox_mode = "read-only"`, `explorer.toml:5`) is instructed to "implement exactly the Goal" (`explorer.toml:16`).
- The delegation advisor injects the full boundary when a contract is active (`subagent-handler.ts:429-435`) while also mandating `fork_turns="none"` (`:395`), so children never inherit that advisor text anyway.
- The duplication is Codex-only by construction: `SubagentStart`/`delegation` routes are `hosts: ['codex']` (`src/cli/hook/route-registry.ts:110-127`); shared fleet sources `agents/fleet/*.md` carry no boundary; it enters only during Codex TOML rendering (`scripts/install-agent-fleet.sh:256`). No Claude-side follow-up slice is needed.

## Frozen decisions

1. **Single runtime owner for Codex native children: `SubagentStart.context`.** It alone sees the real child start, the official `agent_type`/model payload, the custom-agent config scan result, and active contract state.
2. **Persona owns role only.** Remove the 4-paragraph EXECUTION_BOUNDARY from `generateToml()` in `scripts/install-agent-fleet.sh` and the `assets/templates/helpers/install-agent-fleet.sh` mirror; regenerate `.codex/agents/*.toml`. Personas keep role identity, read-only/writable posture, machine-readable final line, report format, and the no-self-escalation role limit.
3. **Delegation advisor owns parent permission + routing only.** Drop the boundary block from `contractContext` (`subagent-handler.ts:429-435`); keep agent-count/depth/no-overlapping-writers/agent_type rules, routing evidence, and parent reconciliation.
4. **`SubagentStart` becomes contract- and writability-aware.** Decision table:
   - active contract + workspace-write child → boundary once + contract path;
   - active contract + read-only child → short read-only scope note, no "implement" boundary;
   - no active contract → dispatch scope, routing, report contract only; drop the unconditional "Read the active repo-harness contract before working." line (no fabricated contract reference);
   - routing invalid / mismatch / unverified → fail-closed routing notice, zero boundary.
   Writability source of truth is `sandbox_mode` from the scanned custom-agent TOML (present in all 7 TOMLs; value validation precedent exists at `scripts/install-agent-fleet.sh:290-309`). Extend the runtime scanner (`scanAgentDirectory`, `subagent-handler.ts:463-502`) to read and validate `sandbox_mode` into role evidence; fail closed on missing/invalid values. Do not infer writability from agent names.
5. **Contract resolution: share path derivation, keep predicates separate.** `runSubagentStart` currently re-derives the plan→contract path inline (`:680-685`) instead of using `activeContractPath()` (`:224-239`). Unify the path derivation; keep the two field predicates explicit and distinct because they answer different questions (`Status: Active|Ready|Executing` = "a contract is active"; `Workflow Profile|Risk: strict|high` = "strict mode").
6. **Exactly-once marker.** Prefix the canonical block with `[repo-harness:execution-boundary/v1]` so composed-stack tests count occurrences deterministically rather than matching prose.
7. **Root authority update.** Root `AGENTS.md`/`CLAUDE.md` currently mandate the clause on every delegated runner surface — that rule is itself the duplication source. Rewrite to: the boundary must appear exactly once in each delegated runner's final rendered task packet; persona, parent delegation permission, and task packet must not simultaneously own it; each runner path names its unique injection owner, verified by composed-path tests.

## Out of scope (this slice)

- `contract-run` worker prompt migration (`scripts/contract-run.ts:791` copy stays; it is a separate standalone runner path and the next migration candidate).
- MCP `codex-goal` document (`src/cli/mcp/tools.ts:607-615` copy stays).
- Cache telemetry expansion to routine runs; per-turn hook latency budget (separate later slices).
- Any Claude-host change (verified: no Claude-side duplication exists).
- Cache TTL / affinity routing / rendered-prompt manifests (host-owned, rejected in the 20260820 research doc).

## Task Breakdown

- [x] Consolidate the two inline boundary array literals in `subagent-handler.ts` (`:429-435`, `:787-793`) into one module-level constant carrying the v1 marker; remaining copies in `contract-run.ts` / `mcp/tools.ts` / `install-agent-fleet.sh` stay governed by the parity test.
- [x] `install-agent-fleet.sh` + assets template mirror: stop appending EXECUTION_BOUNDARY in `generateToml()`; regenerate `.codex/agents/*.toml`.
- [x] `runDelegationAdvisor`: remove the boundary block from `contractContext`.
- [x] `scanAgentDirectory` / `customAgentProfile`: read + validate `sandbox_mode`, project into role evidence, fail closed on invalid.
- [x] `runSubagentStart`: implement the four-row decision table; reuse shared contract path derivation.
- [x] Update root `AGENTS.md` + `CLAUDE.md` boundary ownership rule.
- [x] Invert/replace assertions: `tests/subagent-handler.test.ts:201` (advisor must NOT contain the boundary); `tests/bootstrap-files.test.ts:99-101` and `tests/install-agent-fleet.test.ts:680-698` (personas must NOT contain it); `tests/workflow-contract.test.ts:64-81` (parity set shrinks to the remaining owner files); add composed-stack exactly-once tests covering each decision-table row.
- [x] Record before/after measurement: persona `developer_instructions` bytes/estimated tokens, `SubagentStart` additionalContext bytes/tokens, advisor additionalContext bytes/tokens, boundary occurrence count, total harness-owned native-child static bytes. No provider cache-hit improvement claims unless benchmark `cached_input_tokens` telemetry proves it.

## Exit Criteria

1. Active contract + workspace-write child: composed stack (persona + advisor context + SubagentStart context) contains the boundary marker exactly once.
2. Active contract + read-only child (explorer / gatekeeper / deep-reasoner): zero implementation boundary in the composed stack.
3. No active contract: zero implementation boundary and no fabricated "read the active contract" instruction.
4. Advisor context and all generated personas contain zero boundary text.
5. Existing SubagentStart semantics (native-role-routing evidence, return-channel, long-command guardrail, board slice) keep their current exactly-once behavior per existing tests.
6. Mutation guard, Allowed Paths enforcement, contract preflight, and verification gates unchanged.
7. `bun test --timeout 60000`, `repo-harness run check-task-workflow --strict`, and `bun src/cli/index.ts init --repo . --dry-run` all green.

## Allowed Paths

- `src/cli/hook/subagent-handler.ts`
- `scripts/install-agent-fleet.sh`
- `assets/templates/helpers/install-agent-fleet.sh`
- `.codex/agents/*.toml`
- `tests/subagent-handler.test.ts`, `tests/install-agent-fleet.test.ts`, `tests/bootstrap-files.test.ts`, `tests/workflow-contract.test.ts`
- `AGENTS.md`, `CLAUDE.md`
- `tasks/` sync surfaces

## Provenance

Dual-track synthesis: external peer proposal (GPT-side, 2026-08-20) reviewed against a read-only repo verification pass; four corrections applied (Codex-only scope, runtime-scanner validation semantics, dual contract-predicate split, full failing-test inventory). Research basis: `docs/researches/20260820-model-infra-harness-boundary.md`.

## Annotations
- (none raised during annotation pass; user approved dispatch 2026-08-20)

## Task Breakdown
- [x] Consolidate the two inline boundary array literals in `subagent-handler.ts` (`:429-435`, `:787-793`) into one module-level constant carrying the v1 marker; remaining copies in `contract-run.ts` / `mcp/tools.ts` / `install-agent-fleet.sh` stay governed by the parity test.
- [x] `install-agent-fleet.sh` + assets template mirror: stop appending EXECUTION_BOUNDARY in `generateToml()`; regenerate `.codex/agents/*.toml`.
- [x] `runDelegationAdvisor`: remove the boundary block from `contractContext`.
- [x] `scanAgentDirectory` / `customAgentProfile`: read + validate `sandbox_mode`, project into role evidence, fail closed on invalid.
- [x] `runSubagentStart`: implement the four-row decision table; reuse shared contract path derivation.
- [x] Update root `AGENTS.md` + `CLAUDE.md` boundary ownership rule.
- [x] Invert/replace assertions: `tests/subagent-handler.test.ts:201` (advisor must NOT contain the boundary); `tests/bootstrap-files.test.ts:99-101` and `tests/install-agent-fleet.test.ts:680-698` (personas must NOT contain it); `tests/workflow-contract.test.ts:64-81` (parity set shrinks to the remaining owner files); add composed-stack exactly-once tests covering each decision-table row.
- [x] Record before/after measurement: persona `developer_instructions` bytes/estimated tokens, `SubagentStart` additionalContext bytes/tokens, advisor additionalContext bytes/tokens, boundary occurrence count, total harness-owned native-child static bytes. No provider cache-hit improvement claims unless benchmark `cached_input_tokens` telemetry proves it.

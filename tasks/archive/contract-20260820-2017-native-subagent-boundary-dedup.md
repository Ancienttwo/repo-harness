> **Archived**: 2026-08-20 20:17
> **Related Plan**: plans/archive/plan-20260820-1713-native-subagent-boundary-dedup.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-2017

# Task Contract: native-subagent-boundary-dedup

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1713-native-subagent-boundary-dedup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 17:15
> **Review File**: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
> **Notes File**: `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The EXECUTION_BOUNDARY anti-extras clause currently has multiple active owners on the Codex native-child path: every generated persona in `.codex/agents/*.toml` carries the full 4-paragraph block, the delegation advisor re-injects it when a contract is active (`src/cli/hook/subagent-handler.ts:429-435`), and `runSubagentStart` appends it unconditionally (`:787-793`) — regardless of contract state or child writability. A representative child pays ~422 duplicated static tokens (up to ~633 with advisor context) per spawn, and the read-only explorer persona is instructed to "implement exactly the Goal" it must never implement. Duplicated authority also dilutes the instruction: two or three copies of the same boundary read as boilerplate, not as the binding clause. Evidence: `docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md:115,189` and `docs/researches/20260820-model-infra-harness-boundary.md`.

## Goal

Each Codex native-child runner path has exactly one runtime injection owner for the EXECUTION_BOUNDARY clause: `SubagentStart.context`, rendered contract- and writability-aware. A contract-bound workspace-write child sees the boundary exactly once; read-only children and no-contract children see zero implementation boundary; generated personas and delegation-advisor context carry none. The canonical block gains a `[repo-harness:execution-boundary/v1]` marker so composed-stack tests count occurrences deterministically. Root `AGENTS.md`/`CLAUDE.md` ownership rule is rewritten from "on every delegated runner surface" to "exactly once in each delegated runner's final rendered task packet".

## Scope

- In scope:
  - Consolidate the two inline boundary literals in `subagent-handler.ts` (`:429-435`, `:787-793`) into one module-level constant carrying the v1 marker.
  - `scripts/install-agent-fleet.sh` + `assets/templates/helpers/install-agent-fleet.sh`: stop appending EXECUTION_BOUNDARY in `generateToml()`; regenerate `.codex/agents/*.toml` (7 agents).
  - `runDelegationAdvisor`: remove the boundary block from `contractContext`; keep routing/permission/reconciliation rules and `fork_turns="none"`.
  - `scanAgentDirectory`/`customAgentProfile`: read + validate `sandbox_mode` (`read-only` | `workspace-write`; value-validation precedent at `scripts/install-agent-fleet.sh:290-309`), project into role evidence, fail closed on missing/invalid. Never infer writability from agent names.
  - `runSubagentStart` decision table: active contract + workspace-write → boundary once + contract path; active contract + read-only → short read-only scope note, no implement boundary; no contract → dispatch scope/routing/report contract only, drop the unconditional "Read the active repo-harness contract before working." line; routing invalid/mismatch/unverified → fail-closed routing notice, zero boundary. Share contract path derivation with `activeContractPath()` (`:224-239`); keep the two predicates distinct (`Status: Active|Ready|Executing` vs `Workflow Profile|Risk: strict|high`).
  - Root `AGENTS.md` + `CLAUDE.md`: rewrite the EXECUTION_BOUNDARY surface rule to exactly-once ownership (keep both files aligned).
  - Tests: invert `tests/subagent-handler.test.ts:201` (advisor must NOT contain boundary), `tests/bootstrap-files.test.ts:99-101`, `tests/install-agent-fleet.test.ts:680-698` (personas must NOT contain it); shrink the parity set in `tests/workflow-contract.test.ts:64-81` to the remaining owner files; add composed-stack exactly-once tests covering each decision-table row.
  - Record before/after static-size measurement (persona/advisor/SubagentStart bytes + estimated tokens, boundary occurrence count) in the notes file.
  - Carry the base repair for `tests/evidence-residue-scan.test.ts` (sprint file archived by main@07a5d63a sweep; path-only fix) so the merge gate's full-suite criterion is satisfiable.
- Out of scope:
  - `contract-run` worker prompt (`scripts/contract-run.ts` copy stays) and MCP `codex-goal` (`src/cli/mcp/tools.ts` copy stays) — their parity-test coverage must keep passing.
  - Cache telemetry expansion; per-turn hook latency budget; any Claude-host change (verified: no Claude-side duplication exists — routes are `hosts: ['codex']`, fleet markdown sources carry no boundary).
  - No provider cache-hit improvement claims without benchmark `cached_input_tokens` evidence.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the composed native-child stack (persona `developer_instructions` + advisor context + SubagentStart context) already renders the boundary at most once for a contract-bound writable child, the dedup premise is wrong. Cheapest proof: count occurrences of "Execution boundary: implement exactly the Goal" across `.codex/agents/fast-worker.toml` plus the advisor/SubagentStart injection sites in `src/cli/hook/subagent-handler.ts` — current state is 2–3 copies per composed child.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-1713-native-subagent-boundary-dedup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
- Notes file: `tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"native-role-routing-evidence-readback","kind":"runtime_readback","paths":["src/cli/hook/subagent-handler.ts"]},{"id":"subagent-handler-composed-stack-suite","kind":"deterministic_test","paths":["src/cli/hook/subagent-handler.ts","tests/subagent-handler.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md
  - tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md
  - tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md
  - src/cli/hook/subagent-handler.ts
  - scripts/install-agent-fleet.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - .codex/agents/
  - tests/
  - AGENTS.md
  - CLAUDE.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/hook/subagent-handler.ts
    - .codex/agents/explorer.toml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-1713-native-subagent-boundary-dedup.notes.md
  tests_pass:
    - path: tests/subagent-handler.test.ts
    - path: tests/install-agent-fleet.test.ts
    - path: tests/bootstrap-files.test.ts
    - path: tests/workflow-contract.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base `bc857ac8` (branch `codex/native-subagent-boundary-dedup`)
- Revert strategy: single revert of the work-package branch restores all prior injection sites; no data migration involved.

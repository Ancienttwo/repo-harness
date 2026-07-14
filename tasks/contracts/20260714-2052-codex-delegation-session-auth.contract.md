# Task Contract: codex-delegation-session-auth

> **Status**: Active
> **Plan**: plans/plan-20260714-2052-codex-delegation-session-auth.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: runtime-harness-hook-adapters
> **Last Updated**: 2026-07-14 20:52
> **Review File**: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`
> **Notes File**: `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`assets/hooks/codex-delegation-advisor.sh` injects the full delegation + contract-authority
context ("treat the contract as the authoritative brief ... do not re-derive scope from
this conversation") on EVERY Codex user prompt when the effective delegation mode is
`auto`, with no active-contract check and no regard for the user's current message, and it
writes delegation state files on every prompt. Observed failure: the user asks for status
or questions cost, and Codex is simultaneously instructed to keep executing Exit Criteria
and distrust the conversation. Standing authorization is session-level state being
re-asserted per message; Claude-side delegation is ambient and has no such injection. If
this ships wrong, Codex either loses standing delegation authorization entirely (auto mode
becomes dead) or keeps steamrolling user intent on every prompt.

## Goal

Under effective delegation mode `auto` on the Codex host, standing delegation
authorization is injected exactly once per session at SessionStart, the UserPromptSubmit
delegation advisor injects only on explicit triggers (identically in auto and explicit
modes), plain prompts produce zero advisor output and zero delegation state writes, and
Claude-host behavior is byte-identical to before.

## Scope

- In scope:
  - `assets/hooks/codex-delegation-advisor.sh`: delete the auto-mode injection branch (no
    explicit trigger -> exit 0, no output, no state write); delete the now-dead
    `readGlobalDelegationMode`/`effectiveDelegationMode` resolution; state objects are
    written only on explicit triggers (`explicit: true`, `mode: "explicit"`, real trigger
    name, `stop_fallback: true`); drop the auto-branch standing-authorization sentence
    from the injected text; keep triggers, `isDelegationDiscussion` skip, lock protocol,
    per-turn scope files, and the EXECUTION_BOUNDARY block byte-identical.
  - Advisor injected text, parent-facing authority downgrade: replace the sentence
    "Treat the active task contract (...) as the authoritative execution brief: Goal,
    Scope, Allowed Paths, and Exit Criteria. Do not re-derive scope from this
    conversation." with current-turn-authority framing: the current user turn is the
    execution authority; the active task contract (tasks/contracts/<active-plan-stem>.contract.md)
    constrains the implementation scope authorized by the current turn, but does not by
    itself authorize resuming prior implementation or completing Exit Criteria. Worker
    packet surfaces (contract-run prompts, `brief_is_authoritative`, policy
    `runner_rule`) keep their brief-is-authoritative wording — the downgrade applies
    ONLY to this parent-facing advisor paragraph.
  - `assets/hooks/session-start-context.sh`: new compact block (~8-10 lines), emitted only
    when `HOOK_HOST == codex` AND effective delegation mode resolves to `auto` (global
    `~/.repo-harness/config.json` `delegation.mode` overrides repo `policy.json`; relocate
    that resolution here). Content: standing authorization for bounded native subagent
    delegation this session + core rules (spawn only for >=2 independent bounded
    workstreams; at most `policy.delegation.max_agents` agents; never overlapping write
    ownership; `fork_turns="none"` with `agent_type`; close finished threads; no spawning
    for trivial/sequential work). NO contract-authority assertion, NO Exit Criteria
    continuation language, NO execution-boundary block.
  - `.ai/harness/policy.json` `delegation.rule`: rewrite to the new semantics; `rg` for
    copies of the old rule sentence under `assets/` and update every copy found.
  - Docs consistency (three surfaces must state the same auto semantics): update
    `docs/reference-configs/hook-operations.md` where it describes
    `UserPromptSubmit.delegation` (currently "explicit-mode" while the runtime did auto
    fallthrough), and the README section describing `--delegation-mode`, to the new
    semantics: auto = standing session-level authorization injected once at SessionStart;
    UserPromptSubmit injects only on explicit triggers in both modes. Semantic alignment
    only — no restructuring.
  - Session-context budget emission fix (required for the Goal to hold at all):
    `src/cli/hook/runtime.ts` (~474-481) marks session-start-context output actionable
    only for four fixed headings, and `src/cli/hook/session-context-budget.ts` (~264)
    empties the whole SessionStart payload when nothing is actionable — so the new
    standing-authorization block is silently dropped in idle sessions (empirically
    confirmed via the full CLI dispatcher). Add the new block's heading to the actionable
    classification (minimal change, no budget-system redesign) and add a regression test
    reproducing the observed failure: full dispatcher SessionStart on an idle codex+auto
    repo must emit the standing-authorization block.
  - Bootstrap default copies of the old `delegation.rule` sentence: update
    `scripts/lib/project-init-lib.sh` (~1980), `scripts/ensure-task-workflow.sh` (~1130),
    and `assets/templates/helpers/ensure-task-workflow.sh` (~1130) to the new rule text so
    newly generated repos receive the new semantics; keep the scripts/assets helper pairs
    byte-aligned per the existing parity checks.
  - Regenerate projections with `bun run sync:hooks`; verify with `bun run check:hooks`;
    never hand-edit `.ai/hooks/*`.
  - Test updates in `tests/cli/hook.test.ts` and `tests/hook-contracts.test.ts` per the
    plan's Task Breakdown (auto + no trigger -> no injection, no state file; explicit
    trigger unchanged; SessionStart block present for codex+auto, absent for
    codex+explicit and for claude host).
- Out of scope:
  - stop-orchestrator delegation-fallback semantics (already explicit-only).
  - contract-run, subagent-start-context, MCP codex-goal surfaces beyond keeping the
    EXECUTION_BOUNDARY parity test green.
  - Any new intent classifier, prompt-shape gating, or per-prompt machinery.
  - Benchmark/verifier surfaces (owned by verifier-evidence-lifecycle-cutover).
  - Claude-host hook behavior; `~/.repo-harness/config.json`;
    `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json` (current
    grep shows the rule text is not embedded there — if that turns out wrong, stop and
    hand back instead of widening).
- Taste constraints: deletion-shaped change; do not add config knobs, compatibility
  branches for the old auto behavior, or a second authorization surface.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if: a plain question/status prompt under global `auto` still
receives `[repo-harness:delegation]` context or writes delegation state; or explicit
`/delegate` no longer injects; or Claude-host session context changes at all; or the
EXECUTION_BOUNDARY parity test fails; or the SessionStart block exceeds ~15 lines.
Cheapest proof point: the updated `tests/cli/hook.test.ts` auto-mode dispatcher test
(pipe a plain prompt through the advisor with a temp HOME auto config and assert empty
stdout and no state file).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

## Workflow Inventory

- Source plan: `plans/plan-20260714-2052-codex-delegation-session-auth.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`
- Notes file: `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md
  - tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md
  - tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md
  - assets/hooks/
  - .ai/hooks/
  - .ai/harness/policy.json
  - docs/architecture/
  - docs/reference-configs/
  - assets/reference-configs/hook-operations.md
  - README.md
  - src/cli/hook/runtime.ts
  - src/cli/hook/session-context-budget.ts
  - scripts/lib/project-init-lib.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: 45
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/hooks/codex-delegation-advisor.sh
    - assets/hooks/session-start-context.sh
  artifacts_exist:
    - tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md
  tests_pass:
    - path: tests/cli/hook.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun run check:hooks
    - bun test tests/hook-runtime.test.ts tests/workflow-contract.test.ts tests/contract-run.test.ts
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: codex+auto plain prompt -> silent advisor, no state file; codex+auto
  SessionStart -> one standing-authorization block; explicit triggers unchanged.
- Edge cases: global config overriding repo policy in both directions; missing/invalid
  global config; claude host untouched; `isDelegationDiscussion` still suppresses
  mechanism questions that contain trigger phrases.
- Regression risks: EXECUTION_BOUNDARY parity drift; stop-orchestrator delegation fallback
  must still fire for explicit triggers (its state contract is unchanged).

## Rollback Point

- Commit / checkpoint: worktree base `d5a80279` (branch `codex/codex-delegation-session-auth`).
- Revert strategy: single revert of this work-package commit restores per-prompt auto
  injection; no data migration, no install-surface change.

# Task Contract: stop-diff-changed-set

> **Status**: Active
> **Plan**: plans/plan-20260812-1209-stop-diff-changed-set.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-12 12:09
> **Review File**: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`
> **Notes File**: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Architecture drift recording is blind to every file mutation that does not arrive as a Claude Edit/Write hook event: Codex worktree fleet sessions write exclusively via shell (verified: 197 Bash events, 0 apply_patch in the byok-sdk broker worktree) and apply_patch events extract no path (`mutation-observed.ts:86` silent return; 148/148 codex edit events with `event_writes=0`). Consumer repos lose module-level architecture request cards silently — the byok-sdk `packages/cloud-postgres` package addition produced zero cards. If this ships wrong, drift recording double-fires or misses ranges; if skipped, every Codex-driven repo stays blind.

## Goal

Make a Stop-time git-derived changed set (repo-level drift cursor, `diff(cursor, HEAD)` ∪ working-tree status) the single authority feeding both the legacy architecture cascade and the archctx projection drain, and retire the post-edit journal's `architecture` dirty bit in the same change. The journal keeps owning contract-verification / minimal-change / checkpoint triggers. Full design is frozen in `plans/plan-20260812-1209-stop-diff-changed-set.md` (P3 section); the plan's ## Task Breakdown T1–T4 is the execution order.

## Scope

- In scope: new drift-cursor module under `src/cli/hook/`; `stop-handler.ts` cutover (sourceEvents from cursor, advance-on-ack); `src/cli/commands/architecture-projection.ts` drain command cutover; `mutation-observed.ts` architecture-bit retirement (writer + `consumePendingPostEditEvents` branch + drain handshake); tests/fixtures for all of the above; `docs/architecture/` module note for the changed observation pipeline.
- Out of scope: codex parity for contract-verification/minimal-change/checkpoint journal triggers; PreToolUse mutation-guard path extraction; cross-worktree attribution; `getFilePath` multi-path expansion; any byok-sdk consumer-side fix; cascade command semantics (`architecture-queue record` / `context-contract-sync` stay byte-identical).
- Taste constraints: one new module maximum; no compatibility shims — the journal architecture branch is deleted, not gated; cursor state follows the `session-run-identity.json` single-slot pattern.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if Stop does not reliably fire in codex worktree fleet sessions (cursor authority would then never drain there either). Cheapest proof point: `jq -r 'select(.host=="codex" and .event=="Stop")' <worktree>/.ai/harness/runs/hook-events.jsonl` on a fleet worktree — already verified positive on byok-sdk broker worktree (2 Stop events, 2026-08-11). Secondary falsifier: if `architecture-queue record --file <path>` cannot classify a path whose file no longer exists on disk (deletions in the diff), the cascade feed must filter deletions — check the script's behavior in T2 before wiring.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260812-1209-stop-diff-changed-set.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`
- Notes file: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md
  - tasks/reviews/20260812-1209-stop-diff-changed-set.review.md
  - tasks/notes/20260812-1209-stop-diff-changed-set.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - docs/architecture/
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
    - src/cli/hook/architecture-drift.ts
    - tests/architecture-drift.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260812-1209-stop-diff-changed-set.notes.md
  tests_pass:
    - path: tests/architecture-drift.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/mutation-observed.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch `codex/stop-diff-changed-set` forked at `df24af4a`.
- Revert strategy: drop or revert the branch's commit range; `.ai/harness/state/architecture-drift-cursor.json` is disposable gitignored runtime state (deleting it re-anchors the cursor at HEAD); no data migration to unwind.

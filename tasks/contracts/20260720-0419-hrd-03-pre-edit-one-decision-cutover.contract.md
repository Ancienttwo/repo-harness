# Task Contract: hrd-03-pre-edit-one-decision-cutover

> **Status**: Fulfilled
> **Plan**: plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-20 04:25
> **HRD-02 Delivered**: PR #95 at `a1599467`; collector at `src/effects/loop/state-input-collector.ts`
> **P0 Predecessor**: PR #96 at `8d2d9dc5` — fail-closed plan-status authority (`active_plan.statuses`) and truthful runner constraints are now baseline behavior this cutover must preserve
> **HRD-03 Execution Base**: `origin/main@c6504231208d85bb36e5f69a42a51eed60b16427` (post-P0 close; this branch's fork point)
> **Review File**: `tasks/reviews/20260720-0419-hrd-03-pre-edit-one-decision-cutover.review.md`
> **Notes File**: `tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PreEdit is the hottest guarded path: every edit event today spawns two bash
scripts (`worktree-guard.sh`, `pre-edit-guard.sh`) plus a nested
`state resolve` CLI subprocess — three-plus processes and two independent
state readings per decision (frozen as 22 git + 2 CLI + 6 generic child
invocations in the HRD-01 baseline). HRD-03 is the first handler cutover:
one in-process decision consuming the HRD-02 collector. If it ships wrong,
either a safety gate weakens (the P0 fail-closed semantics must survive the
port byte-for-byte) or the diet claim is false (subprocesses hide instead of
disappearing).

## Goal

`PreToolUse.edit` is decided by one in-process mutation-guard handler with
decision/reason/exit-code/output/write-set parity against current script
behavior (post-P0), strictly reduced child-process counts, both shell
scripts deleted in the same package, and the runtime-shape delta to the
HRD-01 golden regenerated once with a per-field before/after record.

## Scope

- In scope:
  - New handler `src/cli/hook/mutation-guard.ts` (name may follow existing
    conventions if a better sibling pattern exists in `src/cli/hook/`):
    ports the complete decision surface of `worktree-guard.sh` and
    `pre-edit-guard.sh` — worktree ownership refusal, repo-scoped path
    gating, SpecGuard, the P0 fail-closed plan-status gate (single
    authority: `active_plan.statuses` via the collector/policy read — no
    second list), contract allowed-paths scope gate, continuous contract
    verification trigger points, strict contract/worktree guards,
    minimal-change interplay, gate modes (enforce/advice/off), structured
    error output, failure-log/circuit side effects — preserving each
    guard's decision, reason token, ordering, exit code, host-visible
    output shape, and durable write set exactly as the current scripts
    produce them. Consumes the HRD-02 collector for repo facts and the
    Effective State resolution (extend the collector with the
    PreEdit-shaped resolution thunk per its documented design; at most one
    resolution per event).
  - `src/cli/hook/runtime.ts` + `src/cli/hook/route-registry.ts`: the
    `PreToolUse.edit` route's internal script list is replaced by the
    handler invocation; the public route tuple (event, routeId, hosts) is
    byte-stable. The generic script-spawn path for other routes is
    untouched.
  - Script retirement, same package, no dual dispatch: delete
    `worktree-guard.sh` and `pre-edit-guard.sh` from `assets/hooks/`,
    re-sync the `.ai/hooks/` projection (`bun run sync:hooks`), and remove
    any residual references (`run-hook.sh` dispatch tables, docs that
    enumerate the two scripts) — grep-proven zero live references; the
    HRD-09 telemetry sweep remains the final backstop.
  - Test migration in the same package: `tests/plan-status-gate.test.ts`
    (21 fixtures) and every existing test that invokes either script
    directly moves to exercising the handler through `runHook()` with
    identical assertions — fixture values must not change, only the
    invocation path. New parity fixtures where the scripts had uncovered
    decision branches (worktree refusal, scope gate, strict guards, gate
    modes).
  - HRD-01 golden: regenerate ONCE (`UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN=1`)
    for the runtime-shape delta on `PreToolUse.edit` (scripts_run,
    child_invocations expected to drop; decision/reason/exit_code/stdout/
    stderr/write_set must be identical). Record the exact per-field
    before/after in the notes and PR body. Any change to a
    non-`PreToolUse.edit` cell fails this contract.
  - LSC semantic characterization
    (`tests/state/loop-semantics-characterization.test.ts` + its frozen
    JSON): the three edit cells record runtime-shape fields (`entrypoint`,
    `ordering`, side-effect paths) that legitimately move with the cutover;
    those fields may be re-frozen once for edit cells only, with the same
    per-field before/after record. Every decision-semantic field (verdict,
    reason, guard_tokens, exit_code, workflow_profile, state_blockers) and
    every stop/ship cell must come back identical.
  - Event-level cost proof: a fixture asserting the handler performs at
    most one Effective State resolution and spawns strictly fewer child
    processes than the frozen baseline (exact new counts pinned).
  - AMENDMENT (retirement-ripple resolution): the contracted script
    retirement mechanically breaks six out-of-scope files; they join the
    named surfaces for exactly these adaptations and nothing else:
    `scripts/sync-hook-sources.ts` (drop the hard requirement that
    `assets/hooks/pre-edit-guard.sh` exist for its
    `is_workflow_surface_path` parity check — retarget the check at the
    surviving authority), `src/cli/installer/install-profile.ts` (the
    `minimal` profile's `scope-worktree-check-guards` evidence list names
    the two deleted scripts; update it to the in-process handler reality so
    `repo-harness install` works again), `tests/hook-source-projection.test.ts`,
    `tests/cli/global-runtime-init.test.ts`, `tests/cli/hook.test.ts`,
    `tests/cli/route-registry.test.ts` (re-pin the new reality:
    `PreToolUse.edit` route with `scripts: []` + handler),
    `tests/hook-protocol.test.ts` and `tests/harness-circuit-breakers.test.ts`
    (their direct-script-spawn vehicles are superseded by the migrated
    in-scope coverage — retarget through `runHook()`/the handler with
    identical assertions, or retire a vehicle only where the migrated
    suites demonstrably pin the same behavior), and
    `tests/install-profiles.test.ts` (a second independent hardcoded
    `assets/hooks/pre-edit-guard.sh` fixture path at its
    `writeManagedHostSurfaces()`, surfaced only by the post-fix full
    suite — the identical one-line substitution approved for
    `install-profile.ts`). Test intent everywhere preserved; only
    invocation paths and pinned lists adapt.
  - AMENDMENT (gate round-1 fix): live-doc and residual-parity sweep. The
    five live docs still enumerating the retired scripts join the named
    surfaces for mechanical updates only (`README.md`, `README.ja.md`,
    `README.es.md`, `README.zh-CN.md`,
    `docs/reference-configs/hook-operations.md`: route rows and prose move
    to the in-process mutation-guard handler). The generated-rule emitters
    (`scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh`
    + helper mirrors) update their "pre-edit-guard" rule strings to the
    handler reality. Parity closure in already-allowed files: honor the
    `.harness.failure_log_file` policy override in `mutation-guard.ts`
    exactly as the base-SHA bash did (verify the old behavior first; if
    bash also ignored the override, leave the hardcode and ledger it);
    ADJUDICATED KEEP (round-2 gate, orchestrator final): the
    `markdownHeader(planText, 'Sprint Contract')` fallback stays — base
    `derive_contract_path()` carries the identical Task->Sprint Contract
    fallback and non-archived Approved plans exercise it; the round-1
    drop advisory rested on a false dead-code premise; restore the `CLAUDE_FILE_PATH` env and symlink-normalization
    input fallbacks for observable parity; fix the stale
    `mutationGuardScriptsAbsent` reference in `tests/plan-status-gate.test.ts`
    and the todos wording. No other behavior change.
- Out of scope:
  - SessionStart consolidation (HRD-04), PostEdit journal (HRD-05), Stop
    (HRD-06), circuit/lock (HRD-07), telemetry aggregation (HRD-08),
    adopted-repo migration (HRD-09).
  - Any semantic change to any guard: parity is the criterion everywhere;
    the P0 fail-closed semantics port verbatim. No new guards, no removed
    guards, no reordered decisions unless the current scripts' observable
    ordering is preserved.
  - `src/core/loop/loop-event-protocol.ts` production wiring (the protocol
    stays zero-consumer until a later row adopts it deliberately).
  - The three legacy status lists' convergence (ledgered follow-up).
  - Every path outside Allowed Paths; compatibility shim, dual dispatch,
    or a feature flag keeping the scripts alive.
- Taste constraints: port guard-by-guard with the script open beside the
  handler — reason tokens and message text are contract surface, not
  paraphrase material. The handler must read as a decision pipeline, not a
  transliterated shell script; but observable behavior wins every conflict
  with elegance.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if any guard's observable behavior (decision, reason token, exit
  code, output shape, write set) cannot be reproduced in-process without a
  subprocess — name the guard and why.
- Stop if the golden regeneration shifts any cell other than
  `PreToolUse.edit`, or shifts that cell's decision/reason/exit_code/
  write_set fields (only runtime-shape fields may move).
- Stop if a script reference survives that would dual-dispatch (route
  still listing a deleted script, `run-hook.sh` still resolving it).
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The one-decision cutover is falsified if any scripted guard's behavior
depends on shell-only process semantics that in-process code cannot honor
(e.g. a guard that relies on its own subprocess exit boundary for state
isolation). Cheapest proof point: port the two smallest guards first
(worktree refusal + SpecGuard), regenerate nothing, and run the migrated
fixtures against the handler behind a temporary test-only entry; if either
guard needs a subprocess to stay observable-identical, stop before porting
the rest.

## Root Cause Evidence

Not applicable: `code-change` cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-04)
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (row 3)
- Frozen baseline: `tests/fixtures/loop-runtime/characterization.json` (HRD-01; one-shot regeneration authorized for the PreToolUse.edit runtime shape only)
- Collector: `src/effects/loop/state-input-collector.ts` (HRD-02)
- Ported authorities: `assets/hooks/worktree-guard.sh`, `assets/hooks/pre-edit-guard.sh` (post-P0 state)
- Active plan: `plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md`
- Review file: `tasks/reviews/20260720-0419-hrd-03-pre-edit-one-decision-cutover.review.md`
- Notes file: `tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `c6504231208d85bb36e5f69a42a51eed60b16427` /
  `codex/hrd-03-pre-edit-one-decision-cutover` /
  `/Users/kito/Projects/repo-harness-wt-hrd-03-pre-edit-one-decision-cutover`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.
- CLI note: use `bun src/cli/index.ts` / `bun test` for in-worktree
  verification; the global binary is the packaged copy.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-0419-hrd-03-pre-edit-one-decision-cutover.contract.md
  - tasks/reviews/20260720-0419-hrd-03-pre-edit-one-decision-cutover.review.md
  - tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md
  - src/cli/hook/mutation-guard.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/route-registry.ts
  - src/effects/loop/state-input-collector.ts
  - assets/hooks/worktree-guard.sh
  - assets/hooks/pre-edit-guard.sh
  - assets/hooks/run-hook.sh
  - .ai/hooks/worktree-guard.sh
  - .ai/hooks/pre-edit-guard.sh
  - .ai/hooks/run-hook.sh
  - .ai/hooks/.projection.json
  - assets/hooks/projection.json
  - tests/plan-status-gate.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/runtime-profile-enforcement.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/mutation-guard.test.ts
  - scripts/sync-hook-sources.ts
  - src/cli/installer/install-profile.ts
  - tests/hook-source-projection.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/cli/hook.test.ts
  - tests/cli/route-registry.test.ts
  - tests/hook-protocol.test.ts
  - tests/harness-circuit-breakers.test.ts
  - tests/install-profiles.test.ts
  - README.md
  - README.ja.md
  - README.es.md
  - README.zh-CN.md
  - docs/reference-configs/hook-operations.md
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/hook/mutation-guard.ts
  files_not_exist:
    - assets/hooks/worktree-guard.sh
    - assets/hooks/pre-edit-guard.sh
    - .ai/hooks/worktree-guard.sh
    - .ai/hooks/pre-edit-guard.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md
  tests_pass:
    - path: tests/mutation-guard.test.ts
    - path: tests/plan-status-gate.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:state-boundaries
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Golden delta is confined to PreToolUse.edit runtime-shape fields with a per-field before/after record"
    - "Zero live references to the two retired scripts outside historical records"
```

## Acceptance Notes (Human Review)

- Functional behavior: every guard decision identical to the post-P0
  scripts; only process shape changes (fewer children, no bash).
- Edge cases: gate modes (enforce/advice/off), worktree refusal on foreign
  ownership, authority-unavailable fail-closed, structured-error stdout
  contract for both hosts, failure-log/circuit side-effect parity.
- Regression risks: paraphrased reason tokens or message drift breaking
  downstream consumers (failure log parsers, circuit keys); a hidden
  subprocess restoring the old fan-out; golden regeneration masking a
  semantic shift — the per-field delta record is the review surface.

## Rollback Point

- Commit / checkpoint: branch fork point `c6504231208d85bb36e5f69a42a51eed60b16427`
- Revert strategy: revert the single PR; the two scripts, route script list, golden, and migrated tests restore as one unit.

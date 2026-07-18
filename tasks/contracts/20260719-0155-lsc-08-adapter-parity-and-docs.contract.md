# Task Contract: lsc-08-adapter-parity-and-docs

> **Status**: Active
> **Plan**: plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-19 02:00
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-08 Execution Base**: `origin/main@89f75d8a` (post-LSC-07 merge PR #89 plus backfill)
> **Review File**: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`
> **Notes File**: `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The readiness authority now exists and Stop consumes it, but MCP's compact
state omits `readiness` AND `guidance` entirely
(`src/cli/mcp/state-tools.ts:18-55,104-123`), no test proves the four
adapters agree on decision/reason/readiness for the same fixture, and the
characterization probe still reports the typed fields as "missing" because
it checks top-level keys while readiness is nested — the final sprint row
must close the parity surface, prove it, and state the contract in docs, or
the whole convergence remains unobservable from two of the four adapters.

## Goal

Prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason,
and readiness on the same fixtures: MCP compact state gains additive
`readiness` and `guidance` fields (no tool/route/CLI renames); the parity
test suite asserts four-adapter agreement including the
allowed-to-stop/not-ready-to-ship distinction; the characterization probe is
recalibrated to inspect the authority surface (delta-shaped regeneration,
missing fields may only shrink); the parity contract is stated in the
architecture docs; and the two carried LSC-07 follow-ups land (fixture
CLI-pinning; scalar-readiness guard).

## Scope

- In scope:
  - `src/cli/mcp/state-tools.ts`: additive `readiness` and `guidance` fields
    on `CompactEffectiveState` and `StateSummaryResult`, copied verbatim in
    `projectCompactEffectiveState` from the resolved state. No tool renames,
    no new tools, no removed fields.
  - `tests/state/adapter-parity.test.ts`: extend `MCP_COMPACT_FIELDS` (and
    any dynamic-key sets) for the new fields; add parity assertions proving,
    on the same fixtures: CLI full JSON, CLI `--field readiness`, MCP
    compact, and the Stop hook's consumed readiness agree on
    decision/reason/readiness — including one fixture exercising
    allowed-to-stop-with-readyToShip=false reported identically; and a
    Skill-guidance parity assertion (CLI `guidance` == MCP `guidance` ==
    `CEREMONY_GUIDANCE[profile]`). Hook-side parity may drive
    `stop-orchestrator.sh`/`pre-edit-guard.sh` read-only against fixtures
    and compare their emitted decisions/reasons to the readiness authority —
    WITHOUT modifying either hook's decision logic.
  - `tests/cli/mcp-tools.test.ts` (and sibling MCP output-shape pins):
    additive re-pins for the two new compact fields only.
  - Characterization probe recalibration (delta-shaped, authorized):
    `tests/state/loop-semantics-characterization.test.ts:336-341`
    `missingSemanticFields` may be extended to also inspect the
    `state.readiness` authority surface (nested decisions/requirements/
    nextAction); regenerate the fixture via `UPDATE_LOOP_SEMANTICS_GOLDEN=1`.
    Constraint: in each cell's `current` block, `missing_semantic_fields`
    entries may ONLY be removed, and only for fields genuinely present on
    the authority surface for that operation; every other current field,
    every `approved_target_delta` byte, and every TARGET_DELTAS byte stay
    unchanged. Ship-cell fields that the authority does not yet express
    through the ship SCRIPT surface (`workflowProfile`, `requirementsResult`
    at script level) may shrink only if the probe legitimately finds them on
    the state authority; otherwise they stay listed — do not fake closure.
  - Carried follow-up (a): pin `REPO_HARNESS_CLI` (repo-source CLI) in the
    five `tests/cli/hook.test.ts` Delegation Fallback fixtures the stale
    global binary skews, following `runHook`'s existing pattern — test-env
    hygiene only, no product change.
  - Carried follow-up (b): guard the readiness jq/bun reads in
    `.ai/hooks/stop-orchestrator.sh` (~lines 666-693) against non-object
    `readiness` values under `set -e` (type check or `|| true` fallback to
    skip-readiness) — fail direction: skip readiness behavior, never abort
    the hook, never block; mirror to `assets/hooks/stop-orchestrator.sh`
    (cmp-identical) and refresh `.ai/hooks/.projection.json` only via
    `bun scripts/sync-hook-sources.ts --write`.
  - `docs/architecture/index.md`: a concise "Loop semantics parity contract"
    statement under the Effective State bullet — the four adapter surfaces,
    the five agreed dimensions, and where the parity gate lives
    (adapter-parity test). No new gate machinery.
  - Pin `LSC-08 Execution Base` in the sprint header per successor rule.
  - Notes: migration note per sprint DoD; explicit record of what row 8
    deliberately does NOT do (pre-edit-guard and ship-script kernel cutover
    to the readiness authority — parity is proven against their current
    behavior; single-kernel cutover for those surfaces is future work
    beyond this sprint, recorded for the ledger).
- Out of scope:
  - Any change to `pre-edit-guard.sh` decision logic, the ship scripts
    (`verify-sprint.sh`/`ship-worktrees.sh`/`contract-worktree.sh`), the
    readiness evaluator, the requirement matrix, or state resolution.
  - New/renamed CLI commands, MCP tools, hook routes; removed fields.
  - The external `~/.codex/skills` file (runtime-referenced, not vendored).
  - Flat ESA goldens (`tests/state/fixtures/*.json`) — EffectiveState is
    unchanged, so any drift there is a regression.
  - Compatibility shims or dual parity definitions.
- Taste constraints: parity assertions compare adapter outputs to ONE
  source (the resolved state / readiness authority), not to each other in
  a chain; the docs statement is a contract, not a tutorial.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if proving parity would require changing any hook/script decision
  logic beyond the authorized scalar-readiness guard.
- Stop if any characterization change exceeds missing-field shrinkage, or
  any flat ESA golden drifts.
- Stop if a shrunken missing field is not genuinely present on the
  authority surface (no fake closure).
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The parity direction is falsified if any adapter cannot expose or agree on
the five dimensions without recomputing semantics locally — e.g. if MCP
compact cannot carry readiness verbatim, or a hook's emitted reason cannot
be mapped 1:1 to authority reasons on some fixture. Cheapest proof: write
the allowed-to-stop/not-ready-to-ship four-adapter assertion first; if it
needs adapter-side recomputation to pass, stop.

## Root Cause Evidence

Not applicable: this is a `code-change` parity/closure package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-02; Sprint A row 8)
- Source sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` (row 8; DoD parity lines; acceptance scenario)
- Delta authority: `tests/state/fixtures/loop-semantics/characterization.json`
- Readiness authority: `src/core/workflow/operation-readiness.ts` via `EffectiveStateV1.readiness`
- Active plan: `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`
- Review file: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`
- Notes file: `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `89f75d8a` / `codex/lsc-08-adapter-parity-and-docs` /
  `/Users/kito/Projects/repo-harness-loop-control-wt-lsc-08-adapter-parity-and-docs`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md
  - tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md
  - tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md
  - src/cli/mcp/state-tools.ts
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/stop-orchestrator.sh
  - .ai/hooks/.projection.json
  - docs/architecture/index.md
  - tests/state/adapter-parity.test.ts
  - tests/cli/mcp-tools.test.ts
  - tests/cli/hook.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: scope_and_acceptance_owner
    explorer:
      mode: read_only
      purpose: adapter_surface_archaeology
    worker:
      mode: edit_within_allowed_paths
      purpose: parity_closure_proof_and_docs
    verifier:
      mode: read_only
      purpose: exit_criteria_and_no_recompute_review
  runner:
    preferred:
      - subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
    - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
    - tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md
    - tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md
    - tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md
  artifacts_exist:
    - tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md
    - tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md
  tests_pass:
    - path: tests/state/adapter-parity.test.ts
    - path: tests/cli/mcp-tools.test.ts
    - path: tests/cli/hook.test.ts
  commands_succeed:
    - bun test tests/state/adapter-parity.test.ts tests/cli/mcp-tools.test.ts tests/cli/hook.test.ts
    - bun test tests/state/loop-semantics-characterization.test.ts
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
    - repo-harness run check-task-workflow --strict
    - repo-harness state resolve --json
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
    - git diff --check
    - cmp .ai/hooks/stop-orchestrator.sh assets/hooks/stop-orchestrator.sh
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "MCP compact state carries readiness and guidance verbatim; no tool/route/CLI rename; no removed field"
    - "Parity assertions compare each adapter to the single authority on the same fixtures, including the allowed-to-stop/not-ready-to-ship distinction and Skill guidance"
    - "No adapter recomputes semantics; hook decision logic unchanged beyond the scalar-readiness guard whose fail direction is skip-not-abort"
    - "Characterization diff: only missing_semantic_fields shrinkage backed by genuinely present authority fields; probe edit scoped; TARGET_DELTAS and all other bytes unchanged; no flat ESA golden drift"
    - "The five hook.test.ts fixtures pin REPO_HARNESS_CLI and pass with ambient PATH"
    - "Docs state the four-adapter/five-dimension parity contract; architecture-sync green"
    - "cmp hook mirrors identical; .projection.json via sync only"
    - "Final diff contains only Allowed Paths"
    - "Fresh task review and independent external acceptance both pass for the frozen subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: MCP surface completion + proof + docs; hook change
  limited to defensive hardening; everything else observational.
- Edge cases: stale-binary ambient PATH; scalar readiness; stop/ship
  distinction across all four adapters; fields legitimately still missing
  at script level (not faked closed).
- Regression risks: parity proven adapter-to-adapter instead of
  adapter-to-authority; probe over-shrinking; flat golden drift; mirror
  divergence.

## Rollback Point

- Commit / checkpoint: `89f75d8a`.
- Revert strategy: revert the independent LSC-08 PR; MCP loses the two
  additive fields, the parity proofs and docs statement disappear, hook
  hardening reverts; no persisted migration to unwind.

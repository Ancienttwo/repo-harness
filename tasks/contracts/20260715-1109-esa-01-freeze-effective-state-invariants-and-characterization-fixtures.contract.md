# Task Contract: esa-01-freeze-effective-state-invariants-and-characterization-fixtures

> **Status**: Active
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> **Owner**: kito
> **Capability ID**: workflow-engine-inspection-migration
> **Last Updated**: 2026-07-15 11:18
> **Review File**: `tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md`
> **Notes File**: `tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md`

## Why

The current Effective State implementation combines authority parsing, deterministic policy, Git/version effects, lock/cache persistence, and adapter projection. Moving it without a frozen behavioral oracle risks silently changing blockers, freshness, versions, CLI exits, or concurrency safety.

## Goal

Freeze current Effective State v1 behavior at `main@82550779cdccf0575d674ae53bbc95ba63e44743` with reusable real-repository fixtures, at least ten full normalized direct/CLI/hook goldens, lock/cache/source-instability tests, an authority ADR, and a recorded 100-resolution median/p95 baseline. Production behavior must remain unchanged.

Then execute the approved dependent rows ESA-02 through ESA-05 and ESA-07 in order on the same isolated branch, leaving ESA-06 deferred. Produce the repository-wide authoritative benchmark exactly once after the final `src/cli` code freeze, then close the Sprint and merge/push `main`.

## Scope

- In scope: ESA-01 through ESA-05 plus ESA-07 files and tests named by the approved Sprint, along with synchronized workflow artifacts.
- Out of scope: ESA-06 writer hardening, unrelated tools, and the two no-touch Skill Surface files in the main checkout.
- Taste constraints: no new abstraction beyond a shared test fixture used by the existing suite and new characterization suites; no fallback or second authority.

## Stop Conditions

- Stop if satisfying a golden requires changing production source or accepting a semantic delta from baseline.
- Stop if an edit is required outside `allowed_paths`.
- Stop if lock/source-mutation evidence cannot be made bounded and deterministic enough to distinguish stable publication from fail-closed behavior.
- Stop if any existing Effective State assertion changes expected behavior.

## Falsifier

The direction is wrong if current behavior cannot be captured without weakening exact blocker/reason/order/version/hash contracts or if real Git/lock fixtures expose nondeterministic semantic output. Cheapest proof: run the existing suite after extracting only the shared fixture helper, before adding new assertions.

## Workflow Inventory

- Source plan: `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md`
- Sprint: `plans/sprints/20260714-effective-state-authority-convergence.sprint.md`
- Review file: `tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md`
- Notes file: `tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Scope gate: edit only paths listed below.

## Allowed Paths

```yaml
allowed_paths:
  - docs/architecture/effective-state-authority.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/CHANGELOG.md
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.es.md
  - README.fr.md
  - evals/harness/reports/profile-comparison.json
  - evals/harness/reports/profile-comparison.md
  - evals/harness/reports/profile-comparison.sha256.json
  - interfaces/
  - package.json
  - plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
  - plans/sprints/20260714-effective-state-authority-convergence.sprint.md
  - scripts/capability-resolver.ts
  - scripts/check-ci.sh
  - scripts/check-state-boundaries.ts
  - scripts/check-tarball-install-smoke.sh
  - scripts/sync-helper-sources.ts
  - scripts/sync-hook-sources.ts
  - src/core/
  - src/effects/
  - src/cli/
  - assets/templates/helpers/capability-resolver.ts
  - assets/hooks/pre-edit-guard.sh
  - .ai/hooks/pre-edit-guard.sh
  - .ai/hooks/.projection.json
  - assets/skill-version.json
  - assets/workflow-contract.v1.json
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
  - tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md
  - tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
  - tests/effective-state.test.ts
  - tests/
```

## Delegation Contract

```yaml
delegation:
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: implement_and_gatekeep
      purpose: single_writer_for_ordered_sprint_row
  runner:
    preferred:
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/architecture/effective-state-authority.md
    - interfaces/effective-state-v1.ts
    - src/core/state/project-effective-state.ts
    - src/core/capabilities/registry.ts
    - src/effects/state/resolve-effective-state.ts
    - src/cli/mcp/state-tools.ts
    - scripts/check-state-boundaries.ts
    - tests/state/effective-state-fixture.ts
    - tests/state/cli-state-golden.test.ts
    - tests/state/state-concurrency.test.ts
    - tests/state/benchmark-effective-state.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
  tests_pass:
    - path: tests/effective-state.test.ts
    - path: tests/state/
    - path: tests/capabilities/
    - path: tests/cli/mcp-tools.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun run check:helpers
    - bash scripts/check-tarball-install-smoke.sh
    - bun run check:release
    - repo-harness run check-task-workflow --strict
    - repo-harness run verify-sprint --plan plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
  qa_scores:
    - dimension: functionality
      min: 9
    - dimension: code_quality
      min: 9
  manual_checks:
    - "Golden matrix contains at least ten named scenarios"
    - "100-resolution benchmark p95 remains within 10 percent of the ESA-01 baseline"
    - "Direct, CLI, hook, and MCP canonical fields agree for every parity fixture"
    - "Generated capability helper is standalone and bound to the canonical source hash"
    - "Authoritative 3x9 benchmark validates against the frozen final subject"
    - "Evaluator review and external acceptance recommend pass for the final subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: behavior-preserving authority cutover for ESA-01..05 and ESA-07; Effective State protocol `1`, CLI/MCP names, and exit semantics stay stable.
- Edge cases: missing/foreign authority, stale projections, invalid risk/capability inputs, cache deletion/corruption, live/stale locks, changing sources.
- Regression risks: over-normalized goldens or test-only fixture drift.

## Rollback Point

- Commit / checkpoint: isolated branch `codex/esa-01-freeze-effective-state-invariants-and-characterization-fixtures`.
- Revert strategy: revert the ESA-01 commit or discard the isolated branch; no migration required.

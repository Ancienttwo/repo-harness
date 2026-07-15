# Task Contract: esa-01-freeze-effective-state-invariants-and-characterization-fixtures

> **Status**: Active
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> **Owner**: kito
> **Capability ID**: workflow-engine-inspection-migration
> **Last Updated**: 2026-07-15 16:58
> **Review File**: `tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md`
> **Notes File**: `tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md`

## Why

The current Effective State implementation combines authority parsing, deterministic policy, Git/version effects, lock/cache persistence, and adapter projection. Moving it without a frozen behavioral oracle risks silently changing blockers, freshness, versions, CLI exits, or concurrency safety.

## Goal

Freeze Effective State v1 at `main@82550779cdccf0575d674ae53bbc95ba63e44743` with reusable real-repository fixtures, at least ten full normalized direct/CLI/hook goldens, lock/cache/source-instability tests, an authority ADR, and a recorded 100-resolution median/p95 baseline. Public protocol, command/tool names, ordering, exits, and valid-input semantics remain unchanged; review-proven authority-read, locking, and publication failures must be corrected fail closed.

Then execute the approved dependent rows ESA-02 through ESA-05 and ESA-07 in order on the same isolated branch, leaving ESA-06 deferred. ESA-07 includes the minimal evidence-producer correction required to make every harness-enabled provider write into the linked workspace read by its grader. Produce one successful repository-wide authoritative benchmark after the final code freeze, then close the Sprint and merge/push `main`.

## Scope

- In scope: ESA-01 through ESA-05 plus ESA-07 files and tests named by the approved Sprint, the bounded benchmark linked-worktree topology correction, and synchronized workflow artifacts.
- Out of scope: ESA-06 writer hardening, benchmark scenarios/graders/provider semantics/fingerprint validation, unrelated tools, the two no-touch Skill Surface files, and the unapproved Harness Loop plan in the main checkout.
- Taste constraints: no new abstraction beyond a shared test fixture used by the existing suite and new characterization suites; no fallback or second authority.

## Stop Conditions

- Stop if satisfying a golden requires an unreviewed semantic delta from baseline; explicit fail-closed correctness fixes require a reproduced fault and regression proof.
- Stop if an edit is required outside `allowed_paths`.
- Stop if lock/source-mutation evidence cannot be made bounded and deterministic enough to distinguish stable publication from fail-closed behavior.
- Stop if an existing valid-input Effective State assertion changes expected behavior.
- Stop if benchmark recovery requires changing scenario prompts, acceptance commands, grader semantics, product source, or fingerprint/hash validation.

## Falsifier

The direction is wrong if current behavior cannot be captured without weakening exact blocker/reason/order/version/hash contracts, if real Git/lock fixtures expose nondeterministic semantic output, or if provider output and grader authority cannot share one precreated linked workspace without changing evaluator semantics. Cheapest topology proof: run the focused matrix regression before the runner patch.

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
  - docs/architecture/modules/verification/evals-checks.md
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
  - scripts/run-harness-profile-benchmark.ts
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
    - tests/effective-state.test.ts
    - tests/state/effective-state-fixture.ts
    - tests/state/adapter-parity.test.ts
    - tests/state/artifact-parsers.test.ts
    - tests/state/cli-state-golden.test.ts
    - tests/state/project-effective-state.test.ts
    - tests/state/state-concurrency.test.ts
    - tests/state/state-effects.test.ts
    - tests/state/benchmark-effective-state.ts
    - tests/capabilities/registry.test.ts
    - tests/cli/mcp-tools.test.ts
    - scripts/run-harness-profile-benchmark.ts
    - tests/harness-benchmark-matrix.test.ts
    - docs/architecture/modules/verification/evals-checks.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
  commands_succeed:
    - BUN_TEST_ISOLATE_FILES=0 BUN_TEST_TIMEOUT_MS=60000 BUN_TEST_MAX_CONCURRENCY=4 NPM_RELEASE_REGISTRY=https://registry.npmjs.org/ bun run check:release
  qa_scores:
    - dimension: functionality
      min: 9
    - dimension: code_quality
      min: 9
  manual_checks:
    - "Golden matrix contains at least ten named scenarios"
    - "100-resolution benchmark p95 remains within 10 percent of the ESA-01 baseline"
    - "CLI matches requested-risk resolution; hook/MCP match inspect resolution; repository authority fields agree across every parity fixture"
    - "Generated capability helper is standalone and bound to the canonical source hash"
    - "Authoritative 3x9 benchmark validates against the frozen final subject"
    - "Adaptive Lite and Strict providers, guards, focused checks, and graders observe the same precreated linked workspace; No Harness remains a plain isolated clone"
    - "Evaluator review and external acceptance recommend pass for the final subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: behavior-preserving authority cutover for ESA-01..05 and ESA-07; Effective State protocol `1`, CLI/MCP names, and exit semantics stay stable.
- Edge cases: missing/foreign authority, stale projections, invalid risk/capability inputs, cache deletion/corruption, live/stale locks, changing sources.
- Regression risks: over-normalized goldens or test-only fixture drift.

## Rollback Point

- Commit / checkpoint: isolated branch `codex/esa-01-freeze-effective-state-invariants-and-characterization-fixtures`.
- Revert strategy: revert the ESA-01 commit or discard the isolated branch; no migration required.

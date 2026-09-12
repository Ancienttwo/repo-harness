# Task Contract: repo-harness-test-skill

> **Status**: Active
> **Plan**: plans/plan-20260913-0258-repo-harness-test-skill.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-13 02:58
> **Review File**: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`
> **Notes File**: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:377551a2569997cf2bc00709d1f96f2ede9be9384b2afba1f38ed2cb7f440f93`

## Why

Testing technique in this repository is currently spread across commit messages,
archived notes, and the reading of a few helper files. The prose policy in
`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`
deliberately owns only author/reviewer requirements, not the repo-specific
mechanics (which fixture, which runner, which env gate, which CI lane). Without
a router, an agent either re-derives those mechanics wrongly or a second policy
gets written next to the first one.

## Goal

Ship `repo-harness-test` as a canonical skill package: a router `SKILL.md` under
2048 bytes plus four references (`authoring`, `running`, `refactor-evidence`,
`verification-plan`), registered once in `assets/skill-commands/manifest.json` as
a `full`-profile facade so the install/update host sync projects it to both hosts. Every
technique claim in the references resolves to a real file, symbol, command, or
merged PR on `origin/main`. The package restates no policy.

## Scope

- In scope: the new package under `assets/skills/repo-harness-test/`; one package
  entry plus the `expectedProjections.facadesByProfile.full` row in
  `assets/skill-commands/manifest.json`; adding the package name to the
  manifest-derived surface inventories that act as the drift checks between the
  manifest and the declared surface; one routing row in
  `assets/reference-configs/agentic-development-flow.md` and its projection.
- Out of scope: any change to the testing policy prose in `sprint-contracts.md`;
  any change to `src/`; any change to the semantics of an existing assertion;
  README locale tables; `CLAUDE.md` / `AGENTS.md`.
- Taste constraints: the router names entrypoints and boundaries only; every
  reference stays under roughly 120 lines and cites file:line or a command.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the references end up restating `sprint-contracts.md` rather than adding
repo-specific mechanics, the package is a second policy and must not ship.
Cheapest proof point: every normative sentence in a reference should name a
path, symbol, flag, environment variable, or PR that exists in this repository;
a sentence that would read identically in any repository belongs to the policy,
not here.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260913-0258-repo-harness-test-skill.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md`
- Notes file: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md
  - tasks/reviews/20260913-0258-repo-harness-test-skill.review.md
  - tasks/notes/20260913-0258-repo-harness-test-skill.notes.md
  - assets/skills/repo-harness-test/
  - assets/skill-commands/manifest.json
  - assets/reference-configs/agentic-development-flow.md
  - docs/reference-configs/agentic-development-flow.md
  - tests/
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist:
    - assets/skills/repo-harness-test/SKILL.md
    - assets/skills/repo-harness-test/references/authoring.md
    - assets/skills/repo-harness-test/references/running.md
    - assets/skills/repo-harness-test/references/refactor-evidence.md
    - assets/skills/repo-harness-test/references/verification-plan.md
  artifacts_exist:
    - tasks/notes/20260913-0258-repo-harness-test-skill.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {"id": "t-canonical-packages", "kind": "package_test", "path": "tests/skill-surface/canonical-packages.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "router byte budget, frontmatter, declared-reference closure and shell-block limits for the new package", "inputs": {"env": []}},
    {"id": "t-catalog", "kind": "package_test", "path": "tests/skill-surface/catalog.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "manifest package count, profile-component crossref and the full discovery matrix after registration", "inputs": {"env": []}},
    {"id": "t-action-command-skills", "kind": "package_test", "path": "tests/action-command-skills.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "exact facade-kind surface inventory and public-doc naming", "inputs": {"env": []}},
    {"id": "t-routing-eval", "kind": "package_test", "path": "tests/skill-routing-eval.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "discovered_surface derived live from the manifest for full/claude", "inputs": {"env": []}},
    {"id": "t-install-profiles", "kind": "package_test", "path": "tests/install-profiles.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "installer consumes the changed catalog for both profiles", "inputs": {"env": []}},
    {"id": "t-installed-copy-sync", "kind": "package_test", "path": "tests/installed-copy-sync.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "host projection of assets/skills sources to the Claude and Codex skill roots", "inputs": {"env": []}},
    {"id": "t-readme-dx", "kind": "package_test", "path": "tests/readme-dx.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "documentation literal-string assertions over the edited reference-config projection", "inputs": {"env": []}},
    {"id": "t-retired-names", "kind": "package_test", "path": "tests/skill-surface/retired-names-scan.test.ts", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "new assets/ text must not reintroduce a retired package or planning-provider name", "inputs": {"env": []}},
    {"id": "c-typecheck", "kind": "command", "command": "bun run check:type", "cwd": ".", "phase": "preflight", "cost": "normal", "evidence_policy": "current_exact", "necessity": "the four edited test files must still typecheck", "inputs": {"env": []}},
    {"id": "c-reference-configs", "kind": "command", "command": "bun run check:reference-configs", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "assets/reference-configs authoring source and its docs/ projection must not drift", "inputs": {"env": []}},
    {"id": "c-hooks", "kind": "command", "command": "bun run check:hooks", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "required repository integrity check for a substantive change", "inputs": {"env": []}},
    {"id": "c-helpers", "kind": "command", "command": "bun run check:helpers", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "required repository integrity check for a substantive change", "inputs": {"env": []}},
    {"id": "c-architecture-sync", "kind": "command", "command": "bash scripts/check-architecture-sync.sh", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "required repository integrity check for a substantive change", "inputs": {"env": []}},
    {"id": "c-task-workflow", "kind": "command", "command": "bash scripts/check-task-workflow.sh --strict", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "plan/contract/review/notes artifact consistency for this work package", "inputs": {"env": []}},
    {"id": "c-task-sync", "kind": "command", "command": "REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "binds the task digest to the PR merge base the way CI will compute it", "inputs": {"env": []}},
    {"id": "c-deploy-sql-order", "kind": "command", "command": "bash scripts/check-deploy-sql-order.sh", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "required repository integrity check", "inputs": {"env": []}},
    {"id": "c-project-state", "kind": "command", "command": "bun scripts/inspect-project-state.ts --repo . --format text", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "required repository state inspection", "inputs": {"env": []}},
    {"id": "c-init-dry-run", "kind": "command", "command": "bun src/cli/index.ts init --repo . --dry-run", "cwd": ".", "phase": "verification", "cost": "normal", "evidence_policy": "current_exact", "necessity": "adoption planner still resolves against the changed catalog", "inputs": {"env": []}}
  ]
}
```

Author the actual checks using [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

- Changed behavior/boundary: one new shipped skill package plus its single
  manifest registration. The behavior that can break is catalog parsing,
  profile projection, and host sync; all three already have owning tests.
- New test case/file rationale: none added. The new package is declared into the
  existing manifest-derived inventories, which is what gives it coverage; a
  task-named test file would be a second oracle for the same manifest.
- Selected check IDs: `t-canonical-packages` (package shape), `t-catalog` +
  `t-routing-eval` (manifest-derived selectors), `t-action-command-skills`
  (exact facade inventory), `t-install-profiles` + `t-installed-copy-sync`
  (installer and host projection), `t-readme-dx` + `t-retired-names`
  (documentation surfaces), plus the required repository integrity commands.
- Full/expensive check justification: none. No `cost: expensive` check is
  declared. The change touches `assets/` and four test inventory lists; the
  affected consumers are named above, and the PR's own CI run is the full pass
  for the merge candidate.
- Execution/baseline references: recorded in the review file for this contract.
- Residual risks: none outstanding. `REPO_HARNESS_TEST_EXPENSIVE` landed on
  `main` as `268c973d` before this branch was rebased, so every claim in the
  references resolves against `origin/main`.

## Rollback Point

- Commit / checkpoint: `origin/main` at `e3b93f0f` (branch base).
- Revert strategy: revert the single commit on `codex/repo-harness-test-skill`;
  the change adds one package directory and one manifest entry, so removing both
  plus the four inventory rows restores the previous surface exactly.

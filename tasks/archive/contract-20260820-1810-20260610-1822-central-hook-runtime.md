> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260610-1822-central-hook-runtime.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: central-hook-runtime

> **Status**: Fulfilled
> **Plan**: plans/plan-20260610-1822-central-hook-runtime.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-10 19:05
> **Review File**: `tasks/reviews/20260610-1822-central-hook-runtime.review.md`
> **Notes File**: `tasks/notes/20260610-1822-central-hook-runtime.notes.md`

## Goal

Hook execution resolves central-first on both dispatch chains (bash shim and `repo-harness-hook` CLI), so one `repo-harness install` / CLI upgrade updates hook behavior for every trusted opt-in repo without per-repo `.ai/hooks` refreshes. Repos can pin `"hook_source": "repo"` in `.ai/harness/policy.json`; the self-host repo pins it so hook development keeps running live working-tree code.

## Scope

- In scope: `scripts/hook-shim.sh` resolution order, `scripts/repo-harness.sh` central bundle install/status, `run-hook.sh` self-relative dispatch (both copies), `src/cli/hook/runtime.ts` resolveHooksDir, doctor hook-source reporting, self-host policy pin, hook-operations docs (both copies), root contract line, regression tests.
- Out of scope: removing vendored `.ai/hooks` from init/migrate scaffolding; `managed-entries.ts` adapter command changes; fleet rollout state (`~/.repo-harness`, trust file) which happens post-merge.

## Workflow Inventory

- Source plan: `plans/plan-20260610-1822-central-hook-runtime.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260610-1822-central-hook-runtime.review.md`
- Notes file: `tasks/notes/20260610-1822-central-hook-runtime.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260610-1822-central-hook-runtime.contract.md
  - tasks/reviews/20260610-1822-central-hook-runtime.review.md
  - tasks/notes/20260610-1822-central-hook-runtime.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/policy.json
  - .ai/hooks/run-hook.sh
  - assets/hooks/run-hook.sh
  - scripts/hook-shim.sh
  - scripts/repo-harness.sh
  - src/
  - tests/
  - CLAUDE.md
  - AGENTS.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - scripts/hook-shim.sh
    - assets/hooks/run-hook.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260610-1822-central-hook-runtime.notes.md
  tests_pass:
    - path: tests/hook-shim-resolution.test.ts
    - path: tests/hook-shim-trust.test.ts
    - path: tests/cli/hook.test.ts
    - path: tests/cli/doctor.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: shim resolves env override → policy pin → central bundle → repo fallback; CLI chain resolves env → pin → packaged `assets/hooks` → repo fallback; install (re)builds `~/.repo-harness/hooks` with `.version` stamp and removes stale files.
- Edge cases: macOS `/var` symlink canonicalization (tests use realpath), repos without vendored `.ai/hooks` now run via central, central `run-hook.sh` refuses to guess repo root (no `$HOME` fallback), untrusted repos still skip entirely.
- Regression risks: repos relying on locally patched `.ai/hooks` behavior silently switch to central after install — mitigated by the policy pin escape hatch plus doctor/status source reporting.

## Rollback Point

- Commit / checkpoint: branch `codex/central-hook-runtime` base `2cf0d11`
- Revert strategy: revert the merge commit; runtime rollback = reinstall a pre-change `repo-harness.sh install` and delete `~/.repo-harness/hooks/`.

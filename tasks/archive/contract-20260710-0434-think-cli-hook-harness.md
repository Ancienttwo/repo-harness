> **Archived**: 2026-07-10 04:34
> **Related Plan**: plans/archive/plan-20260710-0230-think-cli-hook-harness.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260710-0434

# Task Contract: think-cli-hook-harness

> **Status**: Fulfilled
> **Plan**: plans/plan-20260710-0230-think-cli-hook-harness.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-10 03:45
> **Review File**: `tasks/reviews/20260710-0230-think-cli-hook-harness.review.md`
> **Notes File**: `tasks/notes/20260710-0230-think-cli-hook-harness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The just-landed runtime refresh advertises an update check that fails in live use, misses a common explicit Chinese implementation command, and raises the fast-worker reasoning tier without evidence. Shipping that state makes setup diagnostics untrustworthy, weakens the plan gate for Chinese users, and spends more latency/tokens than the GPT-5.6 migration guidance supports.

## Goal

Deliver one bounded correction that makes the Bun registry lookup work from the installed package, warns when the PATH-resolved Codex is too old for the generated GPT-5.6 profiles, unifies this machine on the existing compatible standalone Codex `0.144.0`, routes `请直接修改…并提交` as execution rather than review-only advice, and keeps the GPT-5.6 Terra fast-worker at the prior `medium` reasoning baseline while preserving GPT-5.6 Sol `xhigh` for judgment roles.

## Scope

- In scope:
  - Correct `readLatestPackageVersion` cwd selection without changing package-manager authority or adding fallback behavior.
  - Add deterministic regression coverage for the live Bun cwd precondition.
  - Add a read-only `codex-cli-version` doctor check: `na` when absent, `warn` below `0.144.0` or unreadable, and `ok` at/above the live-proven GPT-5.6 floor. Claude-only setup reports must filter this Codex-specific check.
  - Uninstall the obsolete Homebrew Codex `0.143.0` cask, retain the existing standalone `~/.local/bin/codex` `0.144.0`, and verify a clean login shell exposes no competing independently installed version. Do not modify the signed ChatGPT app's embedded runtime.
  - Recognize only the explicit Chinese `请直接修改/直接修改` imperative before release-review precedence, with positive and non-imperative tests.
  - Normalize the owned fast-worker generator, checked-in profile, docs mirrors, changelog text, and tests from Terra `high` to Terra `medium`.
  - Record verification/review artifacts and close the contract worktree.
- Out of scope:
  - Responses API request features: Programmatic Tool Calling, persisted reasoning, explicit prompt caching, Pro mode, `max` effort, or API multi-agent.
  - Machine-wide plugin/skill pruning, broad prompt rewriting, global/project Rule 0 deduplication, or model-quality benchmarking beyond availability and harness regressions.
  - Changes to deep-reasoner or gatekeeper model/effort values.
  - Enabling Claude `SubagentStart`/`SubagentStop` routes, which reverses an explicit Codex-only installer contract and needs a separate cross-host protocol canary.
  - Codex hook `statusMessage` metadata and a `features.hooks` doctor warning; missing `features.hooks` means the documented stable default `true`, so missing-config warnings are forbidden.
- Taste constraints: use existing functions and mirrors; add no dependency, file, wrapper, extension point, telemetry, fallback, or compatibility branch.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if no installed Codex binary at/above `0.144.0` can run both `gpt-5.6-sol` and `gpt-5.6-terra`, or if Bun cannot query the registry from the installed package root.
- Stop before uninstalling Homebrew if the standalone target or its `~/.local/bin/codex` symlink is missing or fails the two GPT-5.6 probes.

## Falsifier

The direction is wrong if `bun pm view repo-harness version --json` still requires a cwd other than the installed package root, if the bounded Chinese imperative cannot be distinguished without broad `修改` matching, or if Codex 0.144 rejects the selected GPT-5.6 model IDs. The cheapest probes are the direct Bun command, `prompt-guard-decide`, and one ephemeral `codex exec` per model.

## Workflow Inventory

- Source plan: `plans/plan-20260710-0230-think-cli-hook-harness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260710-0230-think-cli-hook-harness.review.md`
- Notes file: `tasks/notes/20260710-0230-think-cli-hook-harness.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260710-0230-think-cli-hook-harness.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260710-0230-think-cli-hook-harness.contract.md
  - tasks/reviews/20260710-0230-think-cli-hook-harness.review.md
  - tasks/notes/20260710-0230-think-cli-hook-harness.notes.md
  - docs/architecture/requests/
  - docs/CHANGELOG.md
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - scripts/install-agent-fleet.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - .codex/agents/fast-worker.toml
  - src/cli/commands/doctor.ts
  - src/cli/commands/init-hook.ts
  - src/cli/hook/prompt-intents.ts
  - tests/cli/doctor.test.ts
  - tests/cli/init-hook.test.ts
  - tests/cli/prompt-intents.test.ts
  - tests/bootstrap-files.test.ts
  - tests/install-agent-fleet.test.ts
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: explicit_plus_allowed_paths
    writable_paths:
      - /opt/homebrew/Caskroom/codex
      - /opt/homebrew/bin/codex
      - /Users/kito/.local/bin/codex
      - /Users/kito/.codex/packages/standalone
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: integration_and_workflow_artifacts
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: isolated_implementation_slice
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/commands/doctor.ts
    - src/cli/hook/prompt-intents.ts
    - .codex/agents/fast-worker.toml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260710-0230-think-cli-hook-harness.notes.md
    - tasks/reviews/20260710-0230-think-cli-hook-harness.review.md
  tests_pass:
    - path: tests/cli/doctor.test.ts
    - path: tests/cli/init-hook.test.ts
    - path: tests/cli/prompt-intents.test.ts
    - path: tests/install-agent-fleet.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun test
    - bun run check:type
    - bun run check:hooks
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash scripts/check-tarball-install-smoke.sh
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: update advice remains opt-in/read-only; prompt hook remains deterministic/offline; role mapping remains tier-aware.
- Edge cases: offline registry stays `na`; generic plan refinement containing `修改` remains non-execution; generated copies remain byte-aligned.
- Regression risks: cwd portability, Chinese intent precedence, and stale generated documentation.

## Rollback Point

- Commit / checkpoint: the single implementation commit on `codex/think-cli-hook-harness`.
- Revert strategy: revert that commit. If host rollback is explicitly required, reinstall the Homebrew cask separately; do not keep an incompatible fallback in normal operation.

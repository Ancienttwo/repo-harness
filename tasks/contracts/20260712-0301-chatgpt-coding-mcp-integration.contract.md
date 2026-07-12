# Task Contract: chatgpt-coding-mcp-integration

> **Status**: Partial
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 06:18
> **Review File**: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`
> **Notes File**: `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The coding MCP feature and its authorization-runtime repair passed local, repository, and live functional acceptance on a branch that predates the current mainline MCP rollout-retirement cutover. Merging that branch tree wholesale would resurrect deleted rollout-control authority and stale workflow state; skipping integration leaves the accepted feature unavailable on current main. The integration must preserve both authorities without weakening either. Current main later advanced to `02079da` with a BDD² V0 PRD whose catalog filename and missing Draft status make main's own strict workflow and CI fail; integrating current main therefore also requires the smallest catalog repair before this contract can become green.

## Goal

Replay the seven accepted coding MCP commits onto the rollout-retirement base, merge subsequently advanced `origin/main` through `3bf28a7`, preserve current main authorities while keeping the complete default-off coding profile and OAuth authorization-scoped runtime intact, pass all focused and root verification gates, refresh the existing PR #55, then mark it ready and squash-merge it into `main` without absorbing unrelated worktree state.

## Scope

- In scope:
  - Cherry-pick `0b80ef4`, `47cbe50`, `2f3405d`, `443f3ea`, `2a9d490`, `c3a77d1`, and `f3b546d` in order onto `origin/main@788ba60`.
  - Merge refreshed `origin/main@8e160323` and preserve its transactional TypeScript adoption cutover; regenerate derived current/handoff state rather than carrying the retired migration helper contract forward.
  - Merge refreshed `origin/main@bb750141` and preserve its independent BDD² evaluation foundation; regenerate derived current/handoff state rather than carrying either stale snapshot forward.
  - Merge refreshed `origin/main@02079da`; rename its BDD² V0 PRD to the required timestamped catalog shape, add only the missing `Draft` status metadata, and update its two direct references. Do not rewrite the PRD body or otherwise change BDD² product intent.
  - Merge refreshed `origin/main@3bf28a7` and preserve PR #58's newer BDD² authority: the retained V0 lives under `plans/archive/`, its reference points there, and the integration branch's temporary catalog repair must disappear from the final diff.
  - Preserve current mainline removal of MCP rollout controls, candidate flags, and retired policy/type fields while layering the accepted coding-only profile, workspace/file/process tools, OAuth grant identity, docs, tests, and evidence.
  - Preserve the current Bun engine floor and add only the already-reviewed optional `node-pty` dependency; keep the lockfile deterministic.
  - Regenerate `tasks/current.md` and handoff/resume projections from the integrated state rather than selecting either stale side.
  - Run the focused MCP suites, full test suite, all root required checks, contract verification, and install/lockfile verification.
  - Push only the integration branch, reuse PR #55, require fresh green CI and a clean mergeability result, mark the PR ready, and squash-merge it into `main` after all gates pass. Preserve the local integration branch/worktree for post-merge inspection; do not publish or tag a release.
- Out of scope:
  - Updating, stashing, committing, cleaning, or switching `/Users/kito/Projects/repo-harness` local main or its two WIP paths.
  - Reintroducing `scripts/mcp-rollout-gate.ts`, rollout flags, candidate-disabled semantics, or any policy surface retired by current `origin/main`.
  - Changing the accepted coding MCP public interface, adding compatibility fallbacks, publishing a release, tagging a version, deleting the integration worktree/branch, or changing Cloudflare/ChatGPT external state.
  - Redesigning, approving, implementing, or otherwise expanding the incoming BDD² V0 PRD.
- Taste constraints: replay commit patches rather than merge the stale branch tree; one current mainline policy authority, one OAuth authorization identity authority, no dual schemas, no unrelated cleanup.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a conflict cannot preserve current rollout retirement and the accepted coding profile simultaneously without a new product decision.
- Stop before push or PR creation if the local main WIP hashes differ from the recorded preflight values.

## Falsifier

The direction is wrong if replaying the seven commits necessarily requires a deleted rollout-control file/flag, or if focused MCP tests prove the coding profile cannot coexist with current mainline policy/setup semantics. Cheapest proof: cherry-pick the initial feature commit in isolation, inspect conflicts in the overlapping MCP authority files, and run focused policy/setup/HTTP tests before completing the remaining replay.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md`
- Notes file: `tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .agents/skills/repo-harness-chatgpt-bridge/
  - .ai/context/capabilities.json
  - .ai/harness/handoff/
  - bun.lock
  - package.json
  - docs/architecture/domains/runtime-harness.md
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/reference-configs/chatgpt-coding-mcp.md
  - docs/repo-harness-chatgpt-mcp-setup.md
  - docs/researches/20260711-devspace-chatgpt-local-control.md
  - docs/spec.md
  - plans/archive/plan-20260711-0137-chatgpt-coding-mcp.md
  - plans/archive/20260712-1426-bdd-v0.prd.md
  - plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
  - plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
  - plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/prds/20260712-BDD.prd.md
  - plans/prds/20260712-1426-bdd2-v0.prd.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/archive/contract-20260711-0609-chatgpt-coding-mcp.md
  - tasks/archive/notes-20260711-0609-chatgpt-coding-mcp.md
  - tasks/archive/review-20260711-0609-chatgpt-coding-mcp.md
  - tasks/archive/todo-20260711-0609-chatgpt-coding-mcp.md
  - tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
  - tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
  - tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
  - tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
  - tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md
  - tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md
  - tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md
  - tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md
  - tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md
  - src/cli/chatgpt-browser/file-policy.ts
  - src/cli/commands/mcp.ts
  - src/cli/mcp/
  - src/effects/repo-registry.ts
  - tests/archive-evidence-gates.test.ts
  - tests/cli/mcp-coding-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/mcp-oauth.test.ts
  - tests/cli/mcp-policy.test.ts
  - tests/cli/mcp-process-sessions.test.ts
  - tests/cli/mcp-setup.test.ts
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
    - plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
    - docs/reference-configs/chatgpt-coding-mcp.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-0301-chatgpt-coding-mcp-integration.notes.md
  tests_pass:
    - path: tests/cli/mcp-coding-tools.test.ts
    - path: tests/cli/mcp-http.test.ts
    - path: tests/cli/mcp-oauth.test.ts
    - path: tests/cli/mcp-policy.test.ts
    - path: tests/cli/mcp-process-sessions.test.ts
    - path: tests/cli/mcp-setup.test.ts
  commands_succeed:
    - bun install --frozen-lockfile
    - bun run check:type
    - BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_ISOLATE_FILES=1 bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - LC_ALL=C repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: security
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: current planner/orchestrator behavior remains on the post-cutover authority; coding remains explicit, default-off, grant/revision-bound, worktree-first, and usable across fresh MCP transports for one OAuth authorization.
- Edge cases: no retired rollout file/flag reappears; separate OAuth grants cannot share workspace/process state; Bun engine and optional `node-pty` coexist; derived workflow state is regenerated.
- Regression risks: conflict resolution could silently restore removed policy fields, drop coding security annotations, weaken grant isolation, or overwrite current adoption behavior.

## Rollback Point

- Commit / checkpoint: initial integration base `788ba60cca5e0072febc19833002a3ffe497b0a1`, refreshed main through `3bf28a7f1274ae7300b2e2088b2889a84b26a2c5`, source feature head `f3b546dc8ff9bb357f20d709aca51809cb3e3ad0`; local main WIP hashes `ef3558e089fbf2f054b60c9f8cca6e8dc01fb0dee9984df3e575cbe3e7c3c12b` and `4c3aeda0ca8b82fa95da5c91cf2bc829ba8eddeb62f99e5468678fcc20e6a786`.
- Revert strategy: before merge, close PR #55 and preserve the isolated integration branch/worktree; after squash merge, revert only the PR #55 squash commit if required. Never alter the source feature branch or absorb unrelated worktrees.

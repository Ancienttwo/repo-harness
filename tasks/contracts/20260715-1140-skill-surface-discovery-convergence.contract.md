# Task Contract: skill-surface-discovery-convergence

> **Status**: Active
> **Plan**: plans/plan-20260715-1140-skill-surface-discovery-convergence.md
> **Task Profile**: code-change
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **POST_EPC_SHA**: `555524c1aff9ff8195dd744ea209fb8cc673d817` (pinned by this SSD activation contract per R1 at fresh fetch on 2026-07-23, after EPC-09 merged via PR #125 and Sprint C closed 13/13; verified `origin/main == main == 555524c1` with no active EPC writer anywhere and the cross-package projection-drift closeout re-verified green, 21/21)
> **Base SHA**: `314ee1a7b630e9016b4e184030129fbc9e00a9ef` (fresh worktree branched from `origin/main` after the atomic SSD promotion commit; it differs from `POST_EPC_SHA` only by that promotion — the plan's Draft -> Annotating -> Approved flip plus the deferred-ledger SSD row retirement — and touches no production surface, so the SSD execution baseline for all re-audit and subject purposes is `POST_EPC_SHA`)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/skill-surface-discovery-convergence`
> **PR Unit**: one next-minor public Skill-surface cutover PR carrying all seven SSD slices (SSD-01..07), so old and new public rule owners are never released together
> **Capability ID**: root
> **Last Updated**: 2026-07-23
> **Review File**: `tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md`
> **Notes File**: `tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Skill classification, rule ownership, profile discovery, provider adapters,
and retirement safety currently have no single authority: the facade catalog
(`assets/skill-commands/manifest.json`) is hand-authored but unread by
runtime selection; `profile_facades()` in
`scripts/sync-codex-installed-copies.sh` duplicates profile membership;
installer/init/global-runtime hold separate fixed Skill arrays; cross-review
prose repeats Git scope/timeout/transcript mechanics per provider; and
ChatGPT prose has already drifted across three owners (checked-in packages,
facades, and the inline `SKILL_MD` in `src/cli/mcp/setup.ts`). Shipping this
wrong means a partially installed package the transaction path set cannot
compensate, a deleted user-modified host Skill, or dual public rule owners
released together. Skipping it leaves 25 Skill-like sources with duplicated,
drifting rules and a hard-coded mutation-path list that cannot survive the
next added package.

## Goal

Deliver the plan's one next-minor public-surface migration:

1. `assets/skill-commands/manifest.json` (v2) becomes the runtime authority
   for Skill package classification and host/profile discovery projection.
2. Rule owners converge from 25 Skill-like sources to 10 canonical packages
   without forcing every package into default discovery.
3. Deterministic Git scope capture, provider execution, timeout, and
   transcript recovery move out of Skill Markdown into Core/Effects/CLI.
4. ChatGPT inline/checked-in prose drift is removed (one file-backed
   canonical package; no inline `SKILL_MD` owner).
5. Old package-owned names retire transactionally — no steady-state aliases,
   dual reads, semantic fallbacks, or shadow parsers.
6. Routing quality, exact discovered sets, rollback, package projection, and
   repo workflow gates are proven against one frozen subject.

Execution follows the plan's `## Task Breakdown` (SSD-01..07) in dependency
order; SSD-01 (inventory, classification, and routing baseline) executes
first and changes no runtime behavior.

## Scope

- In scope: the plan's affected file families — root `SKILL.md`;
  `assets/skill-commands/**`; `assets/skills/**`;
  `.agents/skills/**` (ChatGPT packages); `src/core/skill-surface/**` (new);
  `src/core/review/**` (new) and `src/effects/review/**`;
  `src/cli/installer/**`;
  `src/cli/commands/{init,global-runtime,cross-review,chatgpt}.ts`
  (`cross-review.ts` is new); `src/cli/mcp/setup.ts`;
  `scripts/sync-codex-installed-copies.sh`; the Skill-routing eval surface
  (`evals/skill-routing/**`, `scripts/run-skill-routing-eval.ts` new or
  `scripts/run-skill-evals.ts` extended, `evals/evals.json`); the focused
  test files listed under Exit Criteria plus `tests/cli/**` siblings;
  README x5; `docs/reference-configs/**` + `assets/reference-configs/**`;
  `docs/architecture/modules/public-surface/**`; `docs/CHANGELOG.md`
  (unreleased section, no version bump); this package's own
  plan/contract/review/notes; `tasks/todos.md` projection; the worktree
  marker `.ai/harness/worktrees/skill-surface-discovery-convergence.json`.
- Out of scope: Effective State protocol, authority precedence, risk
  calculation, and PreToolUse security floors; every EPC evidence/projection
  surface (`src/core/evidence/**`, `src/effects/evidence/**` — SSD absorbs
  no EPC runtime, compatibility, or migration work); `merge-gate` source,
  request schema, tool-free judge semantics, receipt identity, and ship
  side effects (`assets/templates/helpers/merge-gate.ts`); public CLI
  subcommand names and MCP tool names; the harness profile benchmark
  runner/validator/manifest/fixtures and any 3x9 rerun; `package.json` and
  any version field; historical/archive artifacts (retired-name scans use an
  explicit allowlist for `plans/archive/`, `tasks/archive/`, changelog
  history, and research citations); the user's
  `repo-harness-wt-terminal-plans-sweep` worktree (unrelated WIP).
- Non-goals: no compatibility alias, `delegate_to`, dual Skill name,
  semantic fallback, or shadow parser; no `workflow run --mode autoplan`
  engine; no mechanical directory-count target; no browser session, remote
  MCP, deployment, publish, merge, or secret mutation during implementation
  verification.
- Taste constraints: smallest change satisfying each slice's acceptance;
  root `SKILL.md` stays <= 2,048 bytes; mode detail loads progressively from
  references, never inline in routers.

## Execution Boundary

Requirements absent from the plan are forbidden design space. Do not add
compatibility aliases, new public CLI/MCP names, a generic capability
framework, or unrelated installer/effective-state refactors. Treat absent
requirements as forbidden design space, not as permission to improve; record
discovered extra work under the notes file's Out of scope section instead of
implementing it.

## Stop Conditions

- Stop and hand back to the parent if a required edit falls outside this
  contract's exact `allowed_paths`; update this contract before widening
  scope.
- Stop if `origin/main` moves past `314ee1a7` with a change touching any
  in-scope file family before the SSD-07 subject freeze — re-fetch and
  re-audit, never silently rebase.
- Stop if manifest-v2 parity (SSD-02) cannot reproduce the current
  four-profile/two-host discovered sets byte-for-byte — that is a design
  falsifier, not a fixup site.
- Stop if a host retirement transaction would touch a modified or unowned
  installed copy — preserve bytes, fail closed, report.
- Stop if slice write-ownership would be violated (SSD-04 and SSD-05 may run
  concurrently only with the plan's disjoint ownership; SSD-06 is the sole
  integration writer).
- Stop after three fail-fix-reverify rounds on one issue; escalate.

## Falsifier

The direction is wrong if the manifest-derived selector cannot reproduce the
existing profile/host projection exactly before any cutover (SSD-02 parity),
or if transaction snapshots derived from the manifest still miss an actual
Skill mutation path under failure injection. Cheapest proof point: SSD-01's
recorded current discovered sets plus SSD-02's byte-for-byte projection
parity and failure-injection tests — all before any facade is added,
removed, or renamed.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Concurrency and Ownership

- This package is the only active writer in the repository; no other
  package's `allowed_paths` intersect its scope (EPC closed 13/13; the only
  other worktree, `repo-harness-wt-terminal-plans-sweep`, is user WIP and is
  never touched or absorbed).
- Within the package: slices execute in the plan's dependency order; SSD-04
  and SSD-05 may run as a parallel wave only after SSD-03, with the plan's
  exclusive write scopes, and must not touch
  `assets/skill-commands/manifest.json`, installer/profile files,
  README/reference mirrors, `tests/action-command-skills.test.ts`, or
  `tests/evals-contract.test.ts` — SSD-06 receives both sequentially and is
  the sole integration writer. The same manifest, profile, README,
  architecture, or shared test file never has concurrent writers.
- The orchestrator is the only committer/pusher/merger; this contract's
  execution prepares changes and evidence only.

## No-Compatibility Declaration

The public cutover migrates all live references and deletes old authoring
paths in this same work-package. No alias directory, dual read/write path,
semantic fallback, generated compatibility name, or steady-state migration
shim is introduced anywhere. Installed cleanup removes only pristine
package-owned copies; unknown or modified host content is preserved and
blocks the transaction.

## Workflow Inventory

- Source plan: `plans/plan-20260715-1140-skill-surface-discovery-convergence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md`
- Notes file: `tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed
  AcceptanceReceipt under the frozen policy below, then run `verify-sprint`;
  review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - SKILL.md
  - assets/skill-commands/
  - assets/skills/
  - .agents/skills/
  - src/core/skill-surface/
  - src/core/review/
  - src/effects/review/
  - src/cli/installer/
  - src/cli/commands/init.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/commands/cross-review.ts
  - src/cli/commands/chatgpt.ts
  - src/cli/mcp/setup.ts
  - src/cli/index.ts
  - scripts/sync-codex-installed-copies.sh
  - scripts/skill-surface-select.ts
  - scripts/run-skill-routing-eval.ts
  - scripts/run-skill-evals.ts
  - evals/skill-routing/
  - evals/evals.json
  - tests/skill-routing-eval.test.ts
  - tests/action-command-skills.test.ts
  - tests/evals-contract.test.ts
  - tests/install-profiles.test.ts
  - tests/installed-copy-sync.test.ts
  - tests/cli/
  - tests/skill-surface/
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/reference-configs/
  - assets/reference-configs/
  - docs/architecture/modules/public-surface/
  - docs/CHANGELOG.md
  - plans/plan-20260715-1140-skill-surface-discovery-convergence.md
  - tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md
  - tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md
  - tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md
  - tasks/todos.md
  - .ai/harness/worktrees/skill-surface-discovery-convergence.json
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - src/core/evidence/
    - src/effects/evidence/
    - src/core/state/
    - src/effects/state/
    - src/cli/hook/
    - assets/templates/helpers/merge-gate.ts
    - scripts/run-harness-profile-benchmark.ts
    - scripts/validate-harness-profile-benchmark.ts
    - evals/harness/
    - package.json
    - tasks/current.md
  actions:
    - any compatibility alias, dual Skill name, delegate_to, or semantic
      fallback surface
    - public CLI subcommand renames or MCP tool renames
    - full 3x9 harness benchmark rerun
    - version bump or release execution
    - deleting or mutating a modified or unowned installed host Skill copy
    - absorbing dirty/untracked WIP from the root checkout or the user's
      terminal-plans-sweep worktree
    - push, PR open, or merge (orchestrator-only)
```

## Evidence Requirements

```yaml
evidence_requirements:
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
    - assets/skill-commands/manifest.json
    - src/core/skill-surface/catalog.ts
    - tests/skill-routing-eval.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md
  tests_pass:
    - path: tests/skill-routing-eval.test.ts
    - path: tests/action-command-skills.test.ts
    - path: tests/evals-contract.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/installed-copy-sync.test.ts
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts adopt --repo . --dry-run
    - bash scripts/check-tarball-install-smoke.sh
  manual_checks:
    - "Minimal/standard/product-planning/strict discovered sets match the target matrix exactly on both hosts; product planning does not install ChatGPT; strict does not silently add product planning"
    - "No live executable reference targets a retired Skill name; retired names appear only in migration metadata, changelog/history, or archived artifacts"
    - "Host retirement transaction preserves modified and unowned copies, and injected failures restore original bytes at every mutation stage"
    - "Root SKILL.md is at or below 2,048 bytes with mode detail progressively loaded"
    - "Frozen-subject routing evidence meets per-route floors: canonical top-1 >= 95%, per-route recall >= 90%, double-trigger/ambiguous <= 2%, ordinary-QA false activation <= 1% (or zero false activations reported as small-sample when negatives < 100)"
    - "merge-gate source, output schema, tool-free execution, receipt binding, and ship enforcement are byte-unchanged"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `314ee1a7b630e9016b4e184030129fbc9e00a9ef` (worktree
  base; `POST_EPC_SHA = 555524c1` for subject purposes).
- Revert strategy: revert the single work-package PR and reinstall the prior
  package/profile; host transaction rollback must restore all preexisting
  bytes; never remove unowned or modified host Skill content to force
  recovery. After publish, restore the previous package/profile from the
  release artifact and ship a corrective minor.

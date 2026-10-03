# Task Contract: repo-root-normalization

> **Status**: Active
> **Plan**: plans/plan-20260910-0309-repo-root-normalization.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-10 03:10
> **Review File**: `tasks/reviews/20260910-0309-repo-root-normalization.review.md`
> **Notes File**: `tasks/notes/20260910-0309-repo-root-normalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`campaign step --repo .` fails closed with `source_stale` when nothing about the
canonical source moved. A campaign operator who spells the repository root
relatively loses a planning slot to a false staleness verdict, and the failure
is indistinguishable from a real source move. The same unnormalized root reaches
`refactor` and `automation` effects, so the defect is a class, not one command.

## Goal

A repository root reaching an effect is canonical in the same way the writers of
a stored `repository_id` canonicalize it — resolved **and** realpath'd.
`campaign step` treats `--repo .`, `--repo <absolute>`, and `--repo <symlink>`
as the same root, proven by a regression that fails on the unfixed code, and
every `--repo`-derived root in `campaign.ts`, `refactor.ts`, and
`automation.ts` goes through one canonicalization rule.

## Scope

- In scope: routing all 31 `--repo`-derived roots in
  `src/cli/commands/campaign.ts` (13), `src/cli/commands/refactor.ts` (13), and
  `src/cli/commands/automation.ts` (5) through `canonicalRepoPath`. At HEAD 26
  of those were unnormalized and 5 (all in `campaign.ts`) were `resolve`-only,
  which is lexical and cannot collapse a symlink. Exporting
  `canonicalRepoPath` from `src/effects/repo-registry.ts`. One regression test
  covering relative, absolute, and symlinked spellings.
- Out of scope: making `matchCapabilityPath`, `repoHarnessRepoIdFor`, or any
  other callee tolerant of a non-canonical root — that would be a compatibility
  path hiding the next caller's bug, and for `repoHarnessRepoIdFor` it would
  silently re-key persisted identities. Also out of scope: rebuilding the
  BRC14/BRC15 frozen container image, and any change to campaign runtime state.
- Taste constraints: do not introduce a new canonicalization rule. Export and
  reuse the existing one so the existing helper in `repo-registry.ts` stays the single authority
  for what "the same repository" means. (This supersedes an earlier "introduce
  no new helper" constraint that assumed `resolve` was sufficient; the
  acceptance gate proved it is not.)

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/commands/campaign.ts:215` binds the campaign step root as `raw.repo?.trim() || process.cwd()` without canonicalizing, so `campaign-planning-proof.ts:49` calls `repoHarnessRepoIdFor(root)` on a non-canonical string; `repo-registry.ts:105` hashes its argument verbatim, so the derived id cannot equal the `intent.repository_id` recorded through `canonicalRepoPath`, and the check reports `campaign planning authorization is stale`. `resolve` alone does not close it: it is lexical, so a symlinked absolute root reproduces the same failure.
- repro: `bun test tests/cli/repo-root-normalization.test.ts` — one fixture repository stepped three times, with its absolute root, the relative spelling of that root, and a symlink to it.
- regression_guard: tests/cli/repo-root-normalization.test.ts
- pre_fix_failure_artifact: tasks/evidence/repo-root-normalization-pre-fix.log

Callee contract, checked before choosing where to fix: every other caller of
`repoHarnessRepoIdFor` canonicalizes first — registration at
`repo-registry.ts:155`, `:368`, `:586` through `canonicalRepoPath`,
`mcp/reader-tools.ts:238` through `root.canonicalPath`, `engineer.ts:703` and
`:756` via `realpathSync`. The function's contract is that the caller supplies a
canonical absolute path, so the CLI is the violator.

Canonicalizing inside `repoHarnessRepoIdFor` was rejected on three grounds: it
would silently re-key every repository registered under a non-canonical path, it
would hide the next violating caller, and the function is also called with
identities that are not repository roots at all — `grant-store.ts:72` passes an
already-realpath'd Git common directory — so it is a pure hash over an opaque
identity and giving it filesystem I/O would be a layering regression.

The strength of the normalizer matters as much as its placement. `resolve` is
lexical and cannot collapse a symlink, while the ids being compared against come
from `canonicalRepoPath` (resolve **plus** realpath). A first pass of this fix
used `resolve` and left the identical false stale reachable through a symlinked
absolute `--repo`; the acceptance gate reproduced it. The sibling CLI modules
that derive identity-bearing roots already use `realpathSync`
(`interface-change.ts:54`, `delegation.ts:49`, `collaboration.ts:70`,
`verified-context.ts:46`, `engineer.ts:318`), so reusing the exported
`canonicalRepoPath` restores that convention rather than inventing a rule.

## Workflow Inventory

- Source plan: `plans/plan-20260910-0309-repo-root-normalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260910-0309-repo-root-normalization.review.md`
- Notes file: `tasks/notes/20260910-0309-repo-root-normalization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "repo-root-identity-regression", "kind": "deterministic_test", "paths": ["*"]}]}
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
  - tasks/contracts/20260910-0309-repo-root-normalization.contract.md
  - tasks/reviews/20260910-0309-repo-root-normalization.review.md
  - tasks/notes/20260910-0309-repo-root-normalization.notes.md
  - tasks/evidence/repo-root-normalization-pre-fix.log
  - src/cli/commands/campaign.ts
  - src/cli/commands/refactor.ts
  - src/cli/commands/automation.ts
  - src/effects/repo-registry.ts
  - tests/cli/repo-root-normalization.test.ts
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
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - tests/cli/repo-root-normalization.test.ts
    - tasks/evidence/repo-root-normalization-pre-fix.log
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260910-0309-repo-root-normalization.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/cli/repo-root-normalization.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root cause guard: fails on the unfixed relative root and passes after normalization.",
      "inputs": { "env": [] }
    },
    {
      "id": "campaign-planning",
      "kind": "package_test",
      "path": "tests/effects/campaign-planning.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owns the planning boundary whose authority check consumed the unnormalized root.",
      "inputs": { "env": [] }
    },
    {
      "id": "campaign-acquisition",
      "kind": "package_test",
      "path": "tests/effects/campaign-acquisition.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The other campaign step branch reached by the same changed root binding.",
      "inputs": { "env": [] }
    },
    {
      "id": "campaign-cli",
      "kind": "package_test",
      "path": "tests/cli/campaign-planning.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the campaign CLI surface carrying thirteen of the canonicalized sites.",
      "inputs": { "env": [] }
    },
    {
      "id": "automation-cli",
      "kind": "package_test",
      "path": "tests/cli/automation-controller.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the automation CLI surface carrying five of the canonicalized sites.",
      "inputs": { "env": [] }
    },
    {
      "id": "refactor-cli",
      "kind": "package_test",
      "path": "tests/unit/refactor-shadow-entry.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the refactor CLI surface carrying thirteen of the canonicalized sites.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

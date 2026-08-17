> **Archived**: 2026-08-18 05:11
> **Related Plan**: plans/archive/plan-20260818-0302-unify-ai-memory-layers.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0511

# Task Contract: unify-ai-memory-layers

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0302-unify-ai-memory-layers.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 03:02
> **Review File**: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`
> **Notes File**: `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

This machine ran five parallel AI-memory layers with no shared authority: two host built-ins
(Claude Code project memory, Codex chronicle), two Obsidian vaults in separate iCloud containers,
and the repo-harness brain manifest. The newest layer claimed to be wired into `~/.codex/AGENTS.md`
and to run a weekly maintenance automation; neither existed. Its only two write-backs degraded into
commit-SHA and CI-run-id changelogs that rot on the next commit.

If this ships wrong, the product-side skill starts telling downstream adopters that a missing brain
root is a defect, pushing them to create a vault they never asked for, and hand-written memory lands
on manifest-owned paths where the next `brain sync` silently overwrites it.

## Goal

Collapse the memory layers to three with one authority each: repo-local artifacts are the source of
truth, host auto-memory is a session cache that may not be cited as fact, and a single Obsidian vault
is an optional human-readable projection written only through explicit `obsidian-memory` persist calls.

The product surface (`assets/skills/obsidian-memory/SKILL.md` and its dual-host projection) must hold
for an adopter who has never configured a brain root: that is a supported steady state, not a defect.

## Scope

- In scope: `assets/skills/obsidian-memory/SKILL.md` write gate, vault-optional semantics and
  manifest-path ownership boundary; the matching contract tests; the root `CLAUDE.md` / `AGENTS.md`
  closeout sentence; dual-host projection of the skill.
- Out of scope: hook and workflow-check surfaces (three existing rules forbid them from touching
  vault state, and that stays); `brain sync` / `brain promote` code paths and the 13 manifest
  entries, which are document externalization and only get renamed in prose; host built-in memory
  behavior, which is not ours to change; this operator's personal vault and global config, which are
  machine-local cleanup outside this repo.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if explicit persist calls simply never happen. Cheapest proof point: after a few
weeks, check whether the vault has gained any note written through the skill. Zero writes would mean
"the model will invoke it at closeout" is as unfounded as the protocol this task just replaced, and
the fallback is a stateless closeout advisory that reminds without reading or gating on vault state.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260818-0302-unify-ai-memory-layers.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md`
- Notes file: `tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md`
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
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260818-0302-unify-ai-memory-layers.contract.md
  - tasks/reviews/20260818-0302-unify-ai-memory-layers.review.md
  - tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - assets/skills/obsidian-memory/
  - CLAUDE.md
  - AGENTS.md
  - tasks/lessons.md
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0302-unify-ai-memory-layers.notes.md
  tests_pass:
    - path: tests/skill-surface/obsidian-memory-contract.test.ts
  commands_succeed:
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
```

## Verification Environment Note

`bash scripts/check-architecture-sync.sh` is deliberately NOT in `commands_succeed`. The bounded
verifier scrubs every `REPO_HARNESS_*` variable and runs under `bash --noprofile --norc`; archctx 0.4.3
needs Node 24, this machine's PATH resolves node v22.22.0, and the only supplier of Node 24 is the
scrubbed `REPO_HARNESS_NODE_BIN`. The gate therefore reports `state=error` inside the sandbox for every
contract on this machine, independent of the change under review. It is still enforced out-of-band by
the Stop hook drain, and this slice was verified against it directly (`state=ready blocking=0`).

## Acceptance Notes (Human Review)

- Functional behavior: the skill body states the exclusion-first write gate, marks an unconfigured
  brain root as a legitimate steady state, and forbids writing to manifest-declared `brain_path`
  entries. Both host copies are byte-identical to the asset.
- Edge cases: adopter with no brain root (skill reports and stops, does not create one); repo with a
  brain manifest (memory notes go to `notes/` or `decisions/`, never to manifest-owned paths);
  vault unreachable (fail-closed report, no fallback write location).
- Regression risks: the contract test pins Chinese literals from the skill body, so rewording those
  phrases fails the test rather than silently dropping the invariant. That coupling is deliberate.

## Rollback Point

- Commit / checkpoint: branch `codex/unify-ai-memory-layers` off `35fb6f6d`.
- Revert strategy: all repo changes are text; `git revert` the branch. Machine-local vault changes
  are archived in `_ops/archive/ai-memory-pre-merge-20260818.tgz` and
  `_ops/archive/brain-stale-subvaults-20260818.tgz`.

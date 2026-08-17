# Task Contract: worktree-backlog-notice

> **Status**: Active
> **Plan**: plans/plan-20260818-0526-worktree-backlog-notice.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 05:26
> **Review File**: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`
> **Notes File**: `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Issue #196 reported 100+ accumulated worktree directories. Four merged fixes
made the cleanup path actually work; none of them tell anyone there is something
to clean. The reporter's own framing was that an automatic suggestion asking for
authorization would be the better experience, and that is the part still
unbuilt.

Deletion stays operator-executed. A worktree can hold unpushed work, removal is
irreversible, and a scheduled job cannot judge whether the contents matter. What
is automatable is noticing.

## Goal

SessionStart emits a section naming the contract worktrees that are cleanable
and the command that clears them, stays completely silent when there are none,
and deletes nothing.

## Scope

- In scope: add a `--target <ref>` batch entrypoint to
  `scripts/worktree-merge-lib.sh` behind a `BASH_SOURCE`/`$0` guard, printing
  one `<branch>\t<mode>` line per input branch; add
  `worktreeBacklogSessionSection(repoRoot)` to `src/cli/hook/session-context.ts`
  and register it in `buildSessionStartSections` (`:1391`) after
  `securitySentinelSessionSection`; add tests for the listed, silent, unmerged,
  and over-cap cases.
- Out of scope: any deletion, any prompt that performs deletion, any
  hook-initiated cleanup. The predicate inside `worktree_merge_mode`. Both
  existing consumers (`contract-worktree.sh`, `ship-worktrees.sh`). The
  dirty-worktree guards. Any new CLI command or flag — the section points at
  commands that already exist. Any other hook event.
- Taste constraints: mirror the shape of `minimalChangeSessionSection` and
  `securitySentinelSessionSection` in the same file — takes the repo root,
  returns a section or null. Do not introduce a new section abstraction, a
  config knob, or a caching layer.

## Authority constraint (the point of this slice)

The merge determination has exactly one implementation as of `b456121a`:
`worktree_merge_mode` in `scripts/worktree-merge-lib.sh`. **Do not re-derive it
in TypeScript.** Running `git merge-tree --write-tree` and comparing against
`<target>^{tree}` from `session-context.ts` would recreate the two-authority
defect that fix removed — the same datum decided in two places, drifting the
moment either side changes. That defect is what issue #196 actually was.

Consume the shell authority through the new batch entrypoint. Batch, not
per-branch: one process spawn for the whole scan.

Also rejected, do not implement: parsing
`ship-worktrees --cleanup-merged --dry-run` output. It couples a hook to a
human-readable format with no stability contract, and `run_cmd` echoes rather
than executes under `--dry-run`, so the mode never appears there at all.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if delivering the section would require re-implementing the merge
  determination outside `scripts/worktree-merge-lib.sh`.
- Stop if adding the entrypoint changes what sourcing the lib does. Sourcing
  must stay side-effect free.

## Scan bound

Cap the scan at 24 worktrees. Measured cost is ~22ms per `merge-tree`
invocation, bounding the scan near 0.5s. Above the cap, state the unchecked
count explicitly and point at `ship-worktrees --cleanup-merged --dry-run` for
the full list. Do not truncate silently.

## Falsifier

If the section lists a worktree that `contract-worktree cleanup` would refuse,
the notice is worse than silence: it trains the operator to run a cleanup that
fails, and the habit formed after that is reaching for
`--discard-scaffold-only`. Cheapest proof: build a dirty, genuinely unmerged
contract worktree and assert it is absent from the section.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260818-0526-worktree-backlog-notice.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0526-worktree-backlog-notice.review.md`
- Notes file: `tasks/notes/20260818-0526-worktree-backlog-notice.notes.md`
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
  - tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md
  - tasks/reviews/20260818-0526-worktree-backlog-notice.review.md
  - tasks/notes/20260818-0526-worktree-backlog-notice.notes.md
  - .ai/context/capabilities.json
  - assets/templates/helpers/
  - scripts/
  - src/cli/hook/
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0526-worktree-backlog-notice.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

# Task Contract: hrd-04-session-start-consolidation

> **Status**: Fulfilled
> **Plan**: plans/plan-20260720-0829-hrd-04-session-start-consolidation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-20 08:32
> **HRD-03 Delivered**: PR #97 at `b12c07b2` — mutation-guard cutover precedent (handler port pattern, golden delta discipline, retirement ripple checklist)
> **HRD-04 Execution Base**: `origin/main@ab5f7cade48cd90d4975544fed802fcff1152db3` (post-HRD-03 merge plus backfill; this branch's fork point)
> **Review File**: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`
> **Notes File**: `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

SessionStart still spawns three bash scripts per session
(`session-start-context.sh` 641 lines with 6 git + 4 bun calls,
`minimal-change-context.sh`, `security-sentinel.sh`) even though the TS side
already owns the aggregation, budgeting (1500-token cap, fail-closed
overflow), dedupe, and the single Effective State resolution
(`runtime.ts` `budgetSessionContext` path, HRD-02 collector). The frozen
baseline pins the fan-out at 3 scripts / 23 git + 3 CLI children per
SessionStart. HRD-04 collapses the scripts into the existing TS assembly —
the audit's smallest cutover because the hard parts (budget, dedupe, single
resolution) already live in TS. If it ships wrong, session context content
drifts (orientation quality regresses host-wide) or a second budget pass
sneaks in.

## Goal

`SessionStart.default` is assembled by one in-process context builder: one
context assembly, one budget pass, the 1500-token hard cap and fail-closed
overflow retained, content parity with the current three-script output
modulo documented cost-only deltas, all three scripts deleted in the same
package, and the HRD-01 golden's SessionStart cell regenerated once under
the runtime-shape-only delta policy.

## Scope

- In scope:
  - New in-process builder(s) under `src/cli/hook/` (follow the
    mutation-guard precedent: e.g. `session-context.ts`) porting the
    complete observable output of the three scripts section-by-section:
    `session-start-context.sh` (orientation sections: state summary,
    handoff/resume, sprint/current, workflow guidance — port each emitted
    section's content, ordering, and conditional logic), 
    `minimal-change-context.sh` (16 lines, minimal-change guidance
    injection), `security-sentinel.sh` (115 lines, security findings
    fingerprint section). Consume the HRD-02 collector: exactly one
    Effective State resolution per event (the existing
    `effectiveStateSessionSection` path stays the single resolution);
    repo facts read at most once each via collector getters (extend the
    collector per its documented design where a fact is missing).
  - `src/cli/hook/runtime.ts`: the `SessionStart.default` route's script
    list drops to `[]` (mutation-guard precedent); the section list feeds
    the EXISTING `budgetSessionContext` exactly once — no second budget
    pass, no cap change, no packet content redesign (EPC-08 scope). Host
    output contract (stdout shape per host) byte-stable.
  - `src/cli/hook/route-registry.ts`: `SessionStart.default` scripts `[]`;
    public tuple byte-stable.
  - Script retirement, same package: delete the three scripts from
    `assets/hooks/`, re-sync projection, sweep live references (docs,
    emitters, installer guardPaths/evidence lists, sync-tool checks —
    apply the full HRD-03 ripple checklist proactively this time: grep
    FIRST for every consumer of the three filenames across src/, scripts/,
    tests/, docs/, README*, assets/, and enumerate the ripple in the notes
    BEFORE implementing, so the allowlist is amended once, not four times).
  - Test migration with intent preserved: every test invoking the three
    scripts directly moves to the builder/`runHook()` path with identical
    assertions; content-parity fixtures for each ported section (state,
    handoff, sprint, minimal-change, security) including the
    budget-overflow fail-closed case and dedupe behavior.
  - HRD-01 golden: regenerate ONCE for the `SessionStart.default` cell's
    runtime-shape fields only (scripts_run, child_invocations expected to
    drop sharply from 23 git / 3 cli); stdout (the actual injected
    context) must be byte-identical modulo path/time/PID normalization
    unless a specific cost-only delta is documented per-field. Any other
    cell shifting fails this contract.
  - AMENDMENT (ripple enumeration approved, single round): the eleven
    live consumer groups from the notes' pre-implementation enumeration
    join the named surfaces for retirement-adaptation only:
    `tests/cli/hook.test.ts` (script-loop fixtures retarget to a
    still-scripted route or the builder path, intent preserved),
    `tests/cli/route-registry.test.ts` (SessionStart scripts → `[]`),
    `tests/cli/doctor.test.ts`, `tests/create-project-dirs.runtime.test.ts`,
    `tests/sprint-backlog.test.ts` (direct-spawn vehicle retargets through
    `runHook()`/the builder with identical Active Sprint assertions),
    `tests/readme-dx.test.ts`, the five locale READMEs (`README.md`,
    `README.ja.md`, `README.fr.md`, `README.es.md`, `README.zh-CN.md` —
    the FR file additionally gets the PreToolUse.edit row catch-up that
    HRD-03's sweep missed, recorded as such),
    `docs/reference-configs/hook-operations.md`,
    `docs/reference-configs/minimal-change-hooks.md`,
    `scripts/ensure-task-workflow.sh` + synced
    `assets/templates/helpers/ensure-task-workflow.sh`,
    `scripts/lib/project-init-lib.sh`, and conditionally
    `scripts/create-project-dirs.sh` (only if it hardcodes the three
    filenames; if it is a directory copy, no edit). Test intent everywhere
    preserved; only invocation paths, pinned lists, and doc rows adapt.
- Out of scope:
  - Context Packet content redesign, token-shape changes, p95 targets
    (EPC-08); PostEdit (HRD-05), Stop (HRD-06), circuit/lock (HRD-07),
    telemetry aggregation (HRD-08), adopted migration (HRD-09).
  - Any change to what content a session receives: parity is the
    criterion; the 1500 cap, overflow behavior, dedupe, and section
    ordering are frozen surface.
  - `src/core/loop/loop-event-protocol.ts` wiring; the three legacy status
    lists; every path outside Allowed Paths; compatibility shim or dual
    dispatch.
- Taste constraints: section emitters should be small pure functions over
  collector facts; the builder composes them in the scripts' current
  order. Observable content wins every conflict with elegance.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths (enumerate the full ripple FIRST; one amendment round).
- Stop if any section's content cannot be reproduced in-process
  byte-identically (name the section and the blocking dependency).
- Stop if the golden regeneration shifts any cell other than
  `SessionStart.default`, or shifts that cell's stdout content beyond
  documented cost-only deltas.
- Stop if a second Effective State resolution or second budget pass would
  be needed anywhere.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The consolidation is falsified if the three scripts' output depends on
shell-only environment semantics the TS side cannot observe (e.g. a section
built from transient shell state not derivable from repo facts). Cheapest
proof point: port `minimal-change-context.sh` (16 lines) and
`security-sentinel.sh` first, diff their emitted sections against the bash
output on identical fixtures; if either needs a subprocess to stay
byte-identical, stop before touching the 641-line main script.

## Root Cause Evidence

Not applicable: `code-change` cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-04, LOOP-10)
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (row 4)
- Frozen baseline: `tests/fixtures/loop-runtime/characterization.json` (SessionStart cell one-shot authorized)
- Ported authorities: `assets/hooks/session-start-context.sh`, `assets/hooks/minimal-change-context.sh`, `assets/hooks/security-sentinel.sh`
- Precedent: HRD-03 (`src/cli/hook/mutation-guard.ts`, its ripple checklist and golden discipline)
- Active plan: `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`
- Review file: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`
- Notes file: `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Base/branch/WT: `ab5f7cade48cd90d4975544fed802fcff1152db3` /
  `codex/hrd-04-session-start-consolidation` /
  `/Users/kito/Projects/repo-harness-wt-hrd-04-session-start-consolidation`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.
- CLI note: `bun src/cli/index.ts` / `bun test` only; global binary is the
  packaged copy.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-0829-hrd-04-session-start-consolidation.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md
  - tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md
  - tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md
  - src/cli/hook/session-context.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/route-registry.ts
  - src/effects/loop/state-input-collector.ts
  - assets/hooks/session-start-context.sh
  - assets/hooks/minimal-change-context.sh
  - assets/hooks/security-sentinel.sh
  - .ai/hooks/session-start-context.sh
  - .ai/hooks/minimal-change-context.sh
  - .ai/hooks/security-sentinel.sh
  - assets/hooks/run-hook.sh
  - .ai/hooks/run-hook.sh
  - .ai/hooks/.projection.json
  - assets/hooks/projection.json
  - tests/session-context.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/hook-protocol.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
  - tests/cli/hook.test.ts
  - tests/cli/route-registry.test.ts
  - tests/cli/doctor.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/sprint-backlog.test.ts
  - tests/readme-dx.test.ts
  - README.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - README.zh-CN.md
  - docs/reference-configs/hook-operations.md
  - docs/reference-configs/minimal-change-hooks.md
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/create-project-dirs.sh
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/hook/session-context.ts
  files_not_exist:
    - assets/hooks/session-start-context.sh
    - assets/hooks/minimal-change-context.sh
    - assets/hooks/security-sentinel.sh
    - .ai/hooks/session-start-context.sh
    - .ai/hooks/minimal-change-context.sh
    - .ai/hooks/security-sentinel.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md
  tests_pass:
    - path: tests/session-context.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/hook-runtime.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:state-boundaries
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Golden delta is confined to the SessionStart cell's runtime-shape fields with a per-field before/after record"
    - "Zero live references to the three retired scripts outside historical records"
```

## Acceptance Notes (Human Review)

- Functional behavior: identical session context content per host; only
  process shape changes (no bash, sharply fewer children).
- Edge cases: budget overflow fail-closed, dedupe across sections, empty
  handoff/resume/sprint states, security fingerprint no-change suppression,
  codex vs claude host output shape.
- Regression risks: content drift in any orientation section (host-wide
  quality impact); a hidden second resolution; ripple misses (installer
  evidence lists, emitters, docs) — the proactive enumeration requirement
  targets this.

## Rollback Point

- Commit / checkpoint: branch fork point `ab5f7cade48cd90d4975544fed802fcff1152db3`
- Revert strategy: revert the single PR; the three scripts, route list, golden, and migrated tests restore as one unit.

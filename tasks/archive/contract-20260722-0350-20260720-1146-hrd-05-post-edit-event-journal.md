# Task Contract: hrd-05-post-edit-event-journal

> **Status**: Fulfilled
> **Plan**: plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-20 14:30 (pre-enumeration Allowed Paths amendment, one round)
> **Predecessors**: HRD-03 (#97, mutation-guard pattern), HRD-04 (#98, session-context pattern + single-round ripple discipline)
> **HRD-05 Execution Base**: `origin/main@163488bb869f9cfc210909ac3d986a2bded56ae1` (post-HRD-04; this branch's fork point)
> **Review File**: `tasks/reviews/20260720-1146-hrd-05-post-edit-event-journal.review.md`
> **Notes File**: `tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PostEdit is the write-amplification hot path (audit LOOP-05): every
qualifying edit today can trigger active-contract verification, an
architecture-queue record, context-contract sync, capability-context
requests, a full `.claude/.task-handoff.md` rewrite, and a ~200-line
`workflow_write_handoff` regeneration of `.ai/harness/handoff/current.md` —
multiple durable projections per edit. The sprint's target: at most one
small journal event per edit, zero full recovery projections, maintenance
work deferred to dirty-bit processing at explicit verify, phase transition,
or Stop. If this ships wrong, either crash recovery weakens (the journal
must carry what the per-edit handoff refresh used to guarantee) or the
maintenance signals are silently lost instead of deferred.

## Goal

`PostToolUse.edit` writes at most one small journal event (with dirty bits)
per edit and renders zero recovery projections; contract verification,
architecture queue, context sync, and capability requests become dirty bits
consumed by the surfaces that already run at verify/Stop; repeated
same-path events dedupe within a session; pending journal events survive a
crash and are replayed at the next SessionStart/Stop; both PostEdit scripts
are deleted in the same package; and the HRD-01 golden's PostToolUse.edit
cell is regenerated once under the runtime-shape-plus-write-set delta
policy (this row's write-set change IS the deliverable and must be
documented per-field).

## Scope

- In scope:
  - PRE-ENUMERATION GATE (HRD-04 discipline, mandatory): before any code,
    grep both script names (`post-edit-guard.sh`,
    `minimal-change-observer.sh`) and the surfaces they write
    (`.claude/.task-handoff.md`, `workflow_write_handoff`,
    architecture-queue/context-sync/capability-context invocation sites,
    minimal-change latest) across `src/ scripts/ tests/ docs/ README*
    assets/ .ai/hooks/`; classify every hit live vs historical; hand back
    the enumeration for a single amendment round if anything live sits
    outside Allowed Paths.
  - New in-process handler (e.g. `src/cli/hook/mutation-observed.ts`,
    mutation-guard precedent) replacing both scripts for
    `PostToolUse.edit`: evaluates the same qualifying-path conditions the
    scripts evaluate today, then writes AT MOST ONE journal event —
    append-only, one file per event or a single-writer journal file under
    `.ai/harness/` (design for atomic create; the audit's evidence-store
    guidance prefers per-event files for crash safety) — carrying: event
    id, changed paths, subject revision (from the HRD-02 collector's
    facts), and dirty bits (`contract-verification`, `architecture`,
    `context`, `capability`, `minimal-change`, `checkpoint`) derived from
    exactly the conditions that today trigger each maintenance write.
    Consume the collector; at most one Effective State resolution per
    event and only if the scripts resolve today (check the base scripts —
    post-edit-guard.sh historically did NOT run state resolve; do not add
    one).
  - Hot-path removals, each becoming a dirty bit + deferred consumer:
    per-edit `.claude/.task-handoff.md` rewrite and `workflow_write_handoff`
    (their content is regenerated from live state by the surfaces that
    already write handoff at Stop/transition — verify Stop still refreshes
    handoff so recovery stays whole); per-edit `verify-contract` run
    (becomes the `contract-verification` dirty bit; explicit
    `repo-harness run verify-contract`/verify surfaces consume it);
    per-edit architecture-queue record / context sync / capability request
    (their CLI entry points remain the deferred consumers — wire the
    minimal consumption: Stop's existing orchestration and the explicit
    CLI runs read pending journal events and process dirty bits, marking
    events consumed atomically).
  - Advisory doc-drift echoes the scripts print today (pure stdout
    advisories, no durable writes) port to the handler verbatim — those
    are host-visible output parity surface.
  - Minimal-change observation (`minimal-change-observer.sh`, 18 lines):
    its latest-file write becomes part of the journal event (dirty bit +
    payload), with the existing minimal-change consumers reading through
    a compatibility-free cutover — whatever reads the old latest file
    today must read the journal-derived equivalent in the same package
    (no dual authority).
  - Session-scoped dedupe: repeated events for the same path set within
    one session collapse (the journal event carries a session id from the
    hook env; a same-session same-paths event updates/coalesces rather
    than appending unboundedly).
  - Crash-replay: pending (unconsumed) journal events are surfaced at the
    next SessionStart (orientation line) and consumed at Stop —
    fixture required: kill after journal write, next SessionStart sees the
    pending event, Stop consumes it.
  - Script retirement, same package: both scripts deleted from
    `assets/hooks/` + projection re-sync; route `PostToolUse.edit` scripts
    `[]`; ripple per pre-enumeration.
  - HRD-01 golden: regenerate ONCE for the `PostToolUse.edit` cell —
    runtime-shape fields AND the write_set (this row changes durable
    writes by design: the old projection writes disappear, one journal
    write appears). Per-field before/after in notes and PR body. Decision,
    reason, exit code, stdout/stderr parity except documented advisory
    formatting that is byte-identical today must stay byte-identical.
    Any other cell shifting fails this contract.
  - AMENDMENT (gate round-1, second widening — orchestrator decision):
    `.ai/harness/journal/` joins the ignored-runtime-evidence surface. The
    managed gitignore block gains the entry in `src/core/adoption/gitignore-plan.ts`,
    the repo `.gitignore`, and the init seed in `scripts/lib/project-init-lib.sh`
    (plus the direct test pinning the managed block — name it in notes).
    Retention decision: the journal is a transit queue, not an evidence
    ledger (that is EPC scope) — events are DELETED on consumption (no
    consumed/ retention); corrupt pending files are removed at Stop with a
    stderr warning line. The crash-replay SessionStart section becomes
    `actionable: true` with a production-path fixture through `runHook()`.
    The two near-dead checkpoint-block behaviors (per-edit todo sync;
    Backlog-no-plan task-state cleanup) are accepted drops, documented in
    notes deviations. The explicit-verify consumer narrowing (Stop-only
    wiring) is recorded and deferred to HRD-06.
- Out of scope:
  - Stop handler port (HRD-06) — Stop's existing shell orchestration keeps
    running; this row only makes it (and explicit verify) consume the
    journal, minimally and without porting Stop to TS.
  - Canonical checkpoint artifact, Evidence Ledger schema, checks
    materializer (EPC); circuit/lock (HRD-07); telemetry aggregation
    (HRD-08); adopted migration (HRD-09).
  - Any weakening of recovery: if a deferred write is load-bearing for
    crash recovery beyond what the journal + Stop refresh covers, STOP and
    report rather than dropping it.
  - `src/core/loop/loop-event-protocol.ts` wiring; every path outside
    Allowed Paths; compatibility shim, dual authority, or a feature flag
    keeping the scripts alive.
- Taste constraints: the journal event schema is explicit typed data
  (audit LOOP-05's `change_observed` shape is the reference); dirty-bit
  derivation must cite the base-script condition it ports, condition by
  condition, in the notes.

## Stop Conditions

- Stop and hand back if anything live sits outside Allowed Paths
  (pre-enumeration, one amendment round).
- Stop if any deferred write turns out to be load-bearing for recovery
  in a way the journal + Stop refresh cannot cover — name it.
- Stop if the golden regeneration shifts any cell other than
  `PostToolUse.edit`, or shifts that cell's decision/reason/exit_code.
- Stop if minimal-change consumers cannot cut over to the journal-derived
  read in the same package without dual authority.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The dirty-bit deferral is falsified if some consumer requires the
maintenance write to exist BEFORE the next explicit verify/Stop (i.e. a
mid-session reader of handoff/current or the minimal-change latest that
breaks when the write is deferred). Cheapest proof point: before building
the journal, grep every reader of `.claude/.task-handoff.md`,
`.ai/harness/handoff/current.md` (mid-session readers only — Stop-time
readers are fine), and the minimal-change latest file; if a mid-session
reader depends on per-edit freshness, STOP and report it — the deferral
design, not the code, needs the decision.

## Root Cause Evidence

Not applicable: `code-change` cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-05)
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (row 5)
- Frozen baseline: `tests/fixtures/loop-runtime/characterization.json` (PostToolUse.edit cell one-shot authorized incl. write_set)
- Ported authorities: `assets/hooks/post-edit-guard.sh`, `assets/hooks/minimal-change-observer.sh` (base SHA state)
- Precedents: HRD-03 mutation-guard, HRD-04 session-context + single-round ripple
- Active plan: `plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md`
- Review file: `tasks/reviews/20260720-1146-hrd-05-post-edit-event-journal.review.md`
- Notes file: `tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Base/branch/WT: `163488bb869f9cfc210909ac3d986a2bded56ae1` /
  `codex/hrd-05-post-edit-event-journal` /
  `/Users/kito/Projects/repo-harness-wt-hrd-05-post-edit-event-journal`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.
- CLI note: `bun src/cli/index.ts` / `bun test` only.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-1146-hrd-05-post-edit-event-journal.contract.md
  - tasks/reviews/20260720-1146-hrd-05-post-edit-event-journal.review.md
  - tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md
  - src/cli/hook/mutation-observed.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/route-registry.ts
  - src/effects/loop/state-input-collector.ts
  - assets/hooks/post-edit-guard.sh
  - assets/hooks/minimal-change-observer.sh
  - .ai/hooks/post-edit-guard.sh
  - .ai/hooks/minimal-change-observer.sh
  - assets/hooks/run-hook.sh
  - .ai/hooks/run-hook.sh
  - .ai/hooks/.projection.json
  - assets/hooks/projection.json
  - tests/mutation-observed.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/hook-protocol.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
  # --- AMENDMENT (pre-enumeration ripple, one round; see notes file
  #     "Pre-Enumeration + Amendment" section for evidence per item) ---
  - tests/cli/hook.test.ts
  - tests/cli/route-registry.test.ts
  - tests/hook-dedup.test.ts
  - tests/readme-dx.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - README.md
  # --- AMENDMENT (gate round-1 second widening: journal gitignore surface) ---
  - .gitignore
  - src/core/adoption/gitignore-plan.ts
  - scripts/lib/project-init-lib.sh
  - tests/adopt-dry-run.test.ts
  - tests/bootstrap-files.test.ts
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
    - src/cli/hook/mutation-observed.ts
  files_not_exist:
    - assets/hooks/post-edit-guard.sh
    - assets/hooks/minimal-change-observer.sh
    - .ai/hooks/post-edit-guard.sh
    - .ai/hooks/minimal-change-observer.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md
  tests_pass:
    - path: tests/mutation-observed.test.ts
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
    - "Golden delta is confined to the PostToolUse.edit cell with the write-set change documented per-field"
    - "Zero live references to the two retired scripts outside historical records"
    - "No mid-session reader depends on the deferred per-edit writes (falsifier grep recorded)"
```

## Acceptance Notes (Human Review)

- Functional behavior: qualifying edits produce one journal event; no
  recovery projection is rendered on the hot path; deferred consumers
  process dirty bits at verify/Stop; advisory stdout parity.
- Edge cases: crash between edit and Stop (replay fixture); repeated
  same-path edits (dedupe); non-qualifying paths (no event at all);
  minimal-change consumers reading journal-derived data.
- Regression risks: recovery weakening if Stop's refresh doesn't cover
  what per-edit writes guaranteed (the falsifier targets this);
  unbounded journal growth (dedupe + Stop consumption must bound it);
  dual authority if any old latest-file reader survives uncut.

## Rollback Point

- Commit / checkpoint: branch fork point `163488bb869f9cfc210909ac3d986a2bded56ae1`
- Revert strategy: revert the single PR; scripts, route list, golden, journal machinery, and consumer cutover restore as one unit.

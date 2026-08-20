# Plan: Coordination Wait Metrics: instrument backlog-lock wait and merge wait

> **Status**: Archived
> **Created**: 20260820-2049
> **Slug**: coordination-wait-metrics
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Ledger-record assertions per emission point plus zero-behavior-change full suite
> **Rollback Surface**: Single revert removes emission brackets; ledger file is gitignored runtime evidence
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md`
> **Task Review**: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`
> **Implementation Notes**: `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-2049-coordination-wait-metrics.md`
- Sprint contract: `tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md`
- Sprint review: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`
- Implementation notes: `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-2049-coordination-wait-metrics.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-2049-coordination-wait-metrics.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md`
- Review file: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`
- Implementation notes file: `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-2049-coordination-wait-metrics.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert removes emission brackets; ledger file is gitignored runtime evidence
- **Verification boundary**: Ledger-record assertions per emission point plus zero-behavior-change full suite
- **Review/acceptance boundary**: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-2049-coordination-wait-metrics.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md`, `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`, and `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert removes emission brackets; ledger file is gitignored runtime evidence

## Captured Planning Output

# Coordination Wait Metrics: instrument backlog-lock wait and merge wait

## Goal

Typed, append-only wait metrics exist for the two coordination points that today have zero timing: `acquire_backlog_lock()` emits a `backlog_lock_wait` record per acquisition attempt cycle, and `finish_worktree()` emits a `finish_attempt` record per finish attempt (merged / refused-stale-fork / aborted), both into `.ai/harness/runs/coordination/waits.jsonl`. The sprint-split decision (tasks/todos.md row "Instrument backlog-lock wait, merge wait, and verification duration") becomes answerable from numbers instead of anecdote.

## Why

Opened on the row's "observed contention in real multi-agent use" trigger arm: shipping `native-subagent-boundary-dedup` (2026-08-20) hit three mid-ship `main` advances and four gate rounds at ~13 minutes of re-freeze each — real, unmeasured serialization cost. Explorer verification (this session) confirmed: `scripts/sprint-backlog.sh` has no timing anywhere (mkdir-spin lock at `:178-209`, 0.1s × 100 attempts default); `scripts/contract-worktree.sh` stamps `started_at` twice but pairs no completion or duration (`:920`, `:932`); verification duration is ALREADY structurally recorded (`scripts/verify-contract.sh:588` `total_duration_ms`, `:597` per-check `duration_ms`, embedded into every `.ai/harness/runs/run-*-<contract>.json` via `scripts/verify-sprint.sh:1220,1333`) — that leg needs no new emission.

## Frozen decisions

1. **Sink**: `.ai/harness/runs/coordination/waits.jsonl`, following the existing subdirectory-ledger convention (`runs/continuation/attempts.jsonl` precedent). Shell append idiom per `scripts/workstream-sync.sh:304-305`: local `json_escape()` + `printf '%s\n' >> file`; single-line appends, no lock file (matches the existing shell JSONL precedent; note the tradeoff in the record's comment).
2. **`backlog_lock_wait` record** (emitted in `acquire_backlog_lock()` around the `until mkdir` loop, `scripts/sprint-backlog.sh:193-207`): `{"protocol":1,"kind":"backlog_lock_wait","at":"<ISO>","verb":"<start-task|complete-task>","ms":<int>,"attempts":<int>,"reclaimed_stale":<bool>,"outcome":"acquired|timeout"}`. Emit on every acquisition including uncontended (ms≈0) — the baseline distribution is the point. On timeout, emit before the existing `exit 1`.
3. **`finish_attempt` record** (emitted in `finish_worktree()`, `scripts/contract-worktree.sh:1634-2031`): `{"protocol":1,"kind":"finish_attempt","at":"<ISO>","slug":"<worktree slug>","ms":<int from finish entry>,"outcome":"merged|refused_stale_fork|aborted","frozen_base":"<sha>","publication":"<sha|null>"}`. Emission points: both stale-fork refusals (`:1769-1774`, `:1952-1958`), the success line (`:2012`), and the `finish_transaction_abort` path. Wall-clock via epoch-ms bracket from function entry.
4. **No reader/aggregator command in this slice** — the row asks for instrumentation before the decision; reading is `jq` at decision time. A report command is an unrequested extra until the split decision is actually being made.
5. **No verification-duration emission** — already covered structurally (see Why); duplicating it into the new ledger would create a second representation of the same datum without a drift check.
6. **Mirrors**: both script twins under `assets/templates/helpers/` synced via `bun scripts/sync-helper-sources.ts --write`; parity stays guarded by `tests/helper-scripts.test.ts:700-710`.
7. **Ledger row update**: rewrite the row 38 entry in `tasks/todos.md` — instrumentation landed, split decision still deferred, revisit trigger becomes "read `.ai/harness/runs/coordination/waits.jsonl` after sustained multi-agent use shows lock waits or repeated refused finishes worth acting on".
8. **Env knobs**: none added. Existing `REPO_HARNESS_BACKLOG_LOCK_ATTEMPTS`/`_SLEEP_SECONDS` stay untouched.

## Out of scope

- Sprint-file split itself, sprint row schema (todos rows 36/38 decision half), board conflict projection.
- Any change to lock mechanics, timeouts, or finish gate semantics — measurement only, zero behavior change on every existing path.
- Reader/report tooling; hook-events or trace-observer surfaces; TS attempt-ledger reuse (shell scripts stay shell, per the workstream-sync idiom).

## Task Breakdown

- [x] `scripts/sprint-backlog.sh`: epoch-ms bracket + `json_escape` + append in `acquire_backlog_lock()`; thread the calling verb; timeout-path emission before `exit 1`.
- [x] `scripts/contract-worktree.sh`: finish-entry timestamp; emission at both refusal sites, the abort path, and the post-merge success point.
- [x] Sync both `assets/templates/helpers/` twins via `bun scripts/sync-helper-sources.ts --write`; verify with the existing parity test.
- [x] Tests: extend `tests/sprint-backlog.test.ts` (after a `start-task` run, `waits.jsonl` contains one `backlog_lock_wait` record with `outcome:"acquired"` and integer `ms`/`attempts` — `existsSync`/`readFileSync` idiom per `tests/contract-run.test.ts:313-316`); extend one existing finish-driving test (e.g. `tests/contract-worktree-single-publication.test.ts`) to assert a `finish_attempt` record with `outcome:"merged"`; add a refusal-path assertion where a stale-fork fixture already exists, else cover refusal via the same test file with a fixture advance of the target branch.
- [x] `tasks/todos.md`: rewrite the instrumentation row per frozen decision 7.
- [x] Verify: `bun run check:type`, `bun test --timeout 60000`, `bun src/cli/index.ts init --repo . --dry-run`, `repo-harness run check-task-workflow --strict`.

## Exit Criteria

1. A `start-task` invocation on a fixture repo produces exactly one `backlog_lock_wait` record; a driven finish produces exactly one `finish_attempt` record with the correct outcome; a driven stale-fork refusal produces `outcome:"refused_stale_fork"`.
2. Zero behavior change: all existing tests pass unmodified except the ones extended with ledger assertions.
3. Helper parity green (`sync-helper-sources --check` via `tests/helper-scripts.test.ts`).
4. Full required checks green.

## Allowed Paths

- `scripts/sprint-backlog.sh`, `scripts/contract-worktree.sh`
- `assets/templates/helpers/sprint-backlog.sh`, `assets/templates/helpers/contract-worktree.sh`
- `tests/`
- `tasks/todos.md`, `plans/`, and this contract's contract/review/notes files

## Provenance

Opened from tasks/todos.md row 38's observed-contention trigger arm, grounded by a read-only explorer pass (file:line evidence above) and the 2026-08-20 ship serialization data (`tasks/lessons.md` entry, four gate rounds). Related research: `docs/researches/20260820-model-infra-harness-boundary.md`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `scripts/sprint-backlog.sh`: epoch-ms bracket + `json_escape` + append in `acquire_backlog_lock()`; thread the calling verb; timeout-path emission before `exit 1`.
- [x] `scripts/contract-worktree.sh`: finish-entry timestamp; emission at both refusal sites, the abort path, and the post-merge success point.
- [x] Sync both `assets/templates/helpers/` twins via `bun scripts/sync-helper-sources.ts --write`; verify with the existing parity test.
- [x] Tests: extend `tests/sprint-backlog.test.ts` (after a `start-task` run, `waits.jsonl` contains one `backlog_lock_wait` record with `outcome:"acquired"` and integer `ms`/`attempts` — `existsSync`/`readFileSync` idiom per `tests/contract-run.test.ts:313-316`); extend one existing finish-driving test (e.g. `tests/contract-worktree-single-publication.test.ts`) to assert a `finish_attempt` record with `outcome:"merged"`; add a refusal-path assertion where a stale-fork fixture already exists, else cover refusal via the same test file with a fixture advance of the target branch.
- [x] `tasks/todos.md`: rewrite the instrumentation row per frozen decision 7.
- [x] Verify: `bun run check:type`, `bun test --timeout 60000`, `bun src/cli/index.ts init --repo . --dry-run`, `repo-harness run check-task-workflow --strict`.

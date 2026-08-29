# Plan: Fail-closed exit-criteria parser and now_ms hardening

> **Status**: Archived
> **Created**: 20260829-0208
> **Slug**: verify-contract-fail-closed
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Malformed exit_criteria/criterion_reuse rejected with missing_artifact; polluted now_ms no longer fatal; helper mirrors byte-identical and parity-tested; full bun test green
> **Rollback Surface**: Single revertable commit touching three helper scripts, their mirrors, and two test files
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md`
> **Task Review**: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`
> **Implementation Notes**: `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`

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

- Active plan: `plans/plan-20260829-0208-verify-contract-fail-closed.md`
- Sprint contract: `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md`
- Sprint review: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`
- Implementation notes: `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260829-0208-verify-contract-fail-closed.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260829-0208-verify-contract-fail-closed.md`.

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
- Contract file: `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md`
- Review file: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`
- Implementation notes file: `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260829-0208-verify-contract-fail-closed.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit touching three helper scripts, their mirrors, and two test files
- **Verification boundary**: Malformed exit_criteria/criterion_reuse rejected with missing_artifact; polluted now_ms no longer fatal; helper mirrors byte-identical and parity-tested; full bun test green
- **Review/acceptance boundary**: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260829-0208-verify-contract-fail-closed.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md`, `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`, and `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit touching three helper scripts, their mirrors, and two test files

## Captured Planning Output

# Goal

Make the exit-criteria YAML parsing in `verify-contract.sh` fail-closed so a malformed or misindented `exit_criteria` / `criterion_reuse` block is rejected with a clear error instead of silently mutating the executed criteria set, and harden the shared `$(( $(now_ms) - started_ms ))` idiom in the three helper scripts so polluted `now_ms` stdout can no longer shell-fatal a script after side effects have landed. Closes deferred ledger rows "#45 now_ms defensive delta" and "#48 exit-criteria parser fail-closed" in `tasks/todos.md`.

## Context (P1/P2 evidence, explorer pass 2026-08-29)

- Main dispatcher `scripts/verify-contract.sh:1100-1232` recognizes exactly 9 section keys; an unrecognized header-shaped line (e.g. indented `criterion_reuse:`) is a silent no-op that leaves `$section` unchanged. The nested `commands_succeed:`/`tests_pass:` sub-headers under a misindented `criterion_reuse:` then re-trigger the top-level dispatch, so reuse-only items are appended into the executed `commands_succeed`/`tests_pass` arrays (double execution) while the reuse arrays stay empty. The existing `criterion_declared()` guard (1269-1281) is trivially satisfied by the misparse and cannot catch it.
- Reuse parser `scripts/verify-contract.sh:1234-1267` matches `criterion_reuse:` only at column 0, sub-keys at exactly 2-space indent, items at 4-space indent; any deviation silently disables reuse.
- No parse-level `fail()` exists; `failure_class="missing_artifact"` (`:1060`) fires only when no YAML block is found at all.
- `assets/templates/helpers/verify-contract.sh` is byte-identical today, but the byte-parity test `tests/sprint-claim-concurrency.test.ts:1315-1320` covers only `sprint-backlog.sh` and `contract-worktree.sh` — `verify-contract.sh` parity is accidental and unenforced.
- `now_ms` sites (defs + arithmetic): `scripts/sprint-backlog.sh:176-184` / `:225`; `scripts/contract-worktree.sh:94-102` / `:144`; `scripts/verify-contract.sh:17-25` / `:902`. Mirrored byte-identical in `assets/templates/helpers/`. Complete set confirmed by repo-wide grep.
- Under `set -euo pipefail`, a non-empty non-numeric `now_ms` output raises a fatal unbound-variable/arithmetic error at expansion time that a trailing `|| true` on the enclosing command cannot catch (verified experimentally). Worst site: `emit_finish_attempt merged` at `scripts/contract-worktree.sh:2169` runs after `finish_transaction_commit` (`:2167`, publication durable, abort trap disarmed) and before cleanup (`:2181-2188`) — a crash there orphans the worktree/branch with no rollback path.
- `tests/workflow-contract.test.ts` pins no literal strings from these scripts (grep-verified). Existing `criterion_reuse` fixtures in `tests/helper-scripts.test.ts` (`:3441`, `:3643`, `:3820`, `:4485`, `:4552`) all use the correct column-0 shape and must keep passing.

## Frozen decisions (P3)

1. **Fail-closed rule A1 (unknown section header)**: inside the `exit_criteria:` block, any valueless header-shaped line (`^[A-Za-z_][A-Za-z0-9_]*:$` after trim) that is not one of the 9 recognized section keys is a hard parse failure. Item-level keys with values (`path:`, `pattern:`, `dimension:`, `min:`) are unaffected.
2. **Fail-closed rule A2 (misindented criterion_reuse)**: a `criterion_reuse:` line at non-zero indentation anywhere in the YAML block is a hard parse failure with a message naming the required column-0 shape.
3. **Failure classification**: parse rejection reports `failure_class="missing_artifact"` (the existing "artifact unparseable" class per `tasks/todos.md` row #24) with a per-line error message naming the offending line and the accepted keys. No new `failure_class` value — the checks_failed split stays deferred in row #24.
4. **Parity is enforced, not accidental**: identical edits land in `scripts/` and `assets/templates/helpers/` for all three scripts, and `verify-contract.sh` is added to the byte-parity file list in `tests/sprint-claim-concurrency.test.ts`.
5. **now_ms hardening shape (B)**: at each emission site, capture `now_ms` output into a variable and validate `^[0-9]+$` before any arithmetic. On invalid output: `sprint-backlog.sh` and `contract-worktree.sh` skip the telemetry emission entirely (telemetry is best-effort; control flow continues); `verify-contract.sh` writes its report with `total_duration_ms` as `null` and continues. Never fatal. No fallback timestamp source is synthesized (no-fallback rule); also validate the earlier captured `started_ms` before use.
6. **No scope creep**: no changes to the finish/publication sequence, no parser rewrite in another language, no schema for exit_criteria beyond the two rejection rules, no touch of `stop-handler.ts` or `failure_class` routing.

## Scope

- `scripts/verify-contract.sh` + `assets/templates/helpers/verify-contract.sh`: rules A1/A2, parse-failure reporting, `now_ms` guard at `write_report`.
- `scripts/sprint-backlog.sh` + helper mirror: `now_ms` guard in `emit_backlog_lock_wait`.
- `scripts/contract-worktree.sh` + helper mirror: `now_ms` guard in `emit_finish_attempt`.
- `tests/sprint-claim-concurrency.test.ts`: add `verify-contract.sh` to the byte-parity list.
- `tests/helper-scripts.test.ts`: new regression tests — (a) indented `criterion_reuse:` fails closed and the reuse-only command is not executed; (b) unknown/typo section key fails closed; (c) correct column-0 `criterion_reuse` fixtures still pass and reuse still works; (d) polluted `now_ms` (PATH-shimmed node printing a bare word) no longer aborts the enclosing script at a real call site and the emission is skipped/nulled.
- `tasks/todos.md`: remove rows #45 and #48 at closeout.

Out of scope: `checks_failed` blocker split (row #24), Stop cascade cap (row #46), any `src/` change.

## Oracles

- `bun test tests/helper-scripts.test.ts --timeout 60000`
- `bun test tests/sprint-claim-concurrency.test.ts --timeout 60000`
- `bun test tests/contract-worktree-single-publication.test.ts tests/sprint-backlog.test.ts --timeout 60000`
- `diff scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh && diff scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh && diff scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh` (all exit 0)
- `bun test --timeout 60000` (full suite at the gate)

## Task Breakdown

- [ ] Implement fail-closed rules A1/A2 in `scripts/verify-contract.sh` with `failure_class="missing_artifact"` parse rejection, mirror to `assets/templates/helpers/verify-contract.sh`.
- [ ] Add regression tests for misindented `criterion_reuse`, unknown section key, and preserved happy-path reuse in `tests/helper-scripts.test.ts`.
- [ ] Guard the three `now_ms` arithmetic sites (skip/null on non-numeric output) in `scripts/` and mirror to `assets/templates/helpers/`.
- [ ] Add polluted-`now_ms` regression coverage and extend the byte-parity test list with `verify-contract.sh`.
- [ ] Run oracles, close ledger rows #45/#48 in `tasks/todos.md`, complete contract closeout.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Implement fail-closed rules A1/A2 in `scripts/verify-contract.sh` with `failure_class="missing_artifact"` parse rejection, mirror to `assets/templates/helpers/verify-contract.sh`.
- [ ] Add regression tests for misindented `criterion_reuse`, unknown section key, and preserved happy-path reuse in `tests/helper-scripts.test.ts`.
- [ ] Guard the three `now_ms` arithmetic sites (skip/null on non-numeric output) in `scripts/` and mirror to `assets/templates/helpers/`.
- [ ] Add polluted-`now_ms` regression coverage and extend the byte-parity test list with `verify-contract.sh`.
- [ ] Run oracles, close ledger rows #45/#48 in `tasks/todos.md`, complete contract closeout.

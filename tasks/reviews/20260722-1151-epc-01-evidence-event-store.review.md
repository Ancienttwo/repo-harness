# Task Review: epc-01-evidence-event-store

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1151-epc-01-evidence-event-store.md
> **Contract**: tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md
> **Notes File**: tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 16:35
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/core/evidence/` (8 pure modules), new `src/effects/evidence/` (6 IO modules), three new `tests/evidence-*.test.ts` suites, one `.gitignore` line, package plan/contract/review/notes, `tasks/todos.md` projection line
- Actual files changed: exactly that set — 23 paths, single commit `5c5cab0f` on base `5228d4ea`; only pre-existing files modified are `.gitignore` (+1 line) and `tasks/todos.md` (projection); zero existing `src/`/`scripts/` modules modified; zero imports of the new modules from existing code (no consumer cutover)
- Commands passed: `bun test tests/evidence-*.test.ts` (31 pass / 0 fail / 136 expects, red-first), full `bun test` (1711 pass / 1 skip / 0 fail — run by worker twice and re-run by gatekeeper), `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, `check-deploy-sql-order` OK, `check-architecture-sync` advisory blocking=0, `check-task-sync` OK, `inspect-project-state` no drift, `adopt --dry-run` 0 operations, `bun run check:type` clean
- Residual risks: high-entropy redaction pattern `[A-Za-z0-9+/_-]{32,}` over-redacts long dot-free paths and 64-hex digests inside payload strings (fail-safe direction; EPC-02+ producers embedding long paths/hashes inline must account for it); inline cap uses `>=` so exactly-200-line / exactly-8192-byte payloads offload (one unit stricter than the frozen wording, safe direction); D5 supersession acyclicity is a stated property not yet enforced by the fold (nothing can violate it while zero producers exist — revisit in EPC-02..04 if a producer emits supersedes)
- Reviewer action required: none further — gatekeeper acceptance review (fresh context, read-only) verdict PASS
- Rollback: revert the single PR; all changes are new files plus one `.gitignore` line; no existing runtime surface modified

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority is the sprint's `### Frozen decisions (EPC-00, 2026-07-22)` D1–D6 — implementation audited against their letter by gatekeeper
- Root cause or plan evidence: not a bugfix; first implementation package of the frozen EPC design

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (fresh context, read-only) — verdict PASS
- Commands run: see Human Review Card; executed in the contract worktree at `5c5cab0f`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; red-first evidence (three suites written and failing with module-not-found before implementation existed)
- Implementation notes reviewed: yes — vendored ULID split, single-pass span-merge redaction, path-field convention, quarantine-vs-throw boundary, local `writeFileDurably` equivalent, declined lock reuse
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] PR diff confined to allowed_paths; no existing src/ file modified
  - Evidence: `git diff --name-status 5228d4ea..HEAD` lists 23 paths, all within the contract's `allowed_paths`; the only modified pre-existing files are `.gitignore` (one added line `.ai/harness/evidence/`) and `tasks/todos.md` (projection line); gatekeeper grep of `src/` + `scripts/` for imports of `core/evidence` / `effects/evidence` outside the new modules returned zero hits.
- [x] Genesis record precondition enforced fail-closed
  - Evidence: `appendEvidenceEvent` throws when the store lacks a genesis record (`src/effects/evidence/event-log.ts:85-87`); genesis is idempotent for a matching epoch and fails closed on epoch mismatch or a non-genesis first record; covered by the genesis-before-append tests in `tests/evidence-event-store.test.ts` (red-first, now green).
- [x] tasks/current.md untouched
  - Evidence: `git diff 5228d4ea..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- Purely additive: a new evidence ledger substrate (`EvidenceEvent` schema, append-only per-worktree store with genesis/epoch enforcement, content-addressed write-once blob store, deterministic fold with corrupt-tail quarantine). No producer, consumer, or gate reads it yet; runtime behavior of every existing surface is unchanged.

## Residual Risks / Follow-ups

- Over-eager entropy redaction and `>=` cap boundary: carried into EPC-02+ producer design notes (non-blocking, fail-safe direction).
- Supersession acyclicity enforcement: revisit when the first producer emits `supersedes` (EPC-02..04).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All D1–D6 invariants implemented and tested; 31 red-first tests green |
| Product depth | 9/10 | Fail-closed semantics throughout; no bypass path for hand-built records |
| Design quality | 9/10 | Pure/IO split along existing core/effects boundary; no new dependency |
| Code quality | 9/10 | Full suite green; type-check clean; construction-invariant safety |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-event-store.test.ts tests/evidence-blob-store.test.ts tests/evidence-replay-recovery.test.ts`; `repo-harness run check-task-workflow --strict`
- Re-check: grep `src/`+`scripts/` for imports of the new modules (must remain zero until EPC-02)

## Summary

- EPC-01 delivers the EvidenceEvent protocol and atomic append-only per-worktree event store exactly per the frozen D1–D6 decisions: schema with full subject identity and trust classes, genesis/epoch fail-closed enforcement, deterministic replay, corrupt-tail quarantine, and a construction-invariant blob/safety layer — all as new files with zero consumer cutover. Gatekeeper verdict: PASS. Ready to ship as one PR.

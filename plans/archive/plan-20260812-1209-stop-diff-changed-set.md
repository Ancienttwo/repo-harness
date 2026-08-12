# Plan: Stop-time git diff as architecture changed-set authority

> **Status**: Archived
> **Created**: 20260812-1209
> **Slug**: stop-diff-changed-set
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: codex worktree shell-write scenario + full required checks
> **Rollback Surface**: single revertable branch; cursor file is disposable runtime state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md`
> **Task Review**: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`
> **Implementation Notes**: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`

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

- Active plan: `plans/plan-20260812-1209-stop-diff-changed-set.md`
- Sprint contract: `tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md`
- Sprint review: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`
- Implementation notes: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260812-1209-stop-diff-changed-set.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260812-1209-stop-diff-changed-set.md`.

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
- Contract file: `tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md`
- Review file: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`
- Implementation notes file: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260812-1209-stop-diff-changed-set.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single revertable branch; cursor file is disposable runtime state
- **Verification boundary**: codex worktree shell-write scenario + full required checks
- **Review/acceptance boundary**: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260812-1209-stop-diff-changed-set.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md`, `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md`, and `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260812-1209-stop-diff-changed-set.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single revertable branch; cursor file is disposable runtime state

## Captured Planning Output

# Stop-time git diff as the architecture changed-set authority

## Goal

Make the architecture drift pipeline observe every file mutation in a session — Claude Edit/Write, Codex apply_patch, and any shell/script write on either host — by making a Stop-time git-derived changed set the single authority feeding the architecture cascade and the archctx projection lane. Retire the post-edit journal's `architecture` dirty bit in the same work-package.

## Success Criteria

1. In a codex-host worktree session that mutates files exclusively via shell (the byok-sdk fleet pattern), Stop produces a changed set containing every mutated path, and `architecture-queue record` runs for each path (projection-disabled repos) or the projection drain receives them (projection-enabled repos).
2. Multi-file apply_patch edits are covered by the same mechanism — every file, not just the first.
3. Claude-host behavior regresses nowhere: existing Edit/Write journal tests for contract-verification, minimal-change, and checkpoint bits stay green; architecture cards produced for Claude edits are equivalent to today's (same cascade command per path).
4. Repeated Stops with unchanged repo state do not reprocess the same commit range (cursor + deterministic job identity → receipt → idle).
5. `bun test` and all Required Checks in CLAUDE.md pass.

## Context (verified diagnosis, 2026-08-12)

Corrected root-cause chain (supersedes the byok-sdk handoff's first cause):

- Codex 0.147.0 apply_patch events DO reach the PostToolUse/edit route (matcher not blind): daily counts of `apply_patch` in `.claude/.trace.jsonl` match `codex/PostToolUse/edit` in hook-events telemetry exactly (62/62, 34/34, 148/148 across two repos).
- Live kill point 1 (primary, matches the reported symptom): worktree Codex fleet sessions write files exclusively via shell (broker worktree: 197 Bash events, 0 apply_patch). `command-observed` never writes the post-edit journal, so architecture drift records nothing. No per-tool normalization can fix this leg.
- Live kill point 2: apply_patch events reaching `runMutationObserved` extract no path (`getFilePath` is single-path-key; `src/cli/hook/mutation-observed.ts:86` silent return). All 148 codex edit events show `metrics.event_writes=0`.
- Stop and SessionStart fire in codex worktree fleet sessions (verified: broker worktree 2× Stop, 3× SessionStart).

## P1: Architecture Map

- `src/cli/hook/route-registry.ts` — ROUTES: PostToolUse/edit → `mutation-observed`, PostToolUse/bash → `command-observed`, Stop/default → `stop`.
- `src/cli/hook/mutation-observed.ts` — writes post-edit journal events with dirty bits {architecture, contract-verification, minimal-change, checkpoint, context, capability}; `consumePendingPostEditEvents` processes them at Stop.
- `src/cli/hook/stop-handler.ts:439-467` — reads pending journal events, feeds them as `sourceEvents` to `drainArchitectureProjectionJobs`, then consumes journal (architecture cascade when projection disabled).
- `src/effects/architecture/projection-orchestrator.ts` — drain input is already the abstract shape `ArchitectureProjectionSourceEvent {source_key, event_id, changed_paths}`; job identity is deterministic over (event ids, eligible paths).
- `src/cli/commands/architecture-projection.ts` — manual `drain` command builds sourceEvents from the same journal; must cut over to the same new authority.
- `.ai/harness/state/` — established single-slot JSON state surface (`session-run-identity.json` precedent), gitignored.

## P2: Concrete Trace (current failure path)

Codex fleet worker in a worktree runs `bash`-mediated writes → PostToolUse/bash → `runCommandObserved` writes post-bash checks + evidence ledger only → no journal event exists → Stop's `readPendingPostEditEvents` returns [] → projection drain gets no sourceEvents and legacy cascade iterates nothing → `docs/architecture/requests/*` never updated. Same session's Stop DOES fire (verified), so a Stop-time git-derived changed set would have seen every mutation.

## P3: Decision

**Chosen: Stop-time git diff as single changed-set authority (Plan B), implemented as a repo-level drift cursor.**

- New module `src/cli/hook/architecture-drift.ts` (name final at implementation, single owner):
  - Cursor state: `.ai/harness/state/architecture-drift-cursor.json` `{version, head_sha, updated_at}` — single-slot, gitignored runtime state.
  - Changed set at Stop = `git diff --name-only --no-renames <cursor> HEAD` ∪ parsed `git status --porcelain` (staged, unstaged, untracked; rename rows contribute both sides). Paths deduped, repo-relative, filtered through the existing canonicalization used by mutation-observed.
  - Cursor missing or unresolvable (fresh repo, rebase, gc): re-anchor to current HEAD, process working-tree entries only, one stderr note. No history replay, fail-closed.
  - Advance cursor to current HEAD only when the drain/cascade outcome acknowledges (same semantics as today's `acknowledgeSourceEvents`); on retry-pending/dead-letter/error the cursor stays, next Stop retries the same range.
- Stop-handler cutover: build one synthetic `ArchitectureProjectionSourceEvent` from the cursor changed set (`event_id` = deterministic hash of cursor sha + HEAD sha + sorted paths → drain's existing receipt idempotency applies). Projection-disabled path: `processArchitectureCascade` per changed path. Journal consumption keeps running for contract-verification/minimal-change/checkpoint only.
- Journal `architecture` bit retirement (same work-package, no dual authority): `runMutationObserved` stops setting it; `consumePendingPostEditEvents` drops the architecture branch and its eventIds/skipArchitectureCascade handshake with the drain; `architecture-projection.ts` drain command reads the cursor authority instead of journal events. Pending on-disk events written by the old version still consume cleanly for their remaining bits; their paths are covered by the cursor diff, so no migration shim is needed.
- The datum split is explicit: "architecture changed set" has one authority (git via cursor); the journal remains the authority for edit-time trigger payloads (contract file, base ref, checkpoint) — different datum, not a compatibility path.

Invariant preserved: architecture cascade commands (`architecture-queue record --file`, `context-contract-sync sync-latest`) are unchanged — only their input feed changes. At 10x scale (monorepo, huge diffs) the first failure is cascade fan-out per path at Stop; the cursor bounds each Stop to the delta since the last acknowledged Stop, and the projection queue already aggregates paths into one job.

## Scope

- `src/cli/hook/stop-handler.ts`, `src/cli/hook/mutation-observed.ts` (bit retirement only), new drift-cursor module, `src/cli/commands/architecture-projection.ts`, `src/effects/architecture/projection-orchestrator.ts` (only if the source-event adapter needs a helper), associated tests and fixtures.

## Non-goals (tracked separately, not in this cut)

1. Codex parity for contract-verification / minimal-change / checkpoint triggers (journal writers stay Claude Edit/Write-shaped).
2. Codex PreToolUse mutation-guard path extraction (guard is fail-open on codex today).
3. Cross-worktree attribution when a session edits files outside its cwd repo root.
4. byok-sdk consumer-side issues from the handoff (empty capabilities registry, install drift, ReadinessGate bystander sessions).
5. getFilePath multi-path expansion for apply_patch — moot for architecture under the cursor authority; not needed by the remaining journal bits.

## Constraints

- No steady-state compatibility code: the journal architecture branch is removed in this work-package, not gated or aliased.
- No new abstraction beyond the one cursor module; cascade/projection interfaces unchanged.
- Hook runtime stays dependency-free (git CLI only, already a dependency of the hook environment).

## Fragile Assumption

Stop fires in every codex fleet/worktree session shape we care about. Verified on broker worktree (2 events) but the sample is small. Mitigation: the cursor is self-healing — any later Stop in any session over the same checkout covers the missed range; contract-worktree finish also runs verification that lands after commits.

## Rejected Alternatives

- Per-tool normalization (handoff Plan A): matcher addition is a non-fix (apply_patch already routes); multi-path extraction cannot see shell writes — empirically cannot fix the reported symptom.
- A+B dual authority (Codex field suggestion): two authorities for one datum, permanent drift-check burden; rejected under the one-source-of-truth rule.
- Per-session SessionStart HEAD stamp: per-session state races under concurrent sessions in one checkout and misses ranges when a session dies before Stop; the repo-level cursor is strictly simpler and self-healing.

## Public Interface / Config Changes

- New ignored runtime state file `.ai/harness/state/architecture-drift-cursor.json`.
- `repo-harness architecture-projection drain --json` changed-set source switches from journal events to the cursor authority (output schema unchanged).
- Journal event schema: `dirty.architecture` no longer written; readers ignore it. No policy.json changes. No new external dependencies or API keys.

## Tests

- Unit: cursor module (fresh repo, missing cursor, unresolvable cursor, rename/delete/untracked parsing, dedup, canonicalization filter).
- Stop-handler: shell-write-only session scenario (fs writes, no journal) → cascade receives paths; multi-file commit range; cursor advance on ack, hold on failure; receipt idempotency across repeated Stops; projection-enabled variant via injected drain dependency.
- Characterization: codex apply_patch PostToolUse payload fixture → `runMutationObserved` remains a clean no-op (exit 0, no journal write).
- Regression: existing mutation-observed / stop-handler / architecture-projection-orchestration suites updated for the retired branch; Claude Edit/Write journal tests unchanged in behavior for the remaining bits.

## Rollback / Failure Handling

- Single revertable commit range on a `codex/stop-diff-changed-set` worktree branch; no data migration. Cursor file is disposable runtime state (deleting it re-anchors at HEAD). If the cursor diff fails at Stop (git unavailable/corrupt), Stop reports via existing `[ArchitectureProjection]` stderr channel and does not advance the cursor; advisory gate posture is unchanged.

## Task Breakdown

- [x] T1: Drift-cursor module — cursor state read/write, git changed-set computation (diff + status porcelain), canonicalization, deterministic source-event construction; unit tests. (verification: `bun test tests/architecture-drift*.test.ts`)
- [x] T2: Stop-handler + drain command cutover — stop-handler builds sourceEvents from cursor authority, advances cursor on ack; legacy cascade path iterates cursor paths; `architecture-projection.ts` drain command same cutover; update orchestration tests. (verification: `bun test tests/stop-handler.test.ts tests/architecture-projection-orchestration.test.ts`)
- [x] T3: Journal architecture-bit retirement — mutation-observed stops setting the bit, consumePendingPostEditEvents drops the architecture branch and drain handshake, type cleanup; apply_patch payload characterization fixture; update mutation-observed tests. (verification: `bun test tests/mutation-observed.test.ts`)
- [x] T4: End-to-end acceptance + required checks — shell-write worktree scenario test, full `bun test`, CLAUDE.md required checks, docs touch-up (`docs/architecture/` module note for the changed observation pipeline). (verification: Required Checks block)

Phases are independently landable in order T1 → T2 → T3 → T4; T2 and T3 touch disjoint consumption branches but share `stop-handler.ts`, so they execute sequentially by one writer.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1: Drift-cursor module — cursor state read/write, git changed-set computation (diff + status porcelain), canonicalization, deterministic source-event construction; unit tests. (verification: `bun test tests/architecture-drift*.test.ts`)
- [x] T2: Stop-handler + drain command cutover — stop-handler builds sourceEvents from cursor authority, advances cursor on ack; legacy cascade path iterates cursor paths; `architecture-projection.ts` drain command same cutover; update orchestration tests. (verification: `bun test tests/stop-handler.test.ts tests/architecture-projection-orchestration.test.ts`)
- [x] T3: Journal architecture-bit retirement — mutation-observed stops setting the bit, consumePendingPostEditEvents drops the architecture branch and drain handshake, type cleanup; apply_patch payload characterization fixture; update mutation-observed tests. (verification: `bun test tests/mutation-observed.test.ts`)
- [x] T4: End-to-end acceptance + required checks — shell-write worktree scenario test, full `bun test`, CLAUDE.md required checks, docs touch-up (`docs/architecture/` module note for the changed observation pipeline). (verification: Required Checks block)

> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0926-akn06-retirement.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0926-akn06-retirement.md` => `plans/archive/plan-20260922-0926-akn06-retirement.md`
> **Archive Projection V1**: `tasks/notes/20260922-0926-akn06-retirement.notes.md` => `tasks/archive/notes-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0926-akn06-retirement.contract.md` => `tasks/archive/contract-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0926-akn06-retirement.review.md` => `tasks/archive/review-20260923-1409-akn06-retirement.md`

# Plan: AKN-06b reader retirement and shutdown

> **Status**: Archived
> **Created**: 20260922-0926
> **Slug**: akn06-retirement
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: HTTP completion cannot release unretired server read capacity
> **Rollback Surface**: Revert server and both worker entrypoints together; no data migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-1409-akn06-retirement.md`
> **Task Review**: `tasks/archive/review-20260923-1409-akn06-retirement.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-1409-akn06-retirement.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260922-0926-akn06-retirement.md`
- Sprint contract: `tasks/archive/contract-20260923-1409-akn06-retirement.md`
- Sprint review: `tasks/archive/review-20260923-1409-akn06-retirement.md`
- Implementation notes: `tasks/archive/notes-20260923-1409-akn06-retirement.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-1409-akn06-retirement.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0926-akn06-retirement.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0926-akn06-retirement.md`.

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
- Contract file: `tasks/archive/contract-20260923-1409-akn06-retirement.md`
- Review file: `tasks/archive/review-20260923-1409-akn06-retirement.md`
- Implementation notes file: `tasks/archive/notes-20260923-1409-akn06-retirement.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-1409-akn06-retirement.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0926-akn06-retirement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert server and both worker entrypoints together; no data migration
- **Verification boundary**: HTTP completion cannot release unretired server read capacity
- **Review/acceptance boundary**: `tasks/archive/review-20260923-1409-akn06-retirement.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0926-akn06-retirement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-1409-akn06-retirement.md`, `tasks/archive/review-20260923-1409-akn06-retirement.md`, and `tasks/archive/notes-20260923-1409-akn06-retirement.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-1409-akn06-retirement.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert server and both worker entrypoints together; no data migration

## Captured Planning Output

## Goal
Implement AKN-06b: retire Collaboration and TaskDiff capacity only after the owning reader/Worker exits, including server shutdown. This is the server lifecycle requirement in roadmap section 8.3, separate from AKN-06a browser cadence.

## P1 / P2 / P3
P1: startOperatorServer owns all request slots. Fleet already separates HTTP cancellation from its collector completion. Collaboration currently decrements activeCollaborationWorkers in HTTP settlement; readDefaultCollaborationSnapshot terminates a Web Worker without awaiting exit. TaskDiff repeats a cancellation-only slot loop. Context/activity already share handleBoundedTaskRead with node:worker_threads exit tracking; its injected-reader promise is not included in shutdown completion tracking. Local node worker type documentation defines terminate's Promise as fulfilled on exit.
P2: GET -> guarded route -> bounded slot -> reader -> response. Timeout or disconnect settles the response first, yet unfinished resources still own the slot. Tests hold injected readers unresolved after abort, request retries, and begin shutdown; they must observe no premature reentry/close completion. Default worker tests exercise the actual node Worker path and malformed/unavailable source outcomes.
P3: reuse the existing bounded Task read implementation for TaskDiff, making context/activity/diff share its existing max_concurrency budget. This removes the duplicate TaskDiff lifecycle and worker protocol. Collaboration retains its existing scope+Decision cursor coalescing and bounded FIFO queue; only retirement frees its counter. Default Collaboration moves atomically to the existing node:worker_threads request style (workerData/parentPort) with one response and exit-bound Promise. No long-lived protocol translator or fallback. Shutdown first closes admission and cancels all observers, then awaits all completion sets, before resolving. An uncooperative injected reader can delay shutdown indefinitely; it cannot create free capacity. At 10x load, bounded queues/read slots fail busy or time out rather than launch replacement work over unretired slots. Aggregate provider budgeting, Fleet envelope epochs, formal history, native execution and installation remain separate roadmap requirements, not implied complete by this slice.

## Implementation
1. Add pre-fix regression guards to tests/cli/operator-serve.test.ts proving Collaboration timeout/disconnect hold capacity, TaskDiff timeout/disconnect hold capacity, shutdown waits for each unfinished reader, and late retired results cannot satisfy retries. Capture a nonzero pre-fix artifact before production edits.
2. In src/effects/operator/server.ts, separate Collaboration subscription settlement from retirement; keep a Set of actual completion promises; decrement capacity and drain only in actual reader completion. Prevent queue starts during shutdown. Keep same-scope cancellation from starting replacement work while its retiring observation still owns the slot; return existing busy error for a retiring same key.
3. Replace the default Collaboration worker implementation with node:worker_threads, workerData and parentPort in src/effects/operator/collaboration-worker.ts. Decode its existing strict outcome; terminate after outcome/abort but resolve/reject only at exit. Errors and unexpected exits fail unavailable. No public protocol change.
4. Route validated TaskDiff requests through handleBoundedTaskRead and change src/effects/operator/task-diff-worker.ts atomically to workerData/parentPort. Retain the TaskDiff parser, strict decoder, allowed failure/status semantics, no-fetch environment and same-origin guards. Remove its separate cancellation set and duplicated loop. Track injected Task reads in the same completion set as production Workers.
5. Start shutdown once and return its shared completion Promise to concurrent close callers. Cancel all started/queued work before waiting, then await Fleet, Collaboration, task reads and existing message-write completion sets. Late outcome cannot publish after cancellation; no new requests begin once closing is set.

## Scope / surfaces
Three production files above, existing tests/cli/operator-serve.test.ts and tests/effects/operator-task-diff.test.ts if needed, durable docs/researches/20260922-operator-reader-retirement.md, own plan/contract/review/notes/todos and deterministic architecture manifest. No new dependencies, settings, CLI, API route, public schema, provider call, service, install or main merge. The same node Worker mechanism already serves two independent Task consumers. More than eight total files only because the mandatory workflow artifacts accompany three production owners.

## Verification
Targeted pre-fix guard run, then existing operator-serve, operator-task-diff, operator-task-context and operator-task-activity suites, typecheck and all nine required repository-integrity checks. Include same-scope/coalesced subscribers, queue overflow, timeout, disconnect, success, malformed result, unexpected Worker exit, close while queued, and concurrent close calls; default-worker real fixture confirms the deployed path rather than only injection. Preserve one browser write inventory and network/path guards. No full suite or provider benchmark; all fixtures use isolated repo/HOME and no live model calls. Final canonical verification and one semantic acceptance happen after local commit and separately authorized worktree CodeGraph indexing.

## Acceptance / rollback
The full roadmap execution and stage PRs are already authorized. No additional design approval is required for this bounded lifecycle change. Revert these three production files and associated tests together; no data migration. This assumes real Worker exit is observable through the node API; if live default-worker evidence contradicts it, stop before claiming retirement proof. No third-party credentials are needed. Architecture proof, canonical verification and typed semantic acceptance precede the stage PR.

## Task Breakdown
- [x] Prove premature slot release and shutdown with pre-fix regression evidence.
- [x] Implement exit-bound Collaboration and shared Task read retirement.
- [x] Complete focused tests, integrity checks, durable documentation and candidate commit.
- [ ] Obtain local CodeGraph proof, canonical/semantic acceptance and submit stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

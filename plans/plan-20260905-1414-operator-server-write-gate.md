# Plan: Operator server structural write gate and transport hardening

> **Status**: Executing
> **Created**: 20260905-1414
> **Slug**: operator-server-write-gate
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Operator serve regression guards, live loopback probe, repository-integrity checks and one full suite run on the frozen worktree head
> **Rollback Surface**: Revert the operator server and collaboration reader changes together with their tests
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md`
> **Task Review**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md`

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

- Active plan: `plans/plan-20260905-1414-operator-server-write-gate.md`
- Sprint contract: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md`
- Sprint review: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md`
- Implementation notes: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260905-1414-operator-server-write-gate.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260905-1414-operator-server-write-gate.md`.

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
- Contract file: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md`
- Review file: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md`
- Implementation notes file: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260905-1414-operator-server-write-gate.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260905-1414-operator-server-write-gate.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the operator server and collaboration reader changes together with their tests
- **Verification boundary**: Operator serve regression guards, live loopback probe, repository-integrity checks and one full suite run on the frozen worktree head
- **Review/acceptance boundary**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260905-1414-operator-server-write-gate.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md`, `tasks/reviews/20260905-1414-operator-server-write-gate.review.md`, and `tasks/notes/20260905-1414-operator-server-write-gate.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the operator server and collaboration reader changes together with their tests

## Captured Planning Output

## Goal

Make the Operator server's "exactly one browser write" boundary structural and harden the transport around it: clear the shared Fleet in-flight at cancellation so a page reload cannot surface a spurious 503, bound and type-check the single write route, echo-check the collaboration snapshot identity, and close the low-severity header/route gaps.

Audit baseline: main 1a9a5ae1, 2026-09-05 Task Board audit (server slice findings S1–S6, write/collab slice finding W4, runtime anomalies 4–9).

## P1 Architecture Map

- `src/effects/operator/server.ts` owns route dispatch (`handleRequest`), `OPERATOR_ROUTES` inventory (`:91-111`), Fleet in-flight sharing (`:1411-1448`), collaboration worker admission (`:1375-1399`), task message transport (`:1490-1614`), static serving (`fileIfSafe:1238-1260`), security headers (`:215`).
- `src/effects/operator/collaboration.ts` owns `readOperatorCollaborationSnapshot`; `collaboration-worker.ts` produces the payload; `server.ts:395-399` (`collaborationWorkerResponse`) decodes it.
- `src/cli/commands/operator.ts` owns `operator serve` flags and shutdown.
- Tests: `tests/cli/operator-serve.test.ts`, `tests/effects/fleet-collector-process.test.ts`.

## P2 Concrete Traces (defects)

1. `OPERATOR_ROUTES` has zero consumers (`rg -uu OPERATOR_ROUTES` finds only the definition and archived docs). The comment claims a test counts writes against it; none exists. The dispatcher's literal paths and route regexes (`TASK_MESSAGE_ROUTE`, `COLLABORATION_SNAPSHOT_ROUTE`) are unpinned.
2. Fleet in-flight: `release()` aborts the collection when the last subscriber leaves, but `inFlight`/`activeFleetCanceller` clear only when `pending` settles (`:1435-1446`); `readDefaultFleetSnapshot`'s abort path waits 500 ms grace + up to 5 s controller ack. A request arriving in that window receives the dying promise -> 503. Measured 573 ms after a sole-client disconnect. `tests/cli/operator-serve.test.ts:828` is falsely covering: its fixture rejects synchronously inside the abort listener. The collaboration path already removes its observation synchronously (`:1341-1343`).
3. `handleTaskMessage` has no admission bound; each POST spawns `task-message-process.ts` (`:893-906`). Measured 24 concurrent writers at `max_concurrency: 1`.
4. No request `Content-Type` check on the write; `text/plain` JSON reached the effect (403 `repository_read_only`). Origin equality (`:1687-1703`) is the only barrier against preflight-free simple requests.
5. `collaborationWorkerResponse` accepts any object as snapshot and `readOperatorCollaborationSnapshot` never asserts `snapshot.repository_id === input.repository_id`; the worker derives id from the path (`work-exchange.ts:370`) while the registry may carry a hand-written id.
6. `/api` prefix match is case-sensitive while the static fallback is not: `GET /API/v1/fleet/snapshot` with `Accept: text/html` returns the SPA shell 200.
7. Static CSP (`:215`) omits `base-uri` and `form-action`; JSON responses carry no CSP; `OPTIONS` returns 405 without `Allow`; the server emits no log line for any rejected request (403/405/413/421) so operators cannot see refusals.

## P3 Decisions

- Route inventory becomes a gate: a test imports `OPERATOR_ROUTES`, asserts exactly one `write: true` entry (`task_message`), and pins each inventory pattern to the dispatcher's literals/regex sources (export the literals from the module if needed so the test compares the same values the dispatcher uses; do not duplicate strings in the test). A negative probe (adding a fake route in-test) must fail the assertion.
- In-flight: clear `inFlight`/`activeFleetCanceller` at cancellation time, matching the collaboration path; a fresh request after a sole-client disconnect starts a new collection. Replace the falsely-covering test with a fixture whose abort path settles asynchronously (after a delay) and assert the retry gets 200.
- Write admission: reuse the same bounded admission as collaboration (`max_concurrency`), return a typed 503 (`task_message_busy`, fixed public sentence, `Retry-After` header) above the cap. The browser only ever has one in-flight send, so the cap does not change product behaviour.
- Content-Type: require `application/json` (parameters like `; charset=utf-8` allowed) on the write route; otherwise 415 with a fixed public sentence. Ordering: Origin checks stay first (they are the CSRF barrier); then method/path; then media type; then Content-Length/body.
- Collaboration: `readOperatorCollaborationSnapshot` validates the worker payload's `protocol`/`kind` and asserts `repository_id` equals the requested id; mismatch is a typed `collaboration_repository_mismatch` 500-class error (do not translate ids, do not fall back to the requested id).
- `/api` prefix matched case-insensitively (`pathname.toLowerCase().startsWith('/api')`) so any case variant is an API 404, never the SPA shell; route regexes themselves stay exact.
- Headers: add `base-uri 'none'; form-action 'none'` to the CSP and pin the exact header string in a test; add `Allow: GET, HEAD, POST` on 405 responses; do not add CSP to JSON (document why in the header helper: CSP governs documents, and JSON is served `nosniff`).
- Logging: one stderr line per non-2xx response with method, status, error code, and the pathname truncated to 200 chars; never the body, headers, or Origin value. Keep stdout as the single bound-URL line the CLI contract already prints.
- Out of scope: any change to the Fleet collector, task inbox, browser UI, or Windows job controller.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/effects/operator/server.ts` | Modify | inventory exports, in-flight clear at cancel, write admission, 415, case-insensitive `/api`, CSP additions, `Allow`, stderr refusal log |
| `src/effects/operator/collaboration.ts` | Modify | payload protocol/kind validation + repository_id echo check |
| `tests/cli/operator-serve.test.ts` | Modify/Add | route inventory gate, async-abort in-flight test, admission cap, 415, echo mismatch, `/API` case, CSP string, `Allow`, refusal log |
| `src/cli/commands/operator.ts` | Modify only if the stderr log needs wiring | keep stdout contract |

## Task Breakdown

- [x] Regression guards first (RED): inventory gate with negative probe; async-abort retry 200; admission cap 503; 415 on `text/plain`; collaboration id mismatch typed error; `/API/...` never returns HTML; CSP string; `Allow` on 405; refusal line on stderr. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement in-flight clear at cancellation.
- [x] Implement inventory exports and gate.
- [x] Implement write admission bound and 415.
- [x] Implement collaboration payload validation and echo check.
- [x] Implement `/api` case handling, CSP additions, `Allow`, refusal log.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every `[NOTE]` placeholder; notes only for non-obvious deviations.
- [x] Verification: focused tests, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file), `bun run build:operator-web`, and a live probe: start `bun src/cli/index.ts operator serve --port 0`, curl reload-race (abort a snapshot request then immediately re-request) expecting 200, `text/plain` POST expecting 415, `/API/v1/fleet/snapshot` expecting JSON 404, then kill the server.

## Allowed Paths

- `src/effects/operator/server.ts`
- `src/effects/operator/collaboration.ts`
- `src/cli/commands/operator.ts`
- `tests/**`
- `docs/architecture/**` (only if the projection drain rewrites module docs)
- plan, contract, review, notes files of this work package

## Verification

- `bun test --timeout 60000 tests/cli/operator-serve.test.ts tests/effects/fleet-collector-process.test.ts tests/effects/operator-task-message.test.ts tests/cli/collaboration.test.ts`
- `bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run`
- `bun test --timeout 60000` (full, once, logged)

## Annotations

- None.

## Task Breakdown
- [x] Regression guards first (RED): inventory gate with negative probe; async-abort retry 200; admission cap 503; 415 on `text/plain`; collaboration id mismatch typed error; `/API/...` never returns HTML; CSP string; `Allow` on 405; refusal line on stderr. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement in-flight clear at cancellation.
- [x] Implement inventory exports and gate.
- [x] Implement write admission bound and 415.
- [x] Implement collaboration payload validation and echo check.
- [x] Implement `/api` case handling, CSP additions, `Allow`, refusal log.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every `[NOTE]` placeholder; notes only for non-obvious deviations.
- [x] Verification: focused tests, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file), `bun run build:operator-web`, and a live probe: start `bun src/cli/index.ts operator serve --port 0`, curl reload-race (abort a snapshot request then immediately re-request) expecting 200, `text/plain` POST expecting 415, `/API/v1/fleet/snapshot` expecting JSON 404, then kill the server.

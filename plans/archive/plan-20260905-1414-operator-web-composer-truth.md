> **Archived**: 2026-09-05 23:15
> **Related Plan**: plans/archive/plan-20260905-1414-operator-web-composer-truth.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-2315
> **Archive Projection V1**: `plans/plan-20260905-1414-operator-web-composer-truth.md` => `plans/archive/plan-20260905-1414-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/notes/20260905-1414-operator-web-composer-truth.notes.md` => `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md` => `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1414-operator-web-composer-truth.review.md` => `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`

# Plan: Operator web composer truth, AA contrast, draft safety, i18n errors, decoder-valid fixture

> **Status**: Archived
> **Created**: 20260905-1414
> **Slug**: operator-web-composer-truth
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: operator-web suite with new lease-state and contrast guards, vite build, repository-integrity checks and one full suite run on the frozen worktree head
> **Rollback Surface**: Revert the operator-web source, styles, fixture, and tests together
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`
> **Task Review**: `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`

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

- Active plan: `plans/archive/plan-20260905-1414-operator-web-composer-truth.md`
- Sprint contract: `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`
- Sprint review: `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`
- Implementation notes: `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-1414-operator-web-composer-truth.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-1414-operator-web-composer-truth.md`.

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
- Contract file: `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`
- Review file: `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`
- Implementation notes file: `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-2315-operator-web-composer-truth.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-1414-operator-web-composer-truth.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the operator-web source, styles, fixture, and tests together
- **Verification boundary**: operator-web suite with new lease-state and contrast guards, vite build, repository-integrity checks and one full suite run on the frozen worktree head
- **Review/acceptance boundary**: `tasks/archive/review-20260905-2315-operator-web-composer-truth.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-1414-operator-web-composer-truth.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`, `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`, and `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-2315-operator-web-composer-truth.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the operator-web source, styles, fixture, and tests together

## Captured Planning Output

## Goal

Make the browser Task Board's composer tell the truth about who holds a task, bring the single write control to WCAG AA, stop Escape from destroying a draft, route every error message through i18n, and make the UI fixture a payload the production decoder accepts.

Audit baseline: main 1a9a5ae1, 2026-09-05 Task Board audit (UI slice findings U1–U9). Design contract: `docs/design/DESIGN-local-human-control-board-v1.md` (v2 "exactly one write", 2026-08-31 presentation amendment).

## P1 Architecture Map

- `src/operator-web/App.tsx` owns rendering, composer (`composerScope:1272-1283`, `postTaskMessage:1312`), drawer keyboard handling (`:1621-1626`), counts rendering (`:206-210, 326, 646`), footer (`:1958`).
- `src/operator-web/types.ts` owns the strict decoder (`effect_sha256` at `:416`).
- `src/operator-web/i18n.ts` owns copy; `styles.css` owns tokens (`.composer__send:273-274`).
- `src/operator-web/fixture.ts` feeds `tests/operator-web/*.test.tsx`; `decodableSnapshot()` in `operator-interactions.test.tsx:93-105` rewrites its invalid ids.
- Server contract that the UI must respect: claim-scoped sends are accepted only when the lease is `bound` (`src/effects/fleet/task-inbox.ts:718` -> `recipient_unavailable` otherwise). Therefore the UI's fallback to task scope for non-bound leases is correct; only the copy is wrong.

## P2 Concrete Traces (defects)

1. `composerScope` returns `'claim'` only for `bound`; for `reserving`/`completing`/`reviewing`/`unknown` with a live `claim_id`, the identity list shows the claim while the composer says "Nobody holds this task now" / "no current claim" / "Send to the next claimant". The scope choice is right (server rejects claim scope for non-bound); the target naming is false.
2. `.composer__send` renders `#FBF7EF` on `#CC5F1C` at 13px/600 = 3.76:1 (< 4.5:1 AA); hover `#E8742C` is worse.
3. Document-level `keydown` Escape (`App.tsx:1621-1626`) closes the drawer unconditionally, unmounting `Composer` and discarding body + `message_id`; Escape is the IME candidate-cancel key for zh input.
4. `DEFAULT_API_ERROR`, `COLLABORATION_UNAVAILABLE_ERROR`, `COLLABORATION_REPOSITORY_MISMATCH_ERROR`, `TASK_MESSAGE_FAILED_ERROR` (`App.tsx:51-55, 841-851, 1214-1218`), the two payload-invalid constants in `types.ts:86-114`, and nine of ten repository error codes are rendered as hardcoded English in both locales; `OPERATOR_WRITE_BOUNDARY` (`App.tsx:1212`) and `aria-label="Loading Fleet board"` (`:1742`) likewise. `operator-interactions.test.tsx:1303` currently pins the English boundary literal in zh mode.
5. `fixture.ts:79,82` emits `rev-*` / `claim-*` which violate `TASK_DIGEST_PATTERN` / `UUID_PATTERN`; the fixture only covers `available`/`bound`/`released` lease states so finding 1 is structurally untestable.
6. Two counting authorities: `snapshot.counts.unreadable` (`:326`) vs. re-derived repository filter (`:206-210`) and per-repo card filters (`:646`); the "All" chip sums repositories and cards (runtime showed All 929 = 914 repos + 15 cards).
7. Footer prints `OPERATOR_FLEET_PAYLOAD_PROTOCOL` when `snapshot === null` (`:1958`); `effect_sha256` validated only as non-empty string (`types.ts:416`) though rendered as a copyable identifier.

## P3 Decisions

- Composer copy is derived from claim identity and lease state, not from scope alone: when `claim_id !== null` and `lease_state !== 'bound'`, the toggle/scope note/fence/send button name the holder and its state ("Held by <claim short id> · generation N · <state>; this message queues on the task, not on the claim") and the fence line shows the observed claim as informational. Scope stays `'task'` and the POST envelope is unchanged. Every one of the seven `LEASE_STATES` gets an explicit sentence in both locales; no state falls into a generic default.
- Contrast: send button becomes ink-on-carrot or carrot-700 background (`#A54B15`) with `--text-inverse`; verify ≥ 4.5:1 for default, hover, focus, and disabled states with a computed check in the stylesheet test (parse the two hex tokens, compute WCAG ratio). Keep the existing stylesheet contract test's carrot-literal containment rule satisfied.
- Escape: the drawer's Escape handler ignores the key when the event target is inside the composer panel and the draft body is non-empty; a second explicit close path (close button) remains. No confirm dialog (browser modal dialogs are forbidden by the automation contract and the design brief).
- i18n: client-owned error constants are keyed by `code` in `i18n.ts` with `en`/`zh` copy; the closed set of server error codes (`FleetBoardErrorCode`, operator API codes, task message codes) is localized; an unknown code renders the server's English `message` as the only passthrough and is labelled as such. Update `operator-interactions.test.tsx:1303` to assert the localized boundary sentence instead of pinning English. `aria-label` strings go through i18n.
- Fixture: `task_revision` becomes a deterministic 64-hex digest (e.g. sha256 of the slug), `claim_id` a deterministic UUID; add fixture cards for `reserving`, `completing`, `reviewing`, and `unknown` with live claims, and a `reviewing` card with `current_publication`. Delete `decodableSnapshot()` and route the tests that used it through `decodeOperatorFleetSnapshot` directly.
- Counts: the status bar renders `snapshot.counts` as the only fleet-level authority; the "All" chip counts cards only and the unreadable-repositories chip is labelled as repositories; per-repository matrix keeps its per-repo card filters but is labelled per repository. Do not add a client-side unclassified total; a server-side `counts.unclassified` lands in a sibling work package and gets wired afterwards.
- Footer renders `—` when `snapshot === null`. `effect_sha256` validated as nullable `^sha256:[0-9a-f]{64}$`.
- Out of scope: server, collector, inbox, any protocol change, any new dependency.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/operator-web/App.tsx` | Modify | composer target copy by lease state, Escape guard, counts authority, footer, i18n routing |
| `src/operator-web/i18n.ts` | Modify | lease-state target sentences, error copy by code, aria labels |
| `src/operator-web/types.ts` | Modify | `effect_sha256` pattern; error constants moved to i18n keys |
| `src/operator-web/styles.css` | Modify | `.composer__send` colours |
| `src/operator-web/fixture.ts` | Modify | decoder-valid ids, additional lease states |
| `tests/operator-web/operator-interactions.test.tsx`, `operator-ui.test.tsx`, `operator-collaboration.test.tsx`, `tests/unit/operator-web-types.test.ts` | Modify/Add | regression guards below; remove `decodableSnapshot` |

## Task Breakdown

- [x] Regression guards first (RED): composer names holder for each non-bound live-claim state in en and zh; send button contrast ≥ 4.5:1 computed from CSS tokens; Escape inside composer with non-empty body does not close; error band localized in zh for each client constant and each server code; fixture passes `decodeOperatorFleetSnapshot` unchanged; All chip equals card count; footer shows `—` without snapshot; `effect_sha256` pattern rejected when malformed. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement composer copy by lease state.
- [x] Implement contrast fix and computed contrast test.
- [x] Implement Escape guard.
- [x] Implement i18n error routing and aria labels; update the pinned English assertion.
- [x] Implement decoder-valid fixture with extra lease states; delete `decodableSnapshot`.
- [x] Implement counts authority, footer, `effect_sha256` pattern.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every annotation placeholder; notes only for non-obvious deviations.
- [x] Verification: `bun test --timeout 60000 tests/operator-web tests/unit/operator-web-types.test.ts`, `bun run build:operator-web`, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file).

## Allowed Paths

- `src/operator-web/**`
- `tests/**`
- `docs/architecture/**` (only if the projection drain rewrites module docs)
- plan, contract, review, notes files of this work package

## Verification

- `bun test --timeout 60000 tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx tests/operator-web/operator-collaboration.test.tsx tests/unit/operator-web-types.test.ts`
- `bun run build:operator-web`
- `bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run`
- `bun test --timeout 60000` (full, once, logged)

## Task Breakdown
- [x] Regression guards first (RED): composer names holder for each non-bound live-claim state in en and zh; send button contrast ≥ 4.5:1 computed from CSS tokens; Escape inside composer with non-empty body does not close; error band localized in zh for each client constant and each server code; fixture passes `decodeOperatorFleetSnapshot` unchanged; All chip equals card count; footer shows `—` without snapshot; `effect_sha256` pattern rejected when malformed. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement composer copy by lease state.
- [x] Implement contrast fix and computed contrast test.
- [x] Implement Escape guard.
- [x] Implement i18n error routing and aria labels; update the pinned English assertion.
- [x] Implement decoder-valid fixture with extra lease states; delete `decodableSnapshot`.
- [x] Implement counts authority, footer, `effect_sha256` pattern.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every annotation placeholder; notes only for non-obvious deviations.
- [x] Verification: `bun test --timeout 60000 tests/operator-web tests/unit/operator-web-types.test.ts`, `bun run build:operator-web`, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file).

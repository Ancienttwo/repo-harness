# Plan: Operator Connector acceptance repair

> **Status**: Executing
> **Created**: 20260824-1757
> **Slug**: operator-connector-acceptance-repair
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: security_boundary
> **Verification Boundary**: Every Connector finding has focused regression coverage; final exact head passes full checks, fresh receipt, merge seal, CI and Connector re-review.
> **Rollback Surface**: Revert the bounded repair commits and keep PR #218 Draft.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md`
> **Task Review**: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`
> **Implementation Notes**: `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`

## Agentic Routing
- Selected route: delegated-security-and-frontend-repair
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260824-1757-operator-connector-acceptance-repair.md`
- Sprint contract: `tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md`
- Sprint review: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`
- Implementation notes: `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260824-1757-operator-connector-acceptance-repair.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260824-1757-operator-connector-acceptance-repair.md`.

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
- Contract file: `tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md`
- Review file: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`
- Implementation notes file: `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260824-1757-operator-connector-acceptance-repair.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the bounded repair commits and keep PR #218 Draft.
- **Verification boundary**: Every Connector finding has focused regression coverage; final exact head passes full checks, fresh receipt, merge seal, CI and Connector re-review.
- **Review/acceptance boundary**: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: security_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260824-1757-operator-connector-acceptance-repair.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md`, `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`, and `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the bounded repair commits and keep PR #218 Draft.

## Captured Planning Output

> **Task Profile**: bugfix

## Outcome

Close every concrete finding from the GitHub Connector acceptance of PR #218 that affects the Operator trust boundary or user-visible correctness, then produce a new exact-head AcceptanceReceipt, merge seal, green CI, and a fresh Connector verdict. The PR remains Draft until all P0/P1 findings are closed and the final exact head is independently accepted.

## P1 Architecture Map

- `src/effects/repo-registry.ts` owns persisted repository identity authority.
- `src/core/fleet/` owns Fleet facts; `src/core/operator/fleet-snapshot.ts` owns the browser-safe transport boundary.
- `src/effects/operator/server.ts` owns loopback HTTP request authority, routing, collection single-flight, and static assets.
- `src/operator-web/` owns runtime decoding and presentation; it must never infer domain facts or display stale task details as current.
- `scripts/refresh-current-status.sh` owns the tracked current-status projection; `scripts/check-tarball-install-smoke.sh` owns packaged runtime evidence.
- Out of scope: remote serving, auth/RBAC, mutation routes, provider merge, background polling, and compatibility acceptance of malformed registry identities.

## P2 Concrete Traces

1. Registry row: canonical path plus `repository_id` enters strict registry read, Fleet repository/card projection, Operator DTO, runtime decoder, and UI display. The repair must validate the derived opaque identity at the registry authority and construct every browser object through explicit field allowlists.
2. IPv6 request: `--host ::1` binds the listener, exact `[::1]:port` Host/Origin passes, URL parsing uses the same bracketed authority, and health/API/static routes succeed.
3. UI refresh: server typed failure decodes once and survives state transition; a selected exact task key that disappears closes the drawer instead of retaining old facts; nested malformed payload fails into `operator_payload_invalid`.
4. Package/status evidence: tracked current-status output redacts absolute worktree paths at the producer; a clean-installed tarball starts Operator, serves health/HTML/hashed assets/API, and exits cleanly.

## P3 Decision Rationale

- Browser-safe DTO is an allowlist boundary, not a delete-known-fields transformation. New upstream fields must fail to cross by default.
- Repository identity is derived from canonical path and must match its closed opaque format; malformed persisted authority fails closed.
- One exact authority string owns IPv4/IPv6 Host, Origin, emitted URL, and URL parsing.
- React state derives current task details only from the current snapshot. Old snapshot data may remain only in an explicitly stale whole-snapshot state.
- At 10x scale the Fleet collector remains the first bottleneck; these repairs add bounded validation and do not introduce polling or caching.

## Work Packages

### Backend security

- Validate derived repository IDs and eliminate object spreads across the browser DTO boundary.
- Fix IPv6 URL parsing and add real IPv6 route coverage with fail-closed platform skip rules.
- Add negative path-shaped/token/control-character/extra-property DTO tests.

### Frontend state and layout

- Preserve typed API failures through refresh.
- Close or explicitly invalidate a drawer whose exact task key disappears.
- Fully decode nested snapshot/repository/card fields before rendering.
- Implement desktop side-by-side drawer with overlay only below the design breakpoint.

### Package and projection hygiene

- Redact absolute worktree paths in tracked current-status generation and test the owning producer.
- Extend tarball smoke to boot the installed Operator and request health, HTML, hashed assets, Fleet API, then terminate cleanly.

### Connector follow-up P3 closure

- Reconstruct every decoded Fleet transport level from allowlisted fields; validate registry/source digests and 40/64-character Git OIDs.
- Bind drawer semantics to the same 1101px breakpoint as layout: wide detail is complementary and non-modal; narrow detail keeps dialog focus containment.
- Classify POSIX, Windows drive and UNC marker paths before projection, preserve path bytes with `read -r`, and emit only repo-relative or opaque references.

## Verification

- Focused red-green tests for every Connector finding.
- Real IPv4 and IPv6 runtime probes where the host supports IPv6 loopback.
- Frontend interaction and viewport assertions.
- Clean-install tarball runtime smoke.
- Full root required checks, exact-head remote CI, fresh AcceptanceReceipt and installed merge seal.
- Fresh GitHub Connector review against the final exact base/head; no GitHub writes from the reviewer.

## Task Breakdown

- [x] Backend security work package complete and focused tests green.
- [x] Frontend state/layout work package complete and focused tests green.
- [x] Package/projection hygiene work package complete and focused tests green.
- [x] Parent integration review closes scope, architecture and regression gaps.
- [ ] Full verification, acceptance receipt, merge seal, remote CI and Connector re-review pass.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

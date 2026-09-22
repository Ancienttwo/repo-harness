# Plan: Task Inbox portable storage layout and offline migration

> **Status**: Executing
> **Created**: 20260922-1754
> **Slug**: task-inbox-portable-paths
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260922-task-inbox-portable-paths.md
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Exact-byte history preservation, crash recovery and native Windows delivery/ACK/reply
> **Rollback Surface**: One storage layout cutover with digest-guarded offline inverse before subsequent writes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md`
> **Task Review**: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260922-task-inbox-portable-paths.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-1754-task-inbox-portable-paths.md`
- Sprint contract: `tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md`
- Sprint review: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`
- Implementation notes: `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1754-task-inbox-portable-paths.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1754-task-inbox-portable-paths.md`.

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
- Contract file: `tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md`
- Review file: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`
- Implementation notes file: `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1754-task-inbox-portable-paths.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: One storage layout cutover with digest-guarded offline inverse before subsequent writes
- **Verification boundary**: Exact-byte history preservation, crash recovery and native Windows delivery/ACK/reply
- **Review/acceptance boundary**: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1754-task-inbox-portable-paths.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md`, `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`, and `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: One storage layout cutover with digest-guarded offline inverse before subsequent writes

## Captured Planning Output

## Objective and authorization

The owner approved a separate Windows Task Inbox path-contract planning work-package after PR442's Windows Activity tests failed. Implementation is authorized by the continued full-refactor goal after the owner approved the separate migration work-package. Real repository data migration still requires an explicit operator action. Source baseline is12518117e610007b34b9d10c94b5d92404a09ae3. Working branch is codex/task-inbox-portable-paths. Main and the active reader worktrees remain untouched.

## P1 Map

Semantic recipient identity is owned by src/core/fleet/task-message.ts; persisted events/receipts and reply intents/commits are validated by that module and src/core/fleet/task-reply.ts. src/effects/fleet/task-inbox.ts owns delivery, ACK, staging, replies and historical paths in the Git common directory. Engineer/CLI/hook/Operator consumers call that owner. Existing fleet inbox CLI is the operator entrypoint; withTaskLock and the exclusive directory lock own serialization. Existing sprint migration is a reference for exact-subject refusal, not a second parser to copy.

## P2 Trace and root-cause evidence

A claim recipient becomes claim:<UUID>:g<generation> through deriveTaskMessageRecipientKey; taskInboxDeliveryPath and replyDirectory embed it in filesystem components. The Activity fixture follows the same rule and fails on native Windows before the reader starts. Run35710331815 at12518117 has11 such failures. The same run's full Test, Ubuntu matrix and Windows Job cleanup tests passed. Historical direct paths and strict filename checks must migrate with writers.

## P3 Decision

Use a single v2 directory layout on every platform. Derive a storage-only token r- plus SHA256(domain + NUL + exact UTF8 semantic recipient key). Keep all semantic keys, canonical bytes, record protocols, digests, sort order and authorization checks unchanged. Run one offline, operator-invoked migration with exact source manifest, Task locks, staged byte-preserving copy, journaled cutover, retained backup, old-root tombstone, explicit recovery and digest-guarded rollback. Runtime reads only v2 and rejects v1 or active migration; no compatibility fallback. At10x history, offline inventory/copy cost and temporary disk space grow linearly; normal reader budgets remain unchanged. The mandatory offline assumption and failure transitions are specified in docs/researches/20260922-task-inbox-portable-paths.md.

## Scope and file ownership

This slice touches more than8 files because filesystem identity crosses writers, historical readers, migration and native tests. It adds no service, credential, global config or automatic startup behavior.

- New src/core/fleet/task-inbox-layout.ts: pure v2 path-token and migration-manifest schema; depends on the existing recipient validator, owns no new semantic identity.
- src/effects/fleet/task-inbox.ts: every path producer, scan validator, staging name and pre/post layout fence; preserve existing public API and authorization ordering. Reuse existing canonical record validators for migration instead of cloning them.
- New src/effects/fleet/task-inbox-layout.ts: shared filesystem layout refusal/fence for runtime and offline migration.
- New src/effects/fleet/task-inbox-layout-migration.ts: exact inventory, exclusive migration lock, sorted existing Task locks, live execution refusal, byte copy, crash journal, cutover, receipt and guarded rollback.
- src/cli/commands/fleet.ts: add fleet inbox migrate-layout with dry-run default and the explicit mutually exclusive apply/resume/rollback options recorded in the research design. Use current working directory as repository, as existing inbox commands do.
- Existing tests/unit/task-message-v1.test.ts and tests/unit/task-inbox-v1.test.ts: unchanged semantic identity and fixed-size token/path constraints.
- Existing tests/effects/task-inbox.test.ts and tests/effects/task-reply.test.ts: owner delivery/ACK/reply operations, strict path validation, partial history preservation and legacy refusal. Change path expectations only; do not weaken scan/bytes/deadline assertions.
- Existing tests/effects/operator-task-activity.test.ts: use the canonical v2 path helper for setup, preserve all original history and no-write assertions; real Windows execution must pass.
- Existing tests/cli/fleet-task-inbox.test.ts and tests/task-inbox-hook.test.ts: command behavior and original consumers after cutover.
- New tests/effects/task-inbox-layout-migration.test.ts: the one new test file owns offline transaction/recovery, every persistence interruption point and post-write rollback refusal.
- Existing tests/cli/operator-serve.test.ts: update the negative no-store-write assertion at the new layout root and preserve transport checks.
- Existing tests/cli/mcp-http.test.ts: authenticated protected reply lifecycle with v2 paths.
- .github/workflows/ci.yml: include owning native storage/migration tests in the existing three-platform matrix; keep full/required gates.
- docs/researches/20260922-task-inbox-portable-paths.md and a deploy runbook for operator quiescence, dry-run binding, recovery and rollback; refresh architecture projection through provider after source freeze.
- tests/effects/operator-task-context.test.ts: separate in-reader fixture isolation fix for observed auto-maintenance race. Disable background Git maintenance in fixture invocations; retain exact filesystem snapshot assertions.

Do not change architecture-queue, Task/Lease/Binding protocol, principal mapping, canonical actor, authorization grant, homepage features, #441 retry policy or global runtime. The old tombstone is a rejection marker, not a read alias. No user data is moved during implementation tests.

## Public interface and cutover

The detailed schema, commands and crash states in docs/researches/20260922-task-inbox-portable-paths.md are part of this plan. The only CLI addition is fleet inbox migrate-layout. No HTTP/MCP mutation surface is added. Normal remote readers use the existing unavailable result; the operator-facing error explains migration-required. The migration does not require active sprint/actor authority to preserve historical records.

Consumers -> Task Inbox v2 path owner -> canonical records
                                 ^
Offline CLI -> migration engine -+ (copy/cutover only under quiescence)

The entire implementation is one merge/rollback/acceptance unit. No phase may ship v2 readers without migration and refusal behavior. Actual operator apply on a real repository remains a separately authorized execution step even after code acceptance.

## Verification Plan for implementation

Use the contract's executable JSON Verification Plan when this Draft is approved for implementation. Include these bounded owning checks once source and target base are frozen:

- bun test tests/unit/task-message-v1.test.ts tests/unit/task-inbox-v1.test.ts
- bun test tests/effects/task-inbox.test.ts tests/effects/task-reply.test.ts tests/effects/task-inbox-layout-migration.test.ts
- bun test tests/cli/fleet-task-inbox.test.ts tests/task-inbox-hook.test.ts
- bun test tests/effects/operator-task-activity.test.ts tests/effects/operator-task-context.test.ts tests/effects/fleet-collector-process.test.ts
- bun test tests/cli/mcp-http.test.ts tests/cli/operator-serve.test.ts
- bun run check:type
- All nine required repository-integrity commands in AGENTS.md.
- Existing complete hosted CI plus native Windows/macOS/Linux matrix on the exact published head. No local full-suite duplication without new evidence justifying it.

Required assertions: fresh v2 delivery/ACK/reply; semantic key and byte/digest invariance; all recipient kinds and case-distinct IDs; longest legal IDs and generations; no reserved/path characters; deep Windows path plus Git 8.3 identity; malformed/unsafe/duplicate paths; legacy directory refusal; interrupted and completed history retained; active writer refusal; source changed after dry-run; disk/rename/fsync failure; repeated resume; digest mismatch; rollback refusal after any v2 write; legacy reappearance; read-only GET under legacy/migration/ready states. Windows-unrepresentable v1 fixtures run on POSIX before transport; never skip native fresh-v2 lifecycle.

## Task Breakdown

- [x] Add an existing-suite regression for the illegal storage component before product changes, retain native Windows failure as pre-fix evidence, and implement storage tokens without changing semantic identity.
- [x] Implement every v2 read/write/path-validation consumer and fail-closed layout fence.
- [x] Implement operator dry-run, digest-bound offline migration, crash recovery, receipt and guarded rollback in the same slice; add one migration effects suite.
- [x] Update owning fixtures and native matrix; repair the observed Context fixture auto-maintenance race without relaxing the snapshot oracle.
- [ ] Run targeted verification, provider architecture projection and required integrity checks; freeze source and execute canonical verification once.
- [ ] Obtain the new package's one independent semantic review and exact-head CI. Preserve failures and use owner acceptance only when required by its actual review outcome.
- [ ] Record the accepted source and exact integration handoff for #442, automation-summary and #439. Execute those reader acceptance boundaries next under the continuing full-refactor goal; #442 requires exact owner acceptance because its semantic review budget is already consumed.

## Acceptance and rollback

Accept only if migrated history is byte-identical and semantically identical, new writes/readers are portable, wrong/incomplete layout fails closed, recovery survives all journal boundaries, no later v2 writes can be lost by rollback, and exact-head native CI is green. Before migration, rollback is reverting the code slice. During migration or before any v2 write, use the digest-bound operator inverse. After v2 writes, no automatic code/data rollback to v1 is allowed.

No production migration, main merge, global install, Host admission or canary is claimed by plan capture.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

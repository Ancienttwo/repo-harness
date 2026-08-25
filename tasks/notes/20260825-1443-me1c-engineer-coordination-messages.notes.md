# Implementation Notes: me1c-engineer-coordination-messages

> **Status**: Review
> **Plan**: plans/plan-20260825-1443-me1c-engineer-coordination-messages.md
> **Contract**: tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md
> **Review**: tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md
> **Last Updated**: 2026-08-25 21:05
> **Lifecycle**: notes

## Design Decisions

- Task and Module protocols keep separate exact schemas; only canonical byte, bound, rendering and transition mechanics may be shared.
- Module event plus pending receipt are durable before an optional transport can observe a payload.
- Module-scope messages target stable Engineer identity and survive Binding rotation; assignment scope carries exact Binding generation and is superseded on rotation.
- Transport receives only persisted bounded body summary and typed/content-addressed resource refs. Acknowledgement resolves repo-local refs and verifies bytes before transition.
- CLI is the local Human/program-orchestrator surface; restricted Engineer MCP derives Engineer sender/recipient authority from the verified authorization principal.

## P1 Architecture Map

- `src/core/messages/mechanics.ts` owns only reusable closed-record, canonical-byte, digest, UUID/timestamp and UTF-8-bound mechanics.
- `src/core/fleet/task-message.ts` remains the Task Inbox wire authority; its golden bytes are frozen by `tests/unit/task-message-v1.test.ts`.
- `src/core/engineers/module-message.ts` owns the separate Module message event/receipt/observation schemas; `src/effects/engineers/module-inbox.ts` owns git-common-dir persistence and current-Binding fences.
- CLI and restricted Engineer MCP are invocation adapters. Binding/principal stores remain identity authority; transport remains optional and non-authoritative.

## P2 Concrete Trace

1. CLI or restricted MCP derives the authenticated sender and submits closed message fields.
2. The inbox effect revalidates target Profile, current Binding, module/assignment scope and typed resource references.
3. Under the recipient lock it writes immutable event bytes and a pending receipt before calling transport.
4. Transport receives only persisted bounded summaries and content-addressed references; an error appends an observation and leaves delivery pending.
5. Receive records delivery; acknowledgement resolves every resource under its declared repository root and verifies its digest before the terminal transition.
6. Binding rotation supersedes assignment-scope receipts; module-scope pending messages remain available to the next current Binding.

## P3 Decision Rationale

- A distinct Module protocol preserves the existing TaskMessage identity and prevents Binding scope from becoming a Task/Claim alias.
- Persist-first is the invariant: transport uncertainty can affect observations, never durable message existence or task authority.
- The implementation adds no Provider session lifecycle, daemon, database, transcript store or semantic fallback. At 10x scale, recipient-directory scanning is the first pressure point; no index is added without measurement.

## Deviations From Plan Or Spec

- The 2026-08-25 control-plane amendment inserted a mandatory non-authoritative Runtime Admission Canary before ME-1C approval. The canary subsequently passed with one persisted event, one Codex turn, stable read-only reconciliation and unchanged Task/Lease/Fleet projection; exact evidence and the ME-3A effect-correlation contract are recorded in `docs/researches/20260825-runtime-admission-canary.md`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Extend TaskMessage with Engineer fields | Rejected | Would change existing wire identity and collapse task/claim with engineer/binding scope. |
| Copy the Task Inbox implementation | Rejected | Duplicates locking, canonical bytes and transition mechanics and guarantees drift. |
| Persist transport result as `failed` receipt state | Rejected | ME-1C authority keeps failures as observations while receipt remains pending. |
| Add Provider-specific transport now | Deferred to ME-3A | Provider lifecycle/idempotency is a separate authority and prerequisite boundary. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused message/CLI/MCP tests: 34 passing.
- HTTP Engineer OAuth E2E: 15 passing.
- Full repository suite: 3,087 passing, two platform skips, zero failures. The first run exposed a worktree-only `node_modules` symlink escaping the benchmark source root; installing a real worktree-local dependency tree made the affected benchmark file pass 31/31 and the subsequent complete run green.
- Runtime Admission Canary: passed first proof point with exactly one Codex turn, zero turn tool calls, stable repeated observation and byte-identical Task/Lease/Fleet projection.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

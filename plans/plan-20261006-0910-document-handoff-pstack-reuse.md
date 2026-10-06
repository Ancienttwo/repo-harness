# Plan: document handoff and bounded pstack reuse

Status: Stage A local candidate. Independent review is pending. No live dispatch is enabled.
Date: 2026-10-06
Source baseline: `ef695fb9f964f29342ee6c98ce150601006eb40f` (0.21.0, PR #583).

## Goal and approved scope

Use the flow human → Bot (dot or Grok Bot) → Coding Agent (Codex or Claude).
Use repo documents as readable handoff letters. Keep existing execution authority.
The user asked to record and execute the three-stage plan on 2026-10-06.
That direction covers this bounded implementation and the offline comparison.
It does not approve live agents, a running pilot, publication, merge, or release.
This plan records the work. It does not grant permission to execute its contents.

Ordinary tasks can use a PR body plus thin metadata. They do not need five new
documents. Add a separate plan, question, or review only when the task needs it.

## Due diligence

### P1: map the existing owners

- `src/core/fleet/task-message.ts` owns `TaskMessageEventV1`, byte digests, and
  per-recipient delivery receipts. Its body is untrusted data and is at most 8 KiB.
- `src/effects/terminal/task-session.ts` owns task-agent request, round, frozen
  context digest, result submission, and owner collection. `TaskResult.value`
  remains domain data. Its outer request and context fields remain unchanged.
- `src/effects/terminal/task-worktree.ts` derives the task-agent repository ID
  from the Git common directory. It is not the Fleet repository display ID.
- `src/effects/engineers/task-inbox.ts` and `src/core/fleet/task-reply.ts` own the
  narrow reply to an acknowledged original human steer.
- Existing claims, leases, principal bindings, and publication checks own the
  right to act. `src/core/messages/mechanics.ts` owns shared wire checks.
- `src/core/collaboration/handoff.ts` passes knowledge. It does not transfer
  execution rights. Its authenticated actor union is not a generic Bot identity.

### P2: trace the intended path

Human scope → Bot freezes request context → existing task-agent request → worker
submits a result → owner collects it → Bot presents evidence or asks a question.
A `needs_input` result ends that round. A resolved answer enters a new request
and context digest. Do not turn `engineer_task_reply` into generic Bot chat.

For a later Fleet adapter, bind the exact message ID, task revision, recipient,
and claim generation. Bind the task-agent label to the Fleet 64-hex task ID
explicitly. Similar names, hashes, or Git-synced files do not prove that mapping.

### P3: decide the smallest change

Add a pure document payload validator and canonical JSON renderer. Reuse the
existing byte, UUID, digest, and exact-key mechanics. Keep Markdown as opaque
data. Add fixture tests and a short SOP. Add no production consumer in Stage A.
The payload carries claimed identities and references. Validation establishes
shape and exact reference equality only. It establishes no authenticated sender,
current lease, independent review, successful check, or human approval.

## Stages and stop conditions

### A. Typed handoff and policy boundary

Files:
- `src/core/messages/document-handoff.ts`
- `tests/unit/task-message-v1.test.ts`
- `docs/reference-configs/document-handoff.md`
- This plan

Deliver request, question, reply, result, review, and approval-record content.
Keep the task label, request ID, round, context digest, reply ID, sender/recipient
claims, content digest, acceptance criteria, and version explicit. Code reviews
bind head/base. Artifact references bind exact bytes. A source reference in an
approval record is evidence to resolve later, never an approval capability.

Stop after a frozen local candidate, typecheck, affected tests, and an independent
read-only review. The reviewer must not have implemented this candidate. Review
must check that assertions were not bent to fit implementation. Do not push until
publication is separately authorized. Leave transport wiring for a later change.

### B. Offline fixed-source watcher comparison

Use `cursor/plugins@df581122cde17e6e27686b5a448bde23e4ad4318` as the pstack source.
Compare its watcher/backoff/queue techniques with existing repo-harness behavior
using fixed local inputs. Record the source files, hashes, license, commands,
expected outcomes, measured outcomes, and limits. Keep this lane in its own
directory and branch. It must not edit Stage A files.

Stop with an evidence-backed reuse/reject decision. A repeated poll, an unknown
side effect, or a stale head must not become a fresh execution. No full pstack
installation, daemon, scheduler, live ledger, Herdr start, or network mutation.

### C. Proven increments, then a separately authorized pilot

Consider only parts that show an incremental benefit in Stage B. Add them through
the current authority, rather than through a new inbox, TSV, SQLite store, PID
lock, scheduler, or controller. Do not implement Stage C as part of Stage A.

Before a live pilot, obtain its exact scope and execution authority. Use at most
two writers and one independent reviewer. Use disjoint write sets and isolated
worktrees. Codex owns backend work; Claude owns frontend work. This change has
no UI work. Both Bots must use one authority clone/endpoint. One Bot controls a
task. The other is read-only unless existing authenticated ownership permits it.
The current lease covers linked worktrees in one clone, not multiple hosts.

Stop on claim loss, head/base drift, unclear side effects, unresolved policy,
missing identity mapping, conflicting writes, or missing permission. Reconcile
the original request and receipts. Do not retry with a new request to hide doubt.
Cancel only through the existing owner and retain `cleanup_pending` until stop
is proven. No merge, deployment, credential changes, or access changes are implied.

## Fixture acceptance and evidence limits

All new tests use memory-only values. They start no agents and write no live repo
or authority records. The fixture cast is at most two writers and one reviewer.

- Duplicate bytes have stable identity. Changed content changes the existing
  event digest; a stale digest fails. The store still owns same-ID conflicts.
  This does not prove exactly-once external effects.
- Out-of-order request/round/context and task-label/Fleet-ID mapping fail binding
  checks. The real transport continues to own duplicate and ordering policy.
- Unknown side effects remain explicit, including when outcome says completed.
- Head/base drift and claim-generation changes fail exact reference checks.
  These checks do not observe or renew a live claim.
- Injected `Approved`, `PASS`, instructions, and links in Markdown remain data.
  Unknown authority fields fail closed. Sender claims authenticate nobody.
- Observed, delivered, acknowledged, claimed, finished, verified, and human
  approved remain separate facts. None is inferred from another.

Stage A cannot certify a live pilot. Stage C needs real authority-entry tests for
deduplication, stale generation, claim loss, uncertain delivery, and cancellation.

## Policy differences that must remain visible

Root `AGENTS.md` defines a risk-based ordinary workflow. It requires current-task
permission for main publication. Some reference workflow prose and older stage
machines describe wider merge rights or mandatory document stages. This mapping
is unresolved (`policy_unmapped`), not a new wire status or a permission waiver.
Follow root `AGENTS.md` and current user scope. Do not infer approval from a
Markdown status or this plan. This change does not alter execution checks,
workflow contracts, templates, or historical stage-machine behavior.

## Verification, review, and rollback

Run `bun run check:type` and affected unit tests with an isolated HOME, one test
worker, and a 60-second timeout. Check new document links and `git diff --check`.
Record the exact revision, command, result, and environment with the candidate.
Passing local fixtures are not full-suite, live-agent, provider, or macOS proof.
The independent reviewer consumes these checks and adds only needed delta tests.

Rollback removes the new pure module, tests, and docs, or reverts the later
published commit. There is no runtime data migration or deployed state to undo.

## Source references

- [TaskMessage baseline](https://github.com/Ancienttwo/repo-harness/blob/ef695fb9f964f29342ee6c98ce150601006eb40f/src/core/fleet/task-message.ts)
- [Task-agent baseline](https://github.com/Ancienttwo/repo-harness/blob/ef695fb9f964f29342ee6c98ce150601006eb40f/src/effects/terminal/task-session.ts)
- [pstack fixed source](https://github.com/cursor/plugins/tree/df581122cde17e6e27686b5a448bde23e4ad4318/pstack)
- [Handoff SOP](../docs/reference-configs/document-handoff.md)

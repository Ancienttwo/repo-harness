# Document handoff: offline contract

Status: Stage A only. No CLI, MCP, hook, Bot, or task-agent dispatch uses this
payload yet. The pure API is in `src/core/messages/document-handoff.ts`.
See the [implementation plan](../../plans/plan-20261006-0910-document-handoff-pstack-reuse.md).

## Human → Bot → Coding Agent

The human sets the goal and operation limits. One Bot controls each task. The
Coding Agent reports its work, questions, and evidence. Documents carry readable
content between them. They do not carry permission to run that content.

Use a PR body for an ordinary task. A short brief can use these sections:

```markdown
## Goal
What observable result is needed?

## Scope
What can change? What must remain unchanged? Who owns the write set?

## Verify
What checks prove the result? What remains untested?

## Rollback
How can the change be undone? When must the worker stop and ask?
```

Use the same brief as Markdown content. Do not add a plan, contract, review, and
notes file to every task. Machine metadata stays in the thin JSON payload.

## Payload contract

`kind=repo-harness-document-handoff` and `protocol=1` select the closed schema.
Unknown fields fail. Each payload includes:

- `message_id` and `in_reply_to`: exact message references, not titles.
- `binding`: task-agent repository ID, task label, request ID, positive round,
  and frozen context SHA-256. Preserve the repository ID's exact bytes.
- `binding.fleet`: null, or an explicit task ID, revision, claim ID, and
  generation mapping. A task label is not a Fleet 64-hex ID. The payload cannot
  establish this mapping. A future host adapter must resolve both authorities.
- `binding.subject`: null, or exact Git head/base IDs. A code review requires it.
- `sender` and `recipient`: role and identity claims. They do not authenticate
  anyone, even when the role says `human` or the ID says `dot`.
- `intent`: request, question, reply, result, review, or approval_record.
- `body`: inline Markdown with its exact UTF-8 SHA-256, or a Markdown artifact
  reference with digest, byte length, and media type.
- `artifacts`: at most eight evidence references with the same byte fields.

A request supplies its action, acceptance criteria, and stop conditions. A result
supplies its outcome, unresolved questions, and side-effect knowledge. A
`needs_input` result requires a question. A completed result has no unresolved
questions, but it is still only the sender's completion claim.

`side_effects=unknown` remains unknown even if outcome is completed. Do not retry
an external action from that result. Check the original request and provider
receipt first. Neither an outcome nor a successful parse proves an effect.

A review carries a verdict and findings. It does not prove reviewer independence
or successful checks. An approval record names a source reference and the action
discussed there. The source must be resolved and authenticated by the existing
authorized entry point. The schema has no `approved=true` or permission field.

## Pure APIs and limits

- `validateDocumentHandoffPayload(value)` validates and returns a frozen value.
- `canonicalDocumentHandoffBytes(value)` renders deterministic JSON. Its total
  size is at most the existing 8 KiB TaskMessage body limit. Use an artifact
  reference when inline Markdown is too large.
- `assertDocumentHandoffMatches(value, expected)` compares explicit identity,
  request, reply, participant, subject, and Fleet references. The caller must
  obtain expected values independently. Passing the payload's own values proves
  nothing beyond internal agreement. A match does not prove current ownership.
- `assertDocumentArtifactBytes(reference, bytes)` checks only supplied bytes.
  Nothing here opens a path, follows a link, authenticates a source, or runs code.

The context digest belongs to the existing frozen task-agent context. Assemble
the payload after that context is frozen. Do not embed a context's own digest in
the bytes whose digest it claims. The JSON body and its Markdown digest have
different subjects. Do not replace one digest with the other.

The future transport must preserve the unchanged `TaskMessageEventV1` fields,
digest rules, immutable message identity, and per-recipient receipts. It must bind
outer and inner IDs and authenticated sender/recipient references. Keep
`TaskResult`'s existing request/context/value envelope unchanged. The new value
does not replace the existing result identity check or collection authority.

## Questions, duplicate messages, and recovery

For a generic question, submit `result.outcome=needs_input` through the original
request. The owner collects it. The Bot answers within its scope or asks the
human. Freeze that answer in a new context and start the next bounded request
round. Reference the original question/result. Do not edit the old request.

The question and reply content kinds are available for documentation only. They
do not widen `engineer_task_reply`. That operation still requires an acknowledged
original human steer and its existing authenticated reply checks.

Identical payload bytes parse identically. This is not exactly-once delivery.
The existing transport must reject one message ID with conflicting bytes and
handle duplicate receipts. Old rounds, context digests, claims, generations,
head/base IDs, or explicit task mappings must not be substituted silently.

Observed, delivered, acknowledged, claimed, finished, verified, and human approved
are separate facts. Preserve each source. `Approved`, `PASS`, `done`, or commands
inside Markdown remain untrusted content. A source URL is not proof of approval.
Do not promote document status or a parser result to execution authority.

## Bot ownership and policy

Two Bots can research separate tasks. Only one controls a given task. They must
use one existing authority clone/endpoint. The lease covers that clone and its
linked worktrees. It is not a distributed lock across hosts. A task-agent
`caller.lock` serializes calls; it does not authenticate a controller Bot.

Root `AGENTS.md` is the current workflow boundary. Current-task authorization is
required for main publication. Older stage-machine prose and wider merge wording
remain an unresolved policy mapping. This SOP does not rewrite those execution
checks or grant the missing permission. Pause the dependent action when the
mapping or ownership cannot be established.

No new inbox, queue, database, scheduler, daemon, or live dispatch is part of this
contract. A later pilot needs separate authorization and real authority tests.

# BRC failure finalization and supervision repair boundaries

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Current scope

The audit at main 38c26b2 identified five separate defects. This repair worktree starts at e71fb76c; the added BRC6a owner-acceptance documentation did not change the production active-admission guard. Issues #353, #355, #356 and #357 have targeted repair implementations. Issue #354 remains unaccepted pending ownership and completion of the existing Docker containment integration. This document does not grant BRC active or release acceptance.

## P1 — owning boundaries

`campaign-worker.finish` owns one group planning transaction. The public failure-recovery entrypoint owns its own transaction; both now use the same module-private caller-held settlement implementation. Neither generic file-lock semantics nor timeout values change.

`run-bounded-verifier-command.ts` owns actual log descriptors, pipe hashes and local termination observation. Its packaged mirror is identical. `contract-run.ts` consumes the wrapper result before final log handling and independently rejects non-regular descriptors using nonblocking opens; its packaged mirror is also identical.

`gpt-pro-issue-authoring.ts` owns initial/fill/edit rendering. It now states the existing closed metadata grammar, numeric priority range, allowed kinds, non-blank strings, sorted unique arrays, exact keys and fence rules. The syntax example references the parser's kind constant. The parser still rejects malformed metadata; no local repair or new semantic fallback exists.

## P2 — observed failures and repaired paths

The process-isolated finalization fixture simulates admission only; actual Claim/budget stores, invocation preparation, supervisor, finish and replay run unchanged. Both worker nonzero and verifier FAIL previously reached the nested planning lock and failed. After the fix they persist failure finals and settle once. This fixture is explicitly not proof of current active admission or provider authority.

Real FIFO regressions cover stdout/stderr, expired deadlines and a FIFO with a live reader. Opening with O_NONBLOCK prevents a readerless FIFO wait; fstat validates the actual descriptor before truncation, including when the open itself succeeds. Invalid targets produce output_error, started=false and unknown process-group state. stderr-open failures close the already-open stdout descriptor. The caller also had a post-wrapper stderr FIFO wait; its real CLI regression failed before the corresponding descriptor check and now returns without starting its verifier.

Cancellation tests keep a detached descendant's inherited pipes open with the leader both alive and exited. Cancellation wakes drain immediately and bounds it by the TERM/KILL plus confirmation cleanup window. Closing local pipes marks output incomplete, preserves the cancellation reason and does not establish detached process inactivity. Existing cooperative cancellation, deadline, split output and symlink tests remain covered.

Rendered initial/fill/edit examples are accepted by the formal metadata parser. Unsorted or duplicate arrays, invalid priority, extra fields and multiple JSON fences remain rejected. The old 0/10 metadata observation retains its original meaning; no new real authoring batch was run and this defect is not asserted to explain every historical failure.

## P3 — trust, scale and residual boundary

The four repairs introduce no dependency, service, public configuration or persisted protocol. The private settlement implementation exists because finish and recovery need the same atomic invariant without recursive locking. New tests provide direct pre-fix failures, OS-specific blocking/cancellation evidence and prompt/parser drift protection.

At 10x load, group serialization and process output remain the existing bottlenecks. Nonblocking descriptor validation and bounded cancellation do not increase workload deadlines. A dropped local pipe proves output incompleteness, not worker containment.

#354 requires a producer channel that the worker cannot replace. A file and its validating hash inside one writable boundary do not provide provenance. Moving them to a differently named same-UID path is insufficient. The existing Docker candidate protects a host journal and binds container request/receipt to invocation, dispatch, Claim and generations. Its current dirty bytes are not accepted by this package. The actual managed runChild → afterChild → terminal → failed settlement chain, replacement window and crash recovery still need their own evidence before #354 closes. BRC6a runtime refusal remains intact.

## Verification provenance

The task notes point to this worktree's retained pre-fix and development logs. The first four-issue focused batch passed 80 tests across campaign worker/lifecycle, authoring/parser and contract-run. The later caller FIFO delta passed the entire 35-test contract-run file. Supervisor/parser audit tests and actual finish tests have separate pre-fix and post-fix runs. A 1-second successful version probe hit its deadline once in a combined run; the unchanged named test then passed in isolation. That failure is retained rather than erased or repaired by changing the workload deadline.

These are native Bun model-free checks. No real Codex/GPT provider, Docker integration, full Bun suite, tarball release gate, merge, release or issue closure is claimed.

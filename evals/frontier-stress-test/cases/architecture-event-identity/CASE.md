# Case: architecture event identity before lock mechanics

Historical source: `plans/archive/plan-20260814-0157-architecture-queue-idempotent-events.md`.

The draft proposes an append-only architecture event journal and a cross-process
lock. Re-observing an unchanged pending file currently rewrites the request card,
index, and event log with a later timestamp. Wall-clock `ts` is known not to be
semantic identity, but the brief does not say which normalized fields make two
observations the same event.

The user explicitly asks to stress-test before approval. Do not implement.

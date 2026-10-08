# Kanban runtime observations

The Organization / Attention board displays a separate read-only runtime overlay. Runtime observations never advance pipeline phase, admit work, release leases, accept results or change evidence. The existing Pipeline Board V2 schema is unchanged. The overlay uses `repo-harness.runtime-overlay.v2`.

Without configuration, `/api/v1/runtime/status` reports unavailable. To enable observations, the operator owner supplies an absolute JSON configuration path through `repo-harness operator serve --runtime-status-config /authorized/runtime-config.json`. Example shape (paths and names are placeholders, not endpoint discovery):

```json
{
  "protocol": "repo-harness.herdr-runtime-config.v1",
  "source_host": "authorized-host",
  "herdr_session": "authorized-session",
  "socket_path": "/authorized/herdr.sock",
  "deadline_ms": 1000,
  "bindings_path": null,
  "pipeline_snapshot": null
}
```

This explicitly starts owned Unix socket observations before HTTP serving. GET only reads the cache. The service subscribes before snapshots, serializes refresh, rereads on intervening events, refreshes every 30 seconds, and resubscribes with a new source epoch on disconnect or `events_lost`. Shutdown closes only its own sockets and timer. Unreachable or unsupported sources report unavailable. Successful snapshots update observation time, not agent progress time. Failed refresh preserves the original age. Five minutes without a successful snapshot marks data stale; silent working agents do not become errors.

The socket codec is based on [immutable Herdr source](https://github.com/herdrdev/herdr/tree/4dc23bb15d4a2fd2c093abfb509f903c3015bf56), version 0.9.3 and protocol 22. It verifies those reported version fields, rather than claiming a remote binary commit attestation. Only `ping`, `session.snapshot` and `events.subscribe` are sent. Global lifecycle subscriptions precede exact pane status subscriptions and a second snapshot. Titles, cwd, terminal text, arbitrary event payloads and raw agent session paths are excluded from the public projection. The official agent-session object is represented by a digest.

With both binding paths null, observations remain unclaimed. To attach badges, a dispatch owner must supply both an existing immutable pipeline snapshot pointer and a bounded regular-file manifest with exact shape `{ "protocol": "repo-harness.runtime-bindings.v2", "bindings": [...] }`. Each binding must provide `source_host`, repository digest `repository_id`, `task`, `role`, `round`, `pipeline_state_version`, `request_id`, `context_sha256`, `runtime_session`, `attempt`, `generation`, `source_epoch`, `herdr_session`, `terminal_id`, `pane_id` and `agent_session`. `runtime_session` is the SHA-256 digest (with `sha256:` prefix) of the exact existing terminal binding artifact bytes. `generation` is the existing owned dispatch intent ID. `agent_session` is the digest produced by `herdrAgentSessionKey` from the official typed session object. `source_epoch` is a nonnegative integer in the file; the observer replaces it with its own lifecycle epoch after verification.

The manifest is a read-only identity link, not another task ledger. The reader verifies outbox enrollment, current record state version, current role/round/request/context, attempt, owned terminal/provider intent proofs and context bytes against existing dispatch artifacts. It uses the board's existing restore-aware run projection from the same immutable snapshot. This includes recovered enrollment logs. Only the latest round for a role can claim a badge. The actual pane session and terminal IDs must match the binding. Ambiguous, missing, changed or unverifiable bindings remain unclaimed. The UI additionally checks the card state version and latest role round, so a retained older round cannot display runtime activity as current. No association comes from titles or cwd. No automatic binding-file writer or live host setup is included; a caller must provide those complete verified references.

Herdr `idle`, `working`, `blocked`, `unknown` and readable `done` are supported structured observations. `done` displays “Idle · not seen”; it does not mean accepted completion. Herdr blocking reason is unknown. The separate optional typed program-v1 contract supports permission/question/auth reasons, settled, error, clear and aborted; only typed aborted means cancellation. Those program states have synthetic fixtures only. Current Herdr has no OSC 7501 receiver, so production program capability remains unsupported. An upstream bounded typed receiver and structured adapter are a separate dependency, tracked in the proposed Herdr Discussion 5073. Repo-harness never parses terminal output for status.

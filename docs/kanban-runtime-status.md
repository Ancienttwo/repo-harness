# Kanban runtime observations

The Organization / Attention board reads a separate runtime overlay. Observations never advance pipeline phase, admit work, release leases, accept results or change evidence. The Pipeline Board V2 schema is unchanged. The overlay uses `repo-harness.runtime-overlay.v3`. Its `badges` array contains task observations. Its `pane_observations` array contains separate terminal reports.

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

The base socket codec follows [immutable Herdr source](https://github.com/herdrdev/herdr/tree/4dc23bb15d4a2fd2c093abfb509f903c3015bf56). The typed root schema is pinned to local Herdr candidate `c5964c520e2a4417491e1032c4f00ea4876db272`, based on `cce57bc32c44b0a83b641fe5f8625cd3c93ba7e4`. This candidate is not an official release. The codec requires reported version 0.9.3 and protocol 22. These fields do not attest the remote binary commit. Only `ping`, `session.snapshot` and `events.subscribe` are sent. Global lifecycle subscriptions precede exact pane status subscriptions and a second snapshot. Titles, cwd, terminal text, arbitrary event payloads and raw agent session paths are excluded from the public projection. The agent-session object is represented by a digest.

With both binding paths null, observations remain unclaimed. To attach badges, a dispatch owner must supply both an existing immutable pipeline snapshot pointer and a bounded regular-file manifest with exact shape `{ "protocol": "repo-harness.runtime-bindings.v2", "bindings": [...] }`. Each binding must provide `source_host`, repository digest `repository_id`, `task`, `role`, `round`, `pipeline_state_version`, `request_id`, `context_sha256`, `runtime_session`, `attempt`, `generation`, `source_epoch`, `herdr_session`, `terminal_id`, `pane_id` and `agent_session`. `runtime_session` is the SHA-256 digest (with `sha256:` prefix) of the exact existing terminal binding artifact bytes. `generation` is the existing owned dispatch intent ID. `agent_session` is the digest produced by `herdrAgentSessionKey` from the official typed session object. `source_epoch` is a nonnegative integer in the file; the observer replaces it with its own lifecycle epoch after verification.

The manifest is a read-only identity link, not another task ledger. The reader verifies outbox enrollment, current record state version, current role/round/request/context, attempt, owned terminal/provider intent proofs and context bytes against existing dispatch artifacts. It uses the board's existing restore-aware run projection from the same immutable snapshot. This includes recovered enrollment logs. Only the latest round for a role can claim a badge. The actual pane session and terminal IDs must match the binding. Ambiguous, missing, changed or unverifiable bindings remain unclaimed. The UI additionally checks the card state version and latest role round, so a retained older round cannot display runtime activity as current. No association comes from titles or cwd. No automatic binding-file writer or live host setup is included; a caller must provide those complete verified references.

Herdr `idle`, `working`, `blocked`, `unknown` and readable `done` remain supported agent observations. Agent `done` displays “Idle · not seen”. It does not mean accepted completion. Its blocking reason is unknown.

The typed root receiver must advertise `ping.result.capabilities.program_status_root_v1: true`. Missing capability means unsupported. A nonboolean capability, a capability change during observation or root data without capability fails closed. The version check still requires exactly 0.9.3 and protocol 22. The capability does not prove a binary commit or a new release.

The adapter reads `PaneInfo.program_status`. Its envelope has `source: "osc7501"`, `revision`, `source_epoch`, `updated_at_ms` and `record`. The record has state `idle`, `working`, `blocked`, `done` or `error`. Only `blocked` can have a permission, question or auth kind. Root `done` maps to `settled`. It is a report that the program stopped working. It is not task acceptance. Root `idle` does not mean cancellation. Root OSC has no aborted state. A null record means clear. Clear removes the visible report and keeps its revision fence. Reports use `pane.updated` invalidation. OSC has no heartbeat.

Each public terminal report has `scope: "pane"`, `source: "osc7501"`, `pane`, nullable `binding`, `source_epoch`, `revision`, `state`, `reason`, `changed_at` and `freshness`. The pane has source host, Herdr session, terminal ID, pane ID and an agent-session digest. The digest can be null when Herdr has no session reference. The optional binding is a verified current card-to-pane route. It is not the producer identity. A root report cannot prove which task, round or attempt produced it. A UI must label it “关联终端报告”. It must not put it in the task badge or use it as task evidence.

The source checks bindings before and after each snapshot. Missing or ambiguous routes produce a null binding and an unclaimed count. The first report can be shown as the last terminal report. No baseline or later revision is treated as task identity proof. The report's source epoch identifies the Herdr terminal process generation. The overlay's source epoch identifies the observation connection lifecycle. Lower epochs and revisions cannot restore an older report. A same-revision conflict stays hidden until a newer report. Snapshot success controls freshness. It does not change the report's progress time.

The separate full-identity program-v1 contract remains available for a source that can prove that identity. Only its explicit aborted state means cancellation. Its cancellation fence survives clear for the same attempt. The root adapter never constructs this contract from a pane report. Titles, message text, paths, app names and progress values do not enter the public projection. Repo-harness never parses terminal output for status.

Backend tests cover a real Unix socket and HTTP cache path with controlled structured frames. They also cover SQLite dispatch readback. These frames are synthetic receiver output. A separate check feeds the real Pi 1.1.0 startup report, received and serialized by the native Herdr receiver, through this decoder. That check observes idle and removes app data. It is not a full live PaneInfo socket check. These checks do not prove that an installed Herdr daemon emits the new fields. This change does not install a daemon, start a provider or write a binding manifest.

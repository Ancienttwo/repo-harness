# Kanban runtime observations

The Organization / Attention board reads a separate runtime overlay. Observations never advance pipeline phase, admit work, release leases, accept results or change evidence. The Pipeline Board V2 schema is unchanged. The overlay uses `repo-harness.runtime-overlay.v4`. Its `badges` array contains task observations. Its `pane_observations` array contains separate Herdr terminal reports. Its `native_sources` array contains independent native session or terminal observations. Native observations have no task binding.

Without configuration, `/api/v1/runtime/status` reports unavailable. To enable observations, the operator owner supplies an absolute JSON configuration path through `repo-harness operator serve --runtime-status-config /authorized/runtime-config.json`. Example shape (paths and names are placeholders, not endpoint discovery):

```json
{
  "protocol": "repo-harness.runtime-config.v2",
  "kind": "herdr",
  "source_host": "authorized-host",
  "herdr_session": "authorized-session",
  "socket_path": "/authorized/herdr.sock",
  "deadline_ms": 1000,
  "bindings_path": null,
  "pipeline_snapshot": null
}
```

The unreleased config v1 is replaced by the closed config v2 union. Old config files fail closed. A service uses one kind. It cannot combine Herdr data with native capture heartbeats. Herdr remains an optional adapter. Its dispatch and binding controls do not change. Herdr mode always has an empty `native_sources` array.

For native observations, supply a native config. Each source names one explicit capture file. One service accepts one through eight sources. Source IDs and file paths must be unique. The reader does not scan HOME, logs or sockets.

```json
{
  "protocol": "repo-harness.runtime-config.v2",
  "kind": "native",
  "sources": [
    {
      "source_id": "local-codex",
      "provider": "codex",
      "snapshot_path": "/authorized/private/codex-capture.json"
    }
  ]
}
```

Start a new run through explicit capture. The output path must be new. Its parent directory must be owned and private. Capture does not take over an existing desktop session. These commands show the shape. They do not start a model turn.

```sh
repo-harness operator capture --provider codex --source-id local-codex --snapshot /authorized/private/codex-capture.json -- codex app-server
repo-harness operator capture --provider pi --source-id local-pi --snapshot /authorized/private/pi-capture.json -- pi
repo-harness operator serve --runtime-status-config /authorized/runtime-config.json
```

Codex capture passes stdin and stdout through. It does not originate RPC, answer approvals, start a turn or resume a session. Claude and Pi capture use an owned PTY. Capture reads structured OSC 7501 status. It consumes and answers only the fixed capability query. Other bytes continue to the terminal. Installed Claude 2.1.291 does not prove support in 2.1.295. Support needs separate evidence from that version.

The service reads capture snapshots before HTTP starts. Its owned timer refreshes the cache every 30 seconds. GET reads the cache and computes age. GET does not open capture files, write snapshots or start a child. Closing the service stops only its timer and observer. It does not stop a user daemon or a capture child.

Each native source has `source_id`, `provider`, nullable `generation`, `capture_status`, nullable `heartbeat_at`, `freshness` and `observations`. Each observation has `scope`, nullable `session_id`, nullable `turn_id`, `state`, `reason`, `event_received_at` and nullable `changed_at`. Codex scope is session. Claude and Pi scope is terminal. Native mode always has empty task badges and Herdr pane reports. The root `source_epoch` and `observed_at` are projection metadata. They cannot make a source fresh.

Freshness uses each source's own heartbeat. A successful file read does not renew it. Five minutes without a capture heartbeat marks a connected source stale. Heartbeat means capture is reachable. It does not mean agent progress. Event receive time stays fixed until a new event arrives. A disconnected capture is explicit. Future timestamps cannot make a source fresh.

The reader accepts only bounded regular files. It uses no-follow open and file identity checks. Missing files, malformed data, identity mismatch, symlinks and oversize data produce an unavailable source with no observations. Other sources keep their own status. Public data contains no source path, raw error, prompt, tool arguments or terminal text. The reader never creates a hook-log lock.

A capture generation is a UUID. A new generation clears previous observations. Retired generations cannot return. Within a generation, lower sequences and different content at the same sequence fail closed. Rejected states stay hidden until a higher sequence or a new generation. The observer bounds retired-generation history. If that bound is exhausted, it fails closed. File replacement alone does not reset these fences.

Native settled, idle, error and cancelled states are program reports. They do not accept a task. Disconnect does not mean completion. OSC idle does not mean cancellation. Codex interrupted is a native turn result. Pipeline phase, task acceptance and evidence remain under their existing authority.

Herdr mode starts owned Unix socket observations before HTTP serving. GET only reads the cache. The service subscribes before snapshots, serializes refresh, rereads on intervening events, refreshes every 30 seconds, and resubscribes with a new source epoch on disconnect or `events_lost`. Shutdown closes only its own sockets and timer. Unreachable or unsupported sources report unavailable. Successful snapshots update observation time, not agent progress time. Failed refresh preserves the original age. Five minutes without a successful snapshot marks data stale; silent working agents do not become errors.

The base socket codec follows [immutable Herdr source](https://github.com/herdrdev/herdr/tree/4dc23bb15d4a2fd2c093abfb509f903c3015bf56). The typed root schema is pinned to [experimental fork candidate `add5f99a8351e66464f9abec0920778303f0e885`](https://github.com/Ancienttwo/herdr/tree/add5f99a8351e66464f9abec0920778303f0e885). It is based on upstream `f5e7f41d7a132c35cc13a020afa32d54d67f91e9`. This candidate is not an official release. Upstream has not accepted the change. Its contributor gate closed [PR 5093](https://github.com/herdrdev/herdr/pull/5093). The fork preserves the candidate for review. The long-term dependency decision remains open.

The codec requires reported version 0.9.3 and protocol 22. These fields do not attest the remote binary commit. Only `ping`, `session.snapshot` and `events.subscribe` are sent. Global lifecycle subscriptions precede exact pane status subscriptions and a second snapshot. Titles, cwd, terminal text, arbitrary event payloads and raw agent session paths are excluded from the public projection. The agent-session object is represented by a digest.

With both binding paths null, observations remain unclaimed. To attach badges, a dispatch owner must supply both an existing immutable pipeline snapshot pointer and a bounded regular-file manifest with exact shape `{ "protocol": "repo-harness.runtime-bindings.v2", "bindings": [...] }`. Each binding must provide `source_host`, repository digest `repository_id`, `task`, `role`, `round`, `pipeline_state_version`, `request_id`, `context_sha256`, `runtime_session`, `attempt`, `generation`, `source_epoch`, `herdr_session`, `terminal_id`, `pane_id` and `agent_session`. `runtime_session` is the SHA-256 digest (with `sha256:` prefix) of the exact existing terminal binding artifact bytes. `generation` is the existing owned dispatch intent ID. `agent_session` is the digest produced by `herdrAgentSessionKey` from the official typed session object. `source_epoch` is a nonnegative integer in the file; the observer replaces it with its own lifecycle epoch after verification.

The manifest is a read-only identity link, not another task ledger. The reader verifies outbox enrollment, current record state version, current role/round/request/context, attempt, owned terminal/provider intent proofs and context bytes against existing dispatch artifacts. It uses the board's existing restore-aware run projection from the same immutable snapshot. This includes recovered enrollment logs. Only the latest round for a role can claim a badge. The actual pane session and terminal IDs must match the binding. Ambiguous, missing, changed or unverifiable bindings remain unclaimed. The UI additionally checks the card state version and latest role round, so a retained older round cannot display runtime activity as current. No association comes from titles or cwd. No automatic binding-file writer or live host setup is included; a caller must provide those complete verified references.

Herdr `idle`, `working`, `blocked`, `unknown` and readable `done` remain supported agent observations. Agent `done` displays “Idle · not seen”. It does not mean accepted completion. Its blocking reason is unknown.

The typed root receiver must advertise `ping.result.capabilities.program_status_root_v1: true`. Missing capability means unsupported. A nonboolean capability, a capability change during observation or root data without capability fails closed. The version check still requires exactly 0.9.3 and protocol 22. The capability does not prove a binary commit or a new release.

The adapter reads `PaneInfo.program_status`. Its envelope has `source: "osc7501"`, `revision`, `source_epoch`, `updated_at_ms` and `record`. The record has state `idle`, `working`, `blocked`, `done` or `error`. Only `blocked` can have a permission, question or auth kind. Root `done` maps to `settled`. It is a report that the program stopped working. It is not task acceptance. Root `idle` does not mean cancellation. Root OSC has no aborted state. A null record means clear. Clear removes the visible report and keeps its revision fence. Reports use `pane.updated` invalidation. OSC has no heartbeat.

Each public terminal report has `scope: "pane"`, `source: "osc7501"`, `pane`, nullable `binding`, `source_epoch`, `revision`, `state`, `reason`, `changed_at` and `freshness`. The pane has source host, Herdr session, terminal ID, pane ID and an agent-session digest. The digest can be null when Herdr has no session reference. The optional binding is a verified current card-to-pane route. It is not the producer identity. A root report cannot prove which task, round or attempt produced it. A UI must label it “关联终端报告”. It must not put it in the task badge or use it as task evidence.

The source checks bindings before and after each snapshot. Missing or ambiguous routes produce a null binding and an unclaimed count. The first report can be shown as the last terminal report. No baseline or later revision is treated as task identity proof. The report's source epoch identifies the Herdr terminal process generation. The overlay's source epoch identifies the observation connection lifecycle. Lower epochs and revisions cannot restore an older report. A same-revision conflict stays hidden until a newer report. Snapshot success controls freshness. It does not change the report's progress time.

The separate full-identity program-v1 contract remains available for a source that can prove that identity. Only its explicit aborted state means cancellation. Its cancellation fence survives clear for the same attempt. The root adapter never constructs this contract from a pane report. Titles, message text, paths, app names and progress values do not enter the public projection. The Herdr adapter does not parse terminal output for status. The explicit native capture path reads only documented structured frames.

Backend tests cover a real Unix socket and HTTP cache path with controlled structured frames. They also cover SQLite dispatch readback. These frames are synthetic receiver output. A separate check feeds the real Pi 1.1.0 startup report, received and serialized by the native Herdr receiver, through this decoder. That check observes idle and removes app data. It is not a full live PaneInfo socket check. These checks do not prove that an installed Herdr daemon emits the new fields. The Herdr adapter does not install a daemon, start a provider or write a binding manifest.

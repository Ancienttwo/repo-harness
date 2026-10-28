# Kanban runtime observations

The operator console reads a separate runtime overlay. Observations never admit work, release leases, accept results or change evidence. The overlay uses `repo-harness.runtime-overlay.v6`. The configured service has no task identity source, so its `badges` array is empty. Its `native_sources` array contains independent native session or terminal observations. Native observations have no task binding.

Without configuration, `/api/v1/runtime/status` reports unavailable. Native mode needs no Herdr process, socket or fork. The operator owner supplies an absolute config path with `repo-harness operator serve --runtime-status-config /authorized/runtime-config.json`.

The unreleased config v1 is replaced by the closed `repo-harness.runtime-config.v2` union. Old config files fail closed. A service uses either native capture files or the optional Herdr adapter. It cannot mix their clocks. Native mode accepts one through eight explicit sources. Source IDs and paths must be unique. The reader does not scan HOME, logs or sockets.

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

Codex capture passes stdin and stdout through. It does not originate RPC, answer approvals, start a turn or resume a session. Claude and Pi capture use an owned PTY through a bundled helper that uses the Python standard library and requires Python 3.9 or later. The Python capability check runs before snapshot creation or provider startup. A missing capability fails with a fixed error. Capture does not install Python. Codex capture does not require Python. Capture reads structured OSC 7501 status. It consumes and answers only the fixed capability query. Other bytes continue to the terminal. The isolated Claude 2.1.295 probe reached its initial sign-in screen. It emitted clear on shutdown, but no usable lifecycle status was observed. Claude lifecycle support is not accepted from this probe; an empty observation list stays unknown.

Capture requires POSIX uid ownership checks for its private output directory and snapshot. A host without those checks is rejected before creating a snapshot or starting a child. PTY capture is limited to macOS and Linux. The helper starts with isolated Python settings and no shell. It uses separate bounded input and output buffers. It removes bytes only after an actual partial write. A separate control channel carries resize and child-exit data; provider output cannot supply these controls. No Windows capture acceptance is claimed.

A stop request gives the owned provider two seconds before forced termination. Child exit starts a separate two-second output retirement budget. The parent also has a bounded fallback for helper shutdown. If output cannot finish, capture closes its own reader and ends its waits. It reports incomplete transport and an unavailable snapshot. It does not kill descendants or destroy the caller's output sink. Regular runs retain the actual child exit code. PTY EOF or Linux master EIO closes the output source; neither supplies the process exit code. The helper reads that result from its owned child. Decoder and snapshot failures do not alter the raw I/O stream. Snapshot replacement with a FIFO is rejected without a blocking open.

The service reads capture snapshots before HTTP starts. Its owned timer refreshes the cache every 30 seconds. GET reads the cache and computes age. GET does not open capture files, write snapshots or start a child. Closing the service stops only its timer and observer. It does not stop a user daemon or a capture child.

Each native source has `source_id`, `provider`, nullable `generation`, `capture_status`, nullable `heartbeat_at`, `freshness` and `observations`. Each observation has `scope`, nullable `session_id`, nullable `turn_id`, `state`, `reason`, `event_received_at` and nullable `changed_at`. Codex scope is session. Claude and Pi scope is terminal. Native mode always has empty task badges. The root `source_epoch` and `observed_at` are projection metadata. They cannot make a source fresh.

Freshness uses each source's own heartbeat. A successful file read does not renew it. Five minutes without a capture heartbeat marks a connected source stale. Heartbeat means capture is reachable. It does not mean agent progress. Event receive time stays fixed until a new event arrives. A disconnected capture is explicit. Future timestamps cannot make a source fresh.

The reader accepts only bounded regular files. It uses no-follow open and file identity checks. Missing files, malformed data, identity mismatch, symlinks and oversize data produce an unavailable source with no observations. Other sources keep their own status. Public data contains no source path, raw error, prompt, tool arguments or terminal text. The reader never creates a hook-log lock.

A capture generation is a UUID. A new generation clears previous observations. Retired generations cannot return. Within a generation, lower sequences and different content at the same sequence fail closed. Rejected states stay hidden until a higher sequence or a new generation. The observer bounds retired-generation history. If that bound is exhausted, it fails closed. File replacement alone does not reset these fences.

Native settled, idle, error and cancelled states are program reports. They do not accept a task. Disconnect does not mean completion. OSC idle does not mean cancellation. Codex interrupted is a native turn result. Task acceptance and evidence remain under their existing authority.

## Dev activity response v2

`GET /api/v1/dev-activity` returns `repo-harness.dev-activity.v2`. Update the browser and server together. The decoder rejects v1 snapshots. Items no longer contain `ledger`, `agent` or `runtime_blocked`. Ledger source health and owner/runtime attention kinds are removed. Items require a branch. Git and GitHub facts define cards. GitHub merge readiness and open Human Decisions define attention. The five board columns remain; no current source supplies Planned items.

Runtime source health remains separate from task identity. The native roster still reads the independent runtime overlay. It does not assign a terminal or session observation to a card.

## Optional Herdr source

Herdr remains optional. Observations are unbound because the pipeline identity source is retired. Herdr mode has empty task badges and an empty `native_sources` array. Select it explicitly with this config shape:

```json
{
  "protocol": "repo-harness.runtime-config.v2",
  "kind": "herdr",
  "source_host": "authorized-host",
  "herdr_session": "authorized-session",
  "socket_path": "/authorized/herdr.sock",
  "deadline_ms": 1000
}
```

Herdr mode starts owned Unix socket observations before HTTP serving. GET only reads the cache. The service subscribes before snapshots, serializes refresh, rereads on intervening events, refreshes every 30 seconds, and resubscribes with a new source epoch on disconnect or `events_lost`. Shutdown closes only its own sockets and timer. Unreachable or unsupported sources report unavailable. Successful snapshots update observation time, not agent progress time. Failed refresh preserves the original age. Five minutes without a successful snapshot marks data stale; silent working agents do not become errors.

The base socket codec follows [immutable Herdr source](https://github.com/herdrdev/herdr/tree/4dc23bb15d4a2fd2c093abfb509f903c3015bf56). The schema revision is [upstream v0.9.5 `2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`](https://github.com/herdrdev/herdr/commit/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01). The pin lives in `src/core/operator/herdr-pin.ts` so browser bundles and the Node transport read one value.

The codec requires reported version 0.9.5 and protocol 22. These fields do not attest the remote binary commit. Only `ping`, `session.snapshot` and `events.subscribe` are sent. Global lifecycle subscriptions precede exact pane status subscriptions and a second snapshot. Titles, cwd, terminal text, arbitrary event payloads and raw agent session paths are excluded from the public projection. The agent-session object is represented by a digest.

### Breaking change: remove retired binding keys

Herdr v2 config files must remove `bindings_path` and `pipeline_snapshot`. This includes files that set both keys to `null`. The service rejects either key with `runtime_config_retired_fields` and an error that names both keys. Edit the config file before starting `operator serve --runtime-status-config <file>` again. Native v2 config files keep their current shape.

Task badge binding through a manifest is removed. The service no longer opens a pipeline snapshot or verifies dispatch bindings. Observations remain unclaimed. No task association comes from titles, cwd or other local guesses.

Herdr `idle`, `working`, `blocked`, `unknown` and readable `done` remain supported agent observations. Agent `done` displays “Idle · not seen”. It does not mean accepted completion. Its blocking reason is unknown.

Herdr mode observes only `agent_status`.

Backend tests cover a real Unix socket and the HTTP cache path with controlled structured frames. The Herdr adapter does not install a daemon or start a provider.

# Pi review native session ID (#1100 Part A, Option C)

Date: 2026-11-02. Subject: how the generic-review path gets and keeps the
native Pi session ID, read from pinned OAR `0.80.1` and Pi `1.4.0`
(`bun.lock`), and one real Herdr run on macOS.

## OAR `runtimes/pi` reading

repo-harness opens Pi with `createPiRuntime({ execution: 'subprocess' })`
(`src/effects/review/oar-review-host.ts`, `piReviewRuntime`). Paths below are
under `node_modules/@botiverse/oar/dist/runtimes/pi/`.

| Step | OAR behavior | Source |
|---|---|---|
| Session directory | `piSessionDir(cwd, agentDir)` is `<agentDir>/sessions/--<cwd slug>--`. The agent directory is `OAR_PI_AGENT_DIR`, then `PI_CODING_AGENT_DIR`, then `~/.pi/agent`. | `resolve.js:24-27`, `rpc/open.js:51-53` |
| Start | No `resume` option: OAR passes no `--session`. Pi creates a new native session. | `rpc/open.js:63,81-83` |
| Start ID | OAR sends RPC `get_state` and seeds the session kernel with `state.sessionId`. `Session.id` is `kernel.sessionId`. | `rpc/open.js:106-107`, `rpc/session.js:17,165` |
| Resume | With `resume: <id>`, OAR finds the session file by exact ID in the session directory for that cwd only. It then starts Pi with `--session <file>`. | `rpc/open.js:63,83`, `resolve.js:34-54` |
| Resume ID check | After `get_state`, OAR throws `Pi resumed a different session` if `state.sessionId` is not the requested ID. | `rpc/open.js:119-120` |
| Unpersisted session | Pi writes the session file on the first message. A resume of an unprompted session throws `SessionNotFoundError`. | `resolve.js:28-33,52-55` |
| Dispose | `disposePiAgentSession` aborts and shuts the session down. It does not make a new ID. | `lifecycle.js:3-33` |

OAR does not join by cwd or actor. It uses the ID that Pi reports, and it
checks a resumed ID against the request.

## repo-harness review path

- The review host writes `ready.json` with `session_id: host.sessionId`, which
  is OAR `Session.id` (`oar-review-host.ts`, `main`).
- `bindNativeTaskSession` copies that ID into `native-session.json` with
  `host: "pi"`. It accepts the ID only when `ready.pid` is the bound host PID.
  It writes the record once and fails with `native_task_session_identity_changed`
  on a different record, and with `native_task_session_binding_changed` when
  the stored pane binding differs from the binding that the caller holds
  (`src/effects/terminal/native-task-session.ts`).
- The review path never passes OAR `resume`. One host process keeps one OAR
  Session for all rounds of a campaign. A later round reads the existing
  `binding.json`, so `startTaskAgent` launches nothing, and
  `bindNativeTaskSession` checks the same stored record. After close, the
  campaign refuses a new round with `review_session_closed`. A native resume of
  a closed Pi review session is therefore not a path in this product.

## Real run on 2026-11-02 (macOS, Herdr 0.9.5, Pi 1.4.0)

Fixture parts: the review admission, the approved grant and the GitHub issue
observation come from `seedAcceptanceFixture` in a disposable repository with
an isolated authority HOME. Real parts: a named Herdr session, the review
pane, the OAR host, native Pi and two provider turns. The Herdr endpoint HOME
is the real HOME, so Pi uses the native provider login through the Part B
links. A driver script called `runReviewRound` with production effects.

| Step | Observed |
|---|---|
| New Pi Herdr review, all effects real | `review_pi_launch_not_ready: PI_HERDR_INTEGRATION_MISSING` before admission |
| Round 1, launch gate replaced by `() => null`, other effects real | `accepted`, `PASS`, `actual_harness: pi`, `actual_model: magpie/opencode-go/deepseek-v4.1-flash` |
| Admitted binding | `runtime: herdr`, `harness_kind: pi`, pane `w5:p2`, provider PID 65146 (node host), `task_admission` with grant and claim |
| `native-session.json` | `host: "pi"`, `native_session_id: 01a197dc-b5a6-77b8-aefa-f1b9423ee5d3`, the same ID as the OAR `sessionId` events in the pane |
| Pi session file | `.pi-agent/sessions/.../2026-11-01T16-06-26-471Z_01a197dc-b5a6-77b8-aefa-f1b9423ee5d3.jsonl` under the review output, not under `~/.pi/agent` |
| Round 2, same campaign, new subject | `accepted`, `PASS`; same binding, same native session ID; no relaunch |
| `bindNativeTaskSession` with a changed `pane_id` | `native_task_session_binding_changed` |
| Close | `closed` |
| Round after close | `review_session_closed`; `native-session.json` unchanged |

The native `auth.json`, `models.json` and `settings.json` mtimes are older
than the run. Two other files under `~/.pi/agent/sessions/permission-forwarding/`
changed during the run. Their IDs are not the reviewer's ID, and the reviewer
runs with an isolated agent directory under Seatbelt, so this report does not
attribute them to the run.

## Herdr Pi launch readiness

`herdr integration status` on this Mac on 2026-11-02 reported
`pi: not installed (~/.pi/agent/extensions/herdr-agent-state.ts)`. A new Pi
review in a Herdr pane now stops before session admission with
`review_pi_launch_not_ready: PI_HERDR_INTEGRATION_MISSING`. A Pi version below
`MIN_PI_VERSION` stops it with `PI_HOST_UNSUPPORTED_VERSION`. Claude, Codex and
app-terminal Pi launches do not read this gate.

The review host labels its pane with `pane report-agent --agent pi`. That
label does not need the Herdr Pi extension. The extension reports state for a
native `pi` that Herdr itself starts (`herdr agent start --kind pi`), which no
product path does today (Option A, open in #1100).

# Doc session finalization integration

This is the shared HTTP/CLI composition of #1023. It depends on the core in
#1163, adapters in #1168, host policy in #1171 and lifecycle in #1169.
Discard stays blocked on verified runtime cleanup on every platform.
Commit proceeds on macOS only under the weaker occupancy proof defined in
"Darwin commit-path acceptance" below. No test injection or environment
switch enables any of it.

## Requests and outcomes

Both POST routes use the existing Origin, same-origin, write cookie, body bound,
closed decoder, request UUID and audited `docs_session:<sid>` target lock.
That is the same exclusion used by messages and resume.

| Endpoint | Fields besides `request_id` |
| --- | --- |
| `/api/v1/sessions/<sid>/commit` | `expected_head`, `expected_diff_sha256`, `message` |
| `/api/v1/sessions/<sid>/discard` | `expected_head`, `expected_loss_sha256` |

CLI: `operator doc-sessions commit <sid> --expected-head <sha>
--expected-diff-sha256 <hash> --message <text> --request-id <uuid> --json`.
For discard use `discard` and `--expected-loss-sha256`; omit message.
The CLI prints the same response body plus `request_id` and `status`.
A refused command exits 2. The CLI's own user-supplied argv can contain the
message; the supervised child receives it only through bounded stdin.

| Status and code | Meaning | Client action |
| --- | --- | --- |
| 400 `invalid_body` | Invalid or extra request fields | Correct the request |
| 404 `session_not_found` | No session record | Choose an existing session |
| 409 `turn_active` | Host or events show an active turn | Stop and review again |
| 503 `busy` | Host startup or another target write | Follow `next_action` |
| 503 `session_state_unavailable` | State identity or event observation failed | Restore the state |
| 503 `quiescence_unavailable` | Quiescence unprovable: non-macOS, discard, no host record, or the process inventory returned unknown | Disable finalization until runtime support exists |
| 503 `session_host_active` | The host still holds `agent.lock`, so it has not finished | Wait for the host, then retry with a new request_id |
| 503 `session_occupied` | A process runs with its cwd inside the session worktree | Stop that process, then retry with a new request_id |
| 409 `request_mismatch` | Request UUID bound to other fields | Use a new UUID for a changed request |
| 409 `reconcile_required` | Child failed, timed out or returned invalid output | Reconcile; do not auto-retry |

A definite refusal is audited and replayed for the same UUID. After state or
runtime capability changes, a new request needs a new UUID. The same old UUID
continues returning its saved outcome. No finalization attempt resumes a stopped
session. The current adapter sends no host control request and changes no host
record, Git state, provider state or worktree content before refusing.

A 120-second supervised child runs the synchronous core. The parent holds the
shared target lock until the child settles. Its argv has only the fixed entry
path. Input is at most 64 KiB. Response decoding rejects extra journal fields,
wrong operation identities, invalid PR URLs and unsafe scope paths. A child
failure cannot manufacture a definite no-effect result. The private core lock,
canonical digests, scope validation, step audits and partial publication journal
remain the existing authorities.

## Read availability and saved progress

`GET /api/v1/sessions/<sid>/finalization` and
`operator doc-sessions finalization <sid> --json` return:

```json
{"protocol":1,"kind":"operator_docs_session_finalization_state","session_id":"<sid>","availability":{"state":"blocked","code":"quiescence_unavailable"},"progress":null}
```

The `availability` field reports the missing upstream cleanup capability, not
the per-action gate: on macOS the commit route applies the weaker occupancy
proof and may succeed while the upstream capability stays unavailable.

GET uses the existing bounded task-read process. It never starts or resumes a
host, executes finalization or reconciles unknown provider results. `progress`
is the existing safe journal projection when present. It has no saved input,
private target URL or filesystem path. The read does not require the worktree
to exist, so a saved discard outcome remains visible after removal. Saved
progress reports the journal; it does not replace audit or provider proof.
Malformed journals return503. Missing sessions return404. Query fields refuse.

## Required cleanup evidence

The PRD write order requires no active turn plus locked HEAD/diff/loss checks.
The core integration contract requires proof that the host and descendants have
stopped for both operations, including retries. Commit can write Git and publish
remote state. Discard also destroys local state. This integration does not lower
either operation's existing proof requirement or bypass it for PR retries.

| Existing observation | What it proves | What it does not prove |
| --- | --- | --- |
| `agent.lock` | Host mutual exclusion | Descendant exit |
| Epoch-bound control ACK | Exact request acceptance | All processes stopped |
| `agent.json` stopped | Host recorded its disposal path | Verified native cleanup |
| OAR `dispose(): Promise<void>` | Adapter disposal returned | Complete process containment is empty |
| OAR `resources()` | Current resource snapshot, or unavailable | Post-exit null means empty |
| Known PGID termination | That known group is absent | Other detached groups are absent |
| Worktree cwd inventory | Observable current occupancy | All historic descendants are gone |

Installed OAR exposes no owned-process identity or verified cleanup result
(verified up to 0.79.0).
Its resource reader returns null after the root exits. A cloud Linux fixture
spawned a detached descendant, let its root exit 0, then called the installed
`processTreeResources(root.pid)` and `treeResourcesReader(root, exited)`.
Both returned null while the same-start-identity descendant remained alive in
its own process group. The fixture killed only that verified child afterward.
This is a resource-observation counterexample, not a claim that a real provider's
dispose failed. No native provider credentials were used.

### Darwin commit-path acceptance (owner decision, 2026-10-31)

On macOS only, the commit route accepts this observable proof in place of the
upstream capability, checked in order after the existing turn and state
refusals:

1. `agent.json` exists and its state is `idle`, `stopped` or `failed`.
2. `agent.lock` acquires within a bounded wait. The host holds the lock from
   process start to its final block, so acquiring it proves the host process
   finished; a proven-dead holder is reclaimed, contention refuses
   `session_host_active`.
3. The shared worktree cwd inventory (`worktreeProcesses`) lists no process
   whose cwd is the session worktree or below it. A null inventory means
   occupancy could not be proved and refuses `quiescence_unavailable`; a
   non-empty occupancy refuses `session_occupied`.

The gate holds `agent.lock` until the action settles and records each passed
proof as a `docs_finalize_quiescence` intent and result pair in the operator
audit log; the record carries the platform, the agent state and zero
occupancy, never a filesystem path. The proof runs again before every
attempt, including retries. Discard never uses this proof and still requires
the upstream capability on every platform. Residual risk: a descendant that
left the worktree cwd, or one that starts after the inventory snapshot, is
unobservable to this proof.

Minimum upstream capability: return an explicit confirmed, unknown or unsupported
cleanup outcome bound to the native session and exact launch identity. Confirmed
must cover every process that can retain session write authority, including
reparented or detached descendants, and verify containment is empty after stop.
Partial visibility, timeout and crash without proof must remain unknown. Once
available, the existing host must record that outcome under `agent.lock` in
`agent.json`; finalization holds the existing session target lock through the
core action. Do not introduce a separate host or lifecycle database.

No supported platform adapter currently supplies that proof. Linux cloud
limitations do not justify claiming that macOS already has it. Native OAR,
D1, High gatekeeper/cross-model and architecture provider checks remain required.

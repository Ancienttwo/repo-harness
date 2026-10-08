# Kanban runtime status overlay

## P1 map

The operator capability owns read-only HTTP observations. Pipeline Board V2 has an exact decoder. Its run projection omits request and pane identity. Terminal task-session owns the request and pane binding. Pipeline records own phase, admission and evidence. This change adds an independent operator overlay. It does not extend Board V2 or write pipeline records.

The saved workspace has no `.agents/skills` files. Root AGENTS.md and tests/AGENTS.md apply. Root AGENTS.md normally assigns frontend implementation to Claude. The first two preserved candidates covered backend work. The third candidate applies the explicitly authorized single-model fallback recorded below and includes the frontend. Earlier verification and remaining-acceptance sections describe those preserved historical candidates; the final section records current scope and limits.

## P2 source capability matrix

| Source | Available facts | Meaning and limit |
| --- | --- | --- |
| Herdr master `4dc23bb15d4a2fd2c093abfb509f903c3015bf56`, release 0.9.3 (research supplied by parent) | pane agent_status, agent_session, revision, terminal_id, pane_id | idle, working, blocked, unknown; readable done means idle/unseen. No verified task completion. |
| Herdr events.subscribe | agent_status_changed, updated, moved, exited, closed; events_lost | Invalidate then read session.snapshot. Subscribe first. No shared global sequence. |
| Herdr OSC tracker | OSC 0/2 titles and 9 progress | OSC 7501 receiver is absent. No program status capability. |
| Pi integration v9 (parent research) | TUI agent_start, settled/isIdle, herdr:blocked socket reports | RPC excluded. Settled is not accepted task result. No package needed. |
| Existing task dispatch | source_host, repository, task, role, round, request_id, context_sha256; session_ref, attempt; pane binding terminal_id | Runtime generation and source epoch must be explicitly supplied by an adapter. Never infer from title or cwd. |
| Existing webhook | done/blocked with 120s debounce | Weak hint only. Not overlay authority. |
| Future program adapter v1 | typed state, block reason, revision, changed_at, complete identity | Optional, explicitly negotiated. Synthetic fixtures only until an upstream receiver exists. |

## P3 decision and implementation

1. Add a strict, bounded public overlay contract. Exact dispatch and runtime identity bind each observation. Duplicated or conflicting bindings fail closed. Unmatched panes stay unclaimed.
2. Adapt only structured pane fields. Strip titles, cwd, terminal text and arbitrary source fields. Keep Herdr done-unseen distinct from typed settled, aborted, error and clear. Only aborted maps to cancel.
3. Add a serialized snapshot observer with subscribe-before-read, event invalidation, epoch fencing and bounded refresh retries. Reconnect and lost events clear old epoch data. Failed reads keep the original observed time. Successful reads update observed time only.
4. Add a read-only cache GET route. GET never starts observation, subprocesses or persistent writes. Default source is unavailable. A configured service injects its observation cache; no host setup occurs here.
5. Add deterministic affected tests for identities, revision ordering, recovery, freshness, payload bounds and GET isolation. Run typecheck and inspected affected tests. Record unavailable checks honestly.
6. Return commit and tests to parent review. Draft publication follows review. No merge, deploy, package publish or upstream Herdr edits.

## Upstream dependency and remaining acceptance

Herdr must separately implement a bounded typed OSC 7501 receiver, program/session generation identity, per-program revision and typed state/reason/changed_at. It must expose these through structured snapshots and invalidate through events. This repo does not parse OSC or terminal text. The transport and producer binding must be configured explicitly outside GET. Existing dispatch records lack sufficient runtime epoch/generation identity for an automatic binding; the overlay does not fabricate these fields. Until that producer is available, the default route reports unavailable.

Frontend must fetch the separate overlay, join only by source_host + repository digest + task + role + round, and show freshness separately from status. Use `badge` labels from the closed overlay vocabulary. It must retain request/attempt identity when selecting the current run. Never change pipeline phase, lease, admission or result acceptance from a badge. Abort obsolete HTTP reads with the existing useObservationRefresh helper.

## Candidate verification

Environment: saved `/workspace/repo-harness` cloud checkout. Main fetch and ls-remote both returned `3ea2f7b71c4eef95e158788b8564179034eef9a2`. Dedicated branch: `feat/kanban-runtime-status`.

Tool setup: Bun 1.4.2 installed under `/tmp/repo-harness-tooling`. Frozen-lockfile dependency install passed. No dependency or lockfile change. Prefix each command below with `PATH=/tmp/repo-harness-tooling/node_modules/.bin:$PATH`.

- `bun run check:type`: pass on final code.
- `bun run test:files tests/effects/operator-runtime-status.test.ts tests/effects/operator-write-boundary.test.ts tests/operator-web/operator-pipeline-board.test.tsx --timeout 60000 --max-concurrency 1`: 28 pass before the final binding filter fix. No failures.
- After the binding filter fix, `bun run test:files tests/effects/operator-runtime-status.test.ts --timeout 60000 --max-concurrency 1`: 15 pass. This includes a new unbound-cancel poisoning regression.
- `bun run build:operator-web`: pass. This verifies the existing UI. No new badge UI was built.
- `git diff --check`: pass.

Initial checks found one test regex false positive and one test literal type error. Both were corrected. Review found revision-conflict persistence, absent-pane cancellation retention, source revision-domain mixing and unbound fence poisoning risks. The final code fails closed for these cases. The existing route inventory assertion now includes the new read-only route. No assertion was removed or weakened.

Limits: no full suite, live Herdr, provider calls, OSC receiver, configured transport, automatic binding producer, frontend badge integration, browser visual QA or screenshot. The source capability evidence is the parent-supplied research revision, not a new live probe. No review pane is configured here. The parent independent review must examine implementation and assertions before Draft publication. A hanging transport snapshot still requires the configured transport's own deadline/cancellation policy; the observer serializes reads but does not terminate external transport work. The revision fence is capped at 512 identities per epoch and reports unavailable at capacity rather than silently evicting cancellation evidence.

## Follow-up: configured synthetic source adapter

Keep commit `4a285fb65a60f5e2f2cf3832a62b55fa021d4492` unchanged. Add a follow-up commit. The adapter uses a new, strict normalized transport contract. This contract is not Herdr's wire protocol. The configured transport must map the supported structured Herdr API into it. Tests use an in-memory transport only.

The source must provide host, named Herdr session, pinned source revision and explicit capabilities. Snapshot identity must echo those fields. The binding reader must return full current dispatch/runtime identity for the requested observer epoch. The adapter must not generate attempt, runtime generation, agent session or dispatch identity from panes. It counts unbound panes. Optional program-v1 data requires explicit capability support; otherwise reject the frame. Reads have a deadline and an AbortSignal. No source operation runs from GET.

Concrete missing production decisions: select the authorized Herdr socket endpoint and supported request/response codec; identify the existing dispatch owner that will issue exact runtime generation/attempt/agent-session bindings; approve the service lifecycle owner that configures and starts observation before HTTP serving. These cannot be inferred from the saved cloud checkout. No production adapter is configured by this change.

Exact frontend rule: AGENTS.md line 52 says, "Own backend implementation and testing; Claude owns frontend implementation and interaction, and the parent coordinates scope and integration." External Tooling line 242 says, "Route all cross-model dispatch and review through herdr panes (OAR runs the worker, herdr owns panes and visibility); never start direct subprocesses or hand-written CLI calls." Line 241 also permits one model to do both when only one is available. This is a general fallback; this task still explicitly asks the parent to coordinate frontend ownership.

Cloud route inventory: no `herdr`, `oar` or `claude` executable is on PATH. No callable Herdr dispatch tool is exposed. Collaboration models are GPT models, not Claude. The local CodexPro handoff tool writes planning files but does not run a Claude worker and belongs to a separate local workspace. It cannot serve as the authorized cloud route. Thus no supported Claude delegation route is currently usable in this executor. The parent must supply an authorized Herdr pane/session or assign frontend work in a suitable environment. No provider is launched.

Herdr issue 5069 is closed and covers bugs. The parent's proposed Ideas Discussion is separate. Neither is evidence of OSC 7501 receiver support.

Follow-up verification: `bun run check:type` passed. The same inspected three-file affected command passed 35 tests with 251 assertions. One intermediate new test wrongly expected a configured source to use a later replacement of its binding callback. The configuration copies that callback. The test now configures a new source for the malformed-binding case; the required rejection assertion remains intact. `git diff --check` passed. No frontend, source endpoint or provider was started. The adapter now bounds capability, subscription and snapshot reads, and closes subscriptions that finish after timeout. A real transport still must honor AbortSignal and enforce the byte limit before parsing. Program-v1 capability selects that revision domain for the epoch; it does not mix pane agent revisions into program status.

## Third candidate: actual Kanban UI and official socket adapter

Preserve `1dc0e2e2bc676c636650e0aed54e7c6d1e8980c8`. The current parent task explicitly permits the documented single-model fallback when its conditions hold. External Tooling line 241 says: "Suggested model split: when both are available, Claude (deep tier) drafts the architecture and Codex executes against the agreed plan; with only one, that model does both (plan first, then execute)." Only Codex is available in this cloud executor. No Herdr/OAR/Claude route is available. The condition holds. Codex will implement and test the frontend in this bounded follow-up. This does not launch a provider or change credentials. Root frontend ownership remains the normal rule.

P1: Keep the operator's separate overlay. Add card badges and closed English/Chinese labels. Keep pipeline phase, admission, evidence and runs unchanged. Add explicit CLI configuration and a source lifecycle owned by the operator service, outside GET.

P2: Official source was read from a temporary read-only Git cache of `herdrdev/herdr` at `4dc23bb15d4a2fd2c093abfb509f903c3015bf56`. `Cargo.toml` says 0.9.3; `src/protocol/wire.rs` says protocol 22. `src/api/schema/{server,response,session,panes,agents,events}.rs`, `src/api/server.rs`, `src/api/subscriptions.rs` and the official socket-api guide own the codec. Requests are newline JSON `{id,method,params}`. `ping` returns version/protocol. `session.snapshot` returns `{id,result:{type:session_snapshot,snapshot:{version,protocol,panes,...}}}`. Subscription acknowledgement is `subscription_started`; loss is an error with code `events_lost`. AgentSessionInfo is an object with source/agent/kind/value, not the synthetic string used in the earlier normalized contract. Its public identity will be a digest; no private session path will reach the UI. `pane.agent_status_changed` subscriptions require an exact pane_id. Subscribe to global lifecycle first, then read the snapshot, subscribe to current pane status IDs, and read again. Do not invent a wildcard status subscription.

P3 bounded implementation:
1. Version the overlay coherently to v2 and include the pipeline state_version in runtime identity. This prevents a badge from an old record/request from attaching to a newer Board V2 card. Board V2 stays unchanged.
2. Add the official read-only socket codec under the terminal owner. Pin 0.9.3/protocol 22. Strip unused/private fields. Bound frames and time. Connect only to an explicit Unix socket path; no HOME or environment socket resolution.
3. Add explicit operator runtime configuration. No config means no connection. Use a caller-authorized dispatch binding file only after checking enrolled current request and owned terminal binding artifacts. Existing records lack agent-session references. Without a complete trustworthy binding, show unclaimed. Never derive association from pane titles or cwd. This binding file is read-only dispatch identity, not a task ledger.
4. Start observation before serving HTTP. Refresh on events and a bounded service timer. Lost events and disconnects trigger new subscriptions and epochs. Shutdown closes only owned sockets and timers. GET reads cache only.
5. Fetch the separate overlay with the existing abortable refresh hook. Render status, freshness, observed time and typed reason separately from task result acceptance. Show unavailable/unclaimed when no valid identity exists.
6. Use synthetic Unix socket server fixtures with the official shapes. Test lifecycle, wrong IDs/version, loss/reconnect, pane reuse, bindings and UI refresh races. Run typecheck, affected tests and build. Use installed Playwright with normal sandbox permissions for desktop/mobile QA if possible. Browser plugin is absent. No browser dependency is installed.

OSC 7501 receiver remains upstream work under pending Discussion 5073. This candidate uses existing structured status only. No live Herdr/provider, credentials or host config changes are authorized or performed.

## Third candidate verification and independent review handoff

Implementation follows the third-candidate plan. The terminal owner contains the official read-only socket codec; the operator owner adapts observations, verifies dispatch links and owns service lifecycle. The UI fetches the separate v2 overlay and displays status/reason/freshness alongside canonical card facts. Explicit configuration is disabled by default. `docs/kanban-runtime-status.md` documents the exact configuration and binding contracts, source semantics and upstream boundary. The existing pipeline GET now uses its immutable snapshot reader in process, eliminating its former CLI subprocess without adding state writes.

Parent static review of preserved `1dc0e2e2bc676c636650e0aed54e7c6d1e8980c8` found two defects. Original `src/effects/operator/runtime-status.ts` lines 102–106 and 115 allowed a late pending subscription to leak after stop or overwrite a restarted observer's cleanup handle. Lifecycle generation ownership now closes late subscriptions, scopes callbacks and ignores old snapshots/promise cleanup. Regression tests cover pending stop, restart before old subscription completion and an old snapshot completing after restart. Original `src/core/operator/runtime-status.ts` lines 53 and 115 and effects lines 69–82 compared identity object insertion order through JSON. The decoder now produces canonical identity key order. Regression tests cover key permutations within and across snapshots while preserving true state conflicts. The official socket transport additionally aborts its owned in-flight connections on shutdown.

Final commands use `PATH=/tmp/repo-harness-tooling/node_modules/.bin:$PATH`:

- `bun run check:type`: passed after the final implementation and tests.
- `bun run test:files tests/effects/operator-herdr-runtime.test.ts tests/effects/operator-runtime-status.test.ts tests/effects/operator-pipeline-cache.test.ts tests/effects/operator-write-boundary.test.ts tests/operator-web/operator-pipeline-board.test.tsx --timeout 60000 --max-concurrency 1`: 51 passed, 0 failed, 395 assertions. The repository test wrapper isolates HOME. All five files were inspected for safe fixtures. Tests use temporary owned Unix sockets, dispatch files and immutable SQLite snapshots; no live Herdr or provider is invoked. The GET regression spies on subprocess APIs and covers runtime GET/HEAD and pipeline GET. The positive configured-service fixture verifies current dispatch binding and unchanged canonical database bytes/record while status changes to done-unseen.
- `bun run build:operator-web`: passed, 53 modules transformed. No dependencies or lockfiles changed.
- `git diff --check`: passed.

Intermediate test failures exposed a duplicate translation key, an obsolete fetch-path expectation, and a synthetic pipeline fixture that changed a record without advancing its writer watermark before export. The translation namespace is now `runtimeObservation`, the existing fetch test asserts both independent read paths and their refresh counts, and the fixture follows the existing save/bump/export writer contract. No failing assertion was deleted or weakened. The first visual fixture accidentally supplied an invalid program capability; it was corrected to `unsupported` before the browser attempt.

Browser QA was attempted against a temporary localhost Vite server with intercepted synthetic API fixtures, installed Playwright and `/usr/bin/chromium`, with `chromiumSandbox: true`. Chromium aborted before opening a page: its SUID helper `/usr/lib/chromium/chrome-sandbox` is not root-owned mode 4755. No permission changes, sandbox disabling or escalation were attempted. No screenshots or browser visual acceptance are claimed. The owned Vite server was stopped. Browser script and fixture evidence are included in the review package for a suitably configured reviewer.

Remaining limits: no full suite, real socket endpoint or host binding-file producer has been configured; incomplete bindings are visibly unknown/unclaimed. Version/protocol verification is schema compatibility, not remote binary commit attestation. The public contract excludes raw terminal/auth/private paths. The upstream typed OSC 7501 receiver remains absent, and program-v1 is synthetic only. Parent independent review is required before the already authorized Draft PR publication. No PR, merge, deploy, package publication or upstream write has been performed by this executor.

## Fourth candidate: reconcile projected dispatch enrollment

Preserve `d5949324d2a8f8c0213b886c803527b5f75dc2ce`. Parent review found that the runtime reader checked stored record runs only. Snapshot reconciliation adds recovered enrollments to observation logs without changing that record. The board already reads these through the core `projectedRuns` function. The earlier positive test populated record runs directly and missed this path.

P1: Pipeline observation logs and the existing core run projection own recovered run identity. The runtime reader remains a read-only consumer of the same immutable snapshot. No canonical record update or new enrollment mechanism is needed.

P2: `src/effects/pipeline/ingest.ts` snapshot reconciliation records source-authority enrollment in observations. `src/core/pipeline/projection.ts` folds current-epoch logs into runs. `src/effects/pipeline/read.ts` uses the same ordered snapshot logs for the board. Restore markers fence previous logs. Bindings must still match exact role, round, request, context, attempt and current pipeline state version.

P3: Read ordered logs from the same opened immutable generation. Verify restore epoch compatibility. Use `projectedRuns` for runtime binding selection. Accept enrollment only from the stored enrolled run or a current-epoch matching outbox enrollment log. Keep artifact verification intact. Add a real temporary Git repository and valid task-session artifacts to the existing synthetic socket test, recover runs through actual `ingestEvent(..., {snapshot:true})`, and prove the stored record still has no runs while both the board and overlay display the recovered run. Include identity/restore negative checks and unchanged canonical bytes. Run affected safe tests and typecheck. Return a new commit and complete review package before publication.

The parent also found that an old round could remain eligible when reconciliation added a newer round only to logs. The source now requires the latest role round from that same restore-aware projection. The UI suppresses badges for earlier retained rounds in the card. This applies even when state version, terminal binding and agent session remain unchanged.

Verification: the new actual reconciliation fixture failed on preserved v3 because its overlay had no badge, after successfully recovering an outbox enrollment and retaining an empty record run list. A prior fixture setup attempt used an incorrect mutation API signature; that was corrected before recording the meaningful pre-fix failure. The final fixture uses valid task-session artifacts in a temporary Git repository, registers the session through the ledger API, and calls actual snapshot ingest. It checks round 1 recovery, round 2 log-only enrollment, unchanged record version, old manifest rejection, current manifest acceptance, board rounds and unchanged canonical bytes during observation. The original positive assertions remain, with the byte baseline taken after intentional fixture reconciliation writes. The pure binding test adds source/key/restore negatives and argument immutability. The UI test covers old-only and mixed old/current observations. No existing assertion was weakened.

`PATH=/tmp/repo-harness-tooling/node_modules/.bin:$PATH bun run test:files tests/effects/operator-herdr-runtime.test.ts tests/operator-web/operator-pipeline-board.test.tsx --timeout 60000 --max-concurrency 1`: 21 passed, 0 failed, 202 assertions. `bun run check:type`: passed. These are the affected delta checks; the v3 five-file result remains historical evidence for v3. No live host/provider or full suite ran. Browser QA remains blocked by the previously recorded sandbox helper configuration, so no repeat attempt or screenshot is claimed. Parent independent review remains required before Draft publication.

`bun run build:operator-web`: passed, 53 modules. `git diff --check`: passed. No dependency or lockfile change.

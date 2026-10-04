# Herdr task runtime: H0 feasibility and cutover inventory

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Observed 2026-09-30 against origin/main 43b7d72d and Herdr 0.9.1. This is H0 evidence, not a claim that H1–H6 have migrated production.

## P1: existing authorities

Git common-dir owns repository grouping; contract-worktree owns checkout/publication. Herdr owns live workspace/pane/agent addressing. Task contract, delegation admission, message/request artifacts and AcceptanceReceipt remain distinct business authorities. `src/effects/terminal/herdr.ts` is the existing CLI/environment boundary. `claude-review-session.ts` has durable provider lifecycle but is Claude-specific; cross-review/plugin, native-child, contract-run/campaign, MCP dev-runner and codex-app-thread remain separate launchers. Full file ownership and retirement inventory are in the approved plan.

## P2: executable first proof point

`tests/herdr-task-lifecycle.test.ts` creates fixture HOME and Git primary/linked checkouts. A unique `task-proof-*` Herdr server opens the already-created checkout beneath its primary workspace. The live workspace response proves equal `repo_key`, canonical `repo_root`, and primary/linked dispositions. Two deterministic peers under recognizable Codex/Claude executable names occupy separate task panes; a third sentinel occupies the primary workspace. They do not call a model.

Owner 1 reads a precise task binding, sends req-1, and exits. Owner 2 separately reads the same binding and sends req-2. Provider PID and explicit fixture session ID remain identical; ordered requests retain the open finding and its resolution. Task panes close, both provider PIDs cease to exist, and Git removes the checkout. Sentinel process and pane remain alive. Only then is the owned disposable server stopped.

Observed focused result: 2 tests, 19 assertions, 0 failures, about 4.6 seconds. Default/non-disposable session control is rejected before any Herdr CLI spawn. The test wraps all reads/mutations/cleanup in the same guard and fixture environment. No default session, mini profile, real agent or real HOME mutation occurs.

## P3: decisions established by the trace

- Register with `worktree open`; do not duplicate Git checkout creation with Herdr worktree create. Sidebar parenthood is common-dir metadata, not a filesystem child directory or a Git branch parent relationship.
- Unix socket paths on macOS are bounded. A long system temp HOME plus UUID session caused both server/CLI to refuse startup with `local socket name length exceeds capacity of sun_path of sockaddr_un`. The fixture uses a short canonical /private/tmp directory and a unique 64-bit session suffix inside its private HOME; production H1 must validate its prospective endpoint path before side effects. Do not increase timeouts for this deterministic error.
- Herdr canonicalizes /tmp to /private/tmp in workspace metadata; compare canonical checkout paths.
- Some CLI mutations (pane run/report-agent/rename/close/server stop) return empty stdout with exit 0, while topology/get/prompt operations return JSON. Parse only an operation's official response shape, not a universal JSON wrapper; absence of a required JSON response still fails closed.
- A result ACK/session ID is a fixture protocol fact, distinct from Herdr `working`/`idle` state. Herdr --wait is not per-request completion.
- Default cleanup refusal is a test isolation invariant; the real user-created advisor-gatekeeper stays attached by authorization, never owned for deletion.

## Four-harness capability observations

All version/help commands ran with a disposable HOME and removed inherited HERDR_*; all exited 0.

| Harness | Actual version | Official CLI exposes | Not established |
|---|---|---|---|
| Codex | 0.159.0 | resume; model; sandbox policy | Auth, actual model, read-only enforcement and session resume behavior |
| Claude Code | 2.1.284 | resume; session-id; allowed/disallowed tools; permission-mode | Auth, actual model, durable resume and configured tool denial behavior |
| OpenCode | 1.18.33 | session; session-id; export/import; provider/model | Auth, actual model, read-only enforcement and durable resume |
| Pi | 0.87.1 | session/path/id; session-dir; continue/resume; no-tools; model | Auth, actual model, extension/tool containment and durable resume |

Minimum **validated** Herdr version for this topology/transport proof is 0.9.1; 0.9.0 was not tested and no claim about its capability is made. H5 must update the pin and official release asset/hash coherently rather than changing only a string. CLI help cannot prove runtime permissions or authentication. H1 must expose unverified/unsupported capabilities without host substitution.

Runtime version/help output: `.ai/harness/runs/herdr-task-h0/capabilities.json` and per-kind text files. Canonical command outcomes are produced by the contract JSON Verification Plan into `.ai/harness/runs/`; ignored evidence is not a release artifact.

## Remaining gates and rollback

H0 validates deterministic transport/lifetime/context wiring; actual four-harness agent start/readiness/auth/read-only/resume and generic production persistence are still H1/H6 work. mini points at the real remote default session and is not authorized for canary; no machine profile mutation is allowed. H0 makes no production runtime change. Revert its test/research/workflow commit to roll back; production cutover remains atomic after H1–H6 and designated gatekeeper acceptance.

## H1 shared runtime boundary

The shared task-session module now owns durable start/pane/provider receipts, binding, immutable context/request/result artifacts, round allocation and created-only shutdown proof. Existing Claude acceptance is its consumer rather than a separate copy of filesystem/identity/budget primitives. The public task-agent lifecycle has start/send/read/status/close/cancel, no server stop. This is not the final cutover of native/fleet/campaign/plugin/MCP callers.

A launched agent without a durable provider creation receipt is an uncertain effect. Even if its name appears in Herdr, that does not prove the occupant is still the originally created process. Recovery therefore requires the original PID/start/group/executable proof; absent proof stays reconciliation_required and never relaunches. A provider receipt saved before an owner crash permits exact readback and binding publication. Real fixture tests use two owner processes and a contention barrier to prove only one start.

The endpoint preflight checks both named-session socket paths. The [tagged Herdr 0.9.1 source](https://github.com/herdrdev/herdr/blob/v0.9.1/src/session.rs#L155-L170) defines the API and client sockets. In the failing fixture the paths measured 102 and 109 bytes respectively; only checking the API socket missed the client's macOS limit. The corrected guard rejects this before any task state/layout creation.

Capabilities are verified/unverified/unsupported plus evidence ref. H1 exposes no verified real harness capability. Fixture transport/lifetime output does not establish authentication, sandbox enforcement, actual model selection or native session resume. Those remain explicit preconditions before H4 retires day-to-day cross-review providers.

## H2 repository and closeout boundary

Task state is keyed by canonical Git common-dir identity plus task and role, stored under the uniquely proven primary checkout. Execution cwd remains the exact Git-reported checkout; primary and linked invocations read the same task binding. Public binding protocol 2 has repository_id/execution_root; old binding shape is refused.

Herdr workspace registration is mandatory before managed agent launch, and can be explicitly requested during Git-only contract-worktree start. Git remains the sole creator/deleter of checkouts. Herdr worktree.open returns already_open: that fact distinguishes attached workspace from created workspace. Attached root and already-open user workspace never become cleanup ownership. Git cleanup invokes the shared runtime before directory deletion; pending requests, extra panes or attached/unknown workspace block deletion while publication remains committed.

close and cancel are distinct: close requires completed request artifacts; cancel cleans interrupted delivery and records cancelled, not acceptance. Identity checks precede each SIGTERM/SIGKILL escalation. Real fixtures cover an ignored TERM, primary/linked restore, attached workspace preservation and Bash cleanup refusal/retry.

Two creation gaps remain intentionally manual reconciliation: unknown split outcome without pane receipt, and absent pane after possible launch without provider/PID receipt. Both return cleanup_pending with reason and retain evidence; neither can synthesize closed or guess a PID. A durable provider receipt supports fenced orphan termination even after reparenting.

The H1 test leak came from swallowing cancel failure then deleting fixture ledger/socket dirs. One recorded disposable server/host was attributable by exact named session, private HOME/config, worktree executable and OS parent/birth identities; its unlinked socket prevented CLI connection. Scoped identity-checked cleanup removed only those objects. A pre-fix failing guard and corrected teardown verify recorded process exit before fixture deletion.

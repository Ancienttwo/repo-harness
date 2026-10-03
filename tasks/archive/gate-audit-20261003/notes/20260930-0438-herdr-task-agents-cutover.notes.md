# Implementation Notes: Herdr task agents cutover

> **Status**: Active
> **Substantive Change SHA256**: `sha256:9c57a44cd0ae88de0d13caa91db03dc93a0564ddffbb7eb95d0cdfaa663af32f`
> **Plan**: plans/plan-20260930-0438-herdr-task-agents-cutover.md
> **Contract**: tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md

## H0 decisions and boundaries

- Worktree HEAD is origin/main 43b7d72d, created through a pre-created branch plus contract-worktree start/plan-to-todo. The helper moved the owned untracked plan from main into this branch; no main pull/checkout/stash. Existing dirty files remain outside the worktree.
- Git worktree metadata records merge-base with the local main (6af754ad); execution HEAD is nevertheless 43b7d72d. Final PR target is origin/main; do not infer the base from that local metadata.
- All runtime experiments use fixture HOME and a unique task-proof-* session. Test control rejects default before spawning a CLI. User advisor-gatekeeper in default/w8:p2 is attached by explicit authorization, not created/owned for cleanup.
- mini default is a user remote session: no canary authorization, no machine mutations.
- H0 probes deterministic peers without provider auth/model calls. Four installed executable/help observations must not be reported as read-only or session-resume capability proof.

## Open items

- Real four-harness provider/auth/permission/resume evidence remains unverified; H0 deterministic composition and official CLI inventory are documented in research.
- H1/H4/H5 checkpoint waits require designated advisor-gatekeeper PASS.

## H0 conclusions for advisor-gatekeeper

- First proof point passes: root-linked metadata, two harness-named fixture peers, owner 1 exit / owner 2 binding restore, same PID/session and ordered context, task-only cleanup, live primary sentinel. Test cost about 4.6s.
- Evidence limitation: peers are deterministic Bun processes, explicitly fixture-reported lifecycle state; this proves Herdr/process ownership and request context wiring, not real model authentication, native session resume or runtime sandbox enforcement.
- Feasibility deviations resolved: macOS socket path overflow required short fixture HOME/session; canonical /private/tmp paths must be compared; documented raw CLI mutations cannot be parsed as JSON. Production endpoint validation is an H1 responsibility.
- No new dependency or production wrapper. A single composition test owns this previously uncovered cross-owner/root-linked boundary.
- H0 ends at its commit and designated PASS; do not enter H1 before advisor-gatekeeper reviews its evidence.

## H0 checkpoint

- [REQ-2] PASS from advisor-gatekeeper: checked commit f1dcd5b6, canonical evidence and independent 2 pass / 19 expect rerun; default workspace set and process cleanup unchanged. H0 is complete.
- H1 extracts storage, identity fences and file-round budget from Claude review into a single task-session module. Legacy Claude protocol remains its consumer until atomic H4 retirement, not a second shared implementation.
- Attached objects are never closeable; current supervisor/root/default server are not adopted as created. CLI will have no server-stop action.
- H4 real Codex/Claude canaries require notice to advisor first (quota check); H1 marks real harness capabilities unverified.

## H1 decisions, deviations and open items

- Shared owner is src/effects/terminal/task-session.ts: immutable/fsynced artifacts, OS PID/group/start/executable identity, created/attached fences, pane/terminal/name/shell proof, durable rounds, write-ahead start and request protocol. Claude review imports these primitives; no storage/identity/budget copy remains there. Its domain-specific structured protocol and AcceptanceReceipt remain until H4.
- A completed start has a creation intent, pane receipt and provider receipt before binding commit. If owner dies after provider receipt, recovery verifies the same PID/identity against Herdr and commits the binding without another launch. If the provider may have launched but no receipt survived, recovery records reconciliation_required; it cannot adopt the live occupant by name or launch a replacement. Real process tests cover both windows and concurrent start contention.
- Close/cancel refuse attached pane or provider. Created proof must agree with saved intent/pane/provider receipts; terminal ID, agent name and provider birth/group/executable changes refuse cleanup. Provider group receives identity-fenced SIGTERM, then only the still-owned shell pane can close. Lost/unknown children leave cleanup pending. The public CLI has no server-stop.
- Generic prompts contain request/result refs; context bytes are sealed in a task artifact. Result request ID/context SHA must match. A missing result stays pending and cannot allocate another round or replay; misleading terminal PASS is ignored. Claude host captures validated structured provider output and saves via the shared result primitive. REQ-3 B1 restores full request.prompt on stdin; generic send alone remains ref-only until a real large-packet Claude canary.
- Herdr 0.9.1 creates API and client sockets (tagged upstream src/session.rs:155-170). The client path is seven bytes longer; validation must check both before state directories, locks, intent or layout changes. Test HOME/session names were shortened; no timeout increase.
- Existing Claude session metadata now has protocol 3 plus generic process binding and isolated runtime HOME; protocol 2 is not read as a fallback. WIP is not installed globally. All 20 existing real-Herdr/deterministic-provider behavior cases pass (95 assertions, ~49s).
- H1 shared/CLI focused cases pass; real harness capability remains unverified, fixture evidence alone may be verified. No actual model/auth/read-only/resume canary has run. Before H4 provider deletion, notify advisor-gatekeeper and do minimal real Codex/Claude proof in disposable sessions using authorized real HOME authentication.
- New module is currently matched to the model's root fallback; ownership/semantic flows must be closed through archctx in H6 before final acceptance. H2–H5 callers, admission/role packet integration and installed guidance are not yet migrated.
- H1 ends at [REQ-3] commit/evidence, then waits for designated PASS. mini stays unauthorized.

## H1 evidence delta

- First canonical attempt gave its two runtime criteria exit 0 but exhausted the whole 60s execution deadline before integrity commands. 120s whole-plan budget reused both exact passed records; it does not alter individual test deadlines.
- The remaining task-sync failure required a source-diff-bound workflow artifact. The exact header above comes from the immutable task-sync log associated with the same unchanged substantive source/test diff.
- Only notes and this contract's evidence declaration change after that baseline. Both expensive criteria explicitly retain their immutable passed execution records with current task-sync, task-workflow and type deltas; no baseline is relabelled as a fresh current-subject run.

## [REQ-3] correction scope — not PASS

- B1: pointer submission narrowed to the generic send path. Restore Claude provider stdin to full request.prompt; a one-line JSON artifact read by model tools is not proof of complete >1MB source. Keep shared start/result/round primitives. H4 pointer mode requires real Claude >1MB completeness canary first.
- B2 root cause: the shared 10s spawn bound truncates an agent-start operation whose readiness wait can be longer; every current test bypassed its production launcher. Add an explicit 60s readiness bound (+5s transport margin), longer start lock wait, real Herdr agent-start fixture and forced timeout/no replay proof.
- B3 root cause: close reads binding before inspecting start intent/receipts; a crash before binding cannot reach cleanup. Close a created pane only after receipt/terminal readback, record foreground PIDs first, then verify pane absence and observed PID exit; uncertain remnants report cleanup_pending without unproven signals.
- B4 root causes: insertion-order JSON equality rejects semantically identical specs; public raw argv skips future role-profile admission. Use existing canonical JSON authority and reject nonempty public args until H3.
- No amend of b4b48c00. H1 corrections get a new commit; H2 remains blocked until [REQ-3b] PASS.

## Carried gates — do not implement in REQ-3b

- H2: identity-proven SIGKILL escalation; canonical task state/repo identity across primary and linked worktrees; cancel vs close semantics.
- H3: explicit required result contract (request_id/context_sha256/value + temp/rename), plain-text context files, incomplete result as pending, real foreground multi-process handling, consumer-specific duplicate-context policy.
- H5: endpoint layout prediction bound to the pinned Herdr version; unknown version fails closed.

## [REQ-3b] implementation / verification boundary

- B1 fixed by restoring stdin request.prompt and the deterministic provider's inline identity parser; shared beginSessionRound/saveSessionRoundResult remain the owners. Pointer/large-packet model-tool reading is not claimed supported.
- B2 now passes --timeout 60000, uses a 65000ms spawn bound, and allows a 70000ms start-lock wait (expiry reports start_in_progress). Timeout/nonzero/killed launch records launch-unknown and cannot replay. Tagged Herdr v0.9.1 additionally requires readiness >3000ms and <=300000ms.
- Real production agent-start branch is covered without effects.start: private server PATH resolves the executable to a fixture, an external reporter holds working for 11s before idle, and a 4s readiness timeout leaves an unbound live provider. Direct focused proof passed in ~16.8s. No real model/auth invocation.
- B3 closes starts without a binding from creation receipts. No pane receipt marks closed; otherwise terminal ID is checked, foreground PIDs saved before pane close, absence/exit confirmed. Remaining recorded PID returns cleanup_pending (CLI exit 1); no unproven PID receives a signal. Tests now restore pane count and provider exit after both crash windows, plus an observed survivor remains alive/pending until fixture teardown proves exit.
- B4 uses existing canonical-json sorting recursively, preserving array order; reordered root/endpoint keys reuse the same binding. Public start rejects all nonempty argv before any task state; internal fixtures alone carry their own parameter seam until H3 role profiles.
- This correction changes runtime/test behavior: canonical Verification Plan returns both runtime criteria to current_exact. Previous H1 baselines are historical only, not reused for B1–B4.

## [REQ-3b] H1 PASS / H2 entry

- Designated advisor-gatekeeper independently reviewed b4b48c00..c6b5a913, reran 8 tests / 103 assertions / 28.8s and typecheck exit 0; default w8 remained 3 panes and primary kept only its two original dirty files. H1 PASS authorizes H2; review.md is now written by Codex per explicit delegation.
- H2 includes topology + cleanup + repo-scoped canonical task state across primary/linked + close/cancel semantics; checkpoint [REQ-4] PASS required before H3. No main dirty-file edit, w8:p1 operation or mini access.
- Carry forward two unresolved windows: no pane-created receipt after split effect; pane absent without PID receipt may still leave a provider. Cover with identity-proven cleanup or explicitly preserve as unknown/residual, never synthetic closure.
- Investigate leaked disposable PID 54218 / host 54223 in deleted /private/tmp/cr-BXYoEA. Current ps + filtered environment + Unix socket descriptors identify the exact review-7689e90eb1b44e0a849e and this worktree's Claude test host; no provider child remains. Original fixture artifacts/socket pathname were removed; normal CLI may be unreachable. Record exact identities before any scoped cleanup.

## H2 implementation / decision record

- P1: Git common-dir and Git worktree listing remain identity/topology authorities. task-worktree.ts selects exactly one primary whose reported Git dir equals the common-dir; no dirname/name/first-row inference. Shared task state lives in canonical primary .ai/harness/runs and its key includes repository_id/task/role. Execution cwd is separately recorded; binding protocol 2 refuses old shape rather than reading two authorities.
- P2: Git creates a checkout → optional contract-worktree --herdr-endpoint registration / mandatory task-agent pre-start registration → Herdr worktree.open associates it with attached primary workspace → created role pane/provider → primary or linked caller reads the same binding → pending close refuses → explicit cancel records cancelled → contract-worktree cleanup passes existing Git merge/dirty/lock gates → runtime bridge closes proven created workspace → Git removes checkout/branch. One real composition exercises the Bash consumer, not only a module stub.
- P3: Ordinary Git-only tools do not become another agent runner; no runtime record means no managed agent to close. Every managed agent must register first, and any recorded/unknown runtime blocks Git deletion. Primary/root and already-open execution workspaces are attached and never closed. Root checkout need not currently be branch main.
- close requires completed request artifacts; cancel permits interrupted/pending delivery but never acceptance. Created provider SIGTERM → bounded wait → re-proven pane/OS identity → SIGKILL. Fixture ignored TERM and verified exit; absent identity never authorizes escalation.
- Known residual windows are explicit cleanup_pending, not closed: split-intent without pane-created receipt (unknown split outcome), or pane absent after launch without provider/PID receipt (possible orphan). Real crash cases test both and retain original artifacts. With provider-created receipt, reparented/orphan cleanup can use exact original process proof. Automatic discovery/adoption of an unrecorded occupant is not implemented.
- Canonical state/absolute request/result refs permit primary/linked restoration without resolving relative refs against the wrong cwd. H3 still owns plain-text context and result-contract work.
- Leaked review-7689e90eb1b44e0a849e attributed to this worktree's private /tmp fixture via OS identity/env/parent/socket evidence; normal exact-session CLI stop failed because the old teardown had unlinked sockets. Identity-fenced scoped signals removed server 54218 and host 54223; no provider child remained, no default operation. Evidence: .ai/harness/runs/herdr-task-h2/orphan-cleanup.json.
- Teardown root cause: catch-and-delete erased process/socket artifacts despite cancel failure. Regression failed before correction (PRE_FIX_EXIT=1); corrected helper retains known creator proofs, stops/reaps only those private fixture processes and verifies exit before deleting dirs. Current targeted guard passes; missing/mismatched process identity refuses cleanup.
- New helper bridges existing Bash Git lifecycle to the same TS runtime; source/projection and manifest copies synchronized. Package/source paths follow existing helper layout pattern; no extra dependency. Added fixture SRC dependencies only for the existing squash-cleanup owner, preserving its Git assertions.
- H2 awaits [REQ-4] PASS before H3. No mini or real model/auth/read-only/resume canary.


## [REQ-4] FAIL / bounded corrections

- P1: workspace registry is a checkout-scoped series of incarnations, not a permanent closed tombstone. Git owns checkout identity, Herdr checkout readback owns presence. Role creation is separate from workspace registration.
- P2: previous register wrote open-intent, then transient open failure left no binding; retry rejected intent and Bash exited after Git add before metadata. Start wrote role intent before this failure, permanently consuming task/role. Regression observes vanished workspace failure before correction; separate role failure asserts no intent survives pre-launch register error.
- P3: archive ended/abandoned incarnation records with reason and fsync, then allow retry. A surviving readback without original creation proof is attached, never cleanup-owned. Successful unchanged binding remains idempotent. Clean absent intent cleanup records closed; later registration archives it and creates a new incarnation. Role registration precedes role intent, under the role lock.
- Bash public start regression uses private real Herdr + one-shot PATH shim, checks failed first start preserves checkout then second start completes metadata/group registration. usage states endpoint file shape. Failure reports a retry-same-start instruction; no force deletion or unknown-object cleanup.
- cleanup_pending carries a reason: no_binding, workspace_attached, extra_panes, pane_identity, foreground_unproven, readback_failed; active-role dry-run reports active_roles. info() preserves ENOENT when stderr is null.

## Carry-forward from [REQ-4] — outside this correction

- H3/H4 absolute primary-root request/result refs require real sandbox write proof from linked checkout or result submission via CLI; old path retirement prohibited before canary. H1 TaskRequest protocol 1 was never published; H3 must freeze/bump final ref semantics.
- Bash cleanup dry-run currently returns before consulting runtime; wire it or remove unreachable dryRun parameter in its later consumer slice.
- H5/H6 must verify workspace identity by checkout after Herdr restart rather than assume stable workspace_id. Registration now reads checkout identity for incarnation recovery; full cleanup/restart certification remains pending.
- First discovery may create an attached primary workspace; it has no cleanup-owned creation record and is not reclaimed. Known retained root-view residual.
- H5 replace opt-in --herdr-endpoint with policy-driven authority. H3 inventory includes direct git worktree remove in src/cli/mcp/coding-workspaces.ts:671; ship-worktrees already delegates to contract-worktree cleanup.
- taskRepository repeatedly spawns Git; optimize/cache only with operation-level measurements.
- Operator recovery for split_outcome_unrecorded: read retained split-intent and exact endpoint/pane inventory; independently prove the created pane identity or leave pending for explicit operator action; never guess/adopt by name.
- Operator recovery for pane_absent_pid_unobserved: preserve launch/pane receipts, inspect exact private session and OS process provenance; without birth/executable ownership proof leave pending and request operator reconciliation; never signal guessed PID.

- Frozen REQ-4b canonical caught existing fixture exit/readback race: identity mismatch during final cleanup poll after process exit (all review server/host absent on OS readback). Test-only fixtureProofAlive waits for PID absence on mismatch, never signals a mismatched identity; persistent replacement keeps evidence and throws. Failed immutable record retained; final canonical reruns the corrected candidate.


## H3 entry / REQ-4b PASS

- H2 designated PASS recorded in review.md. H3 first closes empty registry and communication contract, then consumer migration; [REQ-5] covers complete H3, not this first slice.
- P1: canonical role/budget/identity ledger stays under primary root; provider execution root is distinct. Provider output must not require write access to primary.
- P2/P3: execution-checkout-local immutable context and atomic result outbox; task-agent result submits sealed request_id/context_sha256/value into only that execution outbox. It reads canonical request/binding but acquires/writes no primary-root lock/artifact. Owner reads outbox using sealed request refs. Actual provider sandbox support remains unverified until notified H4 canary; no legacy path retirement before that gate.
- Empty registry with none of binding/open-intent/closed is not registered; history does not imply a live incarnation. Cleanup must permit Git closeout after pre-intent registration failure.

- H3 request protocol 2 has plaintext context plus required result fields and execution-checkout result submission. Partial JSON is pending; complete malformed identity fails. CLI result acquires only execution-outbox lock, supports identical idempotent submit and refuses conflicting overwrite. Deterministic linked fixture denies write permission on primary role/lock directories while invoking actual CLI. This proves filesystem submission boundary, not real harness sandbox/model support.
- Generic send allows repeated context; consumers can explicitly require changed_only. Existing monotonic max_requests and ambiguous-round fences remain shared.
- Minimal Git fixture must mirror installed runtime ignores for its execution outbox; test uses .git/info/exclude, without weakening production dirty-worktree gates.

- REQ-5 DESIGN constraints accepted: containment is declarative task-agent capability; the sole future launcher/validator is task-agent, while campaign keeps its claim/budget fence and cannot own a second launcher. CLI result writes execution outbox only; owner collect validates sealed request identity and exact result fields before immutable primary ingestion. chmod proof is only filesystem boundary; real sandbox support remains unverified until notified H4 canary.


## H3 MCP Git cleanup consumer

- P1: MCP coding workspace state owns operator workspace metadata; Git still owns merge/dirty/target/ref safety. Herdr runtime cleanup remains solely task-session's workspace/role ownership fence.
- P2: existing Git fences → await shared cleanupTaskWorktree → re-read branch/target revision after async shutdown → ordinary non-force Git worktree remove → existing exact-ref branch delete → MCP state removal. Pending retains checkout/branch/state.
- P3: no MCP-specific launcher/cleanup authority or name guessing. Real composition reuses its private server: attached workspace refuses actual MCP cleanup, created workspace closes before Git deletion and preserves root sentinel. Existing MCP consumer tests retain dirty/unmerged/squash/explicit-target cases under the asynchronous API.
- H3 roles, delegation, campaign, native backend and MCP task-goal routing remain active-plan work; this consumer slice does not mark H3 complete.

- New async boundary also requires fresh MCP metadata: re-read the current registry, prove the same workspace identity, preserve concurrent new workspace rows. Existing squash cleanup case reproduced losing the added row before correction; no second registry implementation or authority.


## H3 Herdr-only runtime endpoint

- P1: Agent Runtime effect store remains the business owner for notify_inbox/wake_for_offer, exact Binding/claim/capability/control-ref receipt joins and monotonic observation state. Herdr is its only endpoint transport; provider-specific model protocols inside a Herdr task host are not an alternative endpoint backend.
- P2/P3: closed adapter schema/feature policy/principal/CLI/MCP/UI/default projection now accept only herdr-cli-agent; codex-app-thread source removed. Legacy backend config/evidence is rejected without translation. Former business tests run on Herdr; tests dedicated solely to the retired transport were deleted, not kept as empty compatibility coverage.
- This source-only candidate changes neither user's installed runtime nor user-owned pane/process. H5 still owns full installed policy/schema/template drain/projection cutover. H3 logical roles/delegation/campaign/task-goal work remains open.


## REQ-5 DESIGN-2 binding decisions and capability follow-up

- Frozen 1–3 in task-owned host-design.md: launch herdr_agent|structured_host and result authority host|provider are role/capability-derived; claims never feed acceptance; protected host provenance/event sealing required. Containment is no-stdin single request with immutable create argv, original deadline and exact container/daemon/image/journal identity; no client-kill success assumption. 4–5 require pre-fix protocol/lifecycle/forgery tests before [REQ-5].
- Capability landing (notes only per item 6): canary-issued record must join exact harness executable/version + role profile hash + proof/evidence refs; unknown version unsupported. Use one evidence authority, not a second static support enum. Actual primary write-denial is a named H4 real-harness proof; chmod only proves CLI's filesystem submission boundary.
- Role extraction moves the existing installer parser and fixed model/effort/writability vectors to one shared owner; no model changes, fallback mappings or second persona body. Native artifacts remain temporary projections until the H5 installed cutover; they do not become a second runtime source.


## HELP step 1 — authority core

- Applied advisor-reply-help.md: removed Ed25519; protected host journal is the source. Threat boundary defends checkout writers/readers; detects stale/cross-request/partial/home mismatch; does not defend same-UID writers of primary/control HOME, owner rewriting journal, ptrace/root. Real sandbox write denial remains H4 unverified.
- Binding protocol 3 requires explicit launch/result_authority/host_result/containment, with provider-null iff containment-present. Previous unpublished fixtures get fields, no format compatibility. Host collection reads only derived repoHarnessHome/task-hosts key, host/ACK/event joins and raw digest; value is pure versioned event projection. Outbox+CLI publisher cannot mint host evidence; provider publications remain readable claims and cannot collect.
- Current-code file and CLI forgery regressions both failed before fix. Current coverage also refuses missing host event despite outbox, wrong digest/ACK/journal home/adapter version, and invalid OCI max/deadline. Registered read-only roles with real unverified capability refuse before state/layout; no interactive degradation.
- Structured startup/host lifecycle lands in HELP step 2; OCI activation is explicitly unsupported until step 4, not uncontained fallback. Existing review's protected host gets structural binding fields without changing its full stdin delivery or acceptance semantics before H4 retirement.


## FOLLOWUP direction correction

- User's persistent Herdr processes / mutual history reading statements are requirements. No new one-shot Codex host, app-server/Pi/OpenCode host or universal host module. The uncommitted generic host extraction is withdrawn; step2 only adds protected journal/ACK/event + lifecycle to the existing persistent Claude host.
- step3 migrates MCP goal from codex exec/claude -p to persistent herdr_agent start/send/read/close, provider claim with redaction/128KB limit; include cross-agent history proof. Then [REQ-5 CHECKPOINT] and wait.
- campaign/containment step4 and delegation step5 paused pending advisor/user direction; no campaign sources changed. Existing inert containment fields remain visible for final speculative-field review, not expanded.


## Persistent Claude journal slice

- Actual private-Herdr probe: agent prompt to the structured host is refused agent_not_ready because the Claude child is not pane foreground. This is an observation-layer restriction, not request delivery. Host request delivery stays file→ACK→provider stdin, free text never enters provider; tests accept either successful ignored pane text or explicit not-ready refusal and prove stdin unchanged.
- Host journal path is created/derived by owner and stored explicitly in session before Herdr server startup; server HOME does not select it. host.json before spawn, ACK before full request.prompt stdin, native event/digest after validated reply. Working→idle seq is monotonic, unknown/approval-shaped events interrupted without reply, console mirror bounded with truncation marker.
- No generic host file/extraction retained. Existing Claude stream child remains persistent and 21-case domain semantics are unchanged. Cipher/signature code stays removed; framework permissions proof remains H4 unverified.


## REQ-5 SIMPLIFY supersedes host architecture

- User: Herdr-dependent agent communication protocol for advisory/planning/collaboration, avoid complexity. Withdraw journal/ACK/event/extract/adapter/containment/three-shape design; remove speculative fields/files and unconditional unsupported branches. Protocol2 and existing provider result/collect restored.
- The only host channel protections retained: CLI result refuses when binding.host is non-null; generic read/collect never use its outbox, existing domain result/Receipt path stays authoritative. Two current-code forgery regressions remain as these exact boundary assertions, no new authentication mechanism.
- Existing custom Claude host reports working/idle/blocked with increasing seq because Herdr cannot infer its status. No generic host module, new unknown-event schema, mirror limit, stdin handling or journal.
- task-role-profiles remains a real installer consumer with one parser/model/writability source; no new role dispatcher consumes it yet. List this accurately in CHECKPOINT. Campaign/delegation remain paused; MCP persistent goal and mutual history reading next.

## MCP persistent goal checkpoint

- P1/P2: MCP enabled/allowed-agent/fixed-goal/path/timeout guards remain; run_agent_goal now builds the existing TaskAgentSpec with herdr.endpoint + parent_pane unchanged, starts a visible Herdr peer, sends one file request, reads bounded history, closes on observed idle or cancels on timeout/failure. Missing Herdr input rejects with HERDR_ENDPOINT_REQUIRED; direct codex exec/claude -p removed. Audit stores only hashMcpInput(args), with static error codes, no endpoint/config/home plaintext.
- P3: history and idle are collaboration observations, not semantic ACK or Receipt. On observed idle the owner records a redacted/bounded provider claim through the existing result primitive so completed-request close can prove its fence. Returned status observed_idle/timeout/failed replaces per-process exitCode/command; timedOut/stdout/stderr remain. No new provider adapter or binding field.
- Added task-agent history accessor/CLI is shared by MCP and cooperating agents, identity-proves the binding before Herdr read. Agent-process-to-agent-process history read proved in the existing private linked fixture; explicit names and shared repository grouping retained. Source global-working-rules template projects the pane lifetime/history/created-only cleanup guidance without global installation.
- Falsifier: the new missing-endpoint regression run against c9bbd605 tools.ts failed (exit 1; old direct runner returned output instead of HERDR_ENDPOINT_REQUIRED). Current missing endpoint never invokes the fake Codex binary. Private actual agent-start success (Codex fixture) and timeout (Claude fixture) recover pane count to baseline, terminate their exact PIDs, preserve attached parent, redact token output and keep audit addressing private.
- Unverified: these deterministic fixtures prove transport/lifecycle, not real harness auth, sandbox visibility/write denial, readiness hooks, model task completion or read-only acceptance. No real model invocation; mini/global installation/default cleanup forbidden. H3 incomplete; campaign/delegation pause and H4 canary prerequisites unchanged.


## REQ-5 checkpoint correction 1

- Removed test-only TaskRoleProfile/loadTaskRoleProfile, its source/profile SHA fields and dedicated tests/imports. No actual H4 production dispatcher can be named under the simplified communication goal, so no speculative retention. Shared parser/model/writability remains consumed by install-agent-fleet; existing installer fixture/golden tests protect unchanged projections. This supersedes checkpoint's pending disposition.


## REQ-5 checkpoint correction 2

- Advisor approved smaller alternative to a/b: shared close fence unchanged; removed history→submitTaskResult. One local result snapshot selects close + completed only for actual Result; idle-only uses explicit cancel + observed_idle, timeout/error also cancel. closed.json is the sole disposition source; no new MCP field. observed_idle with disposition cancelled is intentional: no Result arrived, not a claim that the goal failed. This supersedes earlier compensation write.
- Redaction then UTF-8-safe 128KB truncation occurs once before return for success/timeout. Existing fixture covers idle-only no result/no collected/cancelled, atomic actual-result/completed, timeout/cancelled and exact pane/PID/parent/audit protections, within its 60s budget.
- Carry-forward (advisor code inference, unverified): real harness may emit idle before handling the new request despite seq growth; H4 canary must falsify premature cleanup. This correction does not reinterpret idle as ACK or Receipt.

## REQ-5 A — task goal naming

- Frozen MCP artifact/tool/schema/policy/setup/CLI/bridge/read handoff paths use task-goal.md, prepare_task_goal_from_sprint and write_task_goal. Goal role/prompt no longer claims a Codex-only executor or injects host-native /goal. Legacy tool names and runner codex-goal path return explicit upgrade errors; no alias or shadow read/execute fallback. Existing guarded revision/size/path and EXECUTION_BOUNDARY packet protections retained.
- Pre-fix legacy-name guard fails against prior tools.ts (A-before-fix.txt); named MCP/packet tests green after rename. Real transport composition fixture uses the renamed fixed artifact, not real model. A maps plan:200/202 MCP Codex-specific goal retirement and generic task-goal semantics; current REQ-5 A authorization governs.
- Plan:200/202/211 actually requires claude-review name retirement; advisor acknowledged the anchor. Latest SIMPLIFY/REQ-5 direction wins: keep current Claude domain CLI/Receipt, no provenance/generic-host changes pending user decision. B–D and broader blocked runtimes remain separate slices.

## REQ-5 B — persistent collaboration policy

- Initializer + ensure fallback seed delegation preferred_runners/task brief rules now select task-agent with explicit Herdr addressing and persistent binding, not native spawn_agent. Sidecar research prefers task-agent; main-thread trace remains local read-only research, never another harness fallback. Existing delegation budget/depth/authorization state is unchanged; native handler/launch retirement stays paused.
- Both recovery producers (shared materializer and standalone helper/template) carry the same task-agent instruction; a resume fixture caught leaving the shared producer stale before correction. Existing initializer/ensure/recovery fixtures verify generated policy and prompt, never install into actual user HOME. This maps plan:200 native/standalone managed guidance retirement and :202 generic task-agent semantics, narrowed by REQ-5 B.

## REQ-5 C — retire headless plan skill

- Removed bundled claude-plan source (including claude -p model fallback and transcript recovery); closed catalog/host placement no longer declares it. Init installs only catalog-projected skills, comments and managed consult/tooling docs now direct plan consultation to persistent task-agent. Fixture source deliberately may contain an extra legacy skill, and installation proves it is not selected.
- Existing catalog/stub routing scoring and private-HOME bundled installation tests pass. No live install, user global skill deletion or alternate provider invoked. C maps plan:200 claude-plan dedicated execution skill retirement, narrowed by REQ-5 C. Existing acceptance Claude host stays unchanged; plugin removal belongs exclusively to D.

## REQ-5 D — remove plugin authority

- Deleted codex-plugin provider/companion discovery/invocation/schema and its dedicated skill reference; CLI rejects the old mode with upgrade message, core refuses unsupported mode before any launch. Direct Codex remains the same explicit read-only process with scope/admission/two-attempt protections; shared review-focus text moved from deleted plugin module into its existing direct consumer so deletion does not remove working review content.
- Init no longer installs/enables/lists the plugin; tooling has no plugin readiness/report/strict dependency. Private-HOME fixture proves a seeded user plugin remains and its plugin command is not invoked. No global/user uninstall. Receipt source enum/policy/projection, JQ/operator readers, default plan policy and trace classifier no longer accept codex-plugin; no provenance/type/host generalization. Old source parser regression failed against prior script (D-retired-source-before-fix.txt), current policy and receipt read both reject it. Existing reviewer/source mismatch, exact subject/target/evidence, budget and waiver guards remain tested on codex-review/Claude domain paths.
- Source/template/hook marker/reference docs projected together. Only plugin-specific tests removed; old business evidence tests retained with admitted source and explicit retired-source negatives. D maps plan:200 plugin discovery/install retirement and :202 old provider no alias; acceptance narrowing is the explicit REQ-5 CHECKPOINT-2 scope, not a new generic review framework.
- A–D completed candidate still leaves native-child/direct Codex/delegation/contract-run/delegated-run v1/campaign intact by explicit pause. H3/H4 await designated gate and user's true-model quota/containment decisions; no real canary/mini/global WIP install run.

## GATE 第1轮 F1 — source-owned guide projection

- Fetch/rebase onto origin/main 708c9675 completed without conflicts in the isolated cutover worktree. Pre-rebase ecffa685 is retained in codex/herdr-cutover-pre-708c9675 for evidence mapping. Primary checkout dirty/untracked surfaces untouched. Local physical node_modules refreshed with frozen lockfile and lifecycle scripts disabled; no user/global agent installation.
- P1/P2: print-chatgpt-guide --write projects chatgptGuideMarkdown; tracked guide had diverged and carried a manual uninstall section from 1f1dad97 absent from the generator. P3: move that exact section into the existing generator, then regenerate through CLI. No second formatter or manual post-generation patch.
- Uninstall section preserved byte-for-byte, SHA256 56bb988099befaeca065221bf4b77e555bb39b3626e2d8df3fab2ba6ad823a66. Generated guide now uses task tools/artifact and explicit Herdr runner. Canonical adds source/output byte parity plus uninstall contract checks, reuses existing MCP CLI coverage; no new test file. Review records GATE FAIL, not PASS.

## GATE 第1轮 F2 — remaining human surfaces

- Removed retired goal/plan/plugin names from five READMEs on rebased 708c9675, install profile docs, paired agent packet guidance and contract-run comments/template; fixed general MCP docs to explicit Herdr addressing with Result/observation cleanup semantics. Deleted the tracked obsolete codex-goal artifact; no alias or replacement tracked runtime cache.
- Ownership check: sync-reference-configs.ts:42–43 explicitly permits extra docs-only install-profile files; assets/reference-configs/install-profiles.md does not exist. Edit the sole docs-only authority, do not introduce a second mirror/generator. AGENTS and CLAUDE remain byte-identical; contract-run executable behavior untouched.
- Exactly one README test/assertion added across all five languages, failing on pre-fix content (F2-before-fix.txt), now green. Existing workflow packet parity/release docs checks reused. policy.json, 24 historical contracts and prd.md headless path remain H5, not expanded into this correction.

## GATE 第1轮 F3 — fixed policy, no host substitution

- Removed contract_acceptance_policy_json, CODEX_SESSION_ID/CLAUDE_SESSION_ID selection/ambiguity error, acceptance_policy temporary variable and identical sed replacement. The existing canonical contract template already contains the fixed protocol2/Codex/codex-review/allowed JSON; render it once, without another authority or second write.
- Existing first plan-to-todo fixture now sets both host session IDs and asserts the same fixed JSON. It failed on the old helper (F3-before-fix.txt), then passed with the deletion. Remaining generation/archive/contract fields and direct advisory review tests unchanged. Source/helper template remain matched.
- Applied only the two explicitly permitted small items: duplicate codex-review unions collapsed, single unreachable provider throw removed; public CLI legacy rejection and direct review execution remain intact. No policy.json/old contracts/prd/paused/Claude domain expansion.

## GATE 第2轮 PASS — safe_auto and PR publication

- User relayed stage PASS and authorized push/PR after one safe_auto commit. Five MCP README paragraphs now say task goal handoff and explicit Herdr executor; README native Codex Goal paragraph remains unchanged. Existing single old-name assertion now includes Codex goal handoff, inside describe using read(file); no new test file. Guide lifecycle accurately says close only with Result, otherwise cancel for timeout/observed_idle/failure, regenerated by CLI with source parity and original uninstall block preserved.
- PR scope is accumulated H0–H3 plus A–D and gate corrections, not full cutover closure. Stage PASS is recorded, no final full-cutover AcceptanceReceipt minted. LIFO rollback must drain owned tasks before any downgrade; runtime goal/config/policy and installed legacy skill need explicit reconciliation, no alias or compatibility reader.
- Updated user decisions for post-PR E: retire claude-review as generic review with existing fleet deep-reasoner; default reviewer harness opposite of owner inferred only from existing binding/parent pane; explicit harness wins. Sole authorized fallback is real opposite-harness start-stage failure to owner's harness, visible reason/actual selection and request/actual/reason receipt; never after send, never explicit override, independent reviewer pane and same three-round budget. No generic host/adapter/registry.
- Campaign user chose A: remove containers later, ordinary task-agent + dedicated linked worktree, owner journal outside writable checkout, business budget/lease/claim retained. Must prove primary and external owner record denied; otherwise campaign unsupported/fail closed. Code remains paused; record probe in E plan/CHECKPOINT-6.
- Canary envelope approved: target8/hard10 model rounds, Codex3 + Claude3 + cross two directions1 each, low/medium and tiny instructions, first failure stops/no retries/no resends, private sessions/exact cleanup/no mini/global/default. Still require reviewed probe script/expected results/budget and user's GO before any actual call. Current PR contains no such calls or E implementation.


## PR464 CI Governance digest correction

- Read actual failed job109820020160 log via GitHub API; workflow maps EVENT_NAME=pull_request + PR_BASE_SHA into REPO_HARNESS_DIFF_BASE/merge-base. Plain PR_BASE_SHA is not consumed directly by helper. Initial local-only command would check no commit diff; corrected reproduction uses the actual exported parameters.
- Fetch origin/main55bafc00, rebase all22 prior patches clean, refresh only isolated physical dependencies/frozen lock/no lifecycle scripts. Post-rebase helper reproduces exactly CI digest sha256:4959b1a34b9a4c54fbda9f9c6b1f055fb9237da77d674f351599d8542301365e; add canonical note line rather than waiver. Product code unchanged.
- This metadata-only correction makes canonical task-sync use CI full PR diff. Stage history reports remain historical candidates with their hashes/trees; fresh publication checks bind newest base. Feature rebase push will use exact remote-head lease db5fa7ba; user/default/main checkout/other docs untouched. Test and MCP mac/windows results still require CI readback; do not claim green prematurely.

## PR464 Test CI — shared helper inventory/fixture wiring

- Read failed Test job109820107463 log; latest main e97684f6 rebase clean. Complete four reported files reproduced exactly 6 failures (29 pass/6 fail/420 expect/66.96s), not focused-case cherry-picking. P1 authority assets/workflow-contract.v1.json helpers.scripts/descriptions already includes contract-worktree-runtime; listHelperFiles/listHelpers are existing validated projections. RUN_HELP_GROUPS omitted it. P2 publication/conformance two minimal fixtures manually copied a subset, then finish invoked the missing sibling runtime; shared copyHelpers already knew the full package but these fixtures bypassed it.
- P3 reuse listHelperFiles in the existing factory and replace both ad-hoc lists with that factory, rather than add runtime copies to individual fixtures or invent a registry. Full factory dependency symlink conflicted with archive scratch re-link, so the same factory has one private linkDependencies option disabled only by those minimal fixtures; default behavior preserved elsewhere. No production archive change. CLI adds the missing group entry. The initial fix removed the sole Options/Helpers separator to stay at84 lines; GATE3 correctly rejected that tradeoff. Follow-up restores the separator and explicitly raises only line budget to85; helper budget remains60.
- Corrected four full files now35 pass/0 fail/601 expect/101.11s. Initial broader factory attempt's failures preserved in diagnostics; its owned dangling nested node_modules symlink identified by fixture path and removed from isolated dependency tree only. No main/global mutation or model calls. Canonical broadens to all12 existing helper/registry/projection/worktree/host Goal files per request; full CI Test still supplies final whole-suite readback. No new test file or scattered runtime copies.
- Governance digest must be recalculated for entire updated PR/e97684f6 after this source fix, not reused4959...; record exact line below from same merge-base mode. Old MCP matrix(mac/ubuntu/windows) was green, old Test/Governance failed; don't claim final CI green before updated head completes.


## GATE 第3轮 PASS / MEDIUM follow-up

- Restore renderHelpersSection success-path leading blank line, matching error path; it is the only Options/Helpers separator, not redundant. 60 helper IDs remain bounded; RUN_HELP_MAX_LINES explicitly85 for the new helper row, test protects both separator and budget.
- Canonical task-sync uses only actual REPO_HARNESS_DIFF_BASE/merge-base inputs at newest main. Recompute fullPR digest after this source change; no stale4959/6641 binding.
- Gate-mentioned brother fixtures contract-worktree-closeout-journal/archive-evidence-gates need later dependency-copy review; outside currentPRfinding, no edits. PR CI was allgreen on39e4e5cc; this correction needs newCI, no merge or completion claim before readback.

## PR #464 post-spawn startup cleanup

P1: reviewer host owns one detached provider; task-session owns process identity and group signaling; review-session cancel consumes complete binding or serialized no-child evidence. Herdr observation remains fallible and cannot authorize an unproven kill.
P2: host spawn -> report-agent -> rename -> capture -> immutable processes publication -> setup exception -> failure.json -> cancel sees unresolved spawn intent. Real private Herdr reproduces four live-provider leaks, with pre-fix evidence in `.ai/harness/runs/review-startup-fix/pre-fix.log`.
P3: preserve typed binding and fail-closed cancel. Reap only the creator-proven group while holding startup.lock; publish existing no-child evidence only after exit. No new dependency, file authority, protocol or fallback. Abrupt host death before publication still fails closed; recovering that independent crash window would need durable child proof. At 10x concurrency the lock remains per review directory, not global.
Test admission: existing `tests/claude-review.test.ts` lacked failures after successful provider spawn. Four parameterized real-process cases cover Herdr mutations, capture and immutable publication; a fake provider survives EOF so host death cannot hide the leak. All use private sessions and an unchanged sentinel; about 26s for pre-fix cases and 1-2 minutes for the owning full file. MCP observed_idle and generic-review work are out of scope.

> **Substantive Change SHA256**: `sha256:051ac556828eb2208d851cd748ed9527222498a8feb6b4dfca508b6f9b73f054`

Startup fix validation: pre-fix 4 fail/0 pass (26.39s); post-fix 4 pass/0 fail/28 expect (20.92s). First canonical execution passed owning full reviewer integration file (70.443s), type and every integrity check except the expected changed diff digest. Digest updated above; final exact execution is required by the contract after this evidence binding. No model requests, global installs, primary checkout changes or new dependencies/files/abstractions. Sibling trace: startReviewServer already reaps its directly owned child on metadata errors; task-session bindStartedAgent uses durable launch/pane/provider reconciliation and is not a detached reviewer spawn.

## MCP goal idle-before-working correction after PR #464 merged

P1: MCP handler owns observation loop/cleanup; task-session owns request identity and validated Result; Herdr owns lifecycle state/sequence. No provider or reviewer schema changes.
P2: start -> pre-send baseline -> send request -> telemetry unknown then idle before goal work -> old handler reports observed_idle -> finally cancel kills provider before it can publish matching Result. Real private Herdr reproduces completed expected / observed_idle received on latest main; 5.29s, pre-fix log `.ai/harness/runs/mcp-goal-idle-fix/pre-fix.log`. Herdr report-agent accepts idle/working/blocked/unknown; repeated idle is deduplicated, so unknown-to-idle supplies a real newer idle transition.
P3: retain observed_idle as observation, never Result/Receipt. Require an observed post-send working sequence, then strictly newer idle/done; validated matching Result bypasses observation entirely. Missing/coalesced working may conservatively timeout; do not infer consumption from sequence counts. At 10x load the polling window can miss fast work, but it must fail closed rather than kill on pre-work idle. Smallest change: one local sequence variable, no dependency/file/abstraction.
Test admission: extend existing real Herdr MCP integration, which covered success and timeout but no idle before working. Add early-idle-result and idle-only cases to its deterministic provider; delay work to expose the premature termination window, assert lifecycle outcomes/result files/cleanup/parent preservation rather than elapsed-time magic numbers. Existing MCP unit file covers policy gates. Focused existing files expected 1-2 minutes; no real model calls.

> **Substantive Change SHA256**: `sha256:ed1b6062f506585ae1facab064b8e41dd78b781f71b52077c6217c3f0fdd4025`

Focused corrected MCP integration: 1 pass/0 fail/72 expect, five lifecycle modes, 30.67s. The unchanged source probe failed with expected completed/received observed_idle. PR #464 is already merged; this correction is isolated on `codex/mcp-goal-idle` from latest main `dc77b3c6`, without resurrecting its deleted remote branch. Prior reviewer fix CI all passed, including Test and three-platform MCP matrix. Source fix has one local sequence variable; no new file/dependency/abstraction. Existing helpers and provider Result validation remain authoritative.

PR469 review correction: a pre-send baseline also admitted unrelated startup working while sendTaskRequest was writing/submitting the request. The existing real Herdr fixture now wraps only its private prompt invocation to report startup working before delivery; provider subsequently reports idle before executing the queued goal. This reproduces completed expected / observed_idle received on f03dbad4 (7.01s). Probe evidence: `.ai/harness/runs/mcp-goal-idle-fix/pre-delivery-working.log`. Move baseline sampling after sendTaskRequest returns; startup state becomes baseline, never evidence of post-delivery work. A request that completed while delivery returned remains accepted through its validated Result; if fast working was not observed and no Result exists, conservative timeout is intentional. The wrapper and providers are confined to the private fixture endpoint; all six lifecycle modes retain exact process/parent/redaction checks.

> **Substantive Change SHA256**: `sha256:d1a925e21d7b79dcd4c073807358932f53c6f3355e72be9aeb366a91c2da3910`

Corrected post-delivery baseline focused integration: 1 pass/0 fail/86 assertions (41.07s), six lifecycle modes. The new startup-working probe fails on the first fix and passes with the baseline after delivery. Final canonical checks are rerun because source and the executable fixture changed.

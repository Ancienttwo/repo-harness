# Implementation Notes: Herdr task agents cutover

> **Status**: Active
> **Substantive Change SHA256**: `sha256:466c2a7e0566e85f123ced2f7cb45b61e7f6a982aec514020ea29df51a90d23f`
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
- Generic prompts contain request/result refs; context bytes are sealed in a task artifact. Result request ID/context SHA must match. A missing result stays pending and cannot allocate another round or replay; misleading terminal PASS is ignored. Claude host also submits a request file ref, captures only validated structured provider output and saves via the shared result primitive.
- Herdr 0.9.1 creates API and client sockets (tagged upstream src/session.rs:155-170). The client path is seven bytes longer; validation must check both before state directories, locks, intent or layout changes. Test HOME/session names were shortened; no timeout increase.
- Existing Claude session metadata now has protocol 3 plus generic process binding and isolated runtime HOME; protocol 2 is not read as a fallback. WIP is not installed globally. All 20 existing real-Herdr/deterministic-provider behavior cases pass (95 assertions, ~49s).
- H1 shared/CLI focused cases pass; real harness capability remains unverified, fixture evidence alone may be verified. No actual model/auth/read-only/resume canary has run. Before H4 provider deletion, notify advisor-gatekeeper and do minimal real Codex/Claude proof in disposable sessions using authorized real HOME authentication.
- New module is currently matched to the model's root fallback; ownership/semantic flows must be closed through archctx in H6 before final acceptance. H2–H5 callers, admission/role packet integration and installed guidance are not yet migrated.
- H1 ends at [REQ-3] commit/evidence, then waits for designated PASS. mini stays unauthorized.

## H1 evidence delta

- First canonical attempt gave its two runtime criteria exit 0 but exhausted the whole 60s execution deadline before integrity commands. 120s whole-plan budget reused both exact passed records; it does not alter individual test deadlines.
- The remaining task-sync failure required a source-diff-bound workflow artifact. The exact header above comes from the immutable task-sync log associated with the same unchanged substantive source/test diff.
- Only notes and this contract's evidence declaration change after that baseline. Both expensive criteria explicitly retain their immutable passed execution records with current task-sync, task-workflow and type deltas; no baseline is relabelled as a fresh current-subject run.

# PRD: Fleet Task Acquisition, Publication Lifecycle, and Merge Readiness

> **Status**: Draft
> **Slug**: fleet-acquire-publication-readiness
> **Created**: 2026-08-22T04:05:55+0800
> **Updated**: 2026-08-22T12:13:34+0800
> **Source Spec**: `docs/spec.md`
> **Tier**: standard

## AI Quick-Read Card

- Problem: Agents can claim sprint tasks safely inside one repo, but there is no cross-repo acquisition entrypoint, no durable PR↔task↔claim identity (PR URL is only echoed today), no head-SHA-fenced merge gate — and the default PR ship path structurally strands the lease in `completing` with no state for "PR under review", so no feedback/repair flow can be built on the current state machine.
- Users: Autonomous coding agents (disposable Codex / Claude Code CLI sessions) that pull work; the human operator who reviews and merges PRs.
- Platform: repo-harness CLI on one machine, GitHub via `gh`; MCP mirroring ships as part of WP2, not assumed before it.
- P0 surface: `PublicationReceiptV1` → Lease Protocol 2 + PR Review Lifecycle (`reviewing` + `publication reopen/takeover/abandon`) → Publication Recovery + Integration Reconcile → `publication readiness` (`MergeReadinessV1`).
- Core metric: An agent goes from "no context" to "bound worktree with a work envelope" in one command; a user answers "is this PR safe to merge" in one command fenced to an exact head SHA; a CI failure re-enters work only through explicit reopen/takeover, never through liveness guesses or raw steal.
- Hard constraint: No new authority **categories**. Task authority stays in canonical sprint rows, execution authority stays in git-common-dir leases (extended, versioned), evidence stays repo-local, provider facts stay on GitHub; everything else added is a rebuildable artifact or a read model.
- Key risk: WP0-B touches the lease state machine and record schema — highest-care change; and the digest-domain trap: `COORDINATION_PROTOCOL` participates in task_id/task_revision digests, so the record schema version must be a new field, never a bump of that constant.
- Unknowns: Cross-machine steal signal policy (deferred with remote claim protocol); pre-existing handoff dual-producer overlap; `gh` rate behavior.
- Acceptance scenarios: `finish --no-merge` lands the lease in `reviewing` with a current-publication pointer; takeover re-enters via `reserving → bind`, never directly `bound`; receipt rebuilds fully from the PR marker; readiness flips on head or base movement; two same-token repair attempts trigger `no_progress`.
- Suggested next step: WP0-A (`PublicationReceiptV1` with full-payload PR marker and deterministic `publication_id`) — additive, no concurrency surface.

## Problem

repo-harness `63f0ba11` already implements the hard parts of multi-agent task execution: canonical sprint rows with content-addressed task revisions, atomic lease election with claim-ID fencing and generations (`src/cli/commands/sprint.ts:233-322`), a strict `reserving → bind → bound` binding invariant (claim always creates `reserving`, `coordination-identity.ts:288`; only `bind` writes `bound` together with `execution_worktree`/`branch`/`unit_ref` after appending a `resumed` receipt, `sprint.ts:369-400`; `abort-completion` merely restores a previously bound record), a three-axis read-only board projection with torn-snapshot detection (`resolve-board.ts:41-60`), subject-bound review/checks/acceptance freshness (`project-effective-state.ts:113-188`), and a ship flow that ends in a draft PR without auto-merge.

Four gaps block the outer loop ("agent enters any registered repo, acquires a task, verifies, publishes; the user picks PRs to merge"):

1. **The lease state machine has no PR-review state (verified, structural).** The default PR ship path runs `contract-worktree finish --no-merge`, which unconditionally executes `begin-completion` (`bound → completing`, `contract-worktree.sh:1825-1826`) before verification. Both `--no-merge` success branches end at `finish_transaction_commit` and `return 0` (`:1995-2014`) — that function (`:1136-1146`) never touches the lease; `reconcile_after_publication` runs only on the real-merge branch (`:2092-2093`); `abort_completion` only on failure. No cleanup, hook, or CI path reconciles afterward, and `stealLeaseRecord` refuses `completing` (`coordination-identity.ts:600-606`). Every shipped draft PR leaves its lease stranded in `completing` for the whole review window, clearable only by manual `sprint reconcile`. `completing` was designed as a short crash-ambiguity window, not a days-long review state.
2. **Publication identity is unrecorded.** `create_or_report_pr` (`scripts/ship-worktrees.sh:980-1018`) obtains the PR URL and only echoes it; the journal's `pr_observed` phase records a commit SHA. A weak mapping is reconstructable from `gh pr list --head <branch>` while the branch survives, but nothing typed, fenced, or generation-aware survives branch cleanup, renames, duplicate PRs, or stacked absorption.
3. **Merge readiness is unverifiable as a unit.** Local evidence freshness and provider CI/review facts exist separately; nothing joins them under one head-SHA fence. The existing `sprint reconcile` cannot serve remote-merge closure: it never fetches (`coordination-canonical-source.ts:58-89`), and it refuses on strict string inequality of `target_ref` with no ref canonicalization (`coordination-identity.ts:421-424`, `sprint.ts:693-694`).
4. **Failure feedback has no route.** No mechanism maps a CI failure or changes-requested event back to a task/claim/publication and re-enters it into work — and per gap 1, the state machine could not accept it anyway.

### Product Direction

- Hard Constraints:
  - Repo owns meaning; Git owns version and publication; leases own temporary execution rights; `PublicationReceiptV1` binds task + claim + candidate + PR; the provider owns PR/CI/merge facts; the user owns the final merge. CLI, MCP, agents, and any future operator own nothing durable.
  - No new authority categories. `reviewing` extends the existing lease authority (not freely rebuildable); receipts, feedback events, readiness, offers, and boards are rebuildable artifacts or read-time projections. Deleting every rebuildable artifact must lose zero workflow authority.
  - `PublicationReceiptV1` is an **immutable identity fact** with a **deterministic ID**: `publication_id = sha256(protocol + provider_repo_id + task_id + claim_id + generation + head_sha)`, so crash-retry and rebuild converge on one identity. Dynamic PR state (`provider_state`, `integration_state`, `publication_state`, readiness) lives in read-time projections. Integration absorption reuses the existing `worktree_merge_mode` judgment (`ancestor`/`absorbed`); no second implementation.
  - The PR body marker carries the **full canonical receipt payload** (bounded JSON, no local paths/credentials/feedback bodies) so a lost local receipt rebuilds completely from the provider. The marker is an untrusted carrier: rebuild verifies it against live provider facts and local evidence digests, and a marker alone never authorizes any lease mutation. (A remote publication ref as a stronger cross-clone carrier is a deferred upgrade tied to the remote claim protocol.)
  - Lease record schema becomes **protocol 2 of the lease-owner record**, adding `reviewing` and a `current_publication` pointer. **The digest-domain constant is untouchable**: `COORDINATION_PROTOCOL = 1` participates in task_id/task_revision digest domains (`coordination-identity.ts:74-95`), so versioning uses a new record-schema field; bumping the constant would silently change every task identity. Compatibility is explicit: protocol-2 readers accept existing records; the first `reviewing` transition writes the extended record; older CLIs parse unknown states as `unknown` and fail closed (verified: closed-set parser, `coordination-identity.ts:344-347`; `unknown` is never silently cleared, `coordination-lease-store.ts:314-322`) — that refusal is the intended guard, surfaced with an upgrade message. Legacy stranded leases (`completing` + completed no-merge journal + PR) get a detection command and explicit per-lease migration; no silent auto-fix.
  - Lifecycle transitions are explicit domain actions executed under the task lock against the `current_publication` pointer:
    - `completing → reviewing` only after publication identity is proven durable (branch pushed; remote head == verified candidate; PR exists; receipt written; marker present; receipt claim/generation == lease; journal carries publication identity). PR-create or receipt failure keeps `completing` and ship exits non-zero with typed `publication_incomplete` — never reported as success.
    - `publication reopen` (same owner): `reviewing → bound` with claim/generation unchanged, allowed only when the recorded execution worktree still exists in git worktree topology and receipt/head/generation revalidate (mirrors the `abort-completion` restoration precedent, which preserves bind-written fields); otherwise typed `worktree_missing` routes to restoration or takeover.
    - `publication takeover` (new owner): `reviewing → reserving` with new claim ID, generation + 1, execution fields cleared, mandatory reason, **canonical row revalidation**; the new owner then creates/adopts the repair worktree and passes through the existing `bind`. Takeover never writes `bound` directly — `bound` stays bind-only.
    - `publication abandon`: explicit close-out for closed-unmerged/superseded publications, releasing the lease with lineage recorded.
  - `sprint steal` keeps its current `reserving`/`bound` semantics unchanged, but **must refuse `reviewing`** (pointing at `publication takeover`), exactly as it refuses `completing`. Without this refusal the entire publication lifecycle is bypassable.
  - The `current_publication` pointer in the lease record is the single authority for "which publication is current"; receipts stay immutable, lineage events are audit-only, and supersession is derived from the pointer. All reopen/takeover/abandon/reconcile compare it under the task lock.
  - Remote-merge closure uses a new `publication reconcile`, not the existing `sprint reconcile`: fetch provider target into an isolated observation ref, prove the sprint row is `[x]` at the fetched OID, verify receipt/pointer/claim/generation, then clear the `reviewing` lease under the task lock and record `integration_state`. It reuses the existing proof principle (canonical `[x]` before lease clearance) but not the command, whose no-fetch and strict target-ref string equality make it unfit for provider-driven closure.
  - There is **no session-liveness authority**. Hook events, worktree presence, and progress tokens are evidence, never proof of life. No `session_alive` boolean; delivery state lives in `FeedbackDeliveryReceiptV1`. Nothing auto-releases or auto-steals on missing signals; `orphan_reclaimable` and runtime observations remain diagnostics.
  - Feedback is **intake + redispatch, not wake**: provider events persist as immutable `FeedbackEventV1` records in a dedicated inbox under the git-common-dir coordination plane; mutable delivery/ack state is a separate `FeedbackDeliveryReceiptV1` so event digests and `feedback_revision` stay stable. Handoff/resume files are consumers of the inbox, never observer write targets — handoff already has two producers (Stop batch `stop-handler.ts:372-413`; `recovery-view-cli.ts` via `verify-sprint.sh:954-955`); a third is forbidden.
  - Repair is **not a new task**. `RepairOfferV1` is distinct from `TaskOfferV1`: same task/claim/publication lineage, entered only via reopen/takeover, never via plain `sprint claim`.
  - `fleet acquire` v1 returns bound worktrees only for `execution_ready` offers: row pending ∧ lease available ∧ snapshot stable ∧ repo `read_write` ∧ contract mode ∧ approved decision-complete plan exists and matches the row ∧ contract projectable. Rows needing planning are excluded (a `PlanningOfferV1` lane is deferred); acquire never fabricates a bound worktree it cannot actually create.
  - Merge readiness is derived at read time, keyed by `publication_id`, fenced to `expected_head_sha` **and** the verified base/target revision; `ready` additionally requires the PR to be non-draft. No `ready=true` is ever persisted.
  - No-progress detection reuses the **algorithm, not the artifact**: extract the pure stall evaluation from `attempt-ledger.ts`; record `ReactionAttemptReceiptV1` with a composite `reaction_token`. `AttemptReceiptV1` keeps its `state next` envelope-token contract (`attempt-ledger.ts:25-28`) and never receives PR SHAs.
  - No auto-merge. v1 links to GitHub; the merge click stays there.
- Recommended Defaults:
  - On-demand `gh` polling in every P0 module; no daemon, webhook, SQLite, or SSE.
  - Receipt storage: `<git-common-dir>/repo-harness/publications/v1/<publication-id>.json` as the fast local copy; PR marker as the durable full carrier.
  - `reaction_token = sha256(publication_id + head_sha + sorted(failing_check_ids+conclusions) + sorted(unresolved_review_thread_ids) + mergeability_state)`; a reaction receipt is written only when a repair attempt completes, never on observer polls.
  - Acquire claim path is a fixed ordered step sequence (v1: `[local_lease]`) for future remote-CAS prepending.
  - Readiness applies the board's torn-read pattern (provider facts A → local evidence → provider facts B; retry once; then `changed_during_read`).
- Freedoms:
  - JSON field naming, CLI flag spelling, output formatting, selection tie-breaking, retry counts.
  - Whether `publication` and `fleet` are one command group or two, provided contracts match.
  - Intra-invocation caching of `gh` responses.

### Feasibility Boundary

- Confirmed (all verified at `63f0ba11`):
  - The `completing` stranding (full line-level trace, Problem 1).
  - `reserving → bind → bound` invariant: claim creates `reserving` (`coordination-identity.ts:288`); `bindLeaseRecord` requires `reserving` + claim match and writes execution fields (`:412-432`); bind appends the `resumed` receipt before writing the record (`sprint.ts:393-394`); `abort-completion` is the only other `bound` writer and preserves bind-written fields (`:505-535`). Bind performs no filesystem existence checks — the invariant is "bind-declared", not "bind-verified"; reopen preconditions therefore check worktree topology explicitly.
  - `sprint reconcile` limits: no fetch; strict `===` target-ref comparison, no canonicalization; canonical `[x]` required on the non-released path (released records are cleared without canonical check, `sprint.ts:704-731`).
  - Lease parser: closed-set states, `protocol`/`kind` checked, unknown → `unknown` fail-closed, never silently cleared; `COORDINATION_PROTOCOL` feeds task_id/task_revision digest domains.
  - Attempt-ledger token contract; steal's missing canonical revalidation; handoff dual producers; `worktree_merge_mode` absorption; registry authorization surfaces; coordination plane scope = one clone.
- [UNKNOWN]:
  - Sprint rows lack structured `Depends On`/`Capability`/`Priority`/`Concurrency Key`; execution-readiness uses plan/contract presence only until a sprint-schema slice decides them.
  - Migration inventory size for legacy stranded leases.
  - Whether base-movement proof can be delegated to a provider merge queue per repo policy.
- [UNVERIFIED]:
  - `gh` rate limits assumed sufficient for on-demand polling at single-digit PR counts.
  - Whether the pre-existing handoff dual-producer paths race in practice; out of scope, flagged.

## Users

### Primary Users

- User: Autonomous coding agent (disposable CLI session).
  - Need: One command returning a fully bound work envelope for execution-ready tasks or a clean "nothing eligible"; explicit repair entry (`reopen`/`takeover`) with persisted feedback when its publication fails CI or review.
  - Success signal: First productive edit without reading board internals; a successor agent takes over a dead session's publication via `takeover → bind` with zero liveness guessing.

### Secondary Users

- User: Human operator reviewing agent output.
  - Need: One trustworthy per-publication verdict — ready or blocked with typed reasons — fenced to the exact head and base they will merge; a clear attention inbox for what only they can decide.
  - Success signal: Merges happen from a short readiness list; zero merges of a candidate local evidence never covered; stranded leases become visible lifecycle states.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
| --- | ---: | --- | ---: |
| Lease terminal-state correctness | 0 stranded `completing` after successful PR ship | Fixture ship run; lease ends `reviewing` with current-publication pointer | any stranded lease |
| Ship partial-failure honesty | 100% typed | PR created + receipt write forced to fail → non-zero exit, `publication_incomplete`, recoverable journal | any silent success |
| Acquire race safety | 1 winner per task, always | N parallel `fleet acquire` on one execution-ready task | any double-claim |
| Publication mapping coverage | 100% of ship-created PRs | Receipt exists; `head_sha` == live PR head; marker carries full payload | any shipped PR without receipt |
| Receipt rebuild completeness | Field-equivalent receipt | Delete local receipt; rebuild from marker + provider; compare | any lossy rebuild |
| Readiness fencing | 100% | Head push → `head_moved`; base advance → `base_moved_since_verification`; draft → blocked | any stale `ready` |
| Ownership safety of feedback | 0 lease mutations from observers | Intake tests assert lease record unchanged | any observer-driven mutation |

## Acceptance Scenarios

### Scenario 1: PR ship lands in `reviewing` with a current-publication pointer

- Given: A bound task whose finish runs the default PR path through verification and draft-PR creation.
- When: Push, PR creation, receipt write, and marker embed all succeed.
- Then: The lease transitions `completing → reviewing` carrying `current_publication` (publication_id, receipt digest, head SHA, ship transaction key) matching the receipt; the journal's `pr_observed` carries provider repo ID, PR number, and receipt digest; `sprint steal` refuses the `reviewing` lease with a message pointing at `publication takeover`.
- Machine-checkable evidence: Lease record assertions; steal refusal exit; journal fields.

### Scenario 2: takeover re-enters through reserving → bind; reopen requires a live worktree

- Given: A publication in `reviewing`.
- When: A new agent runs `publication takeover --reason ...`; separately, the original owner runs `publication reopen` after its worktree was removed.
- Then: Takeover yields a `reserving` lease (new claim ID, generation + 1, execution fields cleared, canonical row revalidated) and reaches `bound` only through the existing `bind` after the repair worktree exists; the reopen attempt fails typed `worktree_missing` and routes to restoration/takeover. In no path does any command other than `bind` write a `bound` record with fresh execution fields.
- Machine-checkable evidence: Lease state/field assertions across the sequence; generation arithmetic; typed errors.

### Scenario 3: feedback re-enters work explicitly; no-progress needs two attempts

- Given: A publication in `reviewing` with a failing required check.
- When: `fleet feedback intake` runs twice (same provider state), then two repair attempts complete without changing the `reaction_token` (failure A → repair 1: A→A; failure A → repair 2: A→A).
- Then: Exactly one `FeedbackEventV1` per provider event ID (idempotent), delivery state tracked in separate receipts; observer polls write zero `ReactionAttemptReceiptV1`; after the second completed same-token attempt the breaker reports `no_progress` and `attention_owner: user`; intake alone never mutates the lease.
- Machine-checkable evidence: Inbox file counts; reaction-receipt counts; breaker output; lease record unchanged by intake.

### Scenario 4 (negative): projections never own state; authorization enforced

- Given: Any repo state, including a just-displayed `ready:true`.
- When: Any fleet/publication read command runs; the PR head or base moves between display and action; a repo flips `read_only` or its registry `authorizationRevision` advances after an envelope was issued; a row without an approved plan is pending.
- Then (must NOT): No column/status/`ready` flag persisted; no mutation proceeds on a snapshot precondition (leases re-read under task lock, provider facts re-fetched, head and base fences compared); `read_only` repos never offered; stale envelopes fail closed (`authorization_stale`); planning-required rows never surface as `execution_ready` and acquire never claims them; a receipt whose generation mismatches the pointer surfaces `publication_claim_mismatch`, never silent re-attribution.
- Machine-checkable evidence: Typed errors; write-surface test limiting writes to coordination-plane runtime artifacts and ignored caches.

## Non-goals

- **Remote claim protocol (cross-machine CAS refs)** and the remote publication-ref carrier. Deferred until multi-machine acquisition is real; the acquire step sequence and marker design stay extensible for it; its design doc must first resolve the cross-machine steal-signal question (human-only remote steal vs explicit audited TTL).
- **Resident operator daemon, webhooks, SSE, notification center.** On-demand CLI first; a daemon is justified by measured evidence (readiness p95, active publication count, manual poll frequency, missed-feedback latency), and may own only caches/cursors/delivery metadata.
- **Agent runtime adapters / PTY ownership / session wake.**
- **In-product PR merge.** v1 deep-links to GitHub.
- **Web/TUI kanban UI.** `fleet board --json` / `fleet watch --format jsonl` are the v1 surfaces.
- **Multi-tenant cloud service.**
- **Sprint schema extension** (`Depends On`/`Capability`/`Priority`/`Concurrency Key`) and the `PlanningOfferV1` lane — separate slices.
- **Changing `sprint steal` for `reserving`/`bound`.** Its semantics there stay untouched; this PRD only adds the `reviewing` refusal.
- **Fixing the pre-existing handoff dual-producer overlap.** Flagged; this PRD only forbids a third producer.

## Module Behaviors (P0)

### Module 1: PublicationReceiptV1 — identity carrier (WP0-A, build first)

- Purpose: Immutable, deterministically identified binding of task ↔ claim generation ↔ branch ↔ candidate ↔ PR; the join key for every provider-fact projection.
- Hard Constraints:
  - Deterministic `publication_id` (see Product Direction) so PR-created-then-crash retries converge.
  - Immutable creation-time facts only; dynamic state in projections.
  - PR marker carries the full canonical payload; local receipt is a cache; `fleet receipt rebuild` restores a field-equivalent receipt from marker + provider facts, verifying receipt target/base/branch/head against live provider facts and local evidence digests. Marker never authorizes mutations.
  - Ship journal `pr_observed` upgraded to provider repo ID + PR number + receipt digest.
  - PR create succeeds but receipt/marker write fails → typed `publication_incomplete`, non-zero exit, journal keeps a recoverable phase; lease stays `completing` for Module 3's recovery. Never a warning-only success.
  - Before creating a PR, ship durably records a canonical `publication_create_intent` (provider repo, task, claim, generation, head, deterministic publication ID) in its existing closeout journal. Only that matching intent authorizes the first marker after a create-before-marker crash; a pre-existing markerless PR is `publication_claim_mismatch`, never re-attribution. Existing full markers verify target/base/branch/head + identity.
  - WP0-A coverage is task-backed linked-worktree publication only. Primary dirty-worktree maintenance closeout has no task/claim lease authority and is outside receipt coverage.
- Recommended Defaults: Write hook in `create_or_report_pr` after create/lookup; include `review_subject_sha256`, `verification_evidence_sha256`, `merge_seal_sha256`, `base_sha`; idempotent by `publication_id`.
- Normal path: ship → PR → receipt → marker → journal.
- Failure path 1: Marker embed fails after receipt write → same `publication_incomplete` handling; recovery retries embed.
- Failure path 2: Duplicate PR for branch → adopt after identity verification.
- States: Empty (pre-ship/reconstructable), Ready (receipt consistent with live PR), Error (`publication_incomplete`, `publication_claim_mismatch`, unparseable marker).
- Dependencies: `create_or_report_pr`, closeout journal, `gh`.
- Open decisions: None.

### Module 2: Lease Protocol 2 + PR Review Lifecycle (WP0-B)

- Purpose: Give the lease state machine a durable review state, a current-publication pointer, and explicit re-entry paths — under a versioned, migration-safe record schema.
- Hard Constraints: All items in Product Direction on protocol 2, digest-domain decoupling, `reviewing` entry preconditions, reopen/takeover/abandon semantics, bind-only `bound`, steal's `reviewing` refusal, pointer authority, and legacy detection/migration.
- Recommended Defaults: `reviewing` surfaces as its own board lease classification; steal/reopen error messages name the correct command; lineage events appended beside the publications store.
- Freedoms: Field names for the pointer/lineage; whether lineage lives in the lease record or a sibling file (pointer must be in the lease record).
- Normal path: finish `--no-merge` → durability preconditions proven → `reviewing` + pointer; later reopen/takeover/reconcile/abandon.
- Failure path 1: PR/receipt failure mid-finish → stays `completing`; Module 3 recovery resolves.
- Failure path 2: Takeover with stale expected generation/head → fail closed, re-read, report.
- States: Empty (no publication), Loading (transition under task lock), Ready (`reviewing` consistent with pointer + receipt), Error (`stranded_completing`, `publication_claim_mismatch`, `worktree_missing`).
- Dependencies: Module 1; `coordination-identity.ts` transitions + parser; `contract-worktree.sh` finish; board classification.
- Open decisions: None.

### Module 3: Publication Recovery + Integration Reconcile (WP0-C)

- Purpose: Crash recovery for incomplete publications and provider-driven closure after merge/absorption/close.
- Hard Constraints:
  - `publication recover`: inspects `completing` leases with publication journal evidence; retries push/PR/receipt/marker idempotently (converging on the deterministic `publication_id`) or aborts completion explicitly. Legacy stranded leases (pre-PRD) resolve through the same inspection with explicit per-lease operator confirmation.
  - `publication reconcile`: fetch provider target to an isolated observation ref → prove sprint row `[x]` at the fetched OID → verify receipt/pointer/claim/generation → clear the `reviewing` lease under task lock → record `integration_state` (`merged | ancestor | absorbed`). Never calls the existing `sprint reconcile` against an assumed-synced local ref.
  - `provider_state=open` + `integration_state=absorbed` is legitimate: task integrated, PR marked superseded for the user to close; no re-merge demanded.
  - Closed-unmerged PRs route to user attention with `publication abandon` / reopen-PR options.
- Normal path: user merges on GitHub → `publication reconcile` → lease cleared, integration recorded.
- Failure path 1: Fetched row not `[x]` yet → refuse with the exact fetched OID reported; no lease change.
- Failure path 2: Pointer/receipt mismatch at reconcile → `publication_claim_mismatch`, user attention.
- States: Empty, Loading (fetch), Ready (closed out), Error (typed refusals).
- Dependencies: Modules 1–2; `worktree_merge_mode`; `gh`; git fetch.
- Open decisions: None.

### Module 4: MergeReadinessV1 (WP1)

- Purpose: Single fenced verdict joining local evidence and provider facts.
- Hard Constraints:
  - Keyed by `publication_id`; bare `--pr <n>` is a legacy/adoption entry that first reconstructs a receipt.
  - Pure per-invocation derivation: receipt + pointer + local effective state + live `gh` facts (PR state incl. draft, head OID, base OID, per-check runs for that head, review decision, unresolved threads, mergeability) + integration mode + canonical target.
  - Ready requires all of: PR open **and non-draft**; live head == receipt `head_sha`; live base/target consistent with the verified base (`base_moved_since_verification` otherwise, unless repo policy explicitly delegates that proof to a provider merge queue); review subject matches candidate; checks fresh + pass; acceptance pass/not-required/waived; required CI green for that head; required reviews approved; no unresolved changes-requested; mergeable; task revision undrifted; lease `reviewing` with pointer matching the receipt.
  - Torn-read discipline; `expected_head_sha` (and expected base) always emitted; consumers re-fetch and compare before acting; provider unavailable → fail closed.
- Recommended Defaults: Typed blockers each with `attention_owner: agent|user|external`; `fleet ready --json` aggregates across publications.
- Normal path: resolve receipt → double-fetch join → verdict + blockers + states.
- Failure paths: closed-unmerged → user attention; double `changed_during_read` → reported as such.
- States: Empty (no receipt), Loading, Ready (fenced `ready:true`), Error (`provider_unavailable`, `publication_claim_mismatch`).
- Dependencies: Modules 1–3, `project-effective-state`, `gh`.
- Open decisions: None.

### Module 5: Fleet Offer + Acquire (WP2)

- Purpose: One entrypoint from "agent with credentials" to "bound worktree + envelope" for execution-ready tasks across registered repos.
- Hard Constraints:
  - Composes existing primitives only: registry read → stable board collect → readiness classification → `sprint claim` → `contract-worktree start` → `sprint bind`.
  - `TaskOfferV1` carries `execution_readiness: execution_ready | planning_required | inline_ready | unsupported`; v1 acquire selects only `execution_ready` (criteria in Product Direction). `RepairOfferV1` stays distinct and enters only via Module 2 commands.
  - Race loss → re-collect and re-select; bounded retries → clean `no_eligible_task`. Envelope embeds `authorization_revision`; stale → fail closed. Claim path is the ordered step list.
  - MCP mirroring of `fleet offers/acquire` and `publication readiness/reopen/takeover` is **part of this WP's acceptance**, exposing the same JSON contracts through the existing MCP registry.
- Recommended Defaults: Deterministic selection by canonical row order; `--repo-id` pin; `fleet offers --json` lists all offers with readiness classification so planners can see excluded rows.
- Normal path: scan → classify → claim → worktree → bind → `WorkEnvelopeV1`.
- Failure path 1: All raced away → `no_eligible_task` (exit 0, empty `--json`).
- Failure path 2: Claim ok, worktree/bind failed → roll back own lease via existing release; `bind_failed_released`.
- States: Empty, Loading, Ready (envelope), Error (`repo_not_writable`, `authorization_stale`, `bind_failed_released`).
- Dependencies: `repo-registry.ts`, `resolve-board`, sprint commands, `contract-worktree start`, Modules 1–2 for repair offers, MCP registry.
- Open decisions: None.

## Module Behaviors (P1)

### Module 6: Feedback Intake + Redispatch (WP3)

- Purpose: Persist provider feedback and route it into explicit repair work.
- Hard Constraints:
  - Inbox: `<git-common-dir>/repo-harness/feedback/v1/<publication-id>/` with immutable `FeedbackEventV1` (idempotent by provider event ID) and separate mutable `FeedbackDeliveryReceiptV1` (`pending|delivered|acknowledged|superseded`, channel `none|hook_session|host_adapter|manual`). Full comment bodies fetched on demand by provider ID.
  - Persist first, notify best-effort second; notification success never changes any lease. Consumers: recovery materializers summarize pending feedback (read-only); reopen/takeover inject it into repair envelopes. Observers never write handoff/resume.
  - No-progress breaker: shared pure `evaluateNoProgress`; `ReactionAttemptReceiptV1` written only on completed repair attempts; two completed same-token attempts → `no_progress` → `attention_owner=user`, stop auto re-offering. Token change resets naturally. `AttemptReceiptV1` untouched.
  - Feedback on a pointer-mismatched receipt → `publication_claim_mismatch`, user attention, no auto-dispatch.
- Recommended Defaults: `fleet feedback intake [--publication-id]`; attention routing per Module 4 blockers.
- Normal path: intake → event persisted → repair offer appears → reopen/takeover → repair → new publication supersedes via pointer update.
- Failure paths: duplicate events idempotent; unreadable inbox → `feedback_unreadable` flag, nothing inferred.
- Dependencies: Modules 1–5; `gh`; recovery materializers (read-only).
- Open decisions: CLI-manual intake only in P1 (recommended) vs hook-triggered.

### Module 7: Fleet Board projection (WP4)

- Purpose: Cross-repo kanban read model.
- Hard Constraints: Pure projection over registry + boards + receipts + publication status + readiness + inbox; derived columns (`Available | Working | In review | Ready to merge | Done`), orthogonal `attention_owner` inbox, per-repo `snapshot_consistency`; never a mutation precondition; card actions map only to explicit domain commands.
- Normal path: iterate authorized repos → collect → join → JSON/JSONL.
- Failure path: one repo unreadable → its cards `unreadable`, others unaffected.
- Dependencies: Modules 1–6.
- Open decisions: None.

### Module 8 (P2, deferred): Operator daemon (WP5)

Observer + Projector + Command Router only; owns caches/cursors/delivery metadata; fully rebuildable; built when measured evidence justifies it. Not specified further here.

## Data Model

```jsonc
{
  "version": "1",
  "entities": [
    {
      "id": "publication_receipt_v1",
      "owner": "immutable identity fact; PR marker carries the full canonical payload, git-common-dir copy is a cache",
      "fields": {
        "protocol": "1",
        "kind": "repo-harness-publication-receipt",
        "publication_id": "sha256(protocol + provider_repo_id + task_id + claim_id + generation + head_sha)",
        "repo_id": "string",
        "task_id": "sha256",
        "task_revision": "sha256",
        "claim_id": "uuid",
        "generation": "number",
        "target_ref": "string",
        "base_sha": "gitsha",
        "branch": "string",
        "head_sha": "gitsha",
        "tree_sha": "gitsha",
        "review_subject_sha256": "sha256",
        "verification_evidence_sha256": "sha256",
        "merge_seal_sha256": "sha256",
        "provider": "github",
        "provider_repo_id": "string",
        "pr_number": "number",
        "pr_url": "string",
        "created_at": "datetime"
      }
    },
    {
      "id": "lease_owner_record_v2_extension",
      "owner": "existing lease authority (git-common-dir), record schema versioned separately from COORDINATION_PROTOCOL",
      "fields": {
        "record_schema": "2",
        "state": "reserving|bound|completing|reviewing|released",
        "current_publication": "{publication_id, receipt_sha256, head_sha, ship_transaction_key} | null (reviewing only)"
      }
    },
    {
      "id": "publication_status_projection",
      "owner": "derived at read time; never persisted as authority",
      "fields": {
        "provider_state": "draft|open|merged|closed",
        "integration_state": "unintegrated|ancestor|absorbed|unknown (via worktree_merge_mode)",
        "publication_state": "current|superseded (from the lease pointer)",
        "readiness_state": "blocked|ready|stale"
      }
    },
    {
      "id": "work_envelope_v1",
      "owner": "ephemeral projection; authority stays in sprint + lease",
      "fields": {
        "protocol": "1",
        "kind": "repo-harness-work-envelope",
        "repo_id": "string",
        "authorization_revision": "number",
        "task_id": "sha256",
        "task_revision": "sha256",
        "sprint_path": "string",
        "target_ref": "string",
        "claim_id": "uuid",
        "generation": "number",
        "worktree": "path",
        "branch": "string",
        "contract": "path",
        "repair_of_publication_id": "string|null",
        "feedback": "object|null",
        "next_command": "string"
      }
    },
    {
      "id": "feedback_event_v1",
      "owner": "immutable provider observation in git-common-dir inbox; reconstructible",
      "fields": {
        "provider_event_id": "string (idempotency key)",
        "publication_id": "string",
        "head_sha": "gitsha",
        "failing_check_ids": "array<string>",
        "unresolved_review_thread_ids": "array<string>",
        "summary": "string",
        "provider_url": "string",
        "observed_digest": "sha256"
      }
    },
    {
      "id": "feedback_delivery_receipt_v1",
      "owner": "mutable delivery state, separate so event digests stay stable",
      "fields": {
        "provider_event_id": "string",
        "delivery_state": "pending|delivered|acknowledged|superseded",
        "delivery_channel": "none|hook_session|host_adapter|manual"
      }
    },
    {
      "id": "reaction_attempt_receipt_v1",
      "owner": "runtime ledger for repair loops; separate from AttemptReceiptV1",
      "fields": {
        "publication_id": "string",
        "before_reaction_token": "sha256",
        "after_reaction_token": "sha256",
        "outcome": "completed|abandoned",
        "recorded_at": "datetime"
      }
    },
    {
      "id": "task_offer_v1",
      "owner": "derived at read time",
      "fields": {
        "repo_id": "string",
        "task_id": "sha256",
        "task_revision": "sha256",
        "sprint_path": "string",
        "row_order": "number",
        "execution_readiness": "execution_ready|planning_required|inline_ready|unsupported",
        "snapshot_consistency": "stable|changed_during_read"
      }
    },
    {
      "id": "repair_offer_v1",
      "owner": "derived at read time",
      "fields": {
        "kind": "repo-harness-repair-offer",
        "task_id": "sha256",
        "publication_id": "string",
        "expected_claim_id": "uuid",
        "expected_generation": "number",
        "expected_head_sha": "gitsha",
        "feedback_revision": "sha256",
        "allowed_actions": "array<resume_same_owner|explicit_takeover>"
      }
    },
    {
      "id": "merge_readiness_v1",
      "owner": "derived at read time; never persisted",
      "fields": {
        "ready": "boolean",
        "publication_id": "string",
        "expected_head_sha": "gitsha",
        "expected_base_sha": "gitsha",
        "attention_owner": "agent|user|external|none",
        "blockers": "array<{code, attention_owner, detail}>",
        "snapshot_consistency": "stable|changed_during_read"
      }
    }
  ],
  "relationships": [
    { "from": "publication_receipt_v1", "to": "work_envelope_v1", "via": "task_id + claim_id + generation" },
    { "from": "lease_owner_record_v2_extension", "to": "publication_receipt_v1", "via": "current_publication.publication_id (authority for current)" },
    { "from": "publication_status_projection", "to": "publication_receipt_v1", "via": "publication_id" },
    { "from": "feedback_event_v1", "to": "publication_receipt_v1", "via": "publication_id" },
    { "from": "feedback_delivery_receipt_v1", "to": "feedback_event_v1", "via": "provider_event_id" },
    { "from": "merge_readiness_v1", "to": "publication_receipt_v1", "via": "publication_id + expected_head_sha + expected_base_sha" },
    { "from": "repair_offer_v1", "to": "feedback_event_v1", "via": "publication_id + feedback_revision" }
  ]
}
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
| --- | ---: | --- | ---: |
| `fleet acquire` end-to-end (warm, local) | 5 s | timed CLI run in tests | 15 s |
| `publication readiness` single publication | 3 s | timed CLI run (`gh` on network) | 10 s |
| `fleet board` across 10 repos | 10 s | timed CLI run | 30 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
| --- | --- | --- | --- |
| [UNKNOWN] Legacy stranded-lease inventory size | Sizing of WP0-C migration effort | Detection command inventories `completing` + shipped-PR leases first | Maintainer |
| [UNKNOWN] Pre-existing handoff dual-producer overlap (Stop batch vs `recovery-view-cli.ts` via `verify-sprint.sh:954-955`; latter non-atomic) | Potential racey handoff writes today, independent of this PRD | Separate concurrency-analysis slice; this PRD only forbids a third producer | Maintainer |
| [UNKNOWN] Sprint structured fields (`Depends On`, `Capability`, `Priority`, `Concurrency Key`) | Offer filtering stays plan/contract-based | Separate sprint-schema slice after WP2; never infer conflicts from `allowed_paths` overlap | Maintainer |
| [UNKNOWN] Base-movement proof delegation | Whether `base_moved_since_verification` can defer to a provider merge queue per repo policy | Policy flag decided during WP1 | Maintainer |
| [UNKNOWN] Cross-machine steal signal | Blocks deferred remote claim protocol | Remote design doc must choose human-only remote steal vs explicit audited TTL first | Maintainer |
| [UNVERIFIED] `gh` rate limits under polling | `fleet watch` could throttle | Measure with 10-repo loop; conditional requests if needed | Maintainer |

## Developer Handoff

You are implementing this PRD.

- Build first: Module 1 (WP0-A). Then Module 2 (WP0-B — lease protocol 2 + lifecycle; highest-care change; **never touch `COORDINATION_PROTOCOL`**, it feeds task-identity digests). Then Module 3 (WP0-C), Module 4 (WP1), Module 5 (WP2, incl. MCP mirror). Modules 6–7 after all P0 acceptance scenarios pass; Module 8 waits for measured evidence.
- Do not reinterpret: the hard constraints in Product Direction — deterministic immutable receipt with full-payload marker; digest-domain decoupling; `reviewing` entry preconditions; reopen requires live worktree; takeover via `reserving → bind`, never direct `bound`; steal refuses `reviewing`; pointer authority under task lock; `publication reconcile` fetches, never assumes local sync; typed `publication_incomplete` on partial ship; no liveness authority; feedback event/delivery split; repair ≠ new task; execution-ready-only acquire; head **and** base fencing; non-draft requirement; no auto-merge.
- You may improve: JSON field naming, CLI ergonomics, error wording, module layout (`src/core/{fleet,publication}/`, `src/effects/{fleet,scm}/`, `src/cli/commands/{fleet,publication}.ts`) following the core/effects split.
- Verify with: root required checks (`bun test --timeout 60000`, `repo-harness run check-task-workflow --strict`, `bun src/cli/index.ts init --repo . --dry-run`) plus the acceptance scripts below.

### Acceptance Scripts

1. Lifecycle test: fixture ship through `finish --no-merge` with stubbed/recorded `gh`; lease ends `reviewing` with pointer; forced receipt-write failure → non-zero `publication_incomplete` and `publication recover` resolves it; `steal` refuses `reviewing`; `reopen` succeeds with live worktree and fails `worktree_missing` without; `takeover` yields `reserving` (generation + 1, canonical revalidated) and reaches `bound` only via `bind`.
2. Identity test: N concurrent `fleet acquire` on one execution-ready task → one winner; planning-required rows never offered as ready; after ship, receipt `head_sha` == live PR head, marker payload is complete, and deleting the local receipt then `fleet receipt rebuild` restores a field-equivalent receipt; crash-retry of `create_or_report_pr` converges on the same `publication_id`.
3. Fencing + feedback test: capture `ready:true`; push a new head → `head_moved`; advance the base → `base_moved_since_verification`; mark PR draft → blocked. Run intake twice on the same provider event → one `FeedbackEventV1`; two completed same-token repair attempts → `no_progress`, `attention_owner=user`; observer polls write zero reaction receipts and intake never mutates the lease.

## Adjacent Patterns

Agent Orchestrator (`Untrivial-ai/agent-orchestrator`, verified at `ed52364`, 2026-08-21) is the primary adjacent product. Verified facts: long-running Go daemon + SQLite durable facts with display status derived at read time; one worktree per session; a 30-second SCM observer polling PR state, per-check CI status, and review threads; a reaction loop returning CI failures/review comments/merge conflicts to the owning agent; a four-column attention board (Working / Needs you / In review / Ready to merge); `ao pr merge` with a `POST /prs/{id}/merge` backend; durable notifications (`needs_input`, `ready_to_merge`, `pr_merged`, `pr_closed_unmerged`) with read/unread history and a live stream; a large agent-adapter fleet (its README lists 26 supported agents while its STATUS counts 25 adapter implementations — the numbers do not reconcile, so no precise count is cited). Its issue-tracker runtime is explicitly non-functional per its STATUS doc, and no `ao spawn --issue` flag appears anywhere in its published docs (docs/cli contains a single README whose spawn flags are `--project`/`--agent`/`--skip-agent-check`) — so AO is a session kanban, not a task queue. That is why this PRD keeps repo-harness as the task/claim/evidence authority and borrows AO's observation-loop, attention-routing, and notification shapes, while replacing its "wake the owning agent" pattern with persist-then-redispatch, since repo-harness does not own agent runtimes.

## Commercialization Notes

Not applicable to this PRD.

## Frontend Perspective

No UI ships in this PRD. `fleet board --json` / `fleet watch --format jsonl` are the stable contract a later TUI/Web kanban consumes; column derivation, publication status, and `attention_owner` routing live in core so any UI stays a dumb renderer whose card actions invoke only explicit domain commands.

## Backend Perspective

All provider access goes through `gh` (user's existing credential). Fleet/publication modules follow the existing core/effects split: pure projections, lifecycle transitions, and protocol types in `src/core/`, filesystem/`gh`/registry IO in `src/effects/`. Writes are limited to: coordination-plane runtime artifacts (publications, feedback inbox, lease transitions under task lock), the PR body marker, ship-journal fields, and ignored observation caches. A wiped publications/feedback/cache surface plus provider facts and repo state must reconstruct everything except the lease authority itself (Acceptance Script 2); lease transitions remain the only writes requiring the task lock.

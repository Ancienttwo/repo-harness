# LoopX Comparative Analysis: Goal Control Plane vs Delivery Workflow Governor

> **Captured**: 2026-08-03, after a dual-track review (independent Codex report + a Claude-side blind track: two read-only exploration passes plus one high-effort judgment pass that never saw the Codex report; every load-bearing citation below was re-verified in session).
>
> **Source**: [huangruiteng/loopx](https://github.com/huangruiteng/loopx) at commit `91d8ed06cd3bd21df4e97a5f3db71791b7226206`, local checkout `/Users/kito/Projects/loopx` (clean worktree).
>
> **Repo baseline**: `5d6a9e411390ffc971acfb4097d70abc80ef3156` (`main`)
>
> **Status**: research synthesis; the adopted slices ran as `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md` (Done 2026-08-03, WP1–WP4 on `main` at `3ab8fe29..75f8b34b` — see the closeout addendum at the end of this document).

## Conclusion

LoopX and repo-harness sit on different layers and both tracks of the review agree on that. LoopX is a long-running **goal control plane**: it owns time between sessions — quota, scheduler, monitors, leases — and decides whether and what the next bounded agent turn should be, while never executing agent reasoning itself. repo-harness is a **software delivery workflow governor**: it owns the mutation of a git working tree — plan, contract, worktree isolation, scope guards, merge gate — and has no concept of a tick. The ~15% overlap zone ("what is the next action", "is this ready to close", durable handoff) is a collision, resolvable only by layering, never by coexistence of two authorities.

Adjudicated position: **borrow three invariants, refuse the machinery.**

- **Borrow**: (1) the irreversible-last commit ordering (`result<validate<writeback<spend` plus a named set of outcomes that can never reach the irreversible phase), (2) a crash-durable journal for the finish transaction — fail-closed on re-entry, never auto-resume, (3) an action/help budget with a test. Secondary: a leak-pattern scan on the staged diff at merge-gate time.
- **Refuse**: the dual-authority todo state with read-time merge, per-todo leases (git worktrees are already the kernel-enforced contention unit), write endpoints on the read model, a standalone interaction-decision vocabulary (fold into `EffectiveStateV1.readiness/next_action`), named-debt allowlists in architecture checks, and soft-claim/hard-lease coexistence.

The review also turned the lens inward and found two things the outward comparison alone would have missed: repo-harness's finish transaction has a verified recovery blind spot (after SIGKILL there is no discoverable, verifiable recovery entry — permanent loss is *not* proven, see §7.1), and `evals/` (52,433 lines, outside Required Checks) is the same structural disease as LoopX's 219k-line `examples/` tier, ~40% along the same curve.

LoopX's anti-drift property for long tasks does not come from its 305k-line surface. It comes from one loop discipline: **every turn re-derives its brief from durable state, and only validated writeback advances that state**. repo-harness already owns the durable state and the validated writeback; what it lacks for long-run endurance is the deterministic per-turn fetch entry, a stall detector, and crash durability. Those gaps feed the sprint.

## 1. Systems at a glance (sizes verified this session)

| | repo-harness | loopx |
|---|---|---|
| core source | `src/` 50,376 lines / 400 tracked `.ts` (repo total ~137k) | `loopx/` 304,579 lines / 681 `.py` (repo total 623,899 / 1,566 files) |
| tests | 62,593 | 63,036 |
| non-required tier | `evals/` 52,433 (239 files, not in Required Checks) | `examples/` ~219,500 (427 top-level smoke scripts) |
| test : source ratio | 1.24 | 0.21 |
| action surface | 23 command modules + 52 `run` helpers (uncapped help listing) | 94 commands = 51 curated + 43 help-only; default help capped at 38 lines by a smoke test |
| runtime dependencies | Bun ecosystem | zero (`pyproject.toml` `dependencies = []`) — "lightweight" refers to deps, not surface |

LoopX's core is ~6x repo-harness's source; repo-harness's test discipline is ~6x better by ratio. Broader vs deeper-per-line.

## 2. Positioning — two axes

- **Who owns time.** repo-harness is synchronous and session-scoped: a hook or CLI call fires, `resolveEffectiveState` reads repo artifacts, decides, exits. LoopX owns the goal between sessions (`"session_state_authoritative": False` in its host contract) and decides the next turn without executing it.
- **What is governed.** repo-harness governs mutation of a checkout and a commit (`allowed_paths`, worktree ownership, ff-only merge, evidence over a diff). LoopX governs progress of an objective (todos, gates, claims, quota, writeback); a repo is just one domain behind a capability adapter.

## 3. Verified findings — LoopX kernel

### 3.1 Dual-authority todo state (mid-migration, fenced)

- `list_goal_todos` (`loopx/todos.py:379-446`) reads BOTH sources on every call — event-log projection and Markdown parse — then branches: both populated → merged overlay (`source="event_projection_with_markdown_overlay"`), projection only, or Markdown only.
- On event-log read failure the read path **falls back wholesale to Markdown** (`loopx/control_plane/goals/active_state_event_projection.py:81-89`) — a transient I/O error silently returns a different answer instead of failing.
- Writes are split by lookup result: `add_goal_todo` writes Markdown only (`todos.py:1050`, under flock); `update_goal_todo` writes Markdown if the todo is found there, else appends to the event JSONL only (`todos.py:1524-1660`, `event_writeback.py:298`).
- To LoopX's credit this is a **declared staged migration**, not steady state: `docs/reference/protocols/event-sourced-state-contract-v0.md:156-169` (step 3 dual-write, step 7 retire Markdown-as-canonical), and an architecture test fails closed on new violating edges while recording the existing debt edges by exact module target (`docs/architecture.md:87-98`).
- Cost signal: `todos.py` alone is 2,057 lines. Review detection signature for this class: any read path shaped `if A_has_data and B_has_data: merge(...)`, or `except -> read the other source`.

### 3.2 Turn transaction (the strongest part of LoopX)

- Commit order is a hard-coded contract string: `"commit_policy": "result<validate<writeback<spend;apply<ack;cadence:no-spend"` (`loopx/control_plane/turn_driver/transaction.py:156`).
- Quota spend runs only after durable writeback succeeded (`executor.py:917-1032`); `NO_SPEND_RESULT_KINDS` (user_action_required, wait, host_failure, validation_failed, writeback_failed, quota_spend_failed) can never reach the spend phase (`transaction.py:48-55`, enforced again schema-side in `validate_loopx_turn_receipt`).
- Every phase persists to a resumable journal at a deterministic path keyed by a sha256 over turn identity (`transaction.py:140-150`); crash mid-turn resumes at the first incomplete phase under flock (`executor.py:1088-1130`). The deterministic `turn_key` is the idempotency anchor.
- Interaction contract outputs deliver / ask / wait / self-repair / quiet (`control_plane/work_items/interaction_contract.py:238-370`); quota states `blocked_health, operator_gate, focus_wait, eligible, waiting, throttled, paused` (`control_plane/quota/states.py:5-12`).

### 3.3 Per-todo lease (well built, default off)

`loopx/control_plane/work_items/task_lease.py` (769 lines): `(goal_id, todo_id)` contention unit, CAS on (owner, idempotency_key, version), 45-min TTL, write-scope overlap detection, acquire/renew/transfer/release/inspect. But `docs/architecture.md:150-152` keeps soft `claimed_by` as the default with hard leases optional — two ownership models coexisting.

## 4. Verified findings — LoopX product surface

- **CLI**: 94 real top-level commands; curated 51 (`help_surface.py:13-217` `COMMAND_GROUPS`) + 43 help-only long-tail (`MANPAGE_COMMAND_HELP_ONLY`, `:223-266`); union verified at runtime to equal the parser's 94. A smoke test runs the actual CLI and asserts default help ≤38 lines (`examples/cli-help-manpage-smoke.py`).
- **Status server is NOT pure read-only**: `POST /reward/append` and `POST /control-plane/configure-goal/apply` exist behind opt-in flags, loopback-host and loopback-origin checks (`status_server.py:84-97, 543-550, 747-750`). Lark/Feishu Kanban sync is one-way projection; the React dashboard (`apps/presentation/dashboard`) consumes status JSON.
- **Public/private boundary is mechanically enforced**, not doc-only: `loopx/contract.py` `LEAK_PATTERNS` regex classes (credential, private_doc_url, local_private_path, internal_task_id, private_ip; `:46-68`) plus tracked-state checks, wired into `loopx check` (`cli_commands/status.py:135-163`). Note its `_hit_allowed_by_policy` (`contract.py:705-713`) downgrades hits via a policy allowlist — do not copy that part.
- **Host boundary is clean and consistent**: subprocess/bridge only. The MCP wrapper shells out to the loopx CLI (`claude_goal_mode/mcp/loopx_mcp.py`); Codex CLI is driven as an external process (`turn_driver/codex_cli.py:423`); tmux paste mode for visible sessions. LoopX never executes agent reasoning.
- **Adoption**: bootstrap/connect works on existing repos (onboarding scan reads git history to propose todos, `onboarding.py:104`), preview-then-apply dry-run, tar.gz+sha256 state backup — but **no symmetric rollback of an applied bootstrap**. repo-harness's transactional adoption (backup/precondition/rollback manifest) is more complete here.
- **README loop diagram** (`README.md:39-56`) matches the implementation element-for-element; no marketing gap found there.

## 5. Codex track fact-check

Where the independent Codex report diverged from verified state:

| Codex claim | Verified |
|---|---|
| core package 681 files / 304,579 lines | exact |
| "58 curated operator commands" | wrong — 94 total = 51 curated + 43 help-only |
| 629 smoke examples | 639 (427 top-level) at this commit |
| "Dashboard/Kanban only consume projections" | imprecise — status server has gated write endpoints (the *principle* Codex recommended is still right) |
| dual-authority risk at `todos.py:379` / `event_sourced_state.py:526` | direction correct; missing the "declared staged migration + architecture-test fencing" qualifier and the wholesale read-fallback detail |
| repo-harness compared at ~137k lines | that is the whole repo; `src/` is 50k, making LoopX's core 6x (not ~2.2x) |

Codex's four proposed slices vs the blind track: agreement on read-only projection principle and provider-returns-receipt boundary; disagreement on per-task leases (blind track: refuse — second ownership authority over what git already enforces) and on a standalone `interaction_decision` read model (blind track: fold into existing `readiness/next_action` vocabulary instead of adding a parallel one). Codex proposed neither of the blind track's top two borrows (irreversible-last contract, finish journal).

## 6. Adjudication — borrow / refuse

**Borrow** (smallest coherent slices, ranked):

1. **Irreversible-last phase invariant.** `ship-worktrees.sh` has push at `:439` and PR creation at `:450` ordered correctly by line position only. Slice: one TS module exporting the ordered phase list + a `NO_PUSH_OUTCOMES` set (gate FAIL/BLOCKED, unattributed dirty worktree, missing evidence), imported by ship/merge-gate surfaces, plus one test asserting no irreversible phase precedes commit+archive and no listed outcome reaches it. ~150 lines.
2. **Crash-durable finish journal** — see §7.1; fail-closed on re-entry, explicitly not auto-resume.
3. **Action/help budget.** Curated group list + one test capping `repo-harness run --help` lines. Budget the real count, not the displayed count — hiding commands (LoopX's 43-command long tail) retires nothing.
4. **Leak-pattern scan at the commit boundary** (secondary): scan the staged diff at merge-gate time only, small pattern set, fail closed, no policy allowlist.

**Refuse** (with the concrete failure mode):

- **Dual-authority state with read-time merge** — which answer the reader sees depends on a boolean computed at read time; the fallback silently changes answers on transient errors; reads papering over the debt remove all pressure to finish the migration.
- **Per-todo lease layer** — a second ownership authority over the git worktree, which the kernel already enforces exclusively. Revisit only the dispatch-time write-scope overlap check, and only after an observed collision.
- **Write endpoints on the read model** — a second write path into workflow state grows beside the CLI and one of them forgets a guard. The MCP read model stays read-only.
- **Standalone interaction-decision vocabulary** — `EffectiveStateV1.readiness/blockers/next_action` already carries deliver/ask/wait/stop semantics; a parallel vocabulary creates a second "what is next" answerer.
- **Named-debt allowlist in architecture checks** — once the allowlist file exists, entry N+1 costs one line. If an exception is ever unavoidable, use LoopX's mitigation shape: a test fixture that must die in the same commit as the code, never a config option.
- **Soft claim default + hard lease optional** — correctness depending on which mode a goal happened to enable.

## 7. Inward findings on repo-harness

### 7.1 Finish transaction recovery blind spot (verified)

`assets/templates/helpers/contract-worktree.sh:459-509`: `finish_transaction_begin()` snapshots `plans`, `tasks`, `.ai/harness/active-plan`, `.ai/harness/active-worktree`, `.ai/harness/sprint`, `.claude/.plan-state` into `mktemp -d`, records `original_head` in a shell variable, and rolls back only from an EXIT trap. SIGKILL / power loss / closed terminal mid-finish leaves the repo half-mutated with no on-disk pointer to the snapshot or original HEAD. `ship-worktrees.sh:123-191` has the identical shape; ship additionally pushes before creating the PR (`ship_linked_pr`, `ship-worktrees.sh:491`), so an interrupt between push and PR leaves an external effect with no phase receipt saying "only PR creation remains". `src/effects/evidence/recovery-materializer.ts` does not cover this: it renders handoff/resume views from the last published checkpoint — it restores reading context, not a half-applied finish.

Claim precision (round-2 adjudication): what is *proven* is the absence of any discoverable, verifiable recovery entry. The mktemp directory and git objects/commits typically survive the process, so a forensic human recovery is usually possible; "permanent data loss" is unproven and per-phase SIGKILL fault injection has not yet been run. The blind spot, not the loss, is the verified defect. (Closed by WP1/WP4: fault injection has since run at every journal phase and passed — see the closeout addendum.)

Fix shape (adopted into the sprint, WP1): journal the closeout transaction under the git common dir — `<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/` — which survives worktree removal, lives outside every working tree, and can never be confused with tracked workflow state. Deterministic transaction key over (repo identity, worktree, operation, plan/contract, original HEAD, target/base SHA); granular phases (`prepared → implementation_committed → gate_sealed → lifecycle_applied → lifecycle_committed → merged|pushed → pr_observed → complete`) each persisted via temp file + fsync + atomic rename; fail closed on re-entry; explicit `recover inspect|abort|reconcile` where abort is allowed only before merge/push and reconcile after an external effect verifies and completes, never rolling back the remote. Hard guard: `resolve-effective-state.ts` and `collect-state-inputs.ts` must never read the journal — the journal records operation progress, never workflow state; violating that reproduces §3.1 locally.

### 7.2 `evals/` is the examples-tier disease, earlier on the curve

LoopX: examples 219k lines ≈ 3.5x its tests — a de-facto second verification tier outside the runner, producing the feeling of confidence. (Round-3 correction: the "outside the runner" half is wrong — the tier runs nightly in shards via `.github/workflows/full-public-smokes.yml` and a cadence audit verifies declared cadence against the real workflow files with a `pr_fast_workflow_drift` check, `canary/smoke_health.py:427-476`. LoopX is ahead of repo-harness on tier ownership; see the round-3 addendum.) repo-harness: `evals/` 52,433 lines across 239 files ≈ 104% of `src/`, reachable only via `benchmark:skills` (`package.json:37`), absent from `.github/workflows/ci.yml` and the Required Checks list (verified). Report-only finding: give each verification tier one owner and one command, or it is not producing confidence.

## 8. Integration boundary (if ever layered)

LoopX above, repo-harness below. One direction. Process boundary only. No shared state.

- **Crosses downward** (LoopX → repo-harness, subprocess only): `state resolve --json`, `run contract-worktree start|finish`, `run merge-gate`; an objective string and an approved plan path — data, not authority.
- **Crosses upward** (exit code + typed JSON, read-only): `EffectiveStateV1` (`readiness`, `blockers`, `next_action`, `state_revision`, `progress_token`); merge-gate verdict PASS/FAIL/BLOCKED.
- **Never crosses**: bidirectional plan/todo authority (a LoopX todo never writes into `plans/` or `tasks/`); LoopX filesystem access to `.ai/harness/*`, `plans/`, `tasks/`, or the worktree; quota/schedule into `readiness` or `progress_token` (the token is a pure content hash — `src/core/state/types.ts:64-69` — feeding time or quota in destroys the property that makes it a hash); any shared mutable file or lock; merge/push authority (LoopX may request a ship turn, never perform one).
- **The one safe coupling**: LoopX's `turn_key` hashes intent; repo-harness's `progress_token` hashes achieved state. Pairing them yields free no-op detection ("repo has not moved since my last turn — do not spend") without either side reading the other's internals.

## 9. Long-run anti-drift gap map

Drift in long tasks happens when the agent's chat context becomes the de-facto authority. LoopX's cure is loop discipline, not surface: every turn re-derives its brief from durable state; only validated writeback advances that state; failed turns neither spend nor advance.

| LoopX mechanism | repo-harness today | Gap | Sprint row |
|---|---|---|---|
| Goal frontier re-read every turn | PRD → sprint backlog → contract chain exists; `sprint-backlog.sh` `cmd_next` (`:415`) already selects the next pending row deterministically | no single continuation envelope composing them | WP2 |
| Typed per-turn route (READY/WAIT/BLOCKED/REPAIR) | `readiness/next_action/blockers` in `EffectiveStateV1` | semantics present, no per-turn consumption shape | WP2 |
| Writeback-before-advance, failed turns don't count | contract finish requires `/check` + checkpoint evidence | mostly present | — |
| No-op detection (quota decides next tick) | `progress_token` exists (`project-effective-state.ts:266`: pure material-progress hash, no time/PID/projection input), unused for this | stall detector missing | WP3 |
| Crash-durable per-phase journal + idempotent key | finish snapshot in `mktemp` + shell vars, EXIT trap only | verified recovery blind spot (§7.1) | WP1 |
| Independent postcondition validation | gatekeeper (fresh context + real commands) | present, stronger | — |
| Scheduler / quota ledger | none | deliberately not built: time belongs to the host (`/loop`, cron); stall detection covers runaway | WP4 documents the host loop; ledger deferred with revisit trigger |

## Addendum — round-2 convergence (2026-08-03)

A second Codex pass reviewed this document and the draft sprint. Full convergence on the refuse list (no lease, no parallel interaction-decision authority, no scheduler/quota ledger, ID/receipt-only integration) and on the borrow list; Codex also accepted the §5 fact-check of its round-1 report. Round-2 refinements adjudicated **into** the plan:

- **Claim precision** (§7.1): "recovery blind spot proven, permanent loss unproven" replaces the earlier data-loss phrasing; per-phase SIGKILL fault injection becomes a WP1 acceptance requirement rather than an assumption.
- **Journal location**: git common dir (`<git-common-dir>/repo-harness/transactions/...`) replaces `.ai/harness/journal/finish/` — survives worktree removal, structurally unreadable as workflow state. Granular phase list, fsync+atomic-rename durability, `recover inspect|abort|reconcile` semantics (abort only pre-merge/push; reconcile never rolls back remote effects).
- **Route vocabulary**: the continuation envelope uses `continue_active_plan | advance_sprint | verify_or_finish | halt | complete | idle` — naming which existing surface continues, with no `ask`/`wait` semantics. This is more faithful to this document's own "fold, don't add" ruling than the draft's `execute/ask/wait/blocked/done`; blocked/needs-user states collapse into `halt` with reasons carried by existing `blockers`/`next_action`/contract Stop Conditions. Command surface: `repo-harness state next --json`; sprint row selection stays with `sprint-backlog` (`cmd_next`), the envelope only points at it.
- **Attempt ledger honesty**: the stall detector's per-turn records are admitted as a new runtime surface (`AttemptReceiptV1`), confined to *liveness evidence* in ignored `.ai/harness/runs/continuation/`, turn-based (before/after `progress_token` per bounded turn, 2 consecutive no-progress turns → `halt:no_progress`), never feeding Effective State or `progress_token`. Falsifiability clause: if real code changes routinely fail to move `progress_token`, fix the fingerprint — do not add heuristics.
- **Scope fences**: action-budget and `evals/` cleanup stay out of this program (independent maintainability work); first WPs avoid `.ai/harness/policy.json` while its pending architecture request is open.

Divergence retained after adjudication: the program PRD stays inline in the sprint file (single source; a separate `plans/prds/` copy would be a second place for the same contract to drift). Sprint rows renamed LRD-* → WP1..WP4 to match the round-2 shape.

## Addendum — program closeout (2026-08-03)

The adopted sprint ran to completion the same day: WP1–WP4 landed on `main` across `3ab8fe29..75f8b34b` — closeout journal + explicit `recover` (WP1), `repo-harness state next --json` continuation envelope (WP2), no-progress circuit breaker (WP3), host conformance doc `docs/reference-configs/long-run-continuation.md` plus `tests/continuation-conformance.test.ts` (WP4).

§7.1's blind spot is closed, by proof rather than assumption: per-phase SIGKILL fault injection ran at every journal phase including between push and PR — the journal is discoverable, rerun fails closed, explicit recover completes without duplicating push or merge. Follow-up concurrency fault injection also proved that simultaneous `finish` or `ship` calls elect exactly one owner before any journal, lifecycle, push, or PR side effect; a dead owner interrupted before journal preparation leaves a discoverable claim that only explicit recovery can clear.

The disposable-repo end-to-end scenario executes the public logical host-command sequence through fixture-local gate implementations: every routing decision is derived from a continuation envelope plus the stdout of the command it names, while the bounded worker reads only the explicit plan path returned by `state resolve` and never prior chat. Each turn samples a closing envelope before recording its receipt, then samples a post-receipt envelope so the no-progress breaker can observe that receipt. This is a conformance proof of command order, data dependency, SIGKILL recovery, and byte-stable halt behavior; it is not a claim that the test shells out through the globally installed `repo-harness` binary for every logical command.

Residuals are ledgered in `tasks/todos.md` with revisit triggers: closeout journal GC, per-goal quota budget, action/help budget (borrow #3), merge-gate leak-pattern scan (borrow #4), and the `evals/` verification-tier ownership finding (§7.2). WP4's final gate returned one manual, record-only finding (LOW-4) on the placement of the receipt-invisibility disjunction binding test; the test remains in the conformance suite (`tests/continuation-conformance.test.ts:101`), and no action is required unless a later work-package touches that surface.

## Addendum — round-3 uncovered-area sweep (2026-08-03)

After program closeout, a full sweep of the areas rounds 1–2 never adjudicated (all 91 top-level modules and 10 `control_plane/` subdirs at the same pinned commit: the ~53k-line benchmark subsystem, `canary/`, `doctor`/`diagnose`, `control_plane/{runtime,testing,scheduler,agents,handoff}`, reward memory, `capabilities/` 76k lines across 14 domain packs, `domain_packs/`, `extensions/`, and the authority/configuration/agent-registry surfaces) found **zero new borrow candidates** clearing the observed-pressure-point filter. Everything examined fails in one of three ways: it re-imports refused machinery (named-debt metric ceilings in `canary/maintainability_ratchet.py:47-58`, a bool-score fallback authority in `benchmark_ledger_countability.py`, a second stall counter in `scheduler/automation_liveness.py`, a preview-only shadow writer in `runtime/local_state_write_correctness.py` — the exact dual-path shape ESA-06 was deferred to avoid); it duplicates an authority repo-harness already holds (worktree ownership vs `agents/workspace_guard.py`, subject-bound evidence vs `benchmark_core/turn_fidelity.py`, freshness/stale-source projection vs `runtime/stale_latest_run.py`, content-hashed adapter verification vs `doctor.py` readback); or it belongs to LoopX's multi-domain generality (`capabilities/`, `domain_packs/`, `extensions/`), which a single-domain delivery governor must not import.

Two evidence attachments landed on existing `tasks/todos.md` rows; nothing opened: (1) the §7.2 correction above — the tier-ownership row now records that LoopX's examples tier is owned (nightly sharded runs + cadence-vs-workflow drift audit), so the comparison argues for action rather than complacency, and pins the smallest shape as "scheduled execution + one drift assertion", never the auditor machinery; (2) the `checks_failed` split row gains a routing refinement from `control_plane/quota/projection_repair.py:110`: route the `missing_artifact` class to a repair continuation inside the existing closed route vocabulary. Conditions that would reopen the verdict: either ledgered trigger firing; a deliberate move to multi-domain or multi-agent-lane operation; or an observed concurrent-session workflow-artifact corruption, which revives ESA-06 with `expected_revision` returning as an enforcing writer, never a shadow validator.

## Provenance

Dual-track method: an independent Codex report (received 2026-08-03) and a Claude-side track of two read-only exploration passes over the LoopX checkout plus one high-effort blind judgment pass that never saw the Codex report; divergences adjudicated by the orchestrator with every contested claim re-verified against the checked-out sources at the commits pinned above. LoopX runtime behavior beyond its demo smoke was not executed; README's "200+ hour" lifetime claims remain unverified narrative.

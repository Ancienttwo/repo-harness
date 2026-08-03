# Long-Run Continuation

Long tasks drift when chat context becomes the de-facto authority. The continuation protocol removes that dependency: the host decides *when* to wake, repo-harness answers *what is next* from durable state alone. A fresh session with no memory of the previous turn reaches the same answer as a session that ran twenty turns.

repo-harness ships no scheduler, no daemon, no timer, and no quota or token ledger. Wake timing belongs entirely to the host loop — Claude Code `/loop`, Codex Goal mode, cron, or a human running one tick at a time.

## The Tick

One tick, in order:

1. `repo-harness state next --json` — read the opening `ContinuationEnvelopeV1` and retain its `progress_token` as `$BEFORE`.
2. Execute **at most one bounded unit**, per the envelope's route (table below).
3. Run the targeted checks or the acceptance gate that the unit requires.
4. Finish the unit, or record the halt.
5. `repo-harness state next --json` — read the closing envelope and retain its `progress_token` as `$AFTER`.
6. `repo-harness state attempt` — record the turn's `AttemptReceiptV1` from `$BEFORE` to `$AFTER`.
7. `repo-harness state next --json` once more. This post-receipt envelope applies the no-progress breaker and is the only envelope from which the host may stop or open the next tick.

Rules that make the tick safe to repeat:

- `state next` is read-only and deterministic. Identical repo bytes and identical receipt ledger bytes yield byte-identical JSON; it never creates a plan, contract, or worktree, and never advances the sprint. Row selection stays with `sprint-backlog`; the envelope only names the command to run. The closing envelope is sampled before its turn receipt exists; only the post-receipt envelope can observe that receipt and trip the breaker.
- One tick executes one unit or one halt — never two units, never a unit plus a "while I am here" extra.
- The tick's working directory is the unit's own worktree. `advance_sprint` on a contract row starts a linked `codex/<slug>` worktree and moves the active-plan marker into it; every following tick for that unit runs there. `.ai/harness/active-worktree` is per-tree runtime state, so running `state next` in the primary tree describes the primary tree, not the in-flight contract.

## Per-Route Host Action

| Route | Meaning | Host action |
|---|---|---|
| `continue_active_plan` | The active plan has an open task; `reason` carries `next_action:<step>` | Run the envelope's `command` (`repo-harness state resolve --json`) for the full brief, then dispatch bounded execution on that next task |
| `advance_sprint` | No active plan, and the Approved sprint still has a pending row | `repo-harness run sprint-backlog start-task --execute` |
| `verify_or_finish` | The active plan's tasks are all checked off | Run the completion gate — `repo-harness run verify-sprint --prepare-acceptance`, then `repo-harness run acceptance-receipt record`, then `repo-harness run verify-sprint` — and only then `repo-harness run contract-worktree finish`. The envelope's `command` field names only the gate's final verification step (`repo-harness run verify-sprint`); the full gate sequence and the `finish` step are protocol knowledge from this document, not envelope-supplied |
| `halt` | A blocker, an unapproved plan/sprint, unusable sprint authority, a stall, or an unreadable ledger; `command` is `null` | Surface `reason` to the operator and stop. Never retry a halt without a state change — the same bytes produce the same halt |
| `complete` | Every backlog row of the active sprint is done | Stop the loop |
| `idle` | No active plan and no active sprint | Stop the loop |

`halt` carries the existing vocabulary rather than inventing one: `blockers:<list>`, `plan_status:<status>`, `sprint_status:<status>`, `sprint_backlog:empty`, `sprint_backlog:unknown_row_status`, `active_sprint:stale`, `stale:active_plan_marker`, `no_progress`, `attempt_ledger_unreadable`. There is no `ask` or `wait` route: a needs-user state is a halt whose reason points at the blocker, the contract's Stop Conditions, or the handoff.

## Attempt Receipts

Record one receipt after each bounded turn:

```bash
repo-harness state attempt --unit-ref "$UNIT" \
  --outcome completed \
  --before-progress-token "$BEFORE" --after-progress-token "$AFTER"
```

- `$BEFORE` is the `progress_token` from the envelope that opened the turn; `$AFTER` is the token from the envelope that closes it. **Tokens compare envelope-to-envelope only.** Never compare an envelope token against a `state resolve` token: `state next` resolves whole-repo inspect-scoped (`targetPaths: []`, `operation: inspect`), while `state resolve` is edit-scoped and accepts `--target-path`/`--operation`. The two coincide while the risk resolution agrees and diverge exactly when the edit-scoped input adds or drops a hard blocker — a mismatch that would read as false progress.
- Two consecutive `completed` receipts on the same `unit_ref` with an unchanged token make the next envelope return `halt:no_progress`. The count resets on a token change or on an explicit `--outcome resumed` receipt.
- `--outcome resumed` needs no tokens. It is the operator's explicit override, and it is the only way to clear a stall without real progress.
- Receipts are liveness evidence, never authority. They append to the ignored `.ai/harness/runs/continuation/attempts.jsonl` and answer only "did this turn move anything" — never "what is the goal, task, or next step".

## Crash Recovery

Closeout is an exclusively owned, journalled transaction. Before either command writes a journal, lifecycle state, commit, push, or PR, `contract-worktree finish` and `ship-worktrees` atomically create a worktree-scoped claim at `<git-common-dir>/repo-harness/transactions/claims/<operation>/<worktree-hash>.lock/`. Simultaneous callers contend on that directory: exactly one becomes owner, and every loser fails closed before any closeout side effect. The owner then writes a `CloseoutJournalV1` under `<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/`, one durable record per phase (`prepared → implementation_committed → gate_sealed → lifecycle_applied → lifecycle_committed → merged|pushed → pr_observed → complete`), each via temp file + fsync + atomic rename. The git common dir keeps claims and journals outside every working tree, so they survive worktree removal and are structurally unreadable as workflow state.

The owner releases its claim only after a terminal journal status. An interrupted closeout **fails closed**: a plain rerun of `finish` or `ship` refuses while either an `in_progress` journal or an ownership claim exists and points at `recover`. A mutating recovery first proves the recorded owner PID is no longer live, then atomically acquires the claim's recovery lane; it never steals from a live owner. A SIGKILL before journal preparation therefore leaves an orphan claim rather than an invisible gap, and explicit `recover abort` is the only operation that clears it. There is no auto-resume or automatic stale-claim reclamation anywhere in the protocol.

| Command | Semantics |
|---|---|
| `recover inspect` | Prints the ownership claim, recorded owner PID/liveness, and, when prepared, the journal directory, status, last phase, original HEAD, snapshot presence, plan/contract/branch/base, and every recorded phase. Read-only |
| `recover abort` | After taking recovery ownership, restores the pre-closeout state from the snapshot. Allowed **only before** the merge or push landed; refused afterwards. If the dead owner was interrupted before journal preparation, this explicitly clears the orphan claim |
| `recover reconcile` | After taking recovery ownership, completes the missing steps after an external effect landed. Never rolls back the remote: no second merge, no second push, no duplicate PR — a post-push interrupt completes only `pr_observed` |

A journal owned by another worktree never blocks this one, and a `complete` journal is neither replayed nor reported as recoverable.

A closeout ownership conflict is a helper-level refusal, not an envelope halt reason, so it never appears in `state next`. When `finish` or `ship` reports one, run `recover inspect`. If the recorded PID is live, wait for that owner or stop it deliberately; never start a parallel closeout. If it is dead, run `recover abort` before merge/push or `recover reconcile` after the external effect. A dead pre-journal claim also requires explicit `recover abort`.

## Operator Remedies

| Halt reason | Remedy |
|---|---|
| `no_progress` | Investigate why the unit stopped moving. Then either make real progress (a token change clears the breaker by itself), or, if the turns were legitimately non-material, record `repo-harness state attempt --unit-ref <unit> --outcome resumed` to override explicitly |
| `attempt_ledger_unreadable` | Inspect `.ai/harness/runs/continuation/attempts.jsonl`, then truncate it. The ledger is liveness evidence, not authority: resetting it loses nothing durable and the loop resumes from the same envelope |
| `blockers:*`, `plan_status:*`, `sprint_status:*`, `sprint_backlog:*`, `active_sprint:stale`, `stale:active_plan_marker` | Fix the named authority artifact. These are the existing Effective State and sprint vocabularies; the envelope does not add remedies of its own |

## The Receipt-Invisibility Invariant

Attempt receipts must never look like material progress, or the circuit breaker would clear itself. Two independent mechanisms keep the ledger out of `progress_token`, and **either one alone suffices**:

- `.ai/harness/runs/` is gitignored, so the ledger never reaches the Git status/diff scan that builds the review subject.
- `isOperationalReviewPath` (`src/effects/review/diff-fingerprint.ts`) classifies `.ai/harness/runs/` as operational, so even an unignored ledger lands in the review subject's `excluded_paths` and never in its `paths`.

`tests/continuation-conformance.test.ts` binds both arms: it asserts `git check-ignore` covers the real repository's ledger path, and it asserts the classifier excludes that path in a repository that carries no ignore rule at all.

## Sources

- Sprint (PRD of record): `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`
- Design rationale: `docs/researches/20260803-loopx-comparative-analysis.md` (§9 gap map + round-2 addendum)
- WP1 closeout journal: `tests/contract-worktree-closeout-journal.test.ts`
- WP2 continuation envelope: `tests/continuation-envelope.test.ts`
- WP3 no-progress breaker: `tests/continuation-attempt.test.ts`
- WP4 host conformance: `tests/continuation-conformance.test.ts`
- Worktree lifecycle and the completion gate: `docs/reference-configs/sprint-contracts.md`

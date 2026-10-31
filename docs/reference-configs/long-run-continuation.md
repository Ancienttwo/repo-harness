# Long-Run Continuation

Long tasks drift when chat context becomes the de-facto authority. The continuation protocol removes that dependency: the host decides *when* to wake, repo-harness answers *what is next* from Git state, the GitHub issue and the PR. A fresh session with no memory of the previous turn reaches the same answer as a session that ran twenty turns.

No local handoff file is part of this loop. The Stop hook does not write `.ai/harness/handoff/current.md` or `resume.md`, and Effective State does not read them or `tasks/current.md`.

repo-harness ships no scheduler, no daemon, no timer, and no quota or token ledger. Wake timing belongs entirely to the host loop — Claude Code `/loop`, Codex Goal mode, cron, or a human running one tick at a time.

## Where the Next Unit Comes From

The branch is the only next-unit input. Effective State reads it with Git and applies one rule:

| Branch | `next_action` |
|---|---|
| Canonical `<type>/<digits>-<slug>`, for example `feat/1228-handoff-retirement` | `Continue GitHub issue #1228 on branch feat/1228-handoff-retirement.` |
| No issue number, no slug, extra path segments, or detached HEAD | null; the envelope is `idle` |

The message always names both the issue and the branch. The host reads that issue and its PR for the task scope and the exact step. An ambiguous branch never invents a target: the loop stays idle until the branch names one issue.

## The Tick

One tick, in order:

1. `repo-harness state next --json` — read the opening `ContinuationEnvelopeV2` and retain its `progress_token` as `$BEFORE`.
2. Execute **at most one bounded unit**, per the envelope's route (table below).
3. Run the targeted checks or the acceptance gate that the unit requires.
4. Finish the unit, or record the halt.
5. `repo-harness state next --json` — read the closing envelope and retain its `progress_token` as `$AFTER`.
6. `repo-harness state attempt` — record the turn's `AttemptReceiptV1` from `$BEFORE` to `$AFTER`.
7. `repo-harness state next --json` once more. This post-receipt envelope applies the no-progress breaker and is the only envelope from which the host may stop or open the next tick.

Rules that make the tick safe to repeat:

- `state next` is read-only and deterministic. Identical repo bytes and identical receipt ledger bytes yield byte-identical JSON; it never creates a workflow artifact or worktree. The closing envelope is sampled before its turn receipt exists; only the post-receipt envelope can observe that receipt and trip the breaker.
- One tick executes one unit or one halt — never two units, never a unit plus a "while I am here" extra.
- The tick's working directory is the unit's own worktree. `.ai/harness/active-worktree` is per-tree runtime state, so running `state next` in the primary tree describes the primary tree, not the in-flight issue branch.

## Per-Route Host Action

| Route | Meaning | Host action |
|---|---|---|
| `continue` | The branch names one GitHub issue; `reason` carries `next_action:Continue GitHub issue #N on branch <branch>.` and `unit_ref` is a stable hash of that message, so projection-only edits do not reset the stall group | Read the issue and PR for the exact step, then run the envelope's `command` (`repo-harness state resolve --json`) for the full brief |
| `halt` | A blocker, a stall, or an unreadable ledger; `command` is `null` | Surface `reason` to the operator and stop. Never retry a halt without a state change — the same bytes produce the same halt |
| `idle` | No next action is available | Stop the loop |

`halt` carries the existing vocabulary rather than inventing one: `blockers:<list>`, `no_progress`, `attempt_ledger_unreadable`. There is no `ask` or `wait` route: a needs-user state is a halt whose reason points at the blocker.

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

Closeout is an exclusively owned, journalled transaction. Before a commit, push, or PR, `ship-worktrees` atomically creates a worktree-scoped claim at `<git-common-dir>/repo-harness/transactions/claims/<operation>/<worktree-hash>.lock/`. Simultaneous callers contend on that directory: exactly one becomes owner, and every loser fails closed before any closeout side effect. The owner then writes a `CloseoutJournalV1` under `<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/`, one durable record per phase (`prepared → implementation_committed → candidate_frozen → push_started → pushed → pr_create_started → pr_observed → complete`), each via temp file + fsync + atomic rename. The git common dir keeps claims and journals outside every working tree, so they survive worktree removal and are structurally unreadable as workflow state.

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
| `attempt_ledger_unreadable` | Run `repo-harness state attempt-repair --json`. It moves an unterminated last line (a torn append) to `attempts.torn-<ms>` beside the ledger and truncates the ledger to its last complete receipt. `state attempt` refuses to append until this repair runs. If `ledger_status` is still `unreadable`, `unreadable_line` names a malformed complete line: inspect `.ai/harness/runs/continuation/attempts.jsonl` and remove that line by hand. The ledger is liveness evidence, not authority: resetting it loses nothing durable and the loop resumes from the same envelope |
| `blockers:*` | Fix the named authority artifact. These are the existing Effective State vocabulary; the envelope does not add remedies of its own |

## The Receipt-Invisibility Invariant

Attempt receipts must never look like material progress, or the circuit breaker would clear itself. Two independent mechanisms keep the ledger out of `progress_token`, and **either one alone suffices**:

- `.ai/harness/runs/` is gitignored, so the ledger never reaches the Git status/diff scan that builds the review subject.
- `isOperationalReviewPath` (`src/effects/review/diff-fingerprint.ts`) classifies `.ai/harness/runs/` as operational, so even an unignored ledger lands in the review subject's `excluded_paths` and never in its `paths`.

`tests/continuation-conformance.test.ts` binds both arms: it asserts `git check-ignore` covers the real repository's ledger path, and it asserts the classifier excludes that path in a repository that carries no ignore rule at all.

## Decision Trail

This decision trail is adapted from pstack (cursor/plugins, MIT, Lauren Tan).
Record each choice in the existing evidence ledger:

```sh
repo-harness run decision-trail record --phase build --decision "Use the ledger" --why "Keep one authority" --evidence '#812' --evidence src/core/evidence/checkpoint.ts:1 --result "Implemented"
repo-harness run decision-trail render --format tsv --limit 20
```

`record` prints one event ID. It writes a `decision.recorded` event with producer
`decision-trail` and trust class `observed`. It binds the observation to HEAD.
It does not verify uncommitted files. `--run-id` can name the agent conversation.
Evidence must name a commit SHA, PR number, repo-relative `file:line`, or artifact
path. Paths must have no spaces. Do not put prose or secrets in evidence pointers.
Tabs and line breaks become spaces. The event writer applies its usual redaction
and blob rules. TSV cells that start with `=`, `+`, `-`, or `@` get a leading quote.

To correct a choice, record a new event with `--supersedes <event_id>`.
The target must be an accepted decision from this worktree. The raw log keeps both
events. The accepted-event fold removes the earlier row from every projection.
`render` defaults to a Markdown table. Rows run from oldest to newest.
`--since <event_id>` excludes that accepted row and all earlier rows.
An unknown or replaced cursor fails. `--limit N` keeps the latest N remaining rows.
Render output is a projection. It is not a second store.

Checkpoint publication retains the latest 20 accepted decisions by `created_at`.
Equal times keep append order. New decisions appear after the next checkpoint
publication.

## Sources

- Next unit: the branch's canonical `<type>/<digits>-<slug>` issue, its GitHub issue and PR
- Task record: GitHub issue and PR
- Design rationale: `docs/researches/20260803-loopx-comparative-analysis.md` (§9 gap map + round-2 addendum)
- WP1 closeout journal: `tests/contract-worktree-closeout-journal.test.ts`
- WP2 continuation envelope: `tests/continuation-envelope.test.ts`
- WP3 no-progress breaker: `tests/continuation-attempt.test.ts`
- WP4 host conformance: `tests/continuation-conformance.test.ts`
- Completion gate: PR checks and CI

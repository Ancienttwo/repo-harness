> **Archived**: 2026-08-19 03:34
> **Related Plan**: plans/archive/plan-20260818-1156-shared-lease-protocol.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260819-0334

# Implementation Notes: shared-lease-protocol

> **Status**: Active
> **Plan**: plans/plan-20260818-1156-shared-lease-protocol.md
> **Contract**: tasks/contracts/20260818-1156-shared-lease-protocol.contract.md
> **Review**: tasks/reviews/20260818-1156-shared-lease-protocol.review.md
> **Last Updated**: 2026-08-18 12:00
> **Lifecycle**: notes

## Design Decisions

Slice A (coordination types, plane primitives, claim verbs):

- One backlog grammar, not two. `project-continuation-envelope.ts`'s
  `backlogRowStatuses` read status cells with its own copy of the
  `backlog_rows` scan; the coordination derivation needs the Task, Mode, and
  Acceptance cells from the same rows. The scan moved to
  `src/core/state/sprint-backlog-rows.ts` and both consumers read it there, so
  `tests/sprint-backlog-grammar-drift.test.ts` still binds exactly one TypeScript
  projection to the bash authority.
- `task_id` and `task_revision` are bare 64-character lowercase hex, not the
  house `sha256:<hex>` shape used by `progress_token` and `state_revision`.
  `task_id` is a single path component under `leases/` and `locks/tasks/`, and
  a bare hex string is a safe component everywhere; `TASK_DIGEST_PATTERN` is
  enforced in the effects layer before any derived value reaches `join()`.
- The digest preimage is `JSON.stringify` of an ordered, domain-tagged string
  array rather than a joined string, so no field value can forge a separator
  into another field's position. `tests/coordination-identity.test.ts` pins
  this with a two-field collision attempt.
- Mutual exclusion reuses `withExclusiveDirectoryLock` instead of hand-rolling
  the shell's `acquire_backlog_lock()` mutex in TypeScript. It is the same
  atomic-`mkdir` election with stale reclaim, hardened with a published owner
  token and PID liveness, and `git-state-version-store.ts` already runs it
  against this same git common directory. A second, weaker mutex beside it
  would be a duplicate authority for the same datum.
- `claim`'s post-write re-read compares the claim's own preconditions (the row
  exists, is still pending, still carries the expected revision) rather than
  the sprint blob or the resolved commit. Comparing whole-file or whole-ref
  state would invalidate every concurrent claim whenever an unrelated row
  completed, which is exactly what the contract's falsifier forbids.
- `released` is published durably before the lease directory is removed, so the
  crash window inside `release` lands in a named state. That is what lets
  `reconcile` clear a residue in this slice without guessing: the record itself
  proves the transfer finished. Clearing a residue on the strength of a
  completed canonical row needs the completion split and is slice B.

Slice B (start-task integration, completion split, cutover, harness):

- The shell never derives an identity. `sprint identify --task <index|cell>
  --target-ref --sprint-path` is the only bridge from the caller-facing task
  reference to `task_id`/`task_revision`; re-deriving either digest in awk
  would be a second implementation of the identity contract. Two more verbs
  exist for the same reason: `sprint begin-completion` (the finish gate) and a
  required `--target-ref` on `reconcile`.
- The fencing token is held as a per-tree capability file at
  `.ai/harness/sprint/claims/<task_id>.claim` (gitignored runtime state, a
  `key=value` record this script both writes and reads). It is not authority:
  the lease record is. It exists so `finish` can check the claim id and the
  worktree binding *independently* -- a stolen-from worktree fails both, since
  `steal` mints a new token and nulls `execution_worktree`.
- A tree holding no claim token releases nothing and gates nothing. That is not
  a fallback: contract worktrees also execute plans captured outside the sprint
  flow, and a row whose claim was stolen leaves a lease that is not this
  caller's to delete. Holding the token *is* the ownership proof.
- `complete-task` releases the lease inside the backlog-lock critical section
  it already holds. `contract-worktree finish` passes `--defer-lease-release`,
  because its transaction boundary is the publication commit, not the row
  rewrite that builds the publication tree.
- `begin-completion` moves `bound -> completing` and admits
  `completing -> completing`, because contract finish is re-runnable by design
  (its closeout journal replays). The state names the publication window:
  `completing` + pending row is a crashed finish, `completing` + `[x]` row is a
  finish that published and died before releasing, which `reconcile` clears.
- `acquire_backlog_lock()` keeps its mtime-based stale reclaim and only changes
  location, per the plan. The TS `withExclusiveDirectoryLock` now addresses the
  same directory with a stricter reclaim rule; the asymmetry is real and is
  pinned by two rows in the concurrency harness (see Open Questions).

## Deviations From Plan Or Spec

- The owner record carries one field the plan's JSON sketch does not:
  `stolen_from: { claim_id, reason } | null`. `steal --reason` is otherwise
  inert, and the plan's own case against `--force` is that it left "no record of
  who took what from whom". Only `steal` ever sets it; a first claim writes null.
- `claim` and `steal` take an explicit `--session-id`. The record requires a
  non-empty holder identity and nothing in the current surface can derive one,
  so it is a required option rather than an inferred or defaulted value.
- Slice B: `start-task` now fails closed when the captured plan path cannot be
  resolved, rolling the reservation back. It previously warned and returned 0.
  A reservation whose plan path is unknown is a lease nobody can find.
- Slice B: the quiescent cutover gate runs inside `runInit` on the apply path.
  `repo-harness init --dry-run` never reaches `runInit` (the CLI routes it
  straight to `runAdoptionPlan`), so the gate cannot refuse a dry run; the
  programmatic `runInit({ apply: false })` path reports `apply would refuse`
  as a skipped step instead of failing.
- Slice B: `reconcile` gained a required `--target-ref`. Slice A's two reconcile
  tests were updated to pass it. The completed-row proof is only as good as the
  ref it was read from, and an optional ref would silently report `none` for a
  lease the caller asked about.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Hand-roll the `acquire_backlog_lock()` mkdir mutex in TS | Rejected | `withExclusiveDirectoryLock` is the same primitive, already proven on this common dir |
| `sha256:<hex>` task ids, matching `progress_token` | Rejected | the id is a path component; the prefix buys nothing and costs filesystem safety |
| Re-read canonical by comparing the resolved commit | Rejected | any unrelated commit would fail live claims; the falsifier requires row-scoped comparison |
| Locate `bind`/`release`/`steal` leases by an extra `--task-id` | Rejected | the plan fixes those flag sets on `--claim-id`; the scan is a lookup and the record is re-compared under the lock |
| Delete an empty lease directory during reconcile | Rejected | it cannot distinguish a crashed claim from a live one paused between `mkdir` and the write |
| Keep the claim id in `.ai/harness/worktrees/<slug>.json` | Rejected | that record's sole-selection authority lives in `verify-sprint.sh`, outside `allowed_paths`, and widening its schema is the relocation this WP excludes |
| Let `complete-task` infer "do not release" from being inside a linked worktree | Rejected | inference where an explicit flag works; `finish` passes `--defer-lease-release` and says why |
| Read the lease by scanning for `execution_worktree == $PWD` at finish | Rejected as the only check | it collapses the two checks the plan names into one; the token file makes claim id and binding independently falsifiable |
| Fix `ADVANCE_COMMAND` to carry `--task` | Done | `allowed_paths` amended to cover the two paired doc surfaces; see the acceptance-fix slice below |
| Make the conformance driver synthesize its own `start-task` argv | Rejected | it passes against a command the envelope never named; the driver now executes `envelope.command` literally |
| Have the envelope pick the row by index instead of Task cell | Rejected | `--task <index\|task>` accepts both, but the index is positional and shifts as rows land; the Task cell is the stable name |
| Gate the cutover on `!quiescent` alone | Rejected | live contract worktrees are an adopted repo's steady state, so the gate would refuse every later `init` forever |
| Gate the cutover on the coordination root's existence | Rejected | a lease sweep or interrupted lock leaves an empty directory behind, which would then read as installed |

## Acceptance-Fix Slice (post slice B)

- **The envelope now names the row.** `advanceCommand()` in
  `src/core/state/project-continuation-envelope.ts` emits
  `repo-harness run sprint-backlog start-task --task '<row task>' --execute`,
  taking the Task cell of the first `[ ]` row from `backlogRows()`. The
  projection stays pure -- no clock, filesystem, or PID -- because the cell is
  already inside the sprint text it was reading. This is not claim-next
  returning: `start-task` still refuses to select a row; the envelope's
  consumer names it. The cell is free text, so it is single-quote escaped
  (`'` -> `'\''`).
- **The conformance driver executes the published string again.** Slice B had
  rewritten `tests/continuation-conformance.test.ts` to synthesize its own argv
  via `firstPendingRow(cwd)` while still asserting the old bare string, so the
  file passed against a command the envelope never emitted -- the one property
  it exists to hold went unasserted. `firstPendingRow` is deleted; the driver
  parses argv out of `envelope.command` with `shellArgv()` and runs that.
  Verified red before green: with the driver restored and the envelope still
  bare, the string assertion failed, and with the assertion also relaxed to the
  bare form the executed helper exited 2 with
  `start-task requires --task <index|task>`.
- **The cutover gate is one-shot.** `src/cli/commands/init.ts` now runs the
  quiescence check only when `isCutoverInstalled(repoRoot)` is false, and marks
  the crossing on success. The marker is a versioned `protocol.json` under the
  coordination root on the git common dir -- a file, not a directory, so an
  empty directory left by a lock or lease sweep cannot spoof it. Without this,
  probing any repo with live `repo-harness-wt-*` worktrees returned
  `quiescent: false` and `init --repo <x>` would have exited 1 forever.
- **The dry-run reporting branch is deleted.** No CLI path reached it:
  `src/cli/index.ts` hardcodes `apply: true`, and the interactive re-entry is
  rejected for `init`. Routing `--dry-run` through the gate was not attempted;
  `runAdoptionPlan` returns before `runInit` is reached.
- **`rollback_claim`'s remediation message was unrunnable.** It named
  `repo-harness sprint reconcile`, which requires `--task-id` and
  `--target-ref`, so the printed command exited on a usage error. Now aligned
  with the wording `scripts/contract-worktree.sh` already used.

## Slice C/D (harness completion, WP1 closeout)

- **The falsification table is split across two suites on purpose, and the split
  is now written into the harness header.** Rows whose hazard is filesystem
  ordering (crash windows, races, cutover refusal, mirror bytes) live in
  `tests/sprint-claim-concurrency.test.ts` over real linked worktrees; rows whose
  hazard is purely derivational (row reorder and deletion, slug collisions,
  cross-sprint isolation, separator forging, an unrelated row's Mode/Acceptance
  edit) live in `tests/coordination-identity.test.ts`, where no filesystem is
  involved. Racing a real clone to re-assert a pure function would buy nothing
  and cost seconds per row.
- **The two `unknown` rows are asserted from a sibling worktree, not the tree
  that created the damage.** The unit suite already pins the classifier on an
  empty lease directory, a truncated record, and a symlinked record. What only a
  real clone can show is the property the shared plane exists for: the sibling
  sees the same `unknown`, its `claim` is refused with the reason plus the verb
  that resolves it, and `reconcile` reports without clearing. The symlink row
  additionally plants a *valid* decoy record as the link target -- the lease must
  refuse to follow it rather than adopt a record from outside its own directory.
- **Sibling non-drift is asserted end to end through the real inline path, not
  by editing the sprint file.** Row one is claimed and bound from a linked
  worktree; row two runs `start-task` and `complete-task` in the primary tree, so
  the row rewrite and the lease release happen inside the shell's own
  backlog-lock critical section, and the result is committed to `main` before
  row one is re-checked. Writing the `[x]` by hand would have asserted the
  digest's granularity while skipping the transaction boundary that produces it,
  and this is the harness's only end-to-end coverage of the inline half of the
  completion split. The fixture needs an active plan, because an inline row is
  captured as a checklist row into it.
- **Undrifted on paper is not the assertion.** The test re-runs
  `begin-completion` for row one after the sibling landed: the claim must still
  pass the finish gate, not merely report an unchanged revision.
- **Row 8 needed no new mechanism.** `tests/helper-scripts.test.ts` already runs
  `bun scripts/sync-helper-sources.ts --check` and asserts the packaged helper
  set equals `assets/workflow-contract.v1.json#helpers.scripts`, and the harness
  carries its own byte-compare row for the two scripts this work package
  touches. A third mirror assertion would be a third authority for one datum.

## Open Questions

- **A steal that lands after the finish gate but before publication cannot stop
  that publication.** The gate is a check-then-act and no atomic operation
  spans a git publication and a filesystem lease -- the same reason the plan
  accepts `done` + residual lease as legal. The harness asserts the reachable
  invariant instead: the two verbs serialize, the lease ends with exactly one
  owner, and the displaced token cannot pass the gate again.
- **The empty-lock-directory wedge is now clone-level.**
  `exclusive-directory-lock.ts:254` refuses to reclaim a lock directory with no
  published owner token, because an empty directory cannot distinguish a
  crashed creator from a live one paused between `mkdir` and publication. With
  `locks/backlog.lock/` on the shared plane, one crash in that window fails
  every worktree's back-fill closed behind a 5s timeout until an operator
  clears the directory. The shell primitive, keeping its mtime rule, *does*
  reclaim the same empty directory after a minute. Both behaviours are pinned
  in `tests/sprint-claim-concurrency.test.ts`; reconciling the two reclaim
  rules is not in this work package.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

# Implementation Notes: wp1-crash-durable-closeout-transaction

> **Status**: Active
> **Plan**: plans/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md
> **Contract**: tasks/contracts/20260803-1824-wp1-crash-durable-closeout-transaction.contract.md
> **Review**: tasks/reviews/20260803-1824-wp1-crash-durable-closeout-transaction.review.md
> **Last Updated**: 2026-08-03 18:24
> **Lifecycle**: notes

## Design Decisions

- **Journal primitive is duplicated verbatim in both helpers, not extracted.**
  A new `closeout-journal.sh` would have to be registered in
  `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json`,
  both outside this contract's scope and the second under a pending
  architecture request. `contract-worktree.sh` and `ship-worktrees.sh` already
  carry `json_escape`, `policy_get`, `normalize_slug`, and `is_linked_worktree`
  as identical copies, so the identical `closeout_journal_*` block follows the
  existing house shape. The two copies are byte-identical; a future extraction
  is a one-file move.
- **Transaction key uses `git hash-object --stdin`, not `sha256sum`/`shasum`.**
  The plan wrote "sha256 over ...". `git` is the only binary these helpers
  already hard-require and validate (`GIT_BIN` must be absolute and
  executable), while `sha256sum` is absent on macOS and `shasum` is a perl
  dependency. Selecting between them at runtime would be exactly the kind of
  compatibility fallback the repo forbids, and a hard dependency on either
  would make `finish` fail on hosts where it works today. The digest is
  deterministic and reproducible from a fresh recovery process, which is all
  the key needs; keys are per-repo and stored under that repo's own common dir.
- **Durability is `dd of=<tmp> conv=fsync` followed by `mv -f`.** Verified
  present on both BSD `/bin/dd` and GNU coreutils `dd`; `status=none` was
  avoided because it is GNU-only (stderr is redirected instead).
- **`status.json` is rewritten whole on every phase.** One file is the phase
  authority and one atomic rename publishes it, instead of an append log plus
  a separate pointer that could disagree. `meta.json` is written once at
  `prepared`. Both are line-formatted plain JSON so the shell can read them
  back with fixed `sed` patterns and no `jq` dependency (`policy_get` already
  treats `jq` as optional).
- **Status is recorded before the payload is discarded.** `complete` and
  `aborted` are journalled *before* `rm -rf <journal>/snapshot`, in the
  in-process commit/abort paths and in both `recover` paths. The first
  fault-injection run caught the opposite order: a SIGKILL landing between the
  snapshot deletion and the status write left an `in_progress` journal with no
  restorable snapshot, a journal claiming progress it could not undo.

## Deviations From Plan Or Spec

- **Re-entry is blocked per worktree+operation, not only per key.** The
  contract says finish/ship "fail closed when an `in_progress` journal exists
  for the same key". The key binds the original HEAD, so a run that crashed
  after committing can never reproduce its own key on retry, which makes a
  same-key-only guard inert for exactly the interrupt named in the Falsifier.
  The guard therefore matches any `in_progress` journal whose `meta.json`
  `worktree` equals this worktree, and ignores every other worktree's journals
  (which the acceptance note requires). Same-key handling stays for the
  complete and aborted cases.
- **The re-entry guard runs early, before contract resolution.** A crash after
  `lifecycle_applied` has already archived the plan and contract, so a plain
  rerun cannot resolve them and died with `no active sprint contract found`
  before reaching a guard placed next to the journal open. The worktree-scoped
  check is now the first thing `finish_worktree` does after the
  linked-worktree check; key derivation and journal creation stay where the
  plan/contract/base inputs exist.
- **A `complete` journal is only replayed as a no-op while its effect is still
  in place.** If HEAD has moved off the recorded `complete` ref the
  transaction was undone afterwards (ship's rollback can undo a finish that
  already completed), so the same key starts a fresh transaction instead of
  reporting success for work that no longer exists. Without this rule a ship
  that aborted after its child finish completed would let the retry's finish
  return 0 without archiving anything.
- **`abort` and `reconcile` gate on a verified external effect, not only on a
  recorded phase.** "Abort refused once merged/pushed" is defeated by a crash
  in the window between the effect and its phase record, so both commands
  share one predicate: finish checks whether the target branch already
  contains the candidate, ship checks `git ls-remote` against the sealed SHA.
  `abort` refuses when it is true, `reconcile` refuses when it is false.
  `reconcile` never performs the external effect itself and never rolls the
  remote back; it completes only the missing bookkeeping and, for ship, the
  missing PR creation.
- **Scope note.** `allowed_paths` named only `assets/templates/helpers/`, but
  `bun scripts/sync-helper-sources.ts` projects `scripts/` (canonical) into
  `assets/templates/helpers/` (projection) and `tests/helper-scripts.test.ts`
  enforces byte-identity. Editing only the projection would be reverted by the
  next sync and fails that test. Both canonical files were added to
  `allowed_paths` under the contract's own scope-gate rule ("update this
  contract before widening scope") and the Scope section records the direction
  of the projection.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Shared `closeout-journal.sh` helper file | Rejected | Drags `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` into scope; the latter is under a pending architecture request |
| `shasum -a 256` as a new trusted binary | Rejected | New hard dependency that can fail where `finish` works today; `git hash-object` adds nothing to the dependency set |
| Append-only `phases.jsonl` plus a pointer file | Rejected | Two files that can disagree; a whole-document rewrite keeps one authority per atomic rename |
| `reconcile` performs a missing merge or push | Rejected | Reconcile exists for an effect that already landed; when none has, `abort` is the correct recovery, so it refuses instead of guessing |

## Open Questions

- None.

## Evidence Links

- Tests: `tests/contract-worktree-closeout-journal.test.ts`
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

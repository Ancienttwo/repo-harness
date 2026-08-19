> **Archived**: 2026-08-19 17:25
> **Related Plan**: plans/archive/plan-20260819-1519-coordination-lease-hardening.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260819-1725

# Implementation Notes: coordination-lease-hardening

> **Status**: Active
> **Plan**: plans/plan-20260819-1519-coordination-lease-hardening.md
> **Contract**: tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md
> **Review**: tasks/reviews/20260819-1519-coordination-lease-hardening.review.md
> **Last Updated**: 2026-08-19 15:22
> **Lifecycle**: notes

## Design Decisions

- **Empty lease store as the gate's short-circuit (T3).** `assert_completion_lease_gate` checks
  `$(git rev-parse --git-common-dir)/repo-harness/coordination/v1/leases/` for any entry before it
  does anything else. The absence of the store is the authority for "nothing owns anything on this
  clone", so a repo that never claims completes rows without deriving an identity or reading a
  canonical ref. Ordering it the other way would have made `sprint identify` (and therefore a
  resolvable target ref plus a reachable CLI) a hard precondition of every inline completion --
  exactly the falsifier the contract names.
- **`target_ref` is flat on the record, not nested under `sprint` as in spec §5.** The landed WP1
  record already flattened `sprint.path` to `sprint_path`; adding a nested `sprint` object now
  would have created two shapes for one datum.
- **Reading `claim_id` out of `owner.json` in shell.** The refusal has to name the owning claim, so
  the gate needs one field of the owner record. `lease_owner_field` mirrors
  `closeout_journal_field` in `contract-worktree.sh`, which already reads common-dir owner records
  the same way against the same two-space-indented serialization. This is a read of a field, not a
  second derivation: no digest, state, or ownership decision is re-computed in the shell, and every
  unclassifiable shape (symlinked lease, missing or unreadable record) refuses and names
  `sprint reconcile` instead of being interpreted.
- **`GitBinaryUnavailableError` discriminates on `ENOENT` (T4).** `execFileSync` throws for both "no
  git binary" and "not a git clone"; only the former carries `code === 'ENOENT'`. Splitting them in
  `coordination-cutover.ts` keeps `resolveGitCommonDirectory` untouched (it is outside this
  contract's allowed paths) while making the gate fail closed on the one environment that can prove
  nothing about the repo.
- **`inspectCutoverQuiescence` now reports all legacy-marker blockers before all
  contract-worktree blockers**, because the legacy scan was extracted into
  `inspectLegacyInFlightMarkers` for the v1 entrypoint gate. Blocker set and quiescence verdict are
  unchanged; only the order within `blockers` moved.

## Amendment: T7 (after T1-T6 delivery)

T1-T6 stranded two call sites in `scripts/contract-worktree.sh`, which the orchestrator then named
explicitly in `allowed_paths` (see the amendment comment in the contract). Both were repairs of
call sites this work package itself invalidated, so T7 closed them.

- **The journal key is stamped by a second `begin-completion` call, not by the ownership gate.**
  The brief assumed `sprint_lease_begin_completion` already held the closeout journal key. It does
  not: the gate runs at `finish_worktree` before `refresh_and_freeze_base`, and the key is derived
  from `frozen_base_sha` (plus `original_head`), so at gate time the key does not exist. Moving the
  gate after the key derivation was rejected -- its comment states the reason it runs first, which
  is that a displaced agent must stop before running a full verification pass it may not publish,
  and `tests/sprint-claim-concurrency.test.ts` pins gate-before-publish. So
  `sprint_lease_record_finish_transaction` re-enters `bound -> completing` with the key once
  `closeout_claim_bind_journal` has one. `beginLeaseCompletionRecord` admits
  `completing -> completing` by design (contract finish is re-runnable), so this is the same
  transition rather than a new one, and it fails closed into `closeout_claim_release` exactly like
  the gate.
- **`--expected-claim-id` was added to `reconcile` as an optional narrowing flag.** The brief named
  it; it did not exist (spec §8.5 lists it, the landed WP1 verb did not). It only ever refuses:
  without it reconcile behaves exactly as before, and with it a caller cleaning up after its own
  publication says "clear my lease or nothing". The proofs reconcile acts on still come from an
  authority other than the caller either way, so this does not turn reconcile into a
  token-authenticated verb.
- **The cleanup checks reconcile's `action`, not just its exit code.** `reconcile` exits 0 while
  reporting `action: none` (for example when the canonical row is not `[x]` yet), so the script
  greps for `cleared_completed_lease` before deleting the local claim token. Anything else warns
  and continues -- the publication has already landed, so a residual lease is a reconcilable state
  rather than a failed finish, which is the tolerance shape the old release path had.

## Deviations From Plan Or Spec

- **`reconcile` still does not complete the finish journal** (spec §9.3's "將 finish journal 完成").
  Out of scope for this contract and unchanged by T7, which only swapped the verb and its
  arguments. The lease is cleared; the journal is closed by `finish_transaction_commit` on the
  normal path and by `recover reconcile` otherwise.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a read-only `sprint inspect` verb for the shell gate to call | Rejected | A new command surface nobody asked for; `reconcile` is the only existing read verb and it mutates, so the gate reads the record path directly instead |
| Make `--finish-transaction-key` required on `begin-completion` | Rejected | Would break the existing call site, and the gate legitimately has no key yet |
| Derive `task_id` in the gate instead of calling `sprint identify` | Rejected | A second implementation of the identity contract in awk/sed |
| Let the gate fall through when `sprint identify` fails | Rejected | A live lease store with an underivable identity is exactly when the gate matters; it fails closed |
| Move the ownership gate after the journal key derivation, so one call carries the key (T7) | Rejected | Would run the full verification pass before checking ownership, reversing the gate's stated reason for running first |
| Derive the closeout journal key earlier so the gate can carry it (T7) | Rejected | The key is derived from the frozen target base; freezing it before the ownership gate reorders the whole closeout |
| Treat reconcile's exit code as proof of cleanup (T7) | Rejected | Reconcile exits 0 while reporting `action: none`; the token is deleted only on `cleared_completed_lease` |

## Open Questions

- None. The two call sites left open after T1-T6 were closed by T7 under the amended
  `allowed_paths`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

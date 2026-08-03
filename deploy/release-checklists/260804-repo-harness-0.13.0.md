# repo-harness 0.13.0 Release Filing

- Date: 2026-08-04
- Package: `repo-harness@0.13.0`
- Base release: `v0.12.2`
- Source range: `v0.12.2..candidate`
- Release scope: add the long-run continuation protocol (`state next`
  `ContinuationEnvelopeV1`, `state attempt` `AttemptReceiptV1`, no-progress
  circuit breaker), make contract and ship closeout a crash-durable exclusively
  owned `CloseoutJournalV1` transaction with explicit recovery, publish the
  host conformance contract and its disposable-repo suite, and bind the
  sprint-backlog grammar to a drift check.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.
- Base note: `0.12.3` was prepared at `d807154d` but never tagged or published;
  the registry `latest` is `0.12.2` and no `v0.12.3` tag exists. `0.13.0` is
  therefore the first published release carrying both the `0.12.3` changelog
  entry (`MainLoopDispatchGuard` and Claude-host fixture hermeticity) and the
  `0.13.0` entry below. The `0.12.3` changelog and filing stay as written; this
  release does not re-document their content.

## Candidate Evidence

- `1577c6a0` (WP1) makes closeout crash-durable in `scripts/contract-worktree.sh`
  and `scripts/ship-worktrees.sh` plus their `assets/templates/helpers/`
  mirrors. Before any journal, lifecycle write, commit, push, or PR, the caller
  atomically creates a worktree-scoped claim under
  `<git-common-dir>/repo-harness/transactions/claims/`, so contending callers
  lose on `mkdir` and fail closed before the first side effect. The owner
  writes a `CloseoutJournalV1` with one fsync'd record per phase (`prepared`
  through `complete`) via temp file plus atomic rename, releases the claim only
  on a terminal status, and re-entry after an interrupt fails closed until
  explicit `recover inspect|abort|reconcile`. A mutating recovery proves the
  recorded owner PID is dead before taking the nested `recovery.lock` lane and
  never steals from a live owner; a dead pre-journal claim requires explicit
  `recover abort`. `tests/contract-worktree-closeout-journal.test.ts` covers
  per-phase `SIGKILL` fault injection and the concurrent double-start race.
- `adfc5b84` (WP2) adds `ContinuationEnvelopeV1` — `src/core/state/types.ts`,
  `src/core/state/project-continuation-envelope.ts`,
  `src/effects/state/resolve-continuation-envelope.ts`, and the
  `repo-harness state next --json` surface in `src/cli/commands/state.ts`. The
  command is read-only and deterministic across the six routes
  (`continue_active_plan`, `advance_sprint`, `verify_or_finish`, `halt`,
  `complete`, `idle`), authorizes at most one bounded unit or one halt per
  call, and leaves row selection with `sprint-backlog`. The same commit adds
  `tests/sprint-backlog-grammar-drift.test.ts` and its four fixtures, binding
  the TypeScript backlog reader to `sprint-backlog.sh` over statuses, row
  shapes, section bounds, and CRLF input.
- `1660d9ec` (WP3) adds `AttemptReceiptV1` and the no-progress circuit breaker —
  `src/core/state/attempt-ledger.ts`,
  `src/effects/state/attempt-ledger-store.ts`, and the `repo-harness state
  attempt` surface. Two consecutive `completed` receipts on one `unit_ref` with
  an unchanged `progress_token` produce `halt:no_progress`; a token change or an
  explicit `--outcome resumed` receipt clears it; an unreadable ledger fails
  closed as `halt:attempt_ledger_unreadable`. The ledger stays in the ignored
  `.ai/harness/runs/continuation/attempts.jsonl` so receipts can never read as
  the progress that would clear the breaker.
- `75f8b34b` (WP4) publishes
  `docs/reference-configs/long-run-continuation.md` — the seven-step tick, the
  per-route host action table, the halt vocabulary, crash-recovery semantics,
  and per-halt operator remedies — and
  `tests/continuation-conformance.test.ts`, which runs the whole tick in a
  disposable repository and binds both arms of the receipt-invisibility
  invariant.
- `c0bb834e` (WP5) closes the conformance review artifact only; it adds no
  product path. Neither it nor the WP1-WP4 merges introduce product
  compatibility fallbacks.
- Version sources and localized README projections are `0.13.0`; the generated
  stamp is `repo-harness@0.13.0+template@0.13.0`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.13.0` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.13.0` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.13.0` from `v0.13.0` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.13.0` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- The release gate is run on the release-prep branch before merge and again on
  the exact merged `main` commit before publication.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the release-prep commit.
- After npm publication: never move or reuse `v0.13.0`; correct forward with a
  new patch release.

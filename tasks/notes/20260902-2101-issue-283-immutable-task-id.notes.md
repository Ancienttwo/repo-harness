# Implementation Notes: issue-283-immutable-task-id

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-283-immutable-task-id.md
> **Contract**: tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md
> **Review**: tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md
> **Last Updated**: 2026-09-02 21:01
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:e20691b9d1d9a80110672e895be163803cc2c128ad32ec4066824ac85a18b7ee`

## Design Decisions

- **ID format: keep the existing 64-hex digest shape.** `task_id` is used verbatim
  as a single path component under the coordination root, and every downstream
  validator (`TASK_DIGEST_PATTERN`, the scheduling `TASK_ID` regex, the lease
  store's `assertTaskId`) already enforces bare 64-hex. Choosing that shape for
  the persisted cell means the migration can write each row's *existing* derived
  id and no validator, path join, or receipt schema had to widen.
- **New ids are random, not derived.** `mint_task_id()` in `scripts/sprint-backlog.sh`
  reads 32 bytes from `/dev/urandom`. Deriving a fresh id from the Task text,
  slug, or row index is the exact coupling this change removes, and the lease
  directory is keyed by `task_id` alone, so ids must also be unique across
  sprints in one clone.
- **Version domain: `SPRINT_IDENTITY_PROTOCOL_V2 = 'protocol-v2'`, a literal.**
  `COORDINATION_PROTOCOL` is deliberately untouched at 1: it is in every
  persisted lease owner record's `protocol` field and `parseLeaseOwnerRecord`
  rejects any other value, so bumping it to version an identity derivation would
  invalidate every record on disk. The two version axes are now separate
  constants and the revision preimage carries the literal, not
  `String(COORDINATION_PROTOCOL)`.
- **Schema is declared, never inferred from column count.** The sprint header
  carries `> **Backlog Schema**: 2`; an absent marker is schema 1 and any other
  declared value fails closed. Inferring from the number of cells would make a
  row that lost a cell silently reclassify the whole file. Both the TypeScript
  projection and the awk authority only honour the marker *before*
  `## Backlog`, so the two parsers cannot disagree about a stray marker; a
  fixture in `tests/fixtures/sprint-backlog-grammar/` pins that.
- **The awk emits one fixed field order for both schemas.**
  `index status task mode acceptance plan id`, with an empty id on schema 1.
  Appending the new field rather than inserting it kept every existing `$n`
  reference in `sprint-backlog.sh` at its position; only the two row-rewrite
  awk blocks needed a schema offset.
- **Consumers changed.** Work Graph carrier (`WorkPackageDefinitionV1.task_ref`
  -> `task_id`, with `task_ref` surviving only on `ProjectedWorkPackageV1` as a
  derived display projection); Engineer scheduling projection
  (`src/effects/engineers/scheduling.ts` now feeds `task_ref` as display and
  joins on `task_id`); Fleet board and slice collectors, task inbox, task
  messages, operator board projections, and external-source bindings all reach
  identity through `projectCanonicalTasks`/`lookupCanonicalTask`, so they moved
  with it and needed no join-key edit of their own. The shell surfaces
  (`sprint-backlog.sh`, `check-task-workflow.sh`, `refresh-current-status.sh`,
  `heartbeat-triage.sh`) became schema-aware, and `session-context.ts` stopped
  re-implementing the row grammar and now reads `backlogRows`.
- **Atomicity as implemented: one rollback boundary, one journal, one test face.**
  Every filesystem touch goes through `MigrateSprintSchemaDependencies.fs`, and
  every write goes through `writeTracked()`, which records the file's prior
  bytes (or `null` when it did not exist) before writing. All three writes --
  sprint, Work Graph carrier, receipt -- live inside one `try`; `restore()`
  replays that journal in reverse, removing what did not exist and rewriting
  what did. It attempts *every* entry and only then raises, because the case
  that motivates it (a carrier whose write failed on an unwritable path) is
  exactly the case where the sprint beside it can and must still be put back.
  The journal covers directories too: a receipt directory this run created is
  removed on rollback when it is empty, so a rolled-back migration leaves no
  trace at all. The guard is not per-branch review but
  `tests/unit/sprint-schema-migrate.test.ts`'s injected-fault matrix: each
  filesystem step is failed in turn -- sprint write, carrier write, post-write
  sprint re-read, post-write carrier re-read, receipt write, receipt mkdir --
  and each case asserts the same three facts (sprint bytes, carrier bytes, no
  receipt). Two details the matrix needs to stay honest: the command is captured
  rather than asserted inside a `catch` (a `catch` around the assertions
  swallows the assertion failure and lets an injection that never fired pass as
  if it had), and the re-read injections are keyed on "after this path was
  written" rather than on a read count, because the rollback journal reads a
  file to record its prior bytes and a count would fire during the write instead
  of during the proof. A future write added outside the
  boundary shows up as a new red row instead of passing review. The pre-fix
  evidence that the matrix bites is `/tmp/283-prefix-atomicity.log`
  (`PRE_FIX_EXIT=1`, "the carrier write fails after the sprint was already
  written").
- **Strict validation, and why each one is a refusal rather than a repair.**
  - Schema 1 rows are checked for the exact six-cell shape on the *raw* line
    (`backlogRowLines()`), plus non-empty Status/Task/Mode/Acceptance and a
    well-formed status cell, before a single id is derived. Cell extraction
    substitutes the empty string for a column a row does not have, so a
    truncated row otherwise reads as a row with empty cells and still gets a
    persisted identity derived from whatever text landed in the Task position.
    The Plan cell stays optional: it is not identity-bearing.
  - The legacy Work Graph carrier is validated as a whole -- exact top-level and
    per-package key sets, protocol, kind, the sprint path it claims, its lane's
    emptiness rule, unique `work_package_id`/`task_ref`, and a 1:1 task_ref ->
    task_id mapping. Then the *migrated* carrier is run through
    `validateWorkGraph()` and `projectWorkGraph()` against the migrated sprint
    before it reaches the disk. Migrating a carrier that the runtime later
    refuses is a migration that produced garbage, and the failure would surface
    far from its cause.
  - The carrier is read at the canonical commit through
    `readCanonicalFileAtCommit()` and the working tree must match it byte for
    byte, in both presence and content -- the same rule the sprint already
    obeyed. A dirty, deleted, or stale carrier would otherwise land in a receipt
    that claims to bind that commit's bytes.
  - Every `*_sha256_after` digest is taken from the bytes re-read off disk, not
    from the in-memory rewrite. A receipt that hashed the intention rather than
    the result proves nothing about the file it names.
  - The `--receipt` target is resolved through `repoPath()` (the same
    containment check every other state write uses) and refused when it already
    exists. That gate runs before any write, which is what lets the rollback
    delete a receipt unconditionally: it can only ever be one this run created.
  - The backlog schema marker is read by scanning the whole preamble and
    requiring exactly one declaration with the value `2`. `sprint_ready_error()`
    counts over the same pre-`## Backlog` region rather than the whole file, so
    the gate and the two parsers apply one identical rule and a marker quoted in
    prose below the table cannot fail a file both parsers accept. Returning on the first
    marker let a second, contradictory one sit unread, so this side could
    project identity from a file the awk authority refuses. Both `backlog_rows`
    and `backlog_schema` in `sprint-backlog.sh` apply the same rule, and
    `tests/sprint-backlog-grammar-drift.test.ts` pins the two together on
    duplicated, contradictory, unsupported and empty declarations.
- **BRC0 authority freeze re-baselined, with the campaign owner's acceptance.**
  PR #292 landed `tests/characterization/repair-campaign-authority-freeze.test.ts`
  while this branch was in flight; it froze v1 identity derivation and could not
  load here. Both sprints are now schema 2 (the campaign sprint migrated in this
  branch after its owner released every lease -- all fifteen rows classified
  `available`/`none` before the migration ran), and the freeze was re-baselined
  under four owner conditions: change only the identity/revision assertions,
  record the provenance in the baseline JSON, prove the migration preserved the
  campaign sprint's real ids, and document it in the research file.
  Five digests moved, not the two the conditions anticipated:
  `task.canonical_projection`, both lease records, `publication.receipt_bytes`
  and `publication.marker`. Every one of them carries a `task_revision`, whose
  preimage gained the exact Task cell and the `protocol-v2` domain. `task_id`
  itself was deliberately preserved -- the freeze fixture now persists the same
  ids its rows derived under schema 1, which is exactly what
  `sprint migrate-schema` writes for a real sprint -- so `task.offer_revision`,
  the 5376-input classification matrix, every acceptance digest,
  `publication.publication_id` and the external-source digests are unchanged.
  That set of *unmoved* digests is the evidence the re-baseline is bounded to
  task revision semantics and touched no other authority; the previous values of
  all five are recorded under `rebaselined.previous` in the baseline JSON so the
  owner can audit the delta rather than take it on trust. The negative proofs
  (Issue is not a Task, prompt is not a Claim, heartbeat read-only, autoplan
  retired, capability absent, `unmapped_surfaces`) are unchanged; the only edit
  inside them is that an invented identity is now fabricated by a test-local
  `inventedTaskId()` helper, because schema 2 removes the product function that
  turned text into an identity. That helper is labelled in the file as something
  no `src/` code may do.
- **Claim tokens are located by identity, not by Task text.** The token file is
  `<task_id>.claim` and carries its own `task_id`, but `find_claim_token()` in
  `sprint-backlog.sh` scanned every token and matched the `sprint` and `task`
  fields against the Task cell. A renamed row therefore reported "this tree
  holds no claim token": the completion gate refused a row the tree really
  owned, and the release that follows completion silently released nothing --
  the exact identity-from-display-text defect this contract removes, still alive
  in the shell after the TypeScript side moved. It now opens
  `${task_id}.claim` directly and verifies the token carries the identity its
  filename claims. `release_task_lease()` reuses the id the completion gate
  already resolved, and short-circuits when this tree holds no token at all so
  the zero-coordination flow still never reaches the CLI. The two other `.claim`
  scanners (`contract-worktree.sh`, `ship-worktrees.sh`) were already
  identity-based -- they take the single token in the worktree and read
  `task_id` out of it -- so the sweep changed nothing there.
- **Inline completion is fenced on task revision, not only on ownership.**
  Locating the claim token by identity fixed half the rename story and exposed
  the other half: the token was found, the claim ids matched, and
  `complete-task` happily completed and released a lease taken against a
  definition that no longer existed. Identity surviving a rename is the point;
  the *definition* not surviving it is what `task_revision` is for. The gate now
  compares the canonical revision `sprint identify` returns against the one the
  owner record carries, and refuses with both values plus the named recovery
  (release and re-claim, or an explicit steal). It re-derives neither value --
  both come from the CLI, which owns every digest -- and it reaches the same
  conclusion the contract path already reached inside the per-task lock in
  `sprint begin-completion` ("drifted since it was claimed"). Sweep: the two
  other finish/steal surfaces delegate to that same CLI gate
  (`contract-worktree.sh` through `begin-completion`, `ship-worktrees.sh`
  through the publication CLI, which re-reads the owner record), so the inline
  path was the only one missing it.
- **The canonical projection carries the persisted id exactly once.**
  `projectCanonicalTasks()` embedded the whole backlog row next to `task_id`,
  and under schema 2 that row carries `id` -- the same datum in two places, with
  no authority to resolve a disagreement between them. The projected row is now
  `CanonicalTaskRow` (`Omit<BacklogRow, 'id'>`), produced by a rest spread that
  preserves the remaining key order, so the projected shape is identical to
  schema 1's. That also made the BRC0 freeze honest: `task.canonical_projection`
  had been moving for two reasons, and now moves only through `task_revision`,
  which is what the baseline's `rebaselined.note` claims. `BoardTaskInput` and
  `BoardOwnershipInput` follow the same shape; no consumer read `row.id`.
- **Precondition proof and write are one coordination boundary.** The migration
  used to prove the live-lease, sprint-bytes and carrier-bytes preconditions
  outside any lock, so a `complete-task` holding the shared backlog lock could
  flip a row to `[x]` between the proof and the write and have it overwritten.
  It now surveys the row set unlocked (only to learn *which* task locks to
  take), then takes the shared backlog lock plus every affected row's task lock
  in sorted `task_id` order and re-proves everything inside: canonical read,
  receipt absence, sprint bytes, the row set itself, lease state, and both
  carrier byte comparisons. A row set that moved while the locks were being
  taken is refused rather than migrated, because the locks held would not cover
  the new rows. The sort is what stops two callers deadlocking by pairing the
  same locks in opposite orders.
- **The receipt is created with `O_CREAT|O_EXCL`.** "Check then write" cannot
  make "never overwrite somebody else's receipt" true: two migrations both
  observe the absence and both write. The create is now one syscall, the receipt
  is journalled only after it returns, and an `EEXIST` rolls this run's own
  writes back and leaves the winner's bytes untouched.
- **A live sprint may not be schema 1.** `sprint_ready_error()` is only asked
  about Approved/Executing sprints, and it now requires exactly one schema-2
  declaration there, naming `sprint migrate-schema` when it is missing. Schema 1
  stays readable for archived sprints and for the migration input, never for
  live execution: activating a sprint without persisted ids means every title
  edit silently deletes a task and creates another, which is the defect this
  whole contract exists to remove.
- **A migration failure always means "files untouched".** Every gate past the
  write goes through `restoreAndRefuse()`, and the whole post-write section is
  wrapped so an *unexpected* throw restores `beforeBytes`/`carrierBefore` and
  drops any receipt before rethrowing. The restore runs in its own `try`: a
  restore failure surfaces and names the original cause through `{ cause }`
  rather than silently replacing it. The pure rewrite is injected through
  `MigrateSprintSchemaDependencies.rewriteSprint` because that is the only seam
  able to produce bytes that pass the rewrite and then fail the re-read proof.
- **Migration receipt path**: `<sprint stem>.schema-migration.v1.json` next to
  the sprint, overridable with `--receipt`. It is a durable commit surface, not
  runtime evidence, because it is the only proof binding old/new sprint bytes,
  old/new Work Graph bytes, and the target commit.

## Deviations From Plan Or Spec

- **Row shape.** The issue *recommends* `| ID | Task | Mode | Acceptance | Status |`.
  The repo's real backlog grammar is six cells,
  `| # | Status | Task | Mode | Acceptance | Plan |`, and `scripts/sprint-backlog.sh`
  owns both the `#` index (its `--task <index|task>` reference form and the row
  regex anchor) and the `Plan` cell (written by `complete-task` and `start-task`).
  Schema 2 therefore *adds* the ID column rather than dropping two live ones:
  `| # | ID | Status | Task | Mode | Acceptance | Plan |`. Every acceptance
  criterion in the issue is about identity semantics, not column count, and the
  required change is stated as "one persisted immutable Task ID column".
- **`repo-harness run check-state-boundaries` is not a registered helper.** The
  plan and dispatch name it; the runtime only exposes
  `bun run check:state-boundaries` (`scripts/check-state-boundaries.ts`). The
  contract records the working invocation.
- **Both tracked sprints stay schema 1, and `scripts/check-task-workflow.sh
  --strict` is red because of it — by design, migrated in sequence.** Enforcing
  "Approved/Executing must be schema 2" is correct and was the reviewed
  requirement; it lands while two sprints under `plans/sprints/` are mid-flight
  and cannot be migrated in this pass. Refusing a live lease is a contract
  requirement the migration must not bypass, and releasing or stealing one is
  out of scope, so each sprint is migrated by whoever owns its lease:
  - `20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
    (row 10, `completing`) — attempted here under explicit operator
    authorisation and **blocked**; see the reconcile deadlock below.
  - `20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` (row 1, `bound`,
    owned by another session) — deliberately untouched. It is migrated in this
    branch after that session's PR merges and its lease is released; the
    orchestrator orders the rebase and the migration then.
- **Judge the gate by the repo-local script, not the installed runtime.**
  `repo-harness run check-task-workflow --strict` reports OK while
  `bash scripts/check-task-workflow.sh --strict` reports the two sprints above.
  That is the known runtime-resolution skew: `repo-harness run` dispatches to
  the installed global helper, which still carries the pre-change copy. The
  repo-local script is the honest signal for this contract, and the divergence
  disappears once the change ships and the global runtime is updated.
- **A schema 1 lease cannot be reconciled once identity is schema-2-only.**
  Found while executing the authorised step 1 recovery. The two verbs deadlock:
  `sprint migrate-schema` refuses while any row holds a non-released lease, and
  `sprint reconcile` can only clear a non-`released` lease by proving the
  canonical row is completed -- a proof that runs through
  `lookupCanonicalTask()`, which now fails closed on a schema 1 sprint. Row 10
  really is `[x]` at `main`, so the proof exists in the bytes and is simply
  unreachable through the schema-2-only path. Reconcile therefore returned
  `classification: "completing"`, `canonical_status: null`,
  `canonical_error: "... is still backlog schema 1 ..."`, `action: "none"`, and
  mutated nothing. This is a migration-ordering trap for every downstream repo,
  not just this one: any lease minted before the migration becomes
  unreconcilable after it -- so the trap is general, not local to this repo, and
  it needs exactly one verb opened rather than a general dual-read.
  **Decision (authorised): implemented.** `sprint reconcile` -- and only
  `sprint reconcile` -- may prove completion for a schema 1 sprint, through
  `lookupLegacyTaskForReconcile()` in the existing
  `src/core/state/sprint-schema-v1.ts` compatibility surface. Why that verb and
  no other: every other identity consumer runs *after* a sprint is live, so
  failing closed costs nothing and protects everything; reconcile is the only
  one that must run *before* the migration, and refusing it is what closes the
  loop. The exception is bounded three ways -- the lease must be a `completing`
  residue (a `reserving` or `bound` lease is live work that still belongs to its
  owner), the row's derived schema 1 id must equal the lease's own `task_id`
  (the caller never supplies a Task cell, so no renamed or unrelated row can be
  matched into a lease it does not own), and the row's status cell must be
  completed. It dies with the same `sprint-schema-v1-parser-removal` trigger,
  which now names this consumer in the `tasks/todos.md` row. Guarded by four
  cases in `tests/coordination-lease-store.test.ts`; pre-fix red at
  `/tmp/283-prefix-reconcile.log` (`PRE_FIX_EXIT=1`, all four).
- **Both tracked sprints are schema 2 now; the succession sprint took a
  recovery step to get there.** The first migration attempt on
  `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
  refused, because row 10 still held a stranded non-released lease in state
  `completing` and refusing a live lease is a contract requirement the migration
  must not bypass. That refusal was real evidence the gate works on live state.
  Under explicit operator authorisation the lease was then cleared through
  `sprint reconcile` -- which proved row 10 was `[x]` at `main` through the
  bounded schema 1 recovery window described above, released it, and mutated
  nothing else -- and the sprint was migrated in `772cc059`. The campaign sprint
  `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
  followed in `ed1a01de` once its owner released every lease (all fifteen rows
  classified `available`/`none` before the migration ran). The v1-parser removal
  trigger stays recorded in `tasks/todos.md`; what it now waits on is archived
  sprints and downstream repos, not these two.

- **The workflow gate criterion runs the checkout's script, not the installed
  runtime.** The contract, `CLAUDE.md`, and `AGENTS.md` previously named
  `repo-harness run check-task-workflow --strict`. That form resolves the helper
  from the *installed* package, and this work-package is what introduces the
  schema-2-aware helper: the released 0.18.0 copy has no `Backlog Schema`
  handling at all, so once both repo sprints migrated it reported them as
  `missing backlog table header '| # | Status | Task | Mode | Acceptance | Plan |'`
  while the checkout's own script reported `[workflow] OK`. The criterion cannot
  be rescued with `REPO_HARNESS_SOURCE_ROOT`: `scrubHarnessEnv()` in
  `scripts/run-bounded-verifier-command.ts` strips every `REPO_HARNESS_*`
  variable before spawning a verification command, deliberately, so that
  harness-internal wiring can never make a criterion pass. All three surfaces
  are therefore aligned to CI's exact form,
  `bash scripts/check-task-workflow.sh --strict` (`scripts/check-ci.sh`), which
  is the repo's real gate and the authority for a repo whose sprints are already
  schema 2. Operator consequence: until a release ships this helper, a global
  `repo-harness` older than it will report a false "not execution-ready" on any
  repo whose sprints have been migrated.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Bump `COORDINATION_PROTOCOL` to 2 for the new derivation | Rejected | It is the persisted lease record's `protocol` field; `parseLeaseOwnerRecord` fails closed on any other value, so every live lease on disk would become unreadable |
| Keep a dual-read that derives identity from the Task cell when the `ID` column is absent | Rejected | That is the indefinite dual-read the issue forbids, and it would leave the exact defect (identity from display text) reachable on every unmigrated sprint |
| Insert the persisted id as the awk's 2nd emitted field to match its column position | Rejected | Every `$1..$6` reference in `sprint-backlog.sh` would shift; appending it as field 7 keeps the shell diff to the two row-rewrite blocks |
| Derive fresh ids from `sha256(sprint path + task text)` so fixtures stay reproducible | Rejected for product code, kept for tests | In product code that reintroduces the coupling; `tests/helpers/sprint-fixture.ts` does it deliberately and says so, because a fixture must name its own ids |
| Change the plan `Source Ref` grammar from `sprint:<path>#<Task cell>` to `#<task_id>` | Deferred | It is a separate authority (plan-to-row binding, not task identity) and would require rewriting the `Source Ref` header of every existing plan; see Open Questions |

## Open Questions

- `proveCanonicalTaskPlan()` still binds a plan to its row through
  `sprint:<sprint path>#<exact Task cell>`
  (`src/effects/state/coordination-canonical-source.ts`). After a title edit the
  plan proof therefore mismatches until the plan's `Source Ref` header is
  updated, even though `task_id` survived. That is a plan-binding authority, not
  task identity, and migrating it would rewrite the header of every existing
  plan, so it stayed out of scope. Tracked as the
  `plan-source-ref-task-cell-coupling` row in `tasks/todos.md`.
- The migrated ids are the schema 1 derived values, whose preimage includes the
  git common-directory path of the clone that runs the migration. That is exactly
  what the issue asks for (preserve the known identity rather than invent an
  alias), and the persisted value becomes the authority everywhere afterwards,
  but it does mean a sprint migrated on two different clones would land two
  different id sets. Migrate once, commit the result.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

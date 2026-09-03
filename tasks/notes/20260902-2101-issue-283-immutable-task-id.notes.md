# Implementation Notes: issue-283-immutable-task-id

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-283-immutable-task-id.md
> **Contract**: tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md
> **Review**: tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md
> **Last Updated**: 2026-09-02 21:01
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:8452ee59f33c5504a2c801e924c6e90c40e366b388f8f51761b5969ac55ec01e`

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
  The guard is not per-branch review but
  `tests/unit/sprint-schema-migrate.test.ts`'s injected-fault matrix: each
  filesystem step is failed in turn and each case asserts the same three facts
  (sprint bytes, carrier bytes, no receipt). A future write added outside the
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
    requiring exactly one declaration with the value `2`. Returning on the first
    marker let a second, contradictory one sit unread, so this side could
    project identity from a file the awk authority refuses. Both `backlog_rows`
    and `backlog_schema` in `sprint-backlog.sh` apply the same rule, and
    `tests/sprint-backlog-grammar-drift.test.ts` pins the two together on
    duplicated, contradictory, unsupported and empty declarations.
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
  --strict` is red because of it.** Enforcing "Approved/Executing must be
  schema 2" is correct and was the reviewed requirement, but it lands while two
  sprints under `plans/sprints/` are mid-flight and cannot be migrated:
  `20260828-2321-collaborative-work-exchange-agent-succession.sprint.md` row 10
  holds a stranded `completing` lease, and
  `20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` row 1 holds a live
  `bound` lease belonging to another worktree. Refusing a live lease is a
  contract requirement the migration must not bypass, and releasing or stealing
  one is out of scope here, so each sprint must be migrated by whoever owns its
  lease. Note that `repo-harness run check-task-workflow --strict` still reports
  OK because the installed global runtime carries an older copy of the helper;
  the repo-local script is the honest signal.
- **The repo's own sprint stays schema 1.**
  `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
  could not be migrated: row 10 still holds a stranded non-released lease in
  state `completing`, and refusing a live lease is a contract requirement the
  migration must not bypass (releasing or stealing it is explicitly forbidden).
  The refusal is real evidence that the gate works on live state. The sprint is
  complete (all rows `[x]`), no active-sprint marker points at it, and no
  identity-minting path reads it, so it stays schema 1 read-only. The blocker and
  the v1-parser removal trigger are recorded in `tasks/todos.md`.

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

# Task Contract: epc-07-recovery-view-cutover

> **Status**: Active
> **Plan**: plans/plan-20260722-2246-epc-07-recovery-view-cutover.md
> **Task Profile**: code-change
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `e5fb55e11863fa51a6945f411327be3cb5bd4c50` (pinned per R1 post-EPC-06: fresh fetch after EPC-06 merged (PR #122) plus its row-flip commit; verified equal to `origin/main` and this worktree's HEAD at task start -- `git merge-base --is-ancestor e5fb55e1... HEAD` holds)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-07-recovery-view-cutover`
> **PR Unit**: one PR carrying the recovery materializer, the Stop internal content-source swap, the retired/thinned writer scripts, the red-first test suite, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 23:40
> **Review File**: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`
> **Notes File**: `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Four independent authoring paths (plus one undeclared, found below) can each
write `handoff/current.md` and `handoff/resume.md`. A hand-edited or
divergent recovery projection can silently steer a fresh session, and the
current split leaves `resume.md` in one of TWO different shapes depending on
which writer last ran (a minimal projection at real Stop time vs. an
elaborate one only when a human/CI explicitly runs
`codex-handoff-resume.sh`). With the EPC-06 checkpoint as the canonical
evidence snapshot, the surviving views become deterministic, D8-provenanced
projections, and the writers that made them shadow authorities are deleted
same-package rather than papered over.

## Goal

Phase A (this section) inventories every writer/consumer/trigger for the
four recovery views with file:line evidence and reconciles each against the
frozen D9 preliminary verdicts, revising in this contract where reality
disagrees (D9 explicitly assigns revision authority here). Phase B (Detailed
Design + Task Breakdown) implements the reconciled cutover: one recovery
materializer renders the handoff view and the merged resume view (plus the
task-handoff payload) from `resolveLastPublishedCheckpoint` (fail-closed)
plus minimal live workflow context; the Stop handler's internal content
source swaps to it with frozen external semantics; retired writers are
deleted/thinned same-package; tests are red-first.

## Phase A: Inventory (recorded before any Phase B edit)

### View 1 -- handoff (`.ai/harness/handoff/current.md`)

**Writers found:**

1. **TS Stop handler** -- `src/cli/hook/stop-handler.ts:478-536` (`projection()`
   builds `handoffContent`), committed by `StopProjectionBatch.commit()`
   (`stop-handler.ts:414-430`) via `atomicWrite` (`stop-handler.ts:320-337`).
   This is the ONLY writer that runs automatically, at every real Stop (root
   `CLAUDE.md`: hooks route through one in-process handler). It is a
   **complete independent reimplementation** of the bash logic below (same
   Markdown shape, same field derivations, ported without a shared module --
   confirmed by the copy-paste artifact at `stop-handler.ts:511`, whose
   resume marker literally still reads
   `<!-- generated-by: workflow_write_handoff v1 -->`, i.e. the TS port never
   updated the marker it inherited from the bash source it was ported from).
2. **Bash `workflow_write_handoff`** -- `.ai/hooks/lib/workflow-state.sh:1779-1971`
   (canonical source `assets/hooks/lib/workflow-state.sh:1779`, identical by
   `diff`). Writes `$handoff_file` via heredoc (`:1894-1971`). Its only
   caller is `scripts/prepare-handoff.sh:54` (`workflow_write_handoff "$reason"`,
   library-present branch) -- confirmed by a repo-wide grep for invocation
   sites (not the definition): no other caller exists.
3. **`workflow_ensure_harness_surface` bootstrap** -- `.ai/hooks/lib/workflow-state.sh:122`
   (`[[ -f "$(workflow_handoff_file)" ]] || printf "# Harness Handoff\n\n> **Reason**: bootstrap\n" > "$(workflow_handoff_file)"`).
   **This is the undeclared fifth writer** (see "Undeclared writer" below).
4. **`scripts/prepare-handoff.sh`'s own no-library fallback** --
   `scripts/prepare-handoff.sh:71-79` (heredoc, fires only when
   `.ai/hooks/lib/workflow-state.sh` itself is absent). Classified
   out-of-scope bootstrap content (see "Classified out of scope" below).

**Readers/consumers found:**

- `src/core/state/project-effective-state.ts:318-326` -- `durable_recovery_state`
  readiness requirement, satisfied purely by
  `handoffFreshness !== 'missing' && resumeFreshness !== 'missing'`
  (existence + mtime; **content-independent**). Feeds
  `allowedToStop`/`readyToShip` via `src/core/workflow/operation-readiness.ts`
  and `artifact-requirement-policy.ts`.
- `src/effects/state/resolve-effective-state.ts:211-213` -- `HANDOFF_PATH`/
  `RESUME_PATH`/`CURRENT_SNAPSHOT_PATH` constants feeding the freshness
  computation above.
- `src/cli/hook/session-context.ts:239-247,557-593` (EPC-08 SessionStart
  surface, read-only for this package) --
  `workflowHandoffFile`/`workflowResumePacketFile` path resolvers;
  `handoffSectionHasSignal(repoRoot, handoffFile, header)` scanning for
  non-empty `## Blockers` (`:628`) and `## Changed Files` (`:629`) sections
  -- **both headers must survive verbatim** in the new handoff template.
  `resumeAvailable()` (`:577-584`) additionally requires the LITERAL marker
  `<!-- generated-by: repo-harness codex-handoff-resume v1 -->` plus a
  `## Resume Prompt` header inside `resume.md` -- see View 2 below for the
  reconciliation this forces.
- `scripts/check-task-workflow.sh:939,592-602` -- `handoff_file` policy
  resolution; mtime-only freshness checks (resume vs. handoff, resume vs.
  `tasks/current.md`); `is_contract_helper_path` (`:662-680`) recognizes
  `prepare-codex-handoff.sh`/`codex-handoff-resume.sh` as known helper
  basenames (existence-of-file check only, content-independent).
- `scripts/refresh-current-status.sh:215-231` (`handoff_next_step`) --
  scans handoff for `## Exact Next Step` -- **this header must survive
  verbatim**.
- `src/cli/mcp/tools.ts:1178-1190` (`latest_handoff` MCP tool) -- reads
  `resume.md` (not `current.md`) plus two unrelated files, previews first 10
  lines; content-shape-agnostic.
- `scripts/verify-sprint.sh:634-635` -- existence-only trigger, re-runs
  `prepare-codex-handoff.sh` opportunistically when either file exists.
- Docs/partials (`AGENTS.md`, `CLAUDE.md`, `assets/partials*`,
  `docs/reference-configs/handoff-protocol.md`, `README*.md`) -- human-facing
  references to the files' existence/purpose; not structural.

**Trigger:** exactly one automatic trigger (real Stop, in-process TS
handler); the bash writer only fires on manual/CI invocation
(`scripts/prepare-handoff.sh`, `scripts/check-ci.sh:66-67`, release
checklists, `src/cli/commands/init.ts:713` adopt-verify flow).

### View 2 -- resume (`.ai/harness/handoff/resume.md`)

**Writers found:**

1. **TS Stop handler** -- `stop-handler.ts:511` (`resumeContent`), same
   `projection()`/`StopProjectionBatch` path as View 1. Writes a **minimal**
   resume (Resume Prompt one-liner + Source Artifacts only), marked
   `<!-- generated-by: workflow_write_handoff v1 -->`.
2. **Bash `workflow_write_handoff`** -- `.ai/hooks/lib/workflow-state.sh:1973-1996`.
   Writes the same **minimal** shape as (1), same marker.
3. **`scripts/codex-handoff-resume.sh:215-263`** -- writes an **elaborate**
   resume (Resume Prompt with required/conditional first reads + execution
   rules, marked `<!-- generated-by: repo-harness codex-handoff-resume v1 -->`).
   Callers: directly (CI, release checklists, `repo-harness run
   codex-handoff-resume`), chained from `scripts/prepare-handoff.sh:56-58,80-81`
   (unless `REPO_HARNESS_SKIP_RESUME_REFRESH=1`), chained from
   `scripts/prepare-codex-handoff.sh:48-56`.
4. **`workflow_ensure_harness_surface` bootstrap** --
   `.ai/hooks/lib/workflow-state.sh:123` -- same undeclared-fifth-writer
   finding as View 1 (see below).

**Reality vs. today's two-tier split:** at every real Stop, resume.md gets
the **minimal** shape (marker `workflow_write_handoff v1`); the **elaborate**
shape only exists when a human/CI separately runs `codex-handoff-resume.sh`
afterward. `resumeAvailable()` (`session-context.ts:577-584`) checks for the
elaborate marker specifically, so **today, immediately after a bare Stop
with no follow-up manual refresh, `resumeAvailable()` returns false** -- an
existing, pre-EPC-07 gap this package's merge verdict closes by construction
(one materializer, one resume shape, every time).

**Readers/consumers:** same `durable_recovery_state` (content-independent)
and `resumeAvailable()`/`resumeCurrentForHandoff()` (marker- and
header-dependent, EPC-08 surface, read-only) as above; `latest_handoff` MCP
tool; `check-task-workflow.sh` mtime checks.

### View 3 -- tracked `tasks/current.md`

**Writer:** `scripts/refresh-current-status.sh` (single materializer,
confirmed; marker `<!-- generated-by: repo-harness refresh-current-status v1 -->`
at `:391`). Invoked by: `ensure-task-workflow.sh:830-831` (bootstrap,
`--clear --write`), `archive-workflow.sh:606` (finish, `--clear --write`),
direct/manual/test invocation. No independent competing writer found. **D9
KEEP verdict confirmed as-is; no rewiring required.**

**Readers:** `stop-handler.ts` does not read it; `session-context.ts`'s
`CURRENT_SNAPSHOT_PATH`; `check-task-workflow.sh` freshness checks (mtime vs.
resume); human/doc references. Unaffected by this package.

### View 4 -- Codex-global task-handoff packet

**Writer:** `scripts/prepare-codex-handoff.sh:58-205` -- after chaining (1)
`prepare-handoff.sh` (resume-refresh skipped) and (2) `codex-handoff-resume.sh`
(elaborate resume), writes/updates
`$CODEX_HOME/handoffs/handoff-<yymmdd>.md`, splicing a per-repo
`<!-- repo:<key> start/end -->` block containing cwd, reason, and up to
8000-char excerpts of the repo handoff and resume files (Node primary,
Python3 fallback, inline heredocs, no separate tracked file). **This is the
"unique payload" D9's task-handoff verdict refers to.**

**Readers:** `scripts/codex-handoff-resume.sh:198-201`
(`latest_global_handoff`, referenced from the elaborate resume's
"Conditional first reads"); human/doc references
(`docs/reference-configs/handoff-protocol.md`).

**Trigger:** manual/CI only (`verify-sprint.sh:634-635`,
`src/cli/commands/init.ts:713`, release checklists). Never automatic at
Stop.

### Undeclared writer found (Phase A discovery)

`workflow_ensure_harness_surface` (`.ai/hooks/lib/workflow-state.sh:101-126`,
canonical mirror identical) seeds **both** `handoff/current.md` (`:122`) and
`handoff/resume.md` (`:123`) with a one-line bootstrap placeholder
(`# Harness Handoff\n\n> **Reason**: bootstrap\n` /
`# Codex Resume Packet\n\n> **Reason**: bootstrap\n`) whenever those files
don't already exist. This function is called from THREE sites:
`workflow_write_handoff` itself (`:1787`, harmless -- immediately
superseded by that same function's own full write moments later),
`workflow_append_event` (`:1205`), and `workflow_write_run_summary`
(`:1239`). The latter two are called from many unrelated event-logging call
paths across the hook surface -- meaning **any** event append that happens
to run before the first real handoff/resume write in a fresh worktree
silently plants placeholder content as a side effect, fully independent of
all four named writers above. This is structurally identical to the
`checks/latest.json` `{}` bootstrap EPC-05 already deleted from this exact
function -- confirmed by the code comment already sitting directly above
these two lines (`:113-121`): *"EPC-05: no `{}` bootstrap for
checks/latest.json here anymore -- it is now materialized exclusively from
the evidence ledger... a missing file is genuine absence, not a placeholder
this library should paper over."* The same rationale is adopted here for
handoff/resume (see Phase B, Reconciled Verdicts).

### Classified out of scope (found, not writers of the live materializer)

- **`scripts/prepare-handoff.sh:71-79`'s no-library fallback** -- fires only
  when `.ai/hooks/lib/workflow-state.sh` is entirely absent (a repo that
  hasn't been through `ensure-task-workflow`/adoption yet). Same class as
  the adoption/bootstrap scaffolding below; not a competing authority for
  this repo's own live recovery materializer. No edit.
- **`src/core/adoption/standard-plan.ts:76-77`**, **`scripts/ensure-task-workflow.sh:910-911`**,
  **`scripts/lib/project-init-lib.sh:2327`**,
  **`scripts/run-harness-profile-benchmark.ts:685+`
  (`writeResumeProjection`, a benchmark-fixture writer building isolated
  sandbox workspaces -- explicitly a Layer-2 benchmark-subject input per the
  sprint's R2, not this package's surface)** -- all one-time placeholder/
  fixture writers for a brand-new downstream repo or an isolated benchmark
  sandbox, never this repo's own live per-session recovery projection. No
  edit.
- **`evals/harness/scenarios.json`** -- a benchmark scenario prompt
  referencing "the recorded next action" in resume.md; consumed against the
  benchmark's own synthetic fixture, not the real materializer. No edit.

### Reconciliation against frozen D9 verdicts

- **handoff -- KEEP, retire bash writer, regenerate from checkpoint
  (CONFIRMED as written).** The TS Stop-handler reimplementation is folded
  into the single materializer (it was never a second file-writer in the D9
  sense -- one process, one commit path -- but it WAS a second independent
  content-assembly implementation, which the merge below eliminates).
- **resume -- MERGE into the handoff materializer (CONFIRMED, verdict
  extended with evidence found here).** One materializer emits both views.
  The merged resume adopts the **elaborate** shape (today's
  `codex-handoff-resume.sh` content), not the minimal one, because the
  elaborate shape is what `resumeAvailable()` (an existing, real, EPC-08
  consumer) already requires, and because the two-tier split itself is the
  shadow-authority pattern D9 exists to close. The legacy marker
  `<!-- generated-by: repo-harness codex-handoff-resume v1 -->` is
  **preserved verbatim** in the rendered output as a stable, documented
  external-observable-contract string for `resumeAvailable()` (an EPC-08
  SessionStart internal this package must not edit beyond a filename-level
  reference); the new D8 Provenance block is the actual machine-checkable
  materializer identity going forward, so the legacy string is a stable
  display-compatible discriminator, not a second source of truth -- exactly
  the same "internal swap, external semantics frozen" principle this
  package already applies to the Stop handler's own shape.
- **tasks-current -- KEEP with `refresh-current-status.sh` as existing
  single materializer (CONFIRMED as written).** No rewiring; a
  regenerate-and-byte-compare drift check is added to the test surface only.
- **task-handoff -- MERGE payload / RETIRE independent writer (CONFIRMED as
  written).** The global-packet section-splice logic becomes an additional
  output of the same single materializer; `prepare-codex-handoff.sh` becomes
  a thin invoker with zero independent content assembly.
- **REVISION (new, this contract, D9 revision authority exercised): the
  `workflow_ensure_harness_surface` bootstrap writer for handoff/resume
  (`.ai/hooks/lib/workflow-state.sh:122-123`) is retired same-package,**
  matching the EPC-05 precedent already recorded in the adjacent code
  comment. Rationale: it is an undeclared, silent, side-effect writer
  reachable from unrelated event-logging call paths; once the materializer
  can always render a typed minimal state with no checkpoint present, the
  placeholder is redundant and re-introduces exactly the "placeholder
  silently satisfies downstream expectations" anti-pattern EPC-05 already
  closed for `checks/latest.json`.
- **`scripts/prepare-handoff.sh` requires no code edit.** Its
  library-present branch calls `workflow_write_handoff "$reason"` (now a
  thin invoker of the single materializer) and conditionally chains
  `codex-handoff-resume.sh` (now also a thin invoker of the same
  materializer). Both callees change internally; the call sites are
  untouched. The post-merge double-invocation is idempotent (same
  deterministic content both times) and removing it is an optimization the
  Goal does not require -- left alone per the EXECUTION_BOUNDARY.

## Detailed Design (Phase B)

### New module: `src/effects/evidence/recovery-materializer.ts`

- `resolveRecoveryEvidence(repoRoot)`: wraps
  `resolveLastPublishedCheckpoint`; catches `CheckpointResolutionError` so a
  dangling/invalid marker degrades to the same typed "unavailable" state as
  "no checkpoint yet" rather than throwing (Stop must never crash on a
  recovery-view read; the checkpoint reader itself stays fail-closed/
  unmodified -- this is a consumer-side catch, not a change to
  `checkpoint-store.ts`). Returns a discriminated union:
  `{available:true, checkpointId, generatedAt, coveredEventCount,
  latestByEventType, sourceEventIds}` |
  `{available:false, reason:'no-checkpoint'|'checkpoint-invalid', detail?}`.
- `buildRecoveryContext(repoRoot, activePlanMarker, env, now)`: the "minimal
  live workflow context" -- ported verbatim (single source of truth) from
  `stop-handler.ts`'s existing `activeArtifacts`/`changedFiles`/`nextAction`/
  `recentCommands`/`activeSprintRow`/`supersededPlan`/`todoSourcePlan`/
  `policy`/`safeHarnessPath` helpers. `stop-handler.ts` imports and reuses
  these instead of keeping its own copies.
- `buildRecoveryProvenance(context, evidence, contractPath, now)`: D8 block
  -- `source_event_ids`/`source_checkpoint_id` from the checkpoint when
  available (else `[]`/`null`, the established "not materialized from a
  checkpoint" idiom already used by `checks-materializer.ts`);
  `subject_hash: null` (recovery views are not subject-filtered, same idiom
  checkpoint.ts itself uses for "whole thing, not one subject"); `content_hash`
  = sha256 of the rendered body excluding the provenance block itself
  (mirrors `checkpoint.ts`'s `bodyAsJson` exclusion, so `generated_at`
  staying volatile never perturbs the hash).
- `renderRecoveryHandoff` / `renderRecoveryResume` (pure functions of
  context + evidence + provenance; no fs): same section shape as today's
  handoff (Goal/Decisions/Files Touched/Commands Run/Evidence/Blockers/
  Active Artifacts/Exact Next Step/Resume Prompt/Source Artifacts/Current
  Status/Changed Files/Provenance) and today's elaborate resume (Resume
  Prompt/Required+Conditional first reads/Execution rules/Source
  Artifacts/Provenance), with `## Blockers`, `## Changed Files`,
  `## Exact Next Step`, `## Resume Prompt` headers preserved verbatim for
  the consumers above, and a new `## Evidence`/`## Provenance` section
  sourced only from `evidence` (never re-deriving from `checks/*` or the
  ledger directly -- single hop).
- `renderGlobalHandoffSection` / `updateGlobalHandoffFile`: the task-handoff
  payload (per-repo spliced section), ported from
  `prepare-codex-handoff.sh`'s Node/Python heredoc into one TypeScript
  implementation.
- `materializeRecoveryViews(repoRoot, options)`: orchestrates the above and
  returns `{handoff, resume}` content strings (no disk write -- callers keep
  their own write path: `StopProjectionBatch.commit()`'s existing
  `atomicWrite`, or the new CLI command below).

### `src/cli/hook/stop-handler.ts` (internal content-source swap only)

- `projection()`'s handoff/resume content construction is replaced by calls
  into `recovery-materializer.ts`. External shape frozen: same
  `StopProjectionTarget` kinds/order/count, same `atomicWrite`/lock/observer
  wiring, same stdout/stderr lines.
- **Reordering (documented internal change):** `publishCheckpointFromLedger`
  moves to run BEFORE `StopProjectionBatch.commit()` instead of after, so
  the checkpoint the materializer reads for THIS Stop's handoff/resume is
  the freshest possible one (including any ledger events accepted earlier
  in this same turn), not the previous Stop's stale snapshot. This changes
  no tested observable: `tests/stop-handler.test.ts` asserts checkpoint
  publication only indirectly (never asserts its ordering relative to the
  projection batch), and `tests/evidence-checkpoint.test.ts` tests
  `publishCheckpointFromLedger` in isolation. Still wrapped in its own
  try/catch (unaffected: a checkpoint-publish fault still never blocks
  Stop).
- One frozen-suite assertion needs a minimal documented update:
  `tests/stop-handler.test.ts:155` currently asserts
  `resume.toContain('<!-- generated-by: workflow_write_handoff v1 -->')` --
  this literally characterizes the deleted minimal-resume assembly
  internals. Updated to assert the new merged resume's actual marker
  (`<!-- generated-by: repo-harness codex-handoff-resume v1 -->`, preserved
  per the reconciliation above) plus presence of the new Provenance section.

### New standalone helper: `scripts/recovery-view-cli.ts` (+ mirror)

**Design correction found during Phase B (recorded here, not ad hoc):** the
first draft of this section proposed a `src/cli/commands/` subcommand that
the three bash scripts would shell into via `bun src/cli/index.ts`. That is
wrong: `codex-handoff-resume.sh`/`prepare-codex-handoff.sh`/
`prepare-handoff.sh` are **distributed** helpers (registered in
`assets/workflow-contract.v1.json`, mirrored byte-identically to
`assets/templates/helpers/`) that must run standalone in any adopting
downstream repo, which never receives this package's own `src/` tree --
confirmed by `tests/helper-scripts.test.ts`'s `copyHelpers()` fixture, which
populates a bare temp workspace's `scripts/` directory from
`assets/templates/helpers/` alone and runs these scripts with `bash
scripts/<name>.sh` directly (no `REPO_HARNESS_BUN_BIN`/
`REPO_HARNESS_HELPER_SOURCE_PATH` env, no `src/`). This is exactly why
`prepare-codex-handoff.sh`'s existing global-packet logic is already a
self-contained Node/Python heredoc with zero imports, and why
`assets/templates/helpers/capability-resolver.ts` documents itself as a
"Standalone typed Bun projection."

Corrected design: `scripts/recovery-view-cli.ts` is a new, standalone,
`#!/usr/bin/env bun` TypeScript helper (Bun already the repo-wide required
runtime, `package.json` `engines.bun >= 1.1.35` -- not a new dependency) that
reimplements the context-building and Markdown rendering logic (duplicated
from, and kept consistent with, `src/effects/evidence/recovery-materializer.ts`
by inspection -- the authoritative real-time path stays `stop-handler.ts`'s
direct TS import; this standalone copy exists only because the distributed
bash scripts have no other way to reach equivalent logic) plus a
best-effort, gracefully-degrading read of
`.ai/harness/evidence/checkpoints/last-published.json` ->
`checkpoint.json` (never fabricates evidence on a read/parse failure --
falls back to the same typed "unavailable" shape).

**Second correction (found running `bun run sync:helpers` after the first
correction above):** `scripts/sync-helper-sources.ts --write` fails closed
with `unclassified package helper` on any file under
`assets/templates/helpers/` that is not in the contract's `helpers.scripts`
inventory -- a manually-placed, unregistered mirror copy is not a valid
shortcut; it breaks the shared sync tool for every other helper too. So
`recovery-view-cli.ts` IS registered in `assets/workflow-contract.v1.json`'s
`helpers.scripts`/`helpers.descriptions` (and the byte-identical self-hosted
copy at `.ai/harness/workflow-contract.json`, which
`tests/workflow-contract.test.ts` asserts is exactly equal to the asset
file), then mirrored via `bun run sync:helpers` like every other helper --
no special-case handling needed once registered (default byte-identical
mirroring, same as most `scripts/*.ts` helpers, since this file never
imports `src/`). It is also now independently invocable via `repo-harness
run recovery-view-cli`, a harmless side effect of registration, not a goal.

The three retained scripts invoke it directly via
`bun "$helper_dir/recovery-view-cli.ts" ...`, the same `$helper_dir`
resolution pattern `prepare-codex-handoff.sh` already uses to invoke
`codex-handoff-resume.sh`. Flags: `--reason`, `--cwd`, `--print-prompt`
(print only the Resume Prompt body, matching `codex-handoff-resume.sh`'s
existing flag), `--with-global-packet` (also update the Codex-home global
packet).

### Writer retirement (per reconciled verdicts)

- `.ai/hooks/lib/workflow-state.sh` (+ canonical `assets/hooks/lib/workflow-state.sh`):
  `workflow_write_handoff` body reduced to a thin invoker (resolve reason,
  shell out to the new CLI subcommand for handoff+resume materialization,
  keep the existing `workflow_append_event "handoff_refresh" ...` and
  `workflow_write_run_summary` calls, which are not part of the four named
  views); `workflow_ensure_harness_surface`'s two bootstrap lines
  (`:122-123`) deleted. `.ai/hooks/.projection.json` refreshed only via
  `bun run sync:hooks` (never hand-edited).
- `scripts/codex-handoff-resume.sh` (+ mirror): body reduced to a thin
  invoker of the new CLI subcommand with `--print-prompt` passthrough; zero
  independent content assembly.
- `scripts/prepare-codex-handoff.sh` (+ mirror): body reduced to a thin
  invoker of the new CLI subcommand with `--with-global-packet`; the
  inline Node/Python heredoc is deleted (superseded by
  `updateGlobalHandoffFile` in the TS materializer).
- `scripts/refresh-current-status.sh`: no code change (confirmed sole
  materializer); a regenerate -> byte-compare drift check is added to
  `tests/evidence-recovery-materializer.test.ts`.
- `scripts/prepare-handoff.sh` (+ mirror): no code change (see
  Reconciliation above).

### Tests (red-first): `tests/evidence-recovery-materializer.test.ts`

Determinism (same checkpoint resolution + same context + same injected
clock => byte-identical handoff/resume); hand-edit overwrite (a hand-edited
published view is fully overwritten by the next materialization);
checkpoint-missing typed minimal state (no fabricated evidence claims);
checkpoint-invalid (dangling marker) degrades the same way, never crashes;
no-independent-authoring (grep/behavioral sweep over `src/`, `scripts/`,
`.ai/hooks/` proving no writer of `handoff/current.md` or `handoff/resume.md`
exists outside `stop-handler.ts`'s `atomicWrite` call and the new CLI
subcommand's write path); Stop integration counts unchanged (delegates to
the existing `tests/stop-handler.test.ts` four-target assertion, unmodified
except the one documented line above); `tasks/current.md` drift check
(regenerate via `refresh-current-status.sh --write` into a temp path,
byte-compare against tracked content in a clean worktree state).

## Scope

- In scope: `src/effects/evidence/recovery-materializer.ts` (new, the
  authoritative in-process implementation `stop-handler.ts` imports
  directly); `src/cli/hook/stop-handler.ts` (internal content-source swap +
  checkpoint-publish reordering only); `scripts/recovery-view-cli.ts` (new,
  standalone) + `assets/templates/helpers/recovery-view-cli.ts` (mirror);
  `.ai/hooks/lib/workflow-state.sh` + `assets/hooks/lib/workflow-state.sh`
  + `.ai/hooks/.projection.json` (thin `workflow_write_handoff` +
  bootstrap-line deletion); `scripts/codex-handoff-resume.sh`,
  `scripts/prepare-codex-handoff.sh` and their
  `assets/templates/helpers/` mirrors (thin-invoker reduction);
  `tests/evidence-recovery-materializer.test.ts` (new);
  `tests/stop-handler.test.ts` (the one documented assertion at `:155`
  only); `tests/helper-scripts.test.ts` (found during Phase B: one
  assertion in "prepare-handoff should write harness handoff using
  workflow-state helpers" characterizes the retired `checks/latest.json`
  `run_file` single-hop violation the same way `stop-handler.test.ts:155`
  did -- documented minimal update, same class); `tests/workflow-state-lib.test.ts`
  (found running the full suite post-implementation: one assertion in
  "exports the shared workflow helper functions" characterized the exact
  `next_action="$(workflow_next_action)"` call site retired from
  `workflow_write_handoff`'s thinned body -- `workflow_next_action()` the
  function definition is untouched and still asserted separately on the
  preceding line; only the now-nonexistent call-site literal is removed,
  documented, same class as the other two); this package's
  plan/contract/review/notes; `tasks/todos.md` projection;
  `.ai/harness/worktrees/epc-07-recovery-view-cutover.json`;
  `assets/workflow-contract.v1.json` + `.ai/harness/workflow-contract.json`
  (mechanical registration of the one new helper id only -- found necessary
  during Phase B, see the standalone-helper section's second correction).
- Out of scope: Context Packet / SessionStart internals beyond the
  filename-level references already inventoried (EPC-08); `checks/latest`
  materializer, verify producer, importers (EPC-02..05 surfaces); EPC-01
  store/fold; EPC-06 checkpoint modules (consumed read-only); `tasks/current.md`
  content itself and `scripts/refresh-current-status.sh` code (confirmed
  sole materializer, no rewiring); `scripts/prepare-handoff.sh` and its
  mirror (no code change required, see Reconciliation); the six
  classified-out-of-scope bootstrap/fixture writers found in Phase A; the
  sprint document; any new npm dependency; any other field of the workflow
  contract manifest beyond the one new helper registration.
- Non-goals: redesigning view content beyond what materialization requires;
  retiring `post-bash-latest.json`; removing the now-redundant
  `prepare-handoff.sh` -> `codex-handoff-resume.sh` double-invocation
  (harmless, out of Goal's requirement); downstream helper deployment
  (EPC-09 release scope).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/`
  or architecture files.
- Stop if the Stop handler cannot take the internal content-source swap
  (plus the documented checkpoint-publish reordering) without changing its
  HRD-frozen external semantics (four-target projection batch, single
  `getStopEffectiveState()` resolution, stdout/stderr shape) -- report for a
  scope ruling rather than altering the frozen shape.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if a surviving recovery view cannot be rendered
deterministically from checkpoint + minimal workflow context (i.e. a view
genuinely needs an independent observation channel), or if retiring/thinning
a writer breaks a host entrypoint the Phase A inventory failed to map.
Cheapest proof: live Stop dogfood produces byte-deterministic views (modulo
the injected clock) whose evidence claims all resolve to the checkpoint,
with the full characterization suite green and the one documented assertion
update visible in the diff.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-2246-epc-07-recovery-view-cutover.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`
- Notes file: `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260722-2246-epc-07-recovery-view-cutover.md
  - tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md
  - tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md
  - tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md
  - tasks/todos.md
  - src/effects/evidence/recovery-materializer.ts
  - src/cli/hook/stop-handler.ts
  - scripts/recovery-view-cli.ts
  - assets/templates/helpers/recovery-view-cli.ts
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/lib/workflow-state.sh
  - assets/hooks/lib/workflow-state.sh
  - .ai/hooks/.projection.json
  - scripts/codex-handoff-resume.sh
  - scripts/prepare-codex-handoff.sh
  - assets/templates/helpers/codex-handoff-resume.sh
  - assets/templates/helpers/prepare-codex-handoff.sh
  - tests/evidence-recovery-materializer.test.ts
  - tests/stop-handler.test.ts
  - tests/helper-scripts.test.ts
  - tests/workflow-state-lib.test.ts
  - .ai/harness/worktrees/epc-07-recovery-view-cutover.json
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/evidence/recovery-materializer.ts
    - scripts/recovery-view-cli.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md
  tests_pass:
    - path: tests/evidence-recovery-materializer.test.ts
    - path: tests/stop-handler.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Phase A inventory recorded with file:line evidence and reconciled verdicts before Phase B edits"
    - "Live Stop dogfood: handoff/resume materialized from last checkpoint, evidence claims resolve to checkpoint, hand-edit overwritten"
    - "tasks/current.md untouched"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: the single commit on `codex/epc-07-recovery-view-cutover` before it merges.
- Revert strategy: revert the single PR -- restores the retired writers
  (bash handoff/resume assembly, the independent `codex-handoff-resume.sh`/
  `prepare-codex-handoff.sh` content assembly) and removes the recovery
  materializer + Stop internal swap + new CLI subcommand; `tasks/current.md`
  content and `scripts/refresh-current-status.sh` were never modified, so
  reverting cannot regress that view.

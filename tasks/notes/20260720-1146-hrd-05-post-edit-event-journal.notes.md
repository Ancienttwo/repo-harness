# Implementation Notes: hrd-05-post-edit-event-journal

> **Status**: Active
> **Plan**: plans/plan-20260720-1146-hrd-05-post-edit-event-journal.md
> **Contract**: tasks/contracts/20260720-1146-hrd-05-post-edit-event-journal.contract.md
> **Review**: tasks/reviews/20260720-1146-hrd-05-post-edit-event-journal.review.md
> **Last Updated**: 2026-07-20 14:30
> **Lifecycle**: notes

## Pre-Enumeration Gate (mandatory, step 1)

Grepped `post-edit-guard.sh`, `minimal-change-observer.sh`, `.claude/.task-handoff.md`,
`workflow_write_handoff`, `architecture-queue`, `context-contract-sync`,
`capability-context`, and the minimal-change latest file
(`.ai/harness/checks/minimal-change.latest.json`) across
`src/ scripts/ tests/ docs/ README* assets/ .ai/hooks/`.

### Category A — already in Allowed Paths (no ripple issue)

`src/cli/hook/route-registry.ts`, `tests/hook-runtime.test.ts`,
`tests/hook-contracts.test.ts`, `assets/hooks/post-edit-guard.sh` +
`.ai/hooks/post-edit-guard.sh`, `assets/hooks/minimal-change-observer.sh` +
`.ai/hooks/minimal-change-observer.sh`, `tests/fixtures/loop-runtime/characterization.json`.

### Category B — confirmed historical (stale references, no test enforces them; precedent: HRD-03/04 left these stale for their own retirements too)

| Path | Why it is not a live ripple consumer |
|---|---|
| `scripts/repo-harness.sh` | Self-labeled "Bash prototype (Phase 0.5)"; still lists `worktree-guard.sh`/`pre-edit-guard.sh` (retired by HRD-03) unfixed — proves nobody enforces this file's hook list. No test references it. |
| `assets/workflow-contract.v1.json` | Still lists `.claude/hooks/pre-edit-guard.sh`, `session-start-context.sh`, `worktree-guard.sh` (all retired by HRD-03/04). `tests/workflow-contract.test.ts`/`tests/bootstrap-files.test.ts` do not assert these specific strings. |
| `docs/architecture/modules/runtime-harness/hook-adapters.md` | Architecture doc for a different capability (runtime-harness), updated via the separate architecture-queue drift-request flow per root workflow convention, not inline per contract. Not in Allowed Paths, not test-enforced. |
| `docs/researches/*` | Dated research snapshots; historical by design. |
| `README.fr.md`, `README.zh-CN.md`, `README.es.md`, `README.ja.md` | `tests/readme-dx.test.ts`'s `LOCALIZED_READMES` loop only checks generic strings (`SessionStart.default`, `PostToolUse.always`, version numbers); never asserts `post-edit-guard.sh`/`minimal-change-observer.sh` presence or absence for these files. |
| `docs/reference-configs/{hook-operations,minimal-change-hooks}.md`, `assets/reference-configs/{hook-operations,minimal-change-hooks}.md` | Only existence-tested (`tests/create-project-dirs.runtime.test.ts`, `tests/helper-scripts.test.ts`, `tests/scaffold-parity.test.ts`), never content-tested for these script names. |

### Category C — confirmed LIVE, outside Allowed Paths (genuine ripple; blocked implementation until amendment)

| # | Path | Evidence |
|---|---|---|
| 1 | `tests/cli/hook.test.ts` | Its own comment (line 436-446) states PostToolUse.edit is the vehicle for 4 generic multi-script-mechanics tests (`post-edit-guard.sh`+`minimal-change-observer.sh` as literal fixture script names) *because* HRD-03 already retired the only other 2-script route (PreToolUse.edit). HRD-05 retires the last one. |
| 2 | `tests/cli/route-registry.test.ts` | `getRoute('PostToolUse','edit')?.scripts` asserted `toEqual(['post-edit-guard.sh','minimal-change-observer.sh'])`. |
| 3 | `tests/hook-dedup.test.ts` | `readFileSync(assets/hooks/post-edit-guard.sh)` directly — file is deleted by this contract. |
| 4 | `tests/readme-dx.test.ts` | `expect(hookAuthority).toContain("minimal-change-observer.sh")` against README.md's Hook Authority Map section (with an explicit comment: "...minimal-change-observer.sh (PostToolUse.edit) is unretired and still documented"). |
| 5 | `tests/create-project-dirs.runtime.test.ts` | Line 649, `hook_source: repo` scaffold test: `expect(existsSync(.ai/hooks/post-edit-guard.sh)).toBe(true)` — source no longer exists to vendor. |
| 6 | `README.md` | Content target of item 4; hook table row (`| PostToolUse.edit | ... | post-edit-guard.sh, minimal-change-observer.sh | ... |`) and Hook Authority Map prose both need updating. |

**Amendment applied** (one round, per Stop Conditions): added items 1-6 to
`allowed_paths` in the contract file. No other live hit found outside Allowed
Paths; no second round needed.

## Falsifier (mandatory, step 2)

Grepped every reader of `.claude/.task-handoff.md`, `.ai/harness/handoff/current.md`
(`workflow_handoff_file`/`workflowHandoffFile`), and the minimal-change latest file
(`.ai/harness/checks/minimal-change.latest.json`, `MINIMAL_CHANGE_REPORT_PATH`)
repo-wide (not just Allowed Paths), classifying each as mid-session vs
Stop/SessionStart-time.

- **`.claude/.task-handoff.md`**: zero programmatic readers anywhere in
  `src/`, `scripts/`, `.ai/hooks/`, `assets/hooks/` — only the writer
  (`post-edit-guard.sh` itself) and gitignore-pattern lists (`gitignore-plan.ts`,
  `project-init-lib.sh`, `sync-codex-installed-copies.sh`) reference the path
  string. It is a human-facing artifact with no code dependency. Not falsifying.
- **`.ai/harness/handoff/current.md`**: the one non-trivial candidate.
  `src/effects/state/resolve-effective-state.ts:473` reads its content on
  *every* Effective State resolution, including `resolvePreEditEffectiveState`
  (called once per `PreToolUse.edit`, i.e. mid-session, by `mutation-guard.ts`
  via the HRD-02 collector). Traced the dependency through
  `src/core/state/project-effective-state.ts:187-198`:
  `handoffFreshness` is `'fresh'` only if the file's `**Task ID**:`/
  `**Source State Revision**:` markdown headers match the CURRENT task id and
  authority revision. The bash `workflow_write_handoff()` writer **never
  populates those two headers** (confirmed by the resolver's own comment at
  project-effective-state.ts:322-326: "the bash handoff writer does not
  populate those fields"), so `handoffFreshness` is `'stale'` for a
  bash-written handoff *regardless of how recently it was written* — this was
  already true before HRD-05 (every previous per-edit refresh also produced
  `'stale'`). The only consumer that branches on handoff freshness at
  mid-session (`nextAction`'s fallback, project-effective-state.ts:285-291)
  requires `handoffFreshness === 'fresh'`, which was already unreachable for a
  bash-written file. The one consumer that requires anything at all
  (`durable_recovery_state` in `readiness`, line 327) only checks
  `handoffFreshness !== 'missing'`, satisfied by either the bootstrap
  placeholder (`standard-plan.ts`/`project-init-lib.sh` seed
  `"# Harness Handoff\n\n> **Reason**: bootstrap\n"` at project init) or any
  prior Stop (`workflow_write_handoff "session-stop"`, unconditional, still
  runs every Stop). Deferring the per-edit refresh changes neither the
  fresh/stale classification (already always stale) nor missing/present
  (already guaranteed present after init). **Not falsifying** — verified by
  reading the actual freshness formula, not inferred from the field's
  existence.
- **Minimal-change latest file** (`.ai/harness/checks/minimal-change.latest.json`):
  only reader is `assets/hooks/stop-orchestrator.sh:195-211` (jq-based read of
  `.report_path // ".ai/harness/checks/minimal-change.latest.json"` for the
  `[MinimalChange] Non-blocking review` stdout line) — a Stop-time read. Not
  falsifying.

**Falsifier verdict: not falsified.** No mid-session reader depends on
per-edit freshness of any of the three deferred-write targets.

## Design Decisions

- **Journal storage**: one JSON file per pending event under
  `.ai/harness/journal/post-edit/pending/<key>.json`, atomic
  tmp-write-then-rename (mirrors `minimal-change-signals.ts`'s
  `writeReportAtomically` and `session-context.ts`'s rotation-file rename).
  Consuming an event is `renameSync` into
  `.ai/harness/journal/post-edit/consumed/<key>.json` — atomic on the same
  filesystem, matches the audit's per-event-file crash-safety guidance
  (contract Scope) over a single shared journal file.
- **Coalesce key**: `sha256(session_id + '\0' + sorted(changed_paths).join('\0'))`
  (first 20 hex chars) as the filename. A same-session edit to the same path
  set overwrites the same pending file (updates `updated_at`, re-derives dirty
  bits) instead of appending — this is what "coalesce" means operationally:
  overwrite-in-place under a deterministic key, not append + reconcile later.
- **`subject_revision`**: current `git rev-parse HEAD` (short 12-char sha, or
  `null` if not resolvable), captured via a direct `execFileSync('git', ...)`
  call — mirrors `mutation-guard.ts`'s `resolveGitDir` pattern (a plain git
  read, not an Effective State resolution). The contract explicitly forbids
  adding an Effective State resolution to this route ("post-edit-guard.sh
  historically did NOT run state resolve; do not add one"), so this is
  deliberately NOT `getSessionEffectiveState()`/`getPreEditEffectiveState()`.
- **`contractReferencesPath` is a NEW port**, not a duplicate of
  `mutation-guard.ts`'s `contractAllowsPath`. Verified by reading both bash
  functions side by side
  (`assets/hooks/lib/workflow-state.sh:1003` vs `:1984`): `contract_references_path`
  (post-edit-guard.sh's continuous-verification trigger) scans the contract's
  `exit_criteria` YAML block (`files_exist`/`tests_pass`/`files_contain`/
  `files_not_exist`/`files_not_contain` sections) for a literal path match;
  `workflow_contract_allows_path` (mutation-guard.ts's `contractAllowsPath`,
  ported by HRD-03) scans the *different* `allowed_paths` section with glob
  matching. These are unrelated checks that happen to share a similarity;
  porting `contractAllowsPath`'s logic here would have been a wrong-condition
  bug.
- **First-principles/anti-simplification advisory dispatch is ported
  verbatim** (subprocess spawn of `first-principles-guard.sh`, falling back to
  `anti-simplification.sh`, from the resolved `hooksDir`) because it is
  literally inline in `post-edit-guard.sh`'s own body (the "Aggregated
  advisories" block) — deleting post-edit-guard.sh without preserving this
  call would silently drop a real, tested, host-visible advisory
  (`tests/hook-contracts.test.ts` "first-principles guard should parse file
  path...", `tests/hook-runtime.test.ts` "first-principles guard: reports
  overengineering advisories without blocking"). Neither
  `first-principles-guard.sh` nor `anti-simplification.sh` is edited (they are
  invoked, not modified), so they do not need to be in Allowed Paths — same
  reasoning `mutation-guard.ts` already relies on for its own `execFileSync('git', ...)` calls.
- **Stop-time consumption lives in `runtime.ts`, not in `stop-orchestrator.sh`**.
  `stop-orchestrator.sh` and the `verify-contract` CLI command source are both
  outside this package's Allowed Paths. Since `Stop.default` already flows
  through the production `runHook()` (same function `mutation-guard.ts`/
  `session-context.ts` hook into for their own routes), a new pre-dispatch
  step in `runtime.ts` (mirroring the `isSessionStartBuilderRoute` /
  `isMutationGuardRoute` precedent shape exactly) reads pending journal
  events, replays the SAME external commands the retired scripts used
  (`architecture-queue.sh record --file <path>`, conditionally
  `context-contract-sync.sh sync-latest` + `capability-context request
  --from-latest-architecture-event` — replicating post-edit-guard.sh's own
  `grep -q '^\[ArchitectureDrift\] Request:'` cascade condition on the
  architecture-queue call's real output, not a second capability-resolver
  implementation), `collectMinimalChangeSignals()` in-process, and
  `verify-contract` via subprocess — then marks each event consumed. This
  requires zero edits to `stop-orchestrator.sh` or the verify-contract command
  (only imports/subprocess-invokes them, which does not require Allowed Paths
  listing, matching `mutation-guard.ts`'s own precedent of calling
  `resolveEffectiveState` from `effects/state/resolve-effective-state.ts`
  without that file being in HRD-03's Allowed Paths). `stop-orchestrator.sh`'s
  own unconditional `workflow_write_handoff "session-stop"` already covers the
  `checkpoint` dirty bit with no wiring needed (verified, not assumed — see
  Falsifier).
- **`checkpoint` dirty bit reflects the retired `.claude/.task-handoff.md` +
  `workflow_write_handoff("task-progress")` write, not a new file.** No
  consumer reads `.claude/.task-handoff.md` programmatically (see Falsifier),
  so it is not regenerated by the Stop-time consumer; only
  `.ai/harness/handoff/current.md` (via Stop's existing unconditional
  `workflow_write_handoff "session-stop"`) is verified to still refresh.
  `.claude/.task-handoff.md` going stale after this cutover is an accepted,
  documented regression risk (human-facing convenience file only).

## Dirty-Bit Derivation (condition-by-condition, cites the base-script line)

| Dirty bit | Base-script condition ported | Evaluated at |
|---|---|---|
| `architecture` | `run_architecture_queue_sync()` runs unconditionally for any non-empty `FILE_PATH` (`assets/hooks/post-edit-guard.sh:49-96`, called at line 158 with no guard beyond the function's own `repo_harness_runner_available` check). Set `true` for every qualifying edit; availability is re-checked at consumption time (Stop), not edit time, to keep the hot-path write free of subprocess/`command -v` calls. | edit time (unconditional) |
| `context` | Coupled to `architecture`: `context-contract-sync sync-latest` only runs inside `if printf '%s\n' "$queue_output" | grep -q '^\[ArchitectureDrift\] Request:'` (post-edit-guard.sh:64-66) — a condition on the architecture-queue call's OWN real-time output, not determinable at edit time without re-implementing capability-resolver matching. Stored as a candidate bit alongside `architecture`; the Stop-time consumer re-derives the real trigger by grepping the (still same, unmodified) `architecture-queue.sh record` output, exactly as post-edit-guard.sh did — just later. | edit time (candidate, true with `architecture`); real gate re-evaluated at consumption |
| `capability` | Same condition as `context` (post-edit-guard.sh:73-94, same `if` block, chained after context-contract-sync). Same treatment. | edit time (candidate, true with `architecture`); real gate re-evaluated at consumption |
| `contract-verification` | `run_continuous_contract_verification()` (post-edit-guard.sh:31-47): active plan exists AND its derived contract file exists AND `contract_references_path(contract_file, FILE_PATH)` is true (contract's `exit_criteria` YAML `files_exist`/`tests_pass`/`files_contain`/`files_not_exist`/`files_not_contain` sections literally list `FILE_PATH`). Ported as a fresh `contractReferencesPath()` helper (see Design Decisions — NOT `mutation-guard.ts`'s `contractAllowsPath`, a different check). | edit time (cheap: text scan, no subprocess) |
| `minimal-change` | `minimal_change_post_edit_enabled()` (`assets/hooks/lib/minimal-change.sh:4-22`): `policy.minimal_change.mode !== 'off' && policy.minimal_change.post_edit_observer === true`. Ported by calling `loadMinimalChangePolicy(repoRoot)` (already-exported, cheap policy read, same function `collectMinimalChangeSignals` itself checks internally) directly. The expensive part (`git diff --name-status`/`--numstat`, fingerprinting, atomic write) stays deferred to Stop-time consumption via `collectMinimalChangeSignals()`, using the path+baseRef captured in the event payload. | edit time (cheap: policy read only) |
| `checkpoint` | The task-handoff regeneration gate (post-edit-guard.sh:162-168 `case` statement): `FILE_PATH` is exactly `tasks/todos.md`, matches `plans/*.md`, `tasks/reviews/*.review.md`, or is `.ai/harness/checks/latest.json`. Ported as a direct regex/pattern match on the changed path set. | edit time (cheap: string match) |

## Write-Amplification (old vs new durable writes per qualifying edit)

Old (`post-edit-guard.sh` + `minimal-change-observer.sh`), per qualifying edit:
- `.claude/.task-handoff.md` full rewrite (heredoc, every edit reaching the checkpoint case-match)
- `.ai/harness/handoff/current.md` regeneration via `workflow_write_handoff "task-progress"`
- `docs/architecture/requests/<slug>.md` (conditional on a real capability match) + `.ai/harness/architecture/events.jsonl` append
- `<capability>/AGENTS.md` + `<capability>/CLAUDE.md` rewrite + `.ai/context/context-map.json` update (conditional, chained after a real architecture match)
- `.ai/harness/capability-context/requests.jsonl` append (conditional, chained after a real architecture match)
- `.ai/harness/checks/latest.json` (conditional on an active contract referencing the path)
- `.ai/harness/checks/minimal-change.latest.json` (conditional on minimal_change policy enabled; includes `git diff --name-status`/`--numstat` computation cost even when it decides not to write, via `event_dedupe`)
- `.ai/harness/runs/hook-invocations.jsonl` (telemetry, unconditional, unchanged by this row)

New (`mutation-observed.ts`), per qualifying edit:
- `.ai/harness/journal/post-edit/pending/<key>.json` — one small typed event (unconditional for any qualifying edit; coalesces in-place on a repeat same-session same-path edit instead of writing again)
- `.ai/harness/runs/hook-invocations.jsonl` (telemetry, unchanged)

Confirmed empirically via the HRD-01 golden's `src/example.ts` fixture scenario (no active plan/contract, no minimal_change policy, unmatched-for-architecture path): old write_set was already down to just the telemetry file for THIS specific scenario (proving the old script's conditional writes were all no-ops here); new write_set is the SAME telemetry file plus exactly one journal event file. The reduction that generalizes to the qualifying-edit-with-real-matches case is: up to 7 potential durable writes collapse to 1 (the journal event), with `.claude/.task-handoff.md` retired outright (no reader, see Falsifier) and the other 6 becoming Stop-time-consumed dirty bits instead of per-edit writes.

## Golden Delta (`tests/fixtures/loop-runtime/characterization.json`, PostToolUse.edit cell)

Regenerated once via `UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN=1 bun test tests/hook-runtime-characterization.test.ts`. `git diff --stat` confirms exactly one file changed (`tests/fixtures/loop-runtime/characterization.json`, 5 insertions/5 deletions) and the diff is confined to the `PostToolUse.edit` cell only — no other of the 11 cells moved.

Per-field before/after:

| Field | Before | After | Why |
|---|---|---|---|
| `scripts_run` | `["post-edit-guard.sh", "minimal-change-observer.sh"]` | `["mutation-observed"]` | Route dispatch replaced (route-registry.ts scripts `[]`, runtime.ts `steps` override), mirrors HRD-03's `mutation-guard`/HRD-04's `session-context` precedent naming. |
| `exit_code` | `0` | `0` (unchanged) | Neither the old nor new PostToolUse.edit path ever blocks. |
| `reason` | `"ok"` | `"ok"` (unchanged) | Same. |
| `failed_script` | `null` | `null` (unchanged) | Same. |
| `skipped_scripts` | `[]` | `[]` (unchanged) | Same. |
| `child_invocations.git` | `5` | `5` (unchanged) | Composition shifted (old: repoRoot-resolve(1) + post-edit-guard's own `git diff --shortstat`/`--name-only`(2) + first-principles-guard.sh's own `git rev-parse --is-inside-work-tree`/`git diff --`(2); new: repoRoot-resolve(1) + mutation-observed's own `git rev-parse HEAD` for subject_revision(1) + first-principles-guard.sh's own 2 calls(2) + [see stdout note below]) but the total held constant for this specific fixture path. |
| `child_invocations.bun_cli` | `1` | `0` | The old path's one `bun $CLI run architecture-queue ...`-shaped call (via `run_repo_harness_helper`, classified `cli` because argv contains `*/cli/index.ts`) no longer runs synchronously — deferred to Stop-time consumption, which this fixture (isolated per-route) does not exercise. |
| `child_invocations.bun_generic` | `7` | `4` | Reduction, not elimination: the retired scripts' OWN `hook_get_file_path()` calls (post-edit-guard.sh once, minimal-change-observer.sh once, each parsing JSON via `hook-input.sh`'s `jq`-or-`bun -e` fallback) are gone (mutation-observed.ts extracts the file path directly in TS, no subprocess); `first-principles-guard.sh` is invoked verbatim (unmodified) and keeps its OWN internal `hook-input.sh`-mediated `bun -e` JSON-parsing fallback calls, which is pre-existing behavior this row does not touch. |
| `stdout` | `"[ArchitectureDrift] No architecture drift request for src/example.ts (unrelated).\n"` | `""` | This line was the OLD synchronous `architecture-queue record` call's own stdout, relayed inline. The architecture-queue call is now deferred to Stop; deferred consumption is deliberately silent (no scriptsRun/stdout relay in runtime.ts, to keep the Stop.default cell byte-identical — see Design Decisions). `src/example.ts` matches no DocDrift pattern and produces an empty git diff for `first-principles-guard.sh`, so no advisory text fires either. |
| `stderr` | `""` | `""` (unchanged) | Same. |
| `write_set` | `[".ai/harness/runs/hook-invocations.jsonl"]` | `[".ai/harness/journal/post-edit/pending/ec3c6c9f5f027d340359.json", ".ai/harness/runs/hook-invocations.jsonl"]` | The one new journal event write — this row's deliverable write-set change, made visible even though every one of the OLD script's OWN conditional durable writes was already a no-op for this specific fixture input (no active plan/contract, no minimal_change policy, unmatched architecture path). |

## Gate Round-1 Fixes (FAIL round 1, adjudicated, applied)

Gatekeeper round 1 returned FAIL with 2 blocking findings + 2 MEDIUM
advisories, all adjudicated by the orchestrator. Contract amended a second
time (`.gitignore` surface, 5 new Allowed Paths). Applied exactly:

1. **BLOCKING — crash-replay surfacing dropped in quiet repos.**
   `pendingPostEditJournalSection`'s `actionable: false` meant
   `budgetSessionContext` (session-context-budget.ts's
   `normalized.some((section) => section.actionable)` check) dropped the
   ENTIRE SessionStart payload to empty stdout whenever the pending journal
   section was the only candidate section -- exactly a quiet repo with a
   crash-recovered pending event and nothing else actionable. Fixed:
   `actionable: true` (mutation-observed.ts, with an inline comment citing
   the mechanism). Proof added through the PRODUCTION path, not the unit
   function: `tests/hook-runtime.test.ts` "a pending journal event is
   visible through production SessionStart stdout in an otherwise-quiet
   repo..." spawns the real `runHook({event:'SessionStart',routeId:'default'})`
   via a `bun -e` wrapper (same shape as `runMutationObservedHook`) and
   asserts the captured child stdout contains `[PostEditJournal]` before
   consumption and not after. Golden proof: `tests/hook-runtime-characterization.test.ts`
   passes UNCHANGED (no regen needed) after this fix -- the `SessionStart.default`
   fixture has zero pending events, so `actionable: true` is never exercised
   there, confirmed empirically, not just asserted.
2. **BLOCKING — journal not covered by the managed gitignore block.** Added
   `.ai/harness/journal/` to `GITIGNORE_MANAGED_BLOCK_CONTENT`
   (`src/core/adoption/gitignore-plan.ts`), this repo's own `.gitignore`
   (dogfood copy, not byte-identical to the template array -- has
   self-host-specific extra entries already), and `PI_DEFAULT_RUNTIME_ENTRIES`
   (`scripts/lib/project-init-lib.sh`) -- all three placed next to
   `.ai/harness/capability-context/` (nearest sibling: another runtime queue
   directory). **Test-pinning finding (verified, not assumed):** neither
   named file needs a content edit. `tests/adopt-dry-run.test.ts` does not
   exist in this repo (`find tests -iname "*adopt*"` finds only
   `tests/cli/adoption-plan.test.ts` and `tests/fixtures/adoption/`, neither
   of which reference the gitignore managed block at all -- confirmed by
   grep, `tests/cli/adoption-plan.test.ts` has zero "gitignore" hits).
   `tests/bootstrap-files.test.ts`'s `.ai/harness/capability-context/`-adjacent
   assertions (lines ~290-300) are `toContain`/`not.toContain` checks against
   `assets/workflow-contract.v1.json`'s `artifacts.runtimeFiles` array -- a
   DIFFERENT manifest, not the gitignore block, and non-exhaustive (adding a
   new gitignore line cannot break a `toContain` check that doesn't mention
   it). A repo-wide search (`grep -rln "GITIGNORE_MANAGED_BLOCK_CONTENT\|gitignoreManagedBlockOperation" tests/`)
   found zero test files importing or exercising the gitignore-plan.ts
   exports at all; every test that reads the real `.gitignore` file
   (`tests/create-project-dirs.runtime.test.ts` [Allowed], plus
   `tests/scaffold-parity.test.ts`/`tests/workflow-contract.test.ts`
   [not touched, out of Allowed Paths, not exhaustive]) uses `toContain`/
   `not.toContain` spot checks, never an exact/exhaustive match -- none of
   them assert `not.toContain(".ai/harness/journal/")`, so none break.
   Neither `tests/adopt-dry-run.test.ts` nor `tests/bootstrap-files.test.ts`
   was edited; no new test file was invented to fill the named-but-nonexistent
   path. Proof (both required items): `git check-ignore -v` against a real
   fixture repo returns `.gitignore:46:.ai/harness/journal/	<path>` (exit 0);
   `tests/mutation-observed.test.ts` "the journal directory is covered by the
   managed gitignore block, and a qualifying edit leaves git status clean"
   writes `GITIGNORE_MANAGED_BLOCK_CONTENT` into a fresh fixture repo's
   `.gitignore`, runs a real qualifying edit through `runMutationObserved`,
   then asserts `git check-ignore -q` exits 0 for the written event file AND
   `git status --porcelain` is empty.
3. **MEDIUM adjudicated — retention.** The journal is a transit queue, not
   an evidence ledger (EPC scope, out of this row). Removed the `consumed/`
   directory machinery entirely (`JOURNAL_CONSUMED_DIR` constant,
   `markPostEditEventConsumed`'s rename-to-consumed); `consumePendingPostEditEvents`
   now DELETES each pending file on successful consumption
   (`deletePendingPostEditEventFile`, `unlinkSync`). Corrupt pending files
   (unparseable JSON, wrong `schema`) are detected via a new
   `scanPendingPostEditEventFiles` scan (separates `valid` from
   `corruptNames`), deleted outright, and warned via `process.stderr.write`
   (a direct write, independent of the `RunHookResult`/`scriptsRun`
   contract, since Stop-time consumption deliberately never touches that
   contract -- see Design Decisions) plus returned in the new
   `PostEditConsumeSummary.warnings` field for testability. Proof:
   `tests/mutation-observed.test.ts` "a corrupt pending file is removed at
   consumption with a stderr warning, without disturbing valid events"
   writes two malformed files alongside one valid event, spies on
   `process.stderr.write`, and asserts both are deleted, both produce a
   warning line (in both the captured stderr and the returned summary), and
   the valid event still consumes normally. All prior "moved to consumed/"
   fixtures (in both `tests/mutation-observed.test.ts` and
   `tests/hook-runtime.test.ts`) updated to assert deletion instead
   (`existsSync(...pending/<id>.json)` is `false`, `existsSync(.../consumed)`
   is `false`).
4. **MEDIUM adjudicated — notes honesty.** See "Deviations From Plan Or
   Spec" below: documents the two accepted drops
   (`workflow_sync_task_state_from_todo`; Backlog-no-plan cleanup +
   `[TaskHandoff]` stdout) with the near-dead-file evidence, and the
   explicit-verify consumer narrowing (Stop-only wiring; explicit CLI runs
   do not read the journal in this row, deferred to HRD-06).

## Deviations From Plan Or Spec

Gate round-1 MEDIUM finding: the original pass of this section understated
what was dropped. Two `post-edit-guard.sh` behaviors are genuinely gone, not
ported to any dirty bit or deferred consumer. Both write/read files this
row's own Falsifier already proved have zero programmatic readers
(`.claude/.task-state.json`, `.claude/.task-handoff.md`), which is the
evidence the gatekeeper adjudicated as "near-dead" and accepted as a drop
rather than requiring a port:

1. **Per-edit `workflow_sync_task_state_from_todo` sync.** post-edit-guard.sh:182-184:
   `if [[ "$FILE_PATH" == "tasks/todos.md" ]] && [[ -f "tasks/todos.md" ]] && !
   grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md;
   then workflow_sync_task_state_from_todo "tasks/todos.md" "$STATE_FILE"; fi` --
   synced `.claude/.task-state.json` from the todo checklist's `[x]`/`[ ]`
   markers on every non-Backlog edit to `tasks/todos.md`. No dirty bit
   carries this; `.claude/.task-state.json` is not part of the journal
   payload or the consumption cascade. Accepted: the file has no
   programmatic reader (same finding as the Falsifier's `.claude/.task-handoff.md`
   check) -- it fed the now-also-retired `.claude/.task-handoff.md` heredoc
   and nothing else.
2. **Backlog-no-plan cleanup + its `[TaskHandoff]` stdout line.**
   post-edit-guard.sh:170-175: when `tasks/todos.md` is edited, no active
   plan is set, AND todos.md's status is `Backlog`, the script deleted
   `$(workflow_task_state_file)` + `.claude/.task-handoff.md`, printed
   `[TaskHandoff] Deferred-goal ledger updated; active execution remains in
   the plan Task Breakdown.`, and exited early. `mutation-observed.ts` has no
   equivalent branch -- the checkpoint dirty bit fires for `tasks/todos.md`
   regardless of Backlog/active-plan state, and neither the delete nor the
   stdout line happens anywhere. Accepted for the same reason: both deleted
   files are dead-reader files, and the stdout line was purely advisory
   about that same dead state.

Neither drop weakens crash recovery (the Falsifier's own scope): both are
downstream of files nothing reads. If a future row gives
`.claude/.task-state.json`/`.claude/.task-handoff.md` a real reader, these
two behaviors need reconsidering at that point, not before.

**Explicit-verify consumer narrowing.** The contract's Scope text ("Stop's
existing orchestration and the explicit CLI runs read pending journal
events...") reads as if both Stop AND a manual `repo-harness run
verify-contract` invocation consume the journal. Only Stop actually does
(`consumePendingPostEditEvents`, wired into `runtime.ts`'s `Stop.default`
dispatch). A manual `repo-harness run verify-contract`/`architecture-queue`/
etc. invocation runs against current repo state as it always has -- it does
not read `.ai/harness/journal/post-edit/pending/`, does not mark events
consumed, and is not aware the journal exists. This is a narrowing from the
Scope text's literal reading, not from the Goal (Stop remains the safety net
that guarantees every dirty bit eventually gets processed regardless of
whether a human also ran verify-contract manually in between). Wiring
explicit-verify surfaces to also consume the journal is recorded here and
deferred to HRD-06 (which already owns the "port Stop to TS" surface this
would naturally live next to) rather than implemented in this row.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Single shared journal file (append-only JSONL) vs one-file-per-event | One file per event | Contract's Scope explicitly cites "the audit's evidence-store guidance prefers per-event files for crash safety"; also makes session-scoped coalesce trivial (deterministic filename = overwrite target) instead of requiring a scan-and-rewrite of a shared file on every edit. |
| Compute minimal-change report at edit time vs defer to Stop | Defer to Stop | The git-diff-based computation is exactly the per-edit cost audit LOOP-05 targets; deferring it while keeping the SAME `collectMinimalChangeSignals()` function (idempotent given repoRoot+path+policy+baseRef) preserves output shape with no dual authority. |
| Pre-filter `context`/`capability` bits by replicating capability-resolver matching vs storing them as unconditional candidates | Store as candidates, re-gate at consumption | Replicating capability/prefix matching in the hot path would be exactly the "shadow parser" / duplicated-authority anti-pattern this repo's CLAUDE.md forbids; the real gate already exists inside `architecture-queue.sh record`'s own output. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

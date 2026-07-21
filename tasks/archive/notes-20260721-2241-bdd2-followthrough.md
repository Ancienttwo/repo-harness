> **Archived**: 2026-07-21 22:41
> **Related Plan**: plans/archive/plan-20260721-1907-bdd2-followthrough.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260721-2241

# Implementation Notes: bdd2-followthrough

> **Status**: Active
> **Plan**: plans/plan-20260721-1907-bdd2-followthrough.md
> **Contract**: tasks/contracts/20260721-1907-bdd2-followthrough.contract.md
> **Review**: tasks/reviews/20260721-1907-bdd2-followthrough.review.md
> **Last Updated**: 2026-07-21 21:35
> **Lifecycle**: notes

## Design Decisions

- T3 split kept the file's existing one-line `if (cond) out.push(...)` style (matching the `[TDD]` line immediately above it) rather than the plan snippet's multi-line braces; the gating semantics are identical (`[BDD]` under `shouldEmitBddFeatureAdvice`, `[UXFeatureGuard]` under the new `shouldEmitUxFeatureGuardAdvice`, advisory text byte-verbatim). Taste constraint: match surrounding style.
- T6(a) `design-options.md`: inserted the product-boundary prerequisite as an unnumbered `## Product Boundary Prerequisite (Before Step 2)` section between `## Step 1` and `## Step 2`, and the `## Taste Refinement Authority Ceiling` table after `## Fallback: User Absent` and before `## Design-Brief Hand-off`, instead of renumbering the existing Step 1-4 headers. No test or other doc string-matches a specific step number, and renumbering would have forced edits to the Worked Example's four step callouts for no functional gain — smallest change that satisfies the goal.
- T7 row removal: followed the ledger's confirmed established pattern (commits `d61d153e`, `15dd405c` — "delist" = full row deletion, not strikethrough/annotation, once a row is fully resolved). Row 22's "qa_scores" partial-annotation style only applies when a *multi-defect* row has some but not all defects fixed; both BDD² revival and BDD3-PS1 are fully resolved (their own revisit triggers fired and both reached terminal sealed outcome docs), so both rows were deleted outright.
- T7 omission: the plan's Task Breakdown line for T7 also says "note `project-init-lib.sh:2153` residue already fixed," but neither the contract's `## Goal` (Track C) nor the dispatch's own T7 instruction mentions this — both independently limit T7 to the two row closures + VH1-unchanged + the one new deferred row. Treated the contract+dispatch as authoritative over the plan's Task Breakdown prose for this one line and did not add it.
- T5 `when_to_use` language: mid-task steering (relayed via the harness) asked to avoid hardcoding Chinese into prompts/skill instructions where language should stay user-controlled. The plan's frontmatter content contract gave an explicit `when_to_use` string mixing ZH/EN (`"design proposal, preview 方案, 出设计方案, 前端方案, 设计预览, mockup pipeline"`), matching this user's broader `~/.claude/skills/*` convention of bilingual trigger lists. Since T5 is a brand-new file (no established bilingual precedent of its own — the four composed sub-skills are all English-only) and the live correction landed exactly while authoring it, wrote `when_to_use` English-only (`"design proposal, design proposal pipeline, frontend design pass, preview pipeline, mockup pipeline, design pipeline orchestration, end-to-end design pass before implementation"`) plus an explicit "Use when the user asks, in any language, for..." clause in `description` so semantic matching still covers non-English requests. Did **not** touch T1's frozen ZH/EN noun regexes or T3's bilingual advisory text — those are the contract's own explicit, twice-reviewed, "verbatim" runtime deliverables (the Falsifier itself requires a Chinese fixture to fire the guard), not discretionary prompt authoring.

## Deviations From Plan Or Spec

- Track A retarget (recorded at contract calibration, before execution): the plan was drafted against the pre-HRD-09 runtime (`assets/hooks/prompt-guard.sh` + `pg_fact` echoes). HRD-09 (PR #106, base `b5a98c90`) retired that bash surface; the UserPromptSubmit authority is `src/cli/hook/prompt-handler.ts`, where one `if (shouldEmitBddFeatureAdvice(context))` (~line 575) pushes both advisory texts. Plan snippet/File Changes/T2/T3 amended in place; semantics unchanged (split the `[UXFeatureGuard]` segment under the new frontend-scoped classifier). The change got simpler: no shell edit, no `pg_fact` derivation, no `sync:hooks` dependency for this track.
- `tasks/todos.md` row drift: the plan's "rows 17-18" (BDD² revival / BDD3-PS1) sit at rows 16-17 on base `b5a98c90`, VH1 at row 18 — match by content, not line number.
- T8 BLOCKED on its stated command: `repo-harness run archive-workflow --plan plans/plan-20260714-1353-design-options-proactive-choice.md --outcome Completed` fails with `Completed requires current passing verify-sprint evidence: Structured checks are not passing in .ai/harness/checks/latest.json (status=missing)`. Root cause (`scripts/archive-workflow.sh:completed_archive_gate`): the `Completed` path requires a *freshly generated*, structurally-valid `repo-harness-run-trace.v1` pass record in **this worktree's** `.ai/harness/checks/latest.json` (gitignored, per-checkout, currently `{}` since this fresh worktree never ran `verify-sprint`) that cross-validates against the old plan's own contract/review files — it is not enough that the old contract (`Status: Fulfilled`) and review (`Status: Complete`, `Recommendation: pass`) already record a historical pass from 2026-07-14. There is no flag to point the gate at a different evidence file. Generating that evidence requires running `verify-sprint`, which the dispatch explicitly forbids ("Do not run `verify-sprint`/acceptance receipts — the orchestrator owns all git actions" / gate ownership). Did not attempt a workaround (no outcome-value substitution, no manufactured evidence). The failed attempt is a no-op: `archive-workflow.sh` wraps the whole operation in a transaction (`archive_transaction_begin`/`archive_transaction_on_exit`) and rolled back cleanly before touching any file — confirmed via `git status --short --branch -uall` immediately before and after, byte-identical aside from the attempt itself. This needs either an orchestrator-level `verify-sprint` run against the old contract, or an explicit decision to use a different mechanism/outcome for this specific archive.
- T9 full-suite: one failure, `tests/hook-dispatch-diet-report.test.ts:110` (`reports protocol v2 and preserves static/synthetic sections`, `expect(report.runtime_evidence.available).toBe(false)` received `true`) — **not** the dispatch's documented flake (`tests/state/state-concurrency.test.ts:576`, which passed clean 11/11 in isolation, no failure in the full run either). Root cause: `reportFor()` in that test calls `buildHookDietReport({ repo: ROOT, ... })` with no `eventsPath`, so `readHookEventTelemetry` defaults to reading the **real, live** `.ai/harness/runs/hook-events.jsonl` under the actual worktree root (not an isolated tmp fixture) and asserts it is empty. That file is gitignored, per-checkout, session-accumulating telemetry that every PreToolUse/PostToolUse hook appends to as a side effect of ordinary tool use in this exact worktree; by the time the full suite ran it already held ~200 lines purely from this dispatch's own Bash/Edit/Read activity. Confirmed unrelated to this task's diff: zero import overlap (`hook-dispatch-diet-report.ts` imports only `route-registry.ts` and `loop-event-protocol.ts`, neither touched) and zero file overlap with `git diff --name-only`. Reproduced deterministically twice in isolation (not itself racy). This is a pre-existing test-hermeticity gap (the test reads real mutable repo state instead of a fixture) that would surface for any sufficiently-interactive session in this worktree, not a regression from T1-T9; fixing the test's isolation is out of scope for this contract's Allowed Paths and Task Breakdown, so it is reported here rather than fixed.
- Architecture-machinery bookkeeping included by orchestrator decision (post-gatekeeper): during the acceptance review the harness's own drift machinery reacted to the uncommitted `src/cli/hook` diff — updating the capability context blocks in `assets/hooks/AGENTS.md`/`CLAUDE.md` and `docs/architecture/index.md`, and creating `docs/architecture/requests/{root,runtime-harness-hook-adapters}.md`. These are deterministic projections/records of this package's own change, so they ship in this PR; `allowed_paths` was widened accordingly (`assets/hooks/`, `.ai/hooks/`, `docs/architecture/`) per the contract's own scope-widening rule, and `bun run sync:hooks` restored projection parity (`check:hooks` green again). The pending drift requests route through the normal architecture workflow after merge.
- Manual ship by orchestrator decision: `ship-worktrees`/`contract-worktree finish` fails in the protected helper environment — the gated path's `predict_post_freeze_manifest` (packaged `contract-worktree.sh:531` → `archive-workflow.sh --predict-manifest`) reports "Structured checks file is missing or empty: .ai/harness/checks/latest.json" while a 0.2s watcher proved the worktree's checks file stayed present at 10229 bytes for the whole run — the predicate resolves a different root in that environment. Two real environment gaps were fixed along the way (bare `node` at packaged `check-architecture-sync.sh:284` is unreachable from the protected PATH; fixed locally by symlinking `node` into `~/.bun/bin`, which protectedPath includes). The remaining predict-path resolution defect is a harness tooling bug outside this contract's scope; the ship steps (commit with finish's message, merge-gate seal, closeout archive, push, PR) were executed manually by the orchestrator instead. Follow-up belongs to a package touching the finish/ship helpers.
- T8 deferred by orchestrator decision (gatekeeper finding 1): `archive-workflow --outcome Completed` requires fresh verify-sprint evidence whose `contract.file`/`review.file` match the plan being archived, and `verify-sprint` binds only the ACTIVE contract (sole flag: `--prepare-acceptance`; resolution via the active-plan marker). Binding the retired design-options contract would require re-pointing active-plan state — state manipulation to satisfy a gate — so the archive is deferred instead of hacked. Recorded as a `tasks/todos.md` deferred row; T8's checkbox stays unticked; the three other contract Goal outcomes are delivered.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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

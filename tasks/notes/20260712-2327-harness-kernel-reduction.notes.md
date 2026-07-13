# Implementation Notes: harness-kernel-reduction

> **Status**: Active
> **Plan**: plans/plan-20260712-2327-harness-kernel-reduction.md
> **Contract**: tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
> **Review**: tasks/reviews/20260712-2327-harness-kernel-reduction.review.md
> **Last Updated**: 2026-07-13 08:05
> **Lifecycle**: notes

## Design Decisions

- Keep Risk Profile separate from existing Task Profile.
- Upgrade the existing state-snapshot owner into the single effective-state
  resolver; do not introduce a third parser.
- Resolve safety floor at PreToolUse from real path/action/capability inputs;
  natural language is not a security authority.
- Enforce SessionStart budget at the runtime aggregation point across all producers.
- Treat the partial synthetic reporter as micro/SLO evidence only.
- Make InstallProfile host-level authority with one transaction/ownership model;
  repo policy may hold an explicit override, not competing installed state.
- Use package-owned hash proof before deleting legacy host paths; modified or
  unknown content fails closed.
- Live Codex benchmark evidence showed `apply_patch` sends the freeform patch as
  `tool_input.command`, not `tool_input.file_path`. The edit guard now expands
  every Add/Update/Delete/Move target and checks each path; `.ai/harness/state/`
  is excluded from implementation fingerprints so the resolver cannot raise its
  own next invocation's risk floor.
- The benchmark runner accepts an explicit `--provider codex|claude`; profile
  comparisons never mix providers inside one report. Codex exhausted its live
  account quota after repeated real matrix attempts, so Claude is the bounded
  same-matrix fallback rather than synthetic evidence.
- Live enforcement exposed two fail-open paths that unit-only execution had not
  covered. A multi-script route shared one consumable stdin stream, and the
  adapter retried the full CLI whenever the hook-only binary returned nonzero.
  The entrypoint now captures/replays one payload and the adapter fallback is
  based only on binary absence, so a guard's first nonzero status is final.
- The first post-hardening full matrix failed before Strict execution because
  `--no-external-skills` skipped the bundled cross-review Skill while the Strict
  profile truthfully required `cross-model-acceptance`. Bundled strict capability
  projection is now independent of optional marketplace Waza/Mermaid selection;
  a focused regression proves Strict remains complete without enabling either.
- Benchmark harness projection must become the synthetic `main` baseline before
  the task starts. Otherwise adoption files appear as task implementation diff,
  raise every Adaptive edit to Strict, and fabricate Plan/Contract cost. The
  corrected Adaptive run produced zero artifacts for low-risk/local scenarios,
  five for the Standard cross-capability scenario, and five for migration.
- Structured provider usage and grader success remain separate evidence fields,
  but a report is authoritative only when both pass. `--require-authoritative`
  additionally requires task status and No Harness isolation. Regrade can repair
  a deterministic grader implementation bug only while runner, manifest,
  fixture, and workspace hashes still match; it cannot alter provider usage.

## Deviations From Plan Or Spec

- The captured contract initially treated any Lite cost result above Strict as
  a falsifier. That comparison threshold does not exist in the attached source's
  Quantitative gates and made completion depend on one noisy provider sample.
  The falsifier is corrected to the actual source gates: no safety regression,
  no full artifact chain for low-risk Lite, and no grader regression. Cost
  regressions remain mandatory reported findings and optimization targets.
- The final report uses Claude for all 27 records because Codex exhausted its
  live account quota until 2026-07-18. This follows the planned single-provider
  fallback and does not mix models inside one comparison.
- The superseded report combined records from two temporary roots while grader
  defects were repaired. It has been replaced, not amended: the final 27 records
  come from one fresh command, one run ID, one source commit, one Claude version,
  and one runner/manifest/fixture revision. No record was regraded into the final
  report.
- A post-fix retry truthfully failed one Adaptive cross-capability grader when
  the provider stopped at the expected Standard Plan gate rather than creating
  the authorized artifacts. That non-authoritative attempt was retained in Git
  history, not promoted as final evidence; the next clean full matrix passed.
- The final verifier reproduced that same provider hesitation: the scenario
  requested implementation but did not state whether creating Standard workflow
  artifacts was approved, so Claude stopped at the correct Plan gate. The
  scenario now states approval and requires Standard artifacts explicitly. This
  removes authorization ambiguity without relaxing the gate or changing the
  expected product edit and grader.
- The final accepted reference report was regenerated after the concurrency,
  context-budget, install-ownership, profile-exclusion, and scenario-authorization
  fixes. All 27 records use run ID `d2a2fdcb-bda9-41af-bd46-411e5d412097`
  and source commit `7b11d293`.
- Closeout exposed an evidence self-invalidation loop: `verify-contract` must
  regenerate the tracked authoritative matrix, while review freshness treated
  those two generated reports as implementation. They now share the established
  operational-evidence exclusion used by checks/runs; report source commit,
  runner/manifest/fixture hashes, provider usage, graders, and external review
  remain the semantic integrity boundary. `verify-sprint` now records a separate
  fingerprint over the actual JSON and Markdown bytes, and checks freshness
  recomputes it. Regressions prove report regeneration does not stale the
  implementation review while post-verification tampering does stale checks.
- The first clean-state full-suite retry exposed three non-benchmark fixture
  writers that still emitted the pre-binding checks schema. They now emit the
  producer's explicit `benchmark_evidence.status=not_applicable`; missing legacy
  status remains fail-closed, while any present report still requires an exact
  byte fingerprint. The two affected suites pass 76/76 after the fixture repair.
- Native independent review found and drove closure of concurrency, critical
  context preservation, transaction compensation, ownership, Strict projection,
  and product-planning exclusion defects. Its final pass found no P1/P2. The
  original full-scope Claude review command timed out without a recoverable
  verdict; a later bounded Claude review of the fixture-only schema delta passed
  with no P1/P2 and confirmed the product fail-closed path remained intact.
- Before final verification the isolated branch was rebased from `941555e` onto
  current `main`/`origin/main` `0cf69cf`. `git range-diff` showed 13 commits
  identical and one expected conflict in `tests/hook-contracts.test.ts`; the
  resolution keeps both main's Strict review-routing assertions and this branch's
  cross-model circuit assertions, all backed by existing runtime strings. The
  bounded Claude integration review became stuck in CodeGraph MCP and was
  interrupted after ten minutes without a verdict; it is not counted as a pass.
- At 12:08 local `main` fast-forwarded via an external `git pull --tags origin
  main` from `0cf69cf` to this branch's `b4acb00`; `git ls-remote` confirmed the
  remote already pointed there. This session issued no push, merge, deploy, or
  main-worktree mutation. Final reporting therefore distinguishes our actions
  from the externally advanced branch state.
- The first final verifier produced a fresh authoritative 27/27 matrix (run
  `514fe7bc-21eb-4d88-bdbb-695b0c6a5d9d`) and a clean full suite, but its earlier
  focused circuit suite hit Bun's 5-second per-test timeout while another repo
  worktree was concurrently running process-heavy hook tests. The same command
  immediately passed except for that 10.5-second timed case; state resolution
  and task sync also passed on direct replay. The circuit suite now uses a
  bounded 30-second default because its real-hook case deliberately exercises a
  2-second fail-closed lock timeout plus multiple Bun/shell spawns. During the
  verifier, `main/origin/main` again advanced externally (to `0cbfab4`), so the
  review must be rebound after integrating that target before the next retry.
- The second final verifier passed every contract command except task-sync. This
  was deterministic, not a flaky gate: the contract regenerates the two tracked
  benchmark reports before `check-task-sync.sh`, while the contract status does
  not change until all commands finish, so the working tree temporarily held
  operational evidence without a `tasks/` edit. The task-sync owner now ignores
  exactly those two independently byte-bound report paths. A regression proves
  report-only regeneration is non-substantive and a report cannot hide an
  unsynchronized source change; no broader evals or docs path is excluded.
- A targeted external review passed the task-sync change with no P1. Its two P2
  advisories were closed: a sibling-report regression now pins the exclusion to
  exactly the JSON/Markdown pair, and durable review/research wording separates
  the independently reviewed reference run from the volatile final verifier run.
  The latter is accepted by exact report-byte and provenance binding, not by
  copying changing token totals into implementation review metadata.
- The third final verifier passed the matrix and every contract command through
  task-sync, proving that evidence exclusion fix. It then failed only because
  `main/origin/main` advanced during the run to native-role capability changes
  whose three registered reference docs had not yet been mirrored into the
  default brain vault. Direct strict workflow check reproduced only that
  `[BrainSync]` drift. The new main also overlaps this work-package's hook,
  report, notes, review, circuit-test, and task-sync surfaces, so it must be
  integrated and audited before the verifier can be retried.
- The branch was then rebased onto `f248e76f`. The three registered reference
  docs were synced through the explicit repo-to-brain manifest, handoff/resume
  were refreshed, and strict workflow validation passed. A git-enabled external
  re-review proved `f248e76f` is an ancestor, native role-routing files are
  byte-identical to main, the model-negative assertion applies only to the
  return-channel guard, and report-byte tampering still fails in both jq and
  no-jq checks paths. Corrected verdict: PASS, no P1/P2.
- The fourth verifier again passed every contract command except strict workflow
  sync. During the hour-long run, the shared `main` worktree locally fast-forwarded
  three unpushed gstack-removal commits and re-synced the global brain vault;
  `origin/main` remained `f248e76f`, which is the Goal's declared integration
  authority. Rebasing onto unpublished local-main WIP would pull unrelated
  `AGENTS.md`/`CLAUDE.md` changes outside this contract and fail allowed-paths.
  Therefore this branch stays based on `origin/main` and reprojects its three
  manifest-owned docs to the brain immediately before the next verifier.
- The fifth verifier reached the same final command but exposed a different
  self-host boundary: bare `repo-harness run` resolved the globally installed
  package helper, which timed out after 120 seconds, while the current source
  helper completed strict workflow checks in under two seconds. Setting the
  documented `REPO_HARNESS_SOURCE_ROOT` to this checkout makes the exact required
  command resolve the current workflow contract and pass. The next self-host
  verifier therefore carries that explicit source authority instead of mutating
  the shared global install during concurrent repo work.
- With explicit source authority, the sixth verifier cleared strict workflow and
  every other contract command; only its plain `bun test` invocation failed
  under concurrent full-suite/benchmark activity. An immediate isolated replay
  of the same full suite passed 1,256 tests with one platform skip and zero
  failures. No code or gate was weakened; the next retry is deferred until the
  other repo-wide test/benchmark processes have exited.
- The seventh verifier isolated the remaining full-suite failure to three
  package-default helper-runner tests inheriting the deliberate self-host
  `REPO_HARNESS_SOURCE_ROOT`. Their assertions expected package authority while
  the ambient override correctly selected source authority. Package-default
  fixtures now explicitly unset that variable; source-override tests keep their
  explicit roots. This changes test isolation only, not helper resolution.
- A final Claude review confirmed that isolation follows the production helper
  authority chain and does not mask a runtime defect. Its circuit-test advisory
  was applied by moving the 30-second test bound from the entire file to only
  the four process/lock cases that need it. Its downstream task-sync advisory is
  accepted as a narrow residual: the exact two report paths are self-host
  operational evidence, while downstream repositories would need to create
  those repo-harness-specific paths before the exclusion could apply. Adding a
  general policy surface for that hypothetical case would create a second
  configuration authority for a single consumer.
- The eighth verifier passed every focused suite, the full `bun test`, typecheck,
  deploy/architecture/task-sync checks, inspector, and adoption dry-run. One
  Strict cross-capability provider run became non-authoritative after the model
  completed its implementation and grader path but then searched the entire
  host filesystem for package internals for more than eleven minutes. The
  operator terminated that isolated provider tool/process; the report honestly
  records exit 143, unavailable provider usage, and `authoritative=false`.
  Root cause was an internally contradictory scenario instruction: it required
  `Standard` workflow even inside the explicitly Strict arm and left the stop
  boundary implicit. The scenario now tells every arm to follow the profile
  selected by its environment, stay inside the disposable workspace, and stop
  after its focused test plus required completion gates. This preserves the
  task and acceptance command while removing host archaeology from the measured
  workload; no product safety or quantitative gate changed.
- Before the next retry, `origin/main` advanced to PR67 (`4e3e76a2`). The branch
  rebased cleanly; an external git review found zero overlap with the new
  configurable deploy-SQL policy and verified its scripts, policy, Skill, and
  tests remain byte-identical. Verdict PASS, no P1/P2.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add parallel effective-state engine | Reject | Would preserve duplicate parsers and violate one-authority invariant. |
| Rename without_skill to No Harness | Reject | It inherits host hooks/config and cannot prove isolation. |
| Truncate only session-start-context.sh | Reject | Other SessionStart producers would remain outside the budget. |
| Delete facades before transaction authority | Reject | Cannot safely prove ownership or rollback host state. |

## Open Questions

- None requiring user input. Detailed file ownership is narrowed per ordered
  work package under this parent contract.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Matrix: `evals/harness/reports/profile-comparison.json`
- Human summary: `evals/harness/reports/profile-comparison.md`

## Removed Authorities And Migration

- Removed steady-state `.claude/.active-plan` reads/writes; only explicit
  one-shot migration to `.ai/harness/active-plan` remains.
- Ordinary, advisory, quoted, negated, and workflow-discussion prompts bypass
  the historical classifier. It remains reachable only after explicit or active
  task routing and is not a second steady-state authority.
- Removed broad default Skill discovery and unconditional external-skill,
  CodeGraph, and cross-model behavior. Five root actions and InstallProfile own
  discovery.
- Profile switch/removal acts only on ownership-marked links/copies/routes.
  Modified or unknown host content fails closed and is preserved.
- Rollback reprojects the prior InstallProfile first and commits
  `~/.repo-harness/install-state.json` only after runtime setup succeeds. Code
  rollback is ordered commit revert; no shared main, push, merge, deploy, secret,
  or provider state was mutated. The accidental benchmark overwrite of the Bun
  global package was repaired immediately with `bun add -g repo-harness@0.9.2`
  and verified by `repo-harness --version` and `bun pm ls -g`.

## Dependency, File, And Abstraction Proof

- New dependencies: none. Node/Bun standard library, Git, Bash, and existing
  package dependencies cover locking, hashing, atomic rename, process capture,
  percentiles, installation transactions, and report generation.
- `state.ts` is a public command boundary; state derivation remains in the
  existing `state-snapshot.ts` owner. `workflow-profile.ts`, `prompt-router.ts`,
  `session-context-budget.ts`, and `circuit-breaker.ts` each isolate one
  cross-module invariant consumed by runtime hooks and focused tests; merging
  them into shell scripts would recreate shadow parsers.
- `install-profile.ts` owns the cross-target transaction/ownership invariant
  used by the install command and both Claude/Codex targets. Target-specific
  files remain projections.
- `run-harness-profile-benchmark.ts`, `scenarios.json`, the fixture tree, and
  reports form the independent benchmark authority: runner, inputs, disposable
  product, and durable output cannot be placed in runtime owners without mixing
  measurement with enforcement.
- Every added test file maps one required outcome to an independently runnable
  verification boundary. New documentation files are the operator contract and
  durable evidence requested by the Goal, not parallel runtime authorities.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

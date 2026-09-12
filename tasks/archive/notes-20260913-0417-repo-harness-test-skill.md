> **Archived**: 2026-09-13 04:17
> **Related Plan**: plans/archive/plan-20260913-0258-repo-harness-test-skill.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260913-0417
> **Archive Projection V1**: `plans/plan-20260913-0258-repo-harness-test-skill.md` => `plans/archive/plan-20260913-0258-repo-harness-test-skill.md`
> **Archive Projection V1**: `tasks/notes/20260913-0258-repo-harness-test-skill.notes.md` => `tasks/archive/notes-20260913-0417-repo-harness-test-skill.md`
> **Archive Projection V1**: `tasks/contracts/20260913-0258-repo-harness-test-skill.contract.md` => `tasks/archive/contract-20260913-0417-repo-harness-test-skill.md`
> **Archive Projection V1**: `tasks/reviews/20260913-0258-repo-harness-test-skill.review.md` => `tasks/archive/review-20260913-0417-repo-harness-test-skill.md`

# Notes: repo-harness-test-skill

## Registration point

`assets/skill-commands/manifest.json` is the only registration list. Everything
downstream reads the parsed catalog rather than its own copy:

- `src/core/skill-surface/catalog.ts` parses it; `computeFacadesForProfile`
  (line 208) is what projects a package into an install profile, and it only
  considers `kind: "facade"`. A shipped, profile-projected skill therefore has
  to be a facade.
- `src/cli/installer/install-profile.ts` consumes the catalog for install state; `scripts/skill-surface-select.ts`
  and `scripts/sync-codex-installed-copies.sh` consume it for host sync;
  `scripts/run-skill-routing-eval.ts` consumes it for discovery scoring.

Chosen shape: `kind: "facade"`, `profiles: ["full"]`,
`component: "verifier"`, `discoverability: "profile-facade"`,
`mutatesRepoByDefault: false`. `verifier` is in `PROFILE_COMPONENTS.full` only
(`src/core/skill-surface/profile-components.ts`), which matches the package's
subject and leaves the minimal discovery matrix untouched. `verifier` is also
not filtered by any other selector, unlike `planning-integrations`, which feeds
`probeExpectations.planningCapabilityPaths`.

## Surface inventories that had to declare the new name

These are the drift checks between the manifest and the declared shipping
surface. Each gained the package name; no assertion's semantics changed.

| File | What it pins |
|------|--------------|
| `tests/skill-surface/catalog.test.ts` | package count 21 -> 22, repo-owned 13 -> 14, the `full` facade order, `mutationPathSkillNames.repoHarnessSkills` |
| `tests/skill-surface/canonical-packages.test.ts` | `CANONICAL_PACKAGES` row, which is what applies the 2048-byte router budget, the frontmatter contract, the declared-reference closure and the 5-line shell-block limit to the new package |
| `tests/action-command-skills.test.ts` | `TARGET_FACADE_KIND_PACKAGES`, an exact set over every `kind: "facade"` manifest entry |
| `tests/skill-routing-eval.test.ts` | `discovered_surface` for `full`/`claude`, derived live from the manifest |

`obsidian-memory` set the precedent for a post-cutover facade addition in the
first and third of those.

## Content provenance

Every technique claim resolves on `origin/main` at `e3b93f0f`:

- fixtures: `tests/helpers/repo-fixture.ts` (`tmpWorkspace` 32, `sandboxEnv`
  122, `run` 128, `initGitRepo` 132, `commitAll` 138, `withTempRepo` 144,
  `fixtureTemplate` 72-120)
- restore-in-place requirement: `repoHarnessRepoIdFor`
  (`src/effects/repo-registry.ts:105-107`); worked examples PR #421 (226bb5c6),
  #423 (95eddaa9), #426 (1ae2cd5c)
- in-process CLI: `tests/helpers/cli-in-process.ts:57`; the `Bun.which`
  start-environment constraint and the one retained real child are from PR #424
  (b9628876) and `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md:38,57`
- issue-numbered naming counter-example: the five `tests/unit/issue-282-*` files
- runner and lanes: `scripts/lib/ci-run-tests.sh` (8, 151, 165-173, 191),
  `.github/workflows/ci.yml:92-95`, `scripts/select-ci-coverage.ts`
  (`isDocumentationPath` 18-27, `selectCoverage` 33), `scripts/replay-ci-coverage.ts`
- per-file timing recipe: verified against `gh run view 34711271371 --log`
  (main `1ae2cd5c`, 446 `[ci] test` lines). The log has no `##[group]tests/...`
  markers; the usable pairing is the pool's `[ci] test <file>` header with bun's
  closing `Ran N tests across 1 file. [<duration>]`, which the job pool keeps
  contiguous.
- JUnit evidence: `bun test --reporter=junit --reporter-outfile=<path>` probed
  on bun 1.4.0 (51 `<testcase name=` entries for one file); the method is named
  in `plans/plan-20260912-1948-fixture-template.md:177`; the 470/470 example is
  PR #420 (065a9225)
- verification plan shape: `src/core/evidence/verification-plan.ts:8-47`
- digest env vars: `scripts/check-task-sync.sh:8-9,124-125,141`
- documentation-consumer projection: `scripts/ci-documentation-consumers.ts`,
  `tests/ci-documentation-consumers.test.ts:45-48`
- expensive-case gates: `REPO_HARNESS_TEST_EXPENSIVE` exported by the `all`
  lane of `scripts/check-ci.sh:73` and consumed by
  `tests/harness-benchmark-matrix.test.ts:47-49` and
  `tests/claude-review.test.ts:22-24`, guarded by
  `tests/expensive-test-gate.test.ts` (which reads the exported name back out of
  the lane script, making that script the single naming authority) and
  documented at `docs/reference-configs/release-deploy.md:16`; landed on `main`
  as `268c973d` (PR #428). Narrower gates: `BRC_TEST_CONTAINER_IMAGE`
  (`tests/effects/campaign-container-live.test.ts:7`,
  `tests/effects/brc10-lifecycle.test.ts:283`) and
  `REPO_HARNESS_WINDOWS_PROTECTED_HELPER_SMOKE`
  (`tests/cli/windows-protected-helper-runtime-smoke.test.ts:14`)
- clock forwarding: `observeIssueBatch`
  (`src/effects/automation/issue-batch-observer.ts:136`, fixed call at 151,
  PR #425 / `9ae4cb2b`) and `refreshExternalSource`
  (`src/effects/external-sources/refresh.ts:64`, fixed call at 78, PR #427 /
  `08634e13`). Both were the same defect against the same fetcher, surfaced by
  the `BUN_TEST_JOBS=4` pool added in #425.

## Deviations

- The branch was rebased onto `e3b93f0f` after the expensive-test-gate package
  landed, so `references/authoring.md` and `references/running.md` cite
  `REPO_HARNESS_TEST_EXPENSIVE` from `main` rather than from a worktree.
- The task brief said not to change test assertions. Four test files were
  edited anyway, because they hold exact-set inventories of the shipping surface
  derived from the same manifest: there is no package `kind` that avoids them
  (`catalog.test.ts` pins the raw `packages.length`). Only names and counts
  moved; no oracle was weakened or removed.
- README's Skills table was left alone. It exists in five locales with no
  automated parity check, so touching one would create drift; the routing row
  went into `assets/reference-configs/agentic-development-flow.md`, which has an
  authoring source and a projection drift check.
- `repo-harness init --repo . --dry-run` plans 0 operations in this checkout and
  warns that downstream init is not applicable to the repo-harness source
  checkout, and validates only the self-host adoption boundary. Public init disables host
  skill sync even for a downstream repo; host projection is exercised through
  `scripts/sync-codex-installed-copies.sh` separately.


## Acceptance boundary decisions

- Refactor recipes describe discovery, process isolation and performance
  measurement options. The canonical policy and Verification Plan decide which
  apply; matching test names cannot establish assertion preservation.
- The in-process CLI helper is documented against its tested chatgpt terminal
  output/exit boundary. Other commands need a separately established completion
  contract before reuse.
- Public init is repo-local adoption. Host skill installation is the
  install/update sync script's boundary, tested separately in an isolated HOME.
- The declared repository integrity checks include deploy SQL ordering and
  project-state inspection in addition to the original plan's checks.


## Boundary readback

A disposable HOME and downstream Git repo exercised both boundaries with the
candidate source. `init --dry-run --json` planned 103 repo-local operations;
`init --no-codegraph --no-verify --json` applied successfully and materialized
`.ai/harness/policy.json`. Host synchronization in copy mode excluded the skill
under `minimal`; under `full`, all five package files in both Claude and Codex
skill roots matched the source byte-for-byte. This is source-entrypoint smoke,
not a packed-release installation or external dependency verification.

The original contract incorrectly declared harness-internal diff variables as
`inputs.env`, which the Verification Plan validator rejects. Its task-sync
command now carries the explicit PR diff boundary, with no such input fields.


## Global discovery boundary

The skill is globally discoverable, but its four references describe this
source checkout's fixtures and CI. Mode selection therefore first establishes
the target repository; downstream projects use their own testing commands,
fixtures and CI. The description and routing-table row state that scope. The
isolated downstream fixture has the adopted policy but no source
`tests/helpers/repo-fixture.ts` or `scripts/check-ci.sh`, demonstrating why
host installation does not make those recipes applicable there.

The formal codex-plugin review identified this scope issue on `3665ec35` as a
P2 finding. It is now corrected. The work-package permits one formal semantic
review; final closeout after this correction requires owner acceptance rather
than a repeated external review or a claim that the prior reviewer passed the
changed subject. Existing canonical package and routing tests verify package
shape and discovery; they are not an LLM downstream-routing evaluation.

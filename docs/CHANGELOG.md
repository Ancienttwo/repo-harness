# Changelog

All notable changes to this skill are documented here.

## [Unreleased]

### Added

- Added the Harness Engineering Optimization sprint closeout surface, including
  task profiles, Human Review Card enforcement, trace/eval evidence grading,
  handoff UX, delegation contract roles, and compressed spec/onboarding paths.
- Added `repo-harness uninstall` to remove repo-harness managed Codex/Claude
  hook adapters while preserving sibling user hooks and Codex trust-state
  residue.
- Added fs-transaction manifests for `repo-harness adopt --experimental-ts-apply`
  and `repo-harness adopt rollback --transaction <manifest>` so the safe
  TypeScript applicator has an executable recovery path.
- Added `scripts/check-release-published.sh` for post-publish npm registry,
  dist-tag, tarball integrity, Git tag, and local version readback.
- Added `scripts/check-tarball-install-smoke.sh` and wired it into the CI gate
  so release checks install the packed tarball in a temporary project and start
  the packaged `repo-harness` and `repo-harness-hook` bins.

### Changed

- Made `repo-harness install` the primary first-run global runtime bootstrap
  command, while preserving `repo-harness init` as a compatibility alias and
  keeping `repo-harness install --target <host> --location <scope>` as the
  adapter-only path.

### Fixed

- Made non-standard `repo-harness adopt --mode minimal|self-host` fail closed
  unless it routes to ordinary TypeScript `--dry-run` or
  `--experimental-ts-apply`,
  avoiding a mismatch where dry-run showed a TypeScript mode plan but apply
  still used the standard shell migrator.
- Made minimal TypeScript adoption install
  `.ai/harness/workflow-contract.json`, preserving the hook opt-in marker for
  all adoption modes.
- Normalized protocol v1 JSON error output for adoption target validation
  failures.
- Added safe-applicator preflight inside `applyAdoptionPlan()` so exported
  callers cannot partially write a plan before encountering an unsupported
  operation.
- Preserved CRLF `.gitignore` managed blocks without duplicate insertion and
  added planned/skipped/failed summary counts to adoption plan output.
- Added a bounded CLI process runner for init/adopt/global-runtime, CodeGraph
  setup, and `repo-harness run` helper dispatch, with default timeout, output
  cap, and common secret redaction.

## [0.6.0] - 2026-06-16

### Added

- Added the Transactional Adoption Planner foundation for
  `repo-harness adopt --dry-run --json`, including protocol v1 operation plans,
  redacted JSON rendering, fixture-backed planner tests, and a safe applicator
  subset for `mkdir`, `writeFile ifMissing`, and managed `.gitignore` blocks.
- Added workflow-contract manifest planning to the TypeScript adoption plan so
  `standard` and `self-host` dry-run JSON now report installation of
  `.ai/harness/workflow-contract.json` from the canonical tracked asset.
- Added workflow-contract-backed adoption templates for `docs/spec.md` and
  `tasks/current.md`, keeping their `writeFile ifMissing` planner behavior while
  moving the file body and reason out of `plan.ts`.
- Added standard-mode helper wrapper planning to the TypeScript adoption plan so
  downstream dry-run JSON reports generated `scripts/<helper>` compatibility
  wrappers from the workflow contract helper manifest.
- Added an atomic safe-applicator writer with target locks, temp-file fsync,
  parent-directory fsync, and backup metadata for existing targets.
- Routed human-readable `repo-harness adopt --dry-run` output through the
  TypeScript adoption planner text renderer, matching the JSON dry-run source of
  truth without writing repo files.
- Added `repo-harness adopt --experimental-ts-apply` as an opt-in TypeScript
  safe-applicator path, with preflight rejection for plans containing
  unsupported operations.
- Added rollback metadata to adoption operation plans so dry-run JSON and
  experimental apply reports expose the planned recovery strategy per operation.
- Added workflow-contract install support to the experimental TypeScript
  adoption applicator, including atomic replacement backups for stale manifests.
- Added workflow-contract-backed adoption templates for `tasks/todos.md` and
  `tasks/lessons.md`, completing manifest ownership of the initial bootstrap
  ledger file bodies.

### Release Notes

- Prepared the `repo-harness@0.6.0` minor release line for npm publish,
  registry readback, clean-room `npx` smoke, Git tag, and GitHub release
  creation.

## [0.5.3] - 2026-06-15

### Fixed

- Fixed `repo-harness update --version <version>` so the update subcommand can
  install an explicit `repo-harness@<version>` package. The top-level
  `repo-harness --version` / `repo-harness -V` shortcut still prints the CLI
  version, but it no longer intercepts the update command's package-version
  option.

### Release Notes

- Prepared the `repo-harness@0.5.3` patch line for npm publish, registry
  readback, clean-room `npx` smoke, Git tag, and GitHub release creation.

## [0.5.2] - 2026-06-15

### Added

- Added a weekly timestamp cache for SessionStart tooling-update advisories so
  Waza and CodeGraph update checks run at most once per week by default unless
  `REPO_HARNESS_TOOLING_ADVISORY_TTL_SECONDS` overrides the TTL.
- Added reviewed security exceptions to `repo-harness security scan` so
  user-level warning-only hook findings can be accepted through exact
  `filePath` + `ruleId` + `command` matches while high/fail findings stay
  active.
- Added transcript recovery to the bundled `claude-review` cross-review skill
  for Claude Code print-mode runs that write the final assistant message to the
  session transcript but produce empty stdout.

### Changed

- Treated `gbrain doctor --json --fast` connection warnings that only report
  skipped DB checks as an accepted fast-mode readiness state, while preserving
  real gbrain warnings such as freshness drift.
- Pinned the repo-local CodeGraph dev dependency to `1.0.1` so local-first
  readiness checks do not float across patch releases.

### Fixed

- `repo-harness setup check --target codex --check-updates --json` now reports
  a fully green setup on this machine after Waza and CodeGraph are up to date,
  reviewed user-level safety hooks are recorded, and gbrain fast-mode DB checks
  are treated as intentionally skipped.

### Release Notes

- Prepared the `repo-harness@0.5.2` package line for npm publish, registry
  readback, clean-room `npx` smoke, Git tag, and GitHub release creation.

## [0.5.1] - 2026-06-14

### Fixed

- Fixed CodeGraph readiness detection so repo-local checks prefer the installed
  platform bundle before the npm shim. This prevents a broken `.bin/codegraph`
  shim from turning a ready local index into `project_index=unavailable`.
- Synced the same CodeGraph resolver into the generated-project helper template.

### Release Notes

- Prepared the `repo-harness@0.5.1` package line for publish; npm publish,
  registry readback, and GitHub release creation remain explicit release
  actions.

## [0.5.0] - 2026-06-14

### Added

- Added README release art from `docs/images/image.png` and documented the
  install/refresh split for first-run bootstrap, user-level runtime updates,
  read-only setup audit, and repo-local adoption.
- Documented the eight managed hook routes installed by the Claude/Codex
  adapters: `SessionStart.default`, `PreToolUse.edit`,
  `PreToolUse.subagent`, `PostToolUse.edit`, `PostToolUse.bash`,
  `PostToolUse.always`, `UserPromptSubmit.default`, and `Stop.default`.

### Changed

- Breaking: `repo-harness update` now owns CLI/user-level runtime refresh only;
  use `repo-harness adopt` for repo-local workflow install, refresh, and
  migration.
- `repo-harness update --check` / `--no-runtime-refresh` now route to the
  read-only setup checklist, and third-party skill/CodeGraph refreshes require
  explicit opt-in.
- Added `repo-harness setup check` as the productized read-only readiness
  command while keeping `repo-harness init-hook` as a compatibility alias.

### Fixed

- Refused `$HOME` as a repo adoption target before any mutation and hardened
  legacy context discovery so vendored/cache trees such as `go/pkg/mod`,
  nested `node_modules`, and `vendor` are not mirrored into.

### Release Notes

- Prepared the `repo-harness@0.5.0` package line for publish; npm publish,
  registry readback, and GitHub release creation remain explicit release
  actions.

## [0.4.3] - 2026-06-13

### Added

- Added `repo-harness docs list|path|show` so bundled runtime/reference docs
  resolve from the user-level/package install instead of copied repo prose.
- Added `repo-harness init-hook --json` bootstrap audit guidance for working
  rules, adapter drift, stale CLI installs, and tooling readiness.
- Added first-principles edit guard coverage to the managed hook route set as
  advisory anti-overengineering guidance.

### Changed

- Generated and migrated repos now write deterministic
  `docs/reference-configs/*.md` pointer stubs while keeping `.ai/harness/*` and
  `.ai/context/*` as repo-local runtime artifacts.
- Retired `AGENTS.md` and `CLAUDE.md` from the reference-doc asset surface and
  stopped publishing duplicate `docs/reference-configs/` runtime docs in the
  npm package file list.

### Fixed

- Clarified plan-completeness capture wording so release/readiness checks do
  not mistake a Draft scan plan for executable implementation state.
- Made `scripts/check-npm-release.sh` refresh the current handoff before the
  Codex resume packet so the release gate works from a clean checkout without
  ignored runtime handoff files.

### Release Notes

- Prepared the `repo-harness@0.4.3` package line for publish; npm publish,
  registry readback, and GitHub release creation remain explicit release
  actions.

## [0.4.2] - 2026-06-13

### Added

- Added the `repo-harness-prd` command facade, PRD template, and PRD eval
  fixtures for generating upper-layer PRDs under `plans/prds/`.
- Added a subagent return-channel guard to the managed Claude/Codex hook routes
  so delegated runs are nudged back through the parent session instead of
  leaking completion claims through the wrong channel.

### Changed

- Split upper-layer PRDs from Sprint backlogs: PRDs stay in `plans/prds/`,
  Sprint backlogs move to `plans/sprints/*.sprint.md`, and `repo-harness-sprint`
  now supports PRD-to-Sprint planning without re-deciding product intent.
- Isolated generated-project helper implementations under `.ai/harness/scripts/`
  while keeping `scripts/*` as compatibility command wrappers.
- Updated skill eval 24 and added evals for PRD generation and PRD-to-Sprint
  backlog creation so the public command surface covers the new hierarchy.
- Aligned the `repo-harness-prd` command guidance with the installed
  `.ai/harness/scripts/check-task-workflow.sh` runtime path.

### Release Notes

- Prepared the `repo-harness@0.4.2` package line for publish; npm publish,
  registry readback, and GitHub release creation remain explicit release
  actions.

## [0.4.1] - 2026-06-12

### Fixed

- Scoped the CodeGraph route nudge to the real hook stdin `session_id` by
  exporting `HOOK_SESSION_ID` from the shared hook input parser and preferring
  it in `session_state_resolve_key`. CodeGraph one-shot state is now per
  Claude/Codex session instead of being pinned to a stale `.claude/.session-id`
  fallback.
- Prevented stale repo-local hook scripts from racing user-level host adapters:
  generated and migrated repos now prune top-level `.ai/hooks/*.sh` unless
  `.ai/harness/policy.json` explicitly pins `"hook_source": "repo"`.
- Treated a missing `post-tool-observer.sh` on `PostToolUse.always` as a
  soft-missing advisory route with an update hint, instead of hard-failing the
  hook runtime when a copied repo-local hook set is stale.

### Changed

- Kept non-pinned downstream repos on the user-level hook runtime by retaining
  only `.ai/hooks/lib/` helper fallbacks plus a README tombstone; this self-host
  repo can still pin live hook development to `.ai/hooks`.
- Normalized active workflow documentation to `tasks/todos.md` for the deferred
  ledger and topic-scoped `docs/researches/*.md` for durable research reports.
- Added `tasks/.current.md.tmp.*` and `.claude/.plan-state/` to the managed
  runtime ignore block, and gave plain `bun test` the same 60s per-test timeout
  used by the release gate.

### Release Notes

- Prepared the `repo-harness@0.4.1` package line for publish; npm publish,
  registry readback, and GitHub release creation remain explicit release
  actions.

## [0.4.0] - 2026-06-12

### Added

- Added a loop-engine evidence surface: `repo-harness-hook state-snapshot
  --json`, an NL decision-table reference, route NL-vs-TS benchmark fixtures,
  and a cutover gate that keeps TypeScript routing authoritative unless
  measured evidence passes.
- Added `scripts/architecture-queue.sh` plus
  `scripts/check-architecture-sync.sh` for derived architecture request indexes,
  stale-index detection, and strict/advisory finish gates.
- Added contract delegation metadata (`budget`, `permission_scope`, and
  `roles`) to contract templates and generated workflow contracts.
- Added `scripts/contract-run.ts`, a repo-local pilot runner that executes
  explicit worker/verifier child commands and validates the verifier output
  against contract exit criteria.
- Added `scripts/heartbeat-triage.sh` and the `.ai/harness/triage/` surface for
  scheduled workflow, sprint-next, and architecture-request triage.

### Changed

- Productized architecture queue assets into both self-host scripts and
  generated-repo templates, including workflow contract inventory, reference
  docs, migration handling, and scaffold parity tests.
- Updated session-start/current-status projection and task workflow checks to
  account for archived sprint plans, archived notes, contract delegation fields,
  and the completed loop-engine sprint.
- Retired the separate generated workflow compatibility `5.x` line; package,
  skill, and template stamps now share the `repo-harness@0.4.0` release line.
- Added `check:architecture-sync` to the npm scripts and release verification
  surface.

### Removed

- Retired `scripts/architecture-drift.sh` and its helper-template copy in favor
  of `architecture-queue.sh`; migrations remove legacy copies from downstream
  repos.

## [0.3.0] - 2026-06-11

### Added

- Added the sprint program layer: `plans/sprints/`, sprint templates,
  `scripts/sprint-backlog.sh`, the `repo-harness-sprint` command facade, active
  sprint markers, current-status projection, session-start projection, workflow
  validation, and generated-repo parity copies.
- Added `src/cli/hook/prompt-intents.ts`: every prompt-text intent classifier
  now lives in TypeScript with real Unicode semantics, fixing
  locale-dependent Chinese misclassification (UTF-8 continuation bytes
  matching `[[:punct:]]` under `LC_ALL=C` grep, e.g. "实现会在这个 worktree
  里完成。" misread as a done declaration on GNU grep).
- Added an edit-layer plan gate to `pre-edit-guard.sh`: implementation edits
  (paths outside plans/tasks/docs/deploy/harness/markdown surfaces) block
  unless the active plan is Approved/Executing and `docs/spec.md` exists.
  Modes `enforce` (default) | `advice` | `off` via policy
  `.guards.edit_plan_gate` or `REPO_HARNESS_EDIT_PLAN_GATE`.
- Added the `prompt-guard-decide` prompt protocol: the shell hook pipes
  `{"prompt": ...}` on stdin and receives one verdict JSON line (action,
  intent facts, derived strings). Legacy copied hooks that send env facts
  still receive the bare action enum.

### Changed

- Hook runtime resolution is now central-first: user-level adapters dispatch
  into `repo-harness-hook`, central packaged hooks are the default runtime, and
  repo policy can pin self-host development back to the repo copy without
  changing downstream user adapters.
- Prompt-layer plan/spec/contract gates became advisory routing; hard
  enforcement moved to the PreToolUse edit layer where it keys off path +
  plan state instead of natural-language guessing. Done-claim gates keep
  blocking because they verify file-backed completion evidence.
- Merged the PostToolUse always-route observers (`trace-event.sh` +
  `context-pressure-hook.sh`) into one `post-tool-observer.sh`: one dispatch,
  one stdin parse, and one library load per tool call. `.claude/.trace.jsonl`
  is now the single tool-trace record (handoff "Commands Run" reads it
  directly), and context-budget bun probes are sampled every 5th call. The
  route tuple (PostToolUse, always) is unchanged; a workflow-contract
  upgrade entry prunes the retired split hooks from migrated repos.
- Unified `run-hook.sh`'s two Codex stdout-filter branches into one
  parameterized path.

### Removed

- Removed the duplicated shell fallback decision table from
  `prompt-guard.sh` (the 0.2.4 copied-hook fallback). Without a reachable
  TypeScript engine the prompt layer now degrades to a one-shot advisory and
  defers enforcement to the edit layer.
- Removed the orphan `scripts/check-versions.ts` and its test, and the
  hidden `prompt-guard-decision` CLI alias (use `prompt-guard-decide`).
- Retired the `project-initializer` legacy name, `PROJECT_INITIALIZER_*`
  environment fallbacks, and the `repo-harness-skill` compatibility alias;
  installed-copy sync now deletes both retired skill directories.

## [0.2.4] - 2026-06-07

### Added

- Added shell fallback routing for copied prompt hooks when the TypeScript
  decision engine is unavailable, preserving PlanCaptureGate guidance instead
  of failing closed on installed hook copies.
- Added workflow readiness checks for stale handoff/resume plan references and
  action-command skill quality gates.
- Added benchmark quality metrics so release evidence distinguishes
  authoritative non-dry-run skill evals from dry-run smoke output.

### Fixed

- Treated plan/workflow consultation prompts as advisory text instead of
  sending them into `PlanStatusGuard`, so questions that mention `new plan`,
  `方案`, hooks, or workflow routing no longer create plan files or block with
  "No active plan found" unless they explicitly start execution.

### Changed

- Updated the self-host CodeGraph development dependency to `0.9.9` and made
  gbrain readiness probe `doctor --json --fast` before falling back to the full
  doctor command.
- Updated maintainer release docs and README verification guidance to require
  non-dry-run skill eval evidence when claiming skill effectiveness.
- Refreshed the ignored Codex resume packet inside the npm release gate before
  strict workflow validation, so release tests that update handoff runtime state
  cannot leave the gate failing its own stale-resume invariant.

### Removed

- Retired the self-host-only `autoresearch-advisory.sh` hook from `.ai/hooks`,
  the generated hook adapter installer, and hook parity exceptions. Autoresearch
  now stays an explicit agent-run workflow instead of a user-level background
  hook route.

## [0.2.3] - 2026-06-05

### Changed

- Replaced the public `repo-harness init` path with a typed global bootstrap
  that installs the current package as the global CLI, refreshes repo-harness
  skill aliases, installs user-level hook adapters, configures Waza
  `think`/`hunt`/`check`/`health`, persists the brain root, and configures
  CodeGraph MCP without applying repo-local workflow files to the current
  directory.

### Removed

- Removed the Superpowers Claude marketplace installer path entirely from the
  active `repo-harness init` flow and from `scripts/setup-plugins.sh`.

## [0.2.2] - 2026-06-04

### Fixed

- Streamed `repo-harness init` setup output directly to the terminal so the
  first-run `npx -y repo-harness init` path no longer looks hung while
  `setup-plugins.sh` clones skills or runs Claude plugin setup.
- Made the Superpowers Claude marketplace plugin opt-in via
  `repo-harness init --with-superpowers` instead of installing it by default.

## [0.2.1] - 2026-06-02

### Added

- Added `repo-harness init` as a thin npm CLI wrapper around
  `scripts/setup-plugins.sh`, so users can run
  `npx -y repo-harness init` for first-run global Claude plugin and hook-profile
  bootstrap without cloning the source repository.
- Added a prompt-guard CodeGraph self-heal path: before emitting the first
  structural code-navigation hint in a session, a missing `.codegraph` index is
  initialized with the local or PATH-visible CodeGraph binary without running the
  heavier readiness probe.

### Changed

- Moved the existing repo-local harness install/refresh CLI surface to
  `repo-harness update`, keeping `repo-harness init` focused on global runtime
  initialization.
- Updated the English, Chinese, Japanese, French, and Spanish READMEs for the
  `0.2.1` npm release line and the split `init` / `update` lifecycle.

### Fixed

- Kept automatic hook-side CodeGraph initialization non-blocking and cleaned up
  the Cursor rule file if current CodeGraph created it only as a side effect of
  this automatic init.

## [0.2.0] - 2026-06-02

### Added

- Added a read-only config security scan (`repo-harness security scan [--json]`) that checks high-value hook and editor-task config (`~/.claude/settings.json`, `~/.codex/hooks.json`, repo-local `.vscode/tasks.json`, and legacy project-level `.claude`/`.codex` adapters) for suspicious command patterns — remote-shell pipes, base64-decode-to-exec, `osascript`, `launchctl`/`crontab` persistence, netcat, and inline interpreter execution — plus unmanaged hook commands and auto-run `folderOpen` tasks. It reports findings only and never mutates config.
- Added a low-frequency `SessionStart` sentinel (`.ai/hooks/security-sentinel.sh`, wired into the `SessionStart.default` route) that fingerprints the config set and re-scans only when a fingerprint changes, surfacing a one-line `[SecurityConfig]` reminder when findings appear.
- Added a `security-config` check to `repo-harness doctor` backed by the same read-only scan.

### Changed

- Bumped the npm package release line from `0.1.5` to `0.2.0`; generated workflow compatibility stays on the `5.2.3` model line, and `repo-harness --version` / `repo-harness status` now report `0.2.0`.
- Added `Why repo-harness` and `What's New in 0.2.0` sections to the English, Chinese, Japanese, French, and Spanish READMEs, promoting file-backed cross-session coordination, CodeGraph-plus-progressive-context token savings, the `scripts/setup-plugins.sh` installer, the config security sentinel, and the Claude/Codex draft-plan lifecycle.
- Added the README hero image to the npm package allowlist so package consumers get the same visual surface as the source checkout.
- Fixed the Chinese README, which still referenced `0.1.4`, to track the current release version.

## [0.1.5] - 2026-06-01

### Changed

- Added `REPO_HARNESS_*` environment variable aliases for scaffold, migration, context-block selection, external-tooling checks, and contract-worktree controls while preserving `PROJECT_INITIALIZER_*` as legacy fallbacks.
- Switched new runtime `.gitignore` and Codex resume generated markers to `repo-harness` while keeping dual-read compatibility for legacy `project-initializer` markers.
- Added a dirty merged linked-worktree closeout guard to `ship-worktrees.sh --cleanup-merged`, requiring useful deltas to be committed, picked, or applied before cleanup and allowing only explicit scaffold-only discard.
- Made `prepare-codex-handoff.sh` prefer Node for global handoff file updates, with Python retained as a fallback, so release verification does not depend on the local `python3 -` execution path.

## [0.1.4] - 2026-05-31

### Changed

- Switched generated plan task artifacts from slug-only names to the active plan stem (`YYYYMMDD-HHMM-<slug>`) for `tasks/contracts/`, `tasks/reviews/`, and `tasks/notes/`.

### Fixed

- Kept workflow-state, handoff, archive, and contract-worktree helpers compatible with existing slug-only task artifacts while preferring the new plan-stem paths.

## [0.1.3] - 2026-05-31

### Added

- Added AI-native scaffold profiles as overlays on the existing A-K plan catalog, including runtime-console, product-copilot, and sidecar-kernel project structures without introducing new public plan codes.
- Added AI-native template variables so selected profiles can project focused project structures, runtime-console defaults, and tech-stack guidance while ordinary A-K scaffolds stay unchanged.
- Added a typed prompt-guard decision engine behind `repo-harness-hook prompt-guard-decide`, keeping host adapters stable while making `intent x plan state` routing table-driven and testable.
- Added CLI and route-level regression coverage for the internal prompt-guard decision command, the lightweight hook entrypoint, and the public `UserPromptSubmit --route default` path through real hook assets.
- Added an optional deploy SQL invariant coverage check: when `tests/sql/control_plane_invariants.sql` exists, `check-deploy-sql-order.sh` now verifies every `deploy/sql/*.sql` migration is referenced by full path or basename.
- Added a dated release filing under `deploy/release-checklists/260531-repo-harness-0.1.3.md` and documented the `YYMMDD-<package>-<version>.md` filing rule.

### Changed

- Split prompt-guard responsibilities so shell continues to parse hook JSON, read workflow files, perform capture side effects, and render host-safe output while TypeScript owns the explicit decision table.
- Documented the 0.1.x release surface as `repo-harness@0.1.3`, still separate from the generated workflow compatibility line (`5.2.3`).
- Expanded the English and Chinese README plus the hook operations reference to show the current host adapter -> CLI route registry -> shell hook -> TypeScript decision table architecture.

### Fixed

- Routed active Draft plan prompts such as `implement this plan` and `执行这个方案` to the non-blocking PlanCaptureGate instead of hard-blocking under PlanStatusGuard.
- Routed no-active-plan and Approved-plan execution projection prompts through the appropriate capture/projection advice instead of collapsing them into generic PlanStatusGuard or ContractGuard failures.
- Treated copied worktree status, retrospective completion reports, and next-slice planning summaries as passive context so they do not start implementation gates merely because they quote implementation vocabulary.
- Ensured linked contract worktrees include `.ai/harness/planning/` before pending orchestration cleanup, preserving strict workflow verification in generated worktrees.
- Filtered `tasks/.current.md.tmp.*` refresh scratch files out of generated `tasks/current.md` snapshots, including generated repo helper parity.
- Aligned `repo-harness --version` and `repo-harness status` with the `package.json` release version for `0.1.3`.

## [0.1.2] - 2026-05-30

### Added

- Added `repo-harness init` as a one-shot existing-repo bootstrap that defaults `--repo` to the current working directory, refreshes host adapters, applies the harness, installs Waza runtime skills, syncs `diagram-design`, and verifies the repo-local workflow.
- Added `repo-harness init --no-codegraph` and `--configure-codegraph` so existing-repo bootstrap can either skip CodeGraph readiness or explicitly register CodeGraph MCP after building the index.
- Added `check:release` / `prepublishOnly` npm release gates that check the official npm registry and reject already-published package versions before running tests, workflow checks, migration dry-run, and pack dry-run.
- Added a GitHub-facing bilingual README path with `README.zh-CN.md` and a Mermaid task workflow from plan to contract worktree checkout, guarded implementation, verification, review, external acceptance, finish, merge, and cleanup.

### Changed

- Retired `project-initializer` as a Codex/Claude installed skill path and upstream resolver fallback; installed-copy sync now removes those directories instead of maintaining them.
- Switched generated footer stamps to `repo-harness@...` while keeping `.claude/.skill-version` semantic version fields stable.
- Prepared npm publishing under the unscoped `repo-harness` package name, made `repo-harness` the primary installed command, and kept `repo-harness-skill` as a compatibility alias.
- Split the npm/CLI package release line (`0.1.x`) from the generated workflow compatibility line (`5.2.3`).
- Updated GitHub repository metadata and source checkout docs for the `Ancienttwo/repo-harness` rename.
- Forced copy-based installed-skill sync when `repo-harness init` runs from an npm `_npx` cache source, avoiding symlinks to temporary npx cache directories.
- Clarified the product boundary, three-layer operating model, and task lifecycle on the README landing page.

### Fixed

- Rebuilt Claude skill aliases during installed-copy sync so `~/.claude/skills/project-initializer` cannot remain on a stale legacy repo while Codex runtime aliases are current.
- Reduced full-suite release flakiness by giving `doctor` environment-probe tests a wider timeout budget.

## [5.2.3] - 2026-05-27

### Fixed

- Expanded anchored approval intent variants such as `go ahead with it`, `please proceed`, and `可以干了` so post-plan approvals reach `PlanCaptureGate` / `PlanExecutionGate` without treating broad bug-fix wording as approval capture.

## [5.2.2] - 2026-05-27

### Fixed

- Started a Draft `plans/` artifact as soon as explicit Codex Plan mode or Waza `/think` planning begins, so plan lifecycle state exists before approval and execution gates run.
- Let terse approval prompts such as `GO` and `可以干` reach the approved-plan capture/projection path instead of being blocked before the agent can run `capture-plan.sh` or `plan-to-todo.sh`.

## [5.2.1] - 2026-05-27

### Fixed

- Fixed terse `GO` approval prompts after Codex Plan mode or Waza `/think` so they trigger `PlanStatusGuard` and route execution through captured `plans/` artifacts instead of bypassing the workflow gate.

## [5.2.0] - 2026-05-27

### Changed

- Added passive plan capture so Codex Plan mode, Waza `/think`, and `repo-harness-plan` outputs can become file-backed `plans/plan-*.md` artifacts through `scripts/capture-plan.sh`, with approved captures able to project directly through `plan-to-todo.sh`.
- Added opt-in default-brain document mirroring through `scripts/sync-brain-docs.sh`, manifest `sync.direction=repo-to-brain` entries, and PostEdit hook integration for registered valuable docs.
- Promoted CodeGraph from advisory setup guidance to required Codex agent readiness for code navigation, with read-only detector support, strict readiness checks, generated repo `.codegraph/` ignores, and non-vendored host install guidance.

## [5.1.2] - 2026-05-27

### Added

- Added generated Codex hook adapter support through `.codex/hooks.json` while keeping `.ai/hooks/` as the shared hook implementation layer.
- Updated init, scaffold, migration, workflow contract, docs, and tests so generated repos install both Claude and Codex hook adapters.

## [5.1.1] - 2026-05-26

### Fixed

- Refreshed stale `references/` docs for the current `repo-harness` hook, migration, eval, plugin, and minimal-documentation contracts.
- Updated public-surface spec and architecture docs to reflect the full 13-command `agentic-dev-*` facade inventory.
- Removed empty optional doc placeholders so generated/self-hosted docs match the `minimal-agentic` profile.

## [5.1.0] - 2026-05-26

### Added

- Added filesystem-owned Evidence Contract fields and guards so approved plan execution must name state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before implementation or completion.

### Changed

- Made broad research delegation a main-agent spawn decision based on context impact and callable runners, with bounded main-thread fallback when spawning is not useful or available.
- Hardened Waza external-tooling checks to compare whole skill directories and shared `rules/` files instead of only `SKILL.md`, catching broken `references/`, `scripts/`, `agents/`, and cross-skill rule links.

## [5.0.2] - 2026-05-25

### Fixed

- Excluded ignored repo-local runtime state from Codex installed-copy sync outputs.

## [5.0.1] - 2026-05-25

### Added

- Added the repo-harness plugin architecture map, domain/module docs, and capability-indexed local context contracts for Claude and Codex.

### Fixed

- Fixed Codex installed-copy sync for symlinked legacy `project-initializer` fallback paths.
- Removed tracked Claude trace state from the release surface and ignored repo-local Codex/runtime logs.

## [5.0.0] - 2026-05-25

### Fixed

- Made repeated `migrate-project-template.sh --apply` idempotent after a clean migration commit by normalizing first-write JSON output and preserving unchanged version stamps.
- Removed stale `3.1 guidance` wording from migration dry-run output.

### Changed

- Added `deploy/sql/` as the tracked deployment SQL surface and wired a filename-order check for `0001_name.sql` style files.
- Split deployable operations assets into tracked `deploy/` while keeping `_ops/` fully ignored for local private operations state and secrets.
- Externalized long-form optional reference configs into the default brain file vault while keeping repo-local runtime contracts, hooks, scripts, and required minimal docs authoritative.
- Added a repo-local brain manifest and workflow check for default brain pointers without making hooks depend on gbrain or iCloud.
- Renamed the skill/package/repo display surface to `repo-harness` while keeping `repo-harness-skill` and `project-initializer` as legacy aliases, install paths, and generated stamp compatibility surfaces.
- Added action-style `agentic-dev-*` command skill facades for plan, review, autoplan, init, scaffold, migrate, upgrade, repair, and check while keeping hooks/docs initialization internal.
- Added advisory prompt-hook route hints for reusable-workflow packaging, with `repo-harness-autoplan` handling evidence-first plans only after user authorization.
- Added a Codex installed-copy sync helper that keeps command facades only in the canonical `repo-harness` copy while legacy directories remain runtime fallback bundles.

## [4.0.2] - 2026-05-20

### Fixed

- Installed `inspect-project-state.ts`, `migrate-workflow-docs.ts`, `workflow-contract.ts`, `check-skill-version.ts`, and a delegating `migrate-project-template.sh` wrapper into generated repos so the router verification path is not left stale.
- Made generated capability discovery ignore `.worktrees/` and `_ref/` caches, preventing local worktree contracts from polluting `.ai/context/capabilities.json`.

## [4.0.1] - 2026-05-20

### Added

- Added a versioned upgrade strategy to the workflow contract, inspector output, harness policy, and migration cleanup path so legacy reconfiguration, archives, preserves, and removals are auditable.
- Added `docs/reference-configs/global-working-rules.md` as the user-level Claude/Codex rule template with enforceable P1/P2/P3 due diligence.

## [4.0.0] - 2026-05-20

### Changed

- Removed `docs/PROGRESS.md` from default generated and required workflow surfaces; legacy progress files are now archived during migration instead of normalized in place.
- Replaced default root `specs/` scaffolding with `docs/spec.md`, `interfaces/`, and tests as the stable product/runtime truth surfaces.
- Promoted `_ops/` as the trackable operations workspace for runbooks, submission materials, release checklists, and helper scripts, while keeping `_ops/secrets/` and `_ops/env/.env*` ignored.
- Made `_ref/` an ignored external comparison cache and added hook guards that block product edits under `_ref/` and sensitive `_ops` env/secret paths.
- Updated workflow contracts, generated templates, reference docs, architecture index, and tests to use `tasks/workstreams/` for durable progress and `docs/CHANGELOG.md` for release history.

## [3.6.0] - 2026-05-19

### Added

- Added `minimal-agentic` documentation generation so default scaffolds keep only required docs plus a small reference-config set, with `PROJECT_INITIALIZER_DOCUMENTATION_PROFILE=full` preserving the previous full docs surface.
- Added `docs/reference-configs/document-generation.md` to document required docs, on-demand docs, and the Agent-owned decision boundary.
- Added `lsp_profiles` metadata to policy and context maps so selected functional blocks can carry lightweight tooling hints without expanding root prompt context.
- Added `worktree_strategy` policy for conflict-triggered `codex/<task-slug>` worktrees, Waza `/check`-style validation, and merge-back to `main` without absorbing unrelated dirty changes.
- Added implementation notes as a task-local workflow artifact under `tasks/notes/`, with plan, contract, review, handoff, and archive integration.
- Added raw verification run snapshots under `.ai/harness/runs/` so `checks/latest.json` remains a pointer while durable evidence stays inspectable.

### Changed

- Updated scaffold, migration, init, ensure, workflow contract, and tests to install reference configs through the documentation profile instead of copying every reference doc by default.
- Changed init/migration external-tooling reports to skip update checks by default; set `PROJECT_INITIALIZER_CHECK_TOOLING_UPDATES=1` when an advisory run should also check upstream versions.
- Updated harness policy and reference docs to distinguish notes, evidence, promoted assets, and advisory memory instead of collapsing task-local decisions into long-term memory.

## [3.5.0] - 2026-05-11

### Added

- Added machine-readable `agentic_development` routing so product discovery uses gstack `office-hours`, complex engineering plans use gstack `plan-eng-review`, design plans use gstack `plan-design-review`, and daily small/medium work uses Waza `/think`, `/hunt`, and `/check`.
- Added `docs/reference-configs/agentic-development-flow.md` to keep detailed gstack/Waza routing and P1/P2/P3 due-diligence triggers out of root prompts.
- Added plan and review template sections for selected route, routing reason, and P1/P2/P3 evidence.
- Added `scripts/select-agent-context-blocks.sh` as the functional-block selector hook for paired `CLAUDE.md` and `AGENTS.md` generation, so Claude Code and Codex receive the same local module contract without inferring boundaries from broad layout globs.

### Changed

- Stopped generating repo-local `.claude/hooks/` shim scripts by default; `.ai/hooks/` is now the shared hook implementation layer and `.claude/settings.json` is the Claude adapter.
- Updated scaffold, migration, workflow contract, policy defaults, reference configs, and tests to keep self-host and generated repos aligned.
- Hardened workflow verification and legacy task migration around runtime contract parsing and partially migrated `tasks/todo.md` files.

## [3.4.0] - 2026-05-06

### Added

- Added Codex-first Waza policy metadata to the harness contract and generated repo policy defaults.
- Added host-aware Waza detection for real Claude/Codex skill paths, per-skill versions, symlink targets, staging drift, and upstream stale status.
- Added tests covering Claude staging symlinks, Codex independent runtime copies, read-only update checks, and Codex stale drift reporting.

### Changed

- Changed Waza `--check-updates` handling to compare upstream `tw93/Waza` raw `SKILL.md` hashes without running mutating `npx skills check`.
- Documented the Waza stage -> copy into Codex -> `cmp` verification workflow for generated and self-hosted harnesses.

## [3.3.0] - 2026-04-19

### Changed

- Removed repo-local Skill Factory and Claude auto-memory surfaces from the shared harness, migration path, and self-hosted repo.
- Added `scripts/check-agent-tooling.sh` plus generated `docs/reference-configs/external-tooling.md` so init and migrate flows can report gstack, Waza, and gbrain advisory status safely.
- Merged guidance-only `external_tooling` defaults into `.ai/harness/policy.json` during scaffold and migration without overwriting explicit repo overrides.

## [3.2.1] - 2026-04-19

### Fixed

- Added progressive context and harness policy surfaces alongside the workflow contract manifest so generated repos keep root context stable while exposing deeper context on demand.
- Wrote directory-level `AGENTS.md` files to discoverable module paths like `apps/*/AGENTS.md` instead of the container roots.
- Stopped custom plan `K` from creating `apps/`, `packages/`, and `services/` unless the target repo already has real module directories there.
- Corrected `scripts/inspect-project-state.ts` routing so initialized repos with bundled Skill Factory assets still classify as `audit` instead of collapsing to `skill-factory`.
- Tightened `scripts/check-task-workflow.sh` so strict workflow verification now fails explicitly when no `node`, `bun`, or `python3` runtime is available to read the workflow contract.
- Extended `scripts/migrate-workflow-docs.ts` to normalize legacy `tasks/todo.md` content in partially migrated repos and preserve the prior checklist in `tasks/archive/legacy-tasks-todo.md`.

## [3.2.0] - 2026-04-08

### Changed

- Added `assets/workflow-contract.v1.json` as the single machine-readable workflow contract and installed `.ai/harness/workflow-contract.json` in generated and self-hosted repos.
- Introduced `scripts/inspect-project-state.ts` so routing starts from structured repo inspection instead of prompt-only branching.
- Added `scripts/migrate-workflow-docs.ts` to preserve and migrate legacy `docs/plan.md`, `docs/TODO.md`, and execution-log style `docs/PROGRESS.md`.
- Updated migration, scaffold, and workflow verification paths to consume the shared contract manifest and verify it after migration.

## [3.1.0] - 2026-03-29

### Changed

- Added `run_id` to trace events, verification reports, and task-state snapshots for tighter report correlation.
- Expanded harness defaults to five dimensions by adding recovery and state profiles to the initializer question pack and plan map.
- Added structured `failure_class` logging plus `scripts/summarize-failures.sh` for guard failure aggregation.

## [3.0.0] - 2026-03-25

### Changed

- Upgraded generated repositories from a tasks-first scaffold to a shared long-running harness model.
- Added `docs/spec.md`, `tasks/reviews/`, and `.ai/harness/{checks,handoff}` as first-class generated artifacts.
- Reworked hook behavior around artifact-aware execution gates, contract scope enforcement, structured checks, and mandatory handoff generation.
- Upgraded the initializer question pack to `v2` and added stack-aware orchestration, evaluation, and handoff defaults.
- Updated helper scripts, templates, CLAUDE/AGENTS routing output, and tests to the shared harness model.

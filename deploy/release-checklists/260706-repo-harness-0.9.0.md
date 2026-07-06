# repo-harness 0.9.0 Release Filing

- Date: 2026-07-06
- Package: `repo-harness@0.9.0`
- Base release: `v0.8.5`
- Release scope: minor release bundling nine work-package plans landed since
  `v0.8.5` — bugfix task profile with root-cause evidence gating, file-coupled
  delegation policy, contract-brief prompt/template distillation, geju and
  agent-fleet first-class dependencies, this repo's own Claude/Codex agent
  fleet, a frontend task profile, an archcontext boundary bridge, the
  EXECUTION_BOUNDARY anti-extras clause, and a review rubric v2 bump.
- Publish status: source pushed (`main` = `30c59a6` on origin), annotated tag
  `v0.9.0` pushed, GitHub release
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.9.0` created and
  read back (2026-07-06); **npm publish still pending**.
- Hold reason (npm): publish gated on the queued cross-vendor Codex
  re-acceptance (`tasks/todos.md`) and the pre-publish battery items below.

## Scope

- Added a `bugfix` task profile with a first-class Root Cause Evidence gate
  evaluated symmetrically by `contract-run.ts` and `verify-contract.sh`
  against shared fixtures, plus the bugfix golden example
  `docs/reference-configs/contract-brief-example-bugfix.md`.
- Declared file-coupled delegation policy (`preferred_runners` /
  `fallback_runner` / `runner_rule`) making the task contract the
  authoritative execution brief; slimmed `codex-delegation-advisor`
  accordingly and wired a non-blocking `[BriefPreflight]` advisory into
  `plan-to-todo` projection.
- Added the optional contract template `## Falsifier` section, aligned all
  five template/helper-mirror copies, and distilled the contract-run
  worker/verifier prompts (self-verify/notes/stop/Intent, required `## Why`,
  golden example + guard test, `verify-sprint` finish advisories, `--runner`
  option with manifest `runner_usage` recording, SKILL.md teaching).
- Added geju (`hylarucoder/hai-stack`) as an `external_tooling` dependency
  with a post-projection `[Geju]` artifact-freeze advisory.
- Made the agent fleet a first-class dependency: `fable_agents` policy entry,
  `install-agent-fleet` helper, `check-agent-tooling` `detectAgentFleet()`
  with strict-readiness, and tiered init/migrate assembly (dry-run never
  writes to `$HOME`).
- Added the `codex-subagent` runner label and committed this repo's own
  `.claude/agents/` + `.codex/agents/*.toml` fleet (`deep-reasoner`,
  `fast-worker`, `gatekeeper`).
- Added a `frontend` task profile with a design-brief gate, intake trigger
  rules with recorded acceptance evidence, and a capability/archcontext
  boundary bridge with a read-only `archcontext-boundaries-v1` export.
- Mechanically landed the `EXECUTION_BOUNDARY` anti-extras clause across all
  delegated runner surfaces with a canonical-sentence parity test; contracts
  now project plan Non-scope and gain an independent In/Out-of-scope
  preflight.
- Renamed the exit-criteria `bun run typecheck` command to `bun run
  check:type` across all template/helper-mirror surfaces, explicitly revised
  `sprint-contracts.md`'s exit-criteria-only promise for the `bugfix` branch,
  and bumped the review rubric from v1 to v2 (fingerprint-bound external
  acceptance, plus a bounded P1-escalation Scope Fidelity dimension).
- Fixed a bash 3.2 heredoc quote-parity trap in `scripts/lib/project-init-lib.sh`
  by switching to `mktemp` file indirection.

## Preflight Evidence

- `git tag -l` shows `v0.8.5` exists locally, pointing at `a8f8663`
  (`chore(release): prepare repo-harness 0.8.5`).
- `git log v0.8.5..HEAD --oneline` returns 80 commits spanning the plans
  listed above (`dev-loop-distillation`, `file-coupled-delegation-phase2`,
  `contract-intent-boundary`, `authority-closure`, `agent-fleet-dependency`,
  `review-scope-fidelity`, `intake-trigger-rules`, `frontend-task-profile`,
  `archcontext-boundary-bridge`), confirmed against each plan's archived
  `## Task Breakdown` track IDs in `plans/archive/`.
- npm registry dist-tag/unpublished-version preflight was **not** queried in
  this prep slice (out of this slice's verification boundary); run it before
  publish.

## Verification

- Passed: `bun -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))'`
  and the same check against `assets/skill-version.json` — both parse clean.
- Passed: `rg -n "0\.8\.5" package.json README*.md .claude/.skill-version
  assets/skill-version.json` — zero hits outside `assets/skill-version.json`'s
  historical `versionHistory` entry for the prior `0.8.5` release (left
  intentionally; the new `0.9.0` entry was appended, not substituted).
- Passed: `rg -rn "skill-version" scripts/ src/ tests/ --glob '!node_modules'`
  to enumerate consumers, then `bun test tests/skill-version.test.ts
  tests/migration-script.test.ts tests/installed-copy-sync.test.ts
  tests/workflow-contract.test.ts` — 60 pass / 0 fail / 993 expect() calls
  across 4 files.
- Passed (after remediation): `bash scripts/check-task-workflow.sh --strict`.
  First run failed on a stale `.ai/harness/handoff/resume.md` (older than
  `tasks/current.md`, left over from the prior `agent-fleet-dependency`
  contract closeout, unrelated to this slice's edits); remediated with
  `bash scripts/prepare-handoff.sh --reason "0.9.0 release prep version
  bump"` (writes only the gitignored `.ai/harness/handoff/` packet), then
  re-ran clean.
- Passed (after this filing + the release-prep notes were added):
  `bash scripts/check-task-sync.sh`.
- Passed: `git status --short --branch -uall` shows only the version-surface
  files, this checklist, and the release-prep notes file.
- Not run in this prep slice: the full `bun run check:release` battery,
  `npm pack`/tarball install smoke, and npm registry preflight. Run those
  before publish.

## Publish Checklist

- [x] Push `main` to origin (`30c59a6`, verified via `git ls-remote`).
- [x] Push annotated tag `v0.9.0` (2026-07-06; tagged at `30c59a6`, one
  docs-only commit after the prepare commit `5e82e1e`).
- [x] Create GitHub release `repo-harness 0.9.0` — created from CHANGELOG
  body + Verification section, read back via `gh release view v0.9.0`
  (non-draft, non-prerelease); the release notes explicitly state npm 0.9.0
  is not yet published.
- [ ] Cross-vendor Codex re-acceptance of the merged diffs (queued in
  `tasks/todos.md`; supersedes both manual overrides).
- [ ] Run the full `bun run check:release` battery (full `bun test`, type
  check, deploy/architecture/task-sync/task-workflow gates, package dry-run,
  tarball smoke).
- [ ] Publish `repo-harness@0.9.0` to npm with the `latest` dist-tag.
- [ ] Read back npm registry metadata, dist tag, tarball shasum/integrity, and
  `gitHead`.
- [ ] Run `bash scripts/check-release-published.sh 0.9.0` (2026-07-06 partial
  run confirms npm currently 404s for 0.9.0, as expected pre-publish).

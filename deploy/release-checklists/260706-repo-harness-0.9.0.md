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
- Publish status: **fully published 2026-07-06** — `repo-harness@0.9.0` on npm
  with `latest` dist-tag (shasum `420e0c00e344a159ec4eb52b78ac13df87dae612`,
  `gitHead=c70fa29`), annotated tag `v0.9.0` at `c70fa29`, GitHub release
  live and non-draft at
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.9.0`.
- Retag note: the tag was first cut at `30c59a6`, then deliberately moved to
  `c70fa29` after the install-bootstrap changes (interactive optional-dep
  prompts, bunx skills, codegraph@latest) were folded into 0.9.0 by user
  decision; the GitHub release was re-published against the new tag (tag
  deletion had reverted it to draft). npm was published only after the move,
  so registry `gitHead`, tag, and the fingerprint-bound acceptance all agree
  on `c70fa29`.

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
- [x] Cross-vendor Codex re-acceptance of the merged diffs — **pass**,
  fingerprint-bound. Reviewed scope `v0.8.5..c70fa29`; fingerprint command
  `git diff v0.8.5..HEAD | shasum -a 256` =
  `fd27185b205a4ef8efb21b8d43fc0ede8f2b60144c3dba5a86b1a17c1bd60e12`
  (independently computed by Codex and by the orchestrator, byte-identical).
  Round 1 (full review, ~310k tokens) found zero P1/P2 across the dual-parser
  root-cause gate, EXECUTION_BOUNDARY propagation, template parity, policy
  seeds, installer never-clobber/TOML-generation, strict readiness, dry-run
  guard, and the install-bootstrap TTY delta, but failed closed on a
  fingerprint pairing error in the dispatch (hook working-tree fingerprint
  paired with release-diff scope). Round 2 re-bound the canonical command and
  returned: External Acceptance pass; authority-closure pass;
  agent-fleet-dependency pass; install-bootstrap delta pass; P1 blockers
  none. This supersedes both interim manual overrides.
- [x] Full `bun run check:release` battery green at `c70fa29` (full
  `bun test` 1075 pass / 1 skip / 0 fail, type check, all gates, package
  dry-run, tarball smoke `[release] OK`).
- [x] Published `repo-harness@0.9.0` to npm with the `latest` dist-tag
  (`prepublishOnly` re-ran the battery at publish time).
- [x] Registry read-back agrees: version `0.9.0`, `dist-tags.latest=0.9.0`,
  shasum `420e0c00e344a159ec4eb52b78ac13df87dae612`, integrity
  `sha512-1bwtbn8D4SNVb[...]`, `gitHead=c70fa295488680bdcf51a264ea1321cc933ac69e`.
- [x] `bash scripts/check-release-published.sh 0.9.0` → OK: registry,
  dist-tag, tarball, tag, and local version files agree.

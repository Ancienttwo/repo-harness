# Release Filing: repo-harness 0.4.2

Date: 2026-06-13
Status: Published; registry readback, Git tag, and GitHub release verified

## Scope

- Package target: `repo-harness@0.4.2`
- Current npm latest at preflight: `repo-harness@0.4.1`
- Base npm tag: `v0.4.1`
- Target branch: `main`
- Source commit: `087c7be3e1febd50db0847cffe91286f888285df`
- Release tag: `v0.4.2`
- Version surfaces bumped before publish:
  - `package.json`
  - `assets/skill-version.json`
  - `src/cli/commands/status.ts`
  - README version/stamp references
  - version expectation tests

## Version Decision

Use `0.4.2` as a patch release on top of the published `0.4.1` line. The diff
since `v0.4.1` adds a public command facade and planning hierarchy, but it does
not break the `repo-harness init` / `repo-harness update` lifecycle or the
`0.4.x` unified package/template version line.

This release prepares the PRD-to-Sprint planning split, generated-project helper
runtime isolation, managed subagent return-channel guard, and PRD workflow check
runtime path alignment for publish.

## Release Notes

- Added `repo-harness-prd` as the upper-layer PRD command facade. PRDs live
  under `docs/prds/`, while Sprint backlogs live under
  `plans/sprints/*.sprint.md`.
- Updated `repo-harness-sprint` to derive ordered execution backlogs from PRDs
  or user-provided slices without re-deciding product intent.
- Isolated generated-project helper implementations under
  `.ai/harness/scripts/` while preserving root `scripts/*` as compatibility
  wrappers.
- Added PRD and PRD-to-Sprint eval fixtures so command routing and generated
  planning artifacts are covered by the release gate.
- Added a managed subagent return-channel hook route for Claude and Codex host
  adapters.
- Aligned `repo-harness-prd` guidance with the installed
  `.ai/harness/scripts/check-task-workflow.sh` verification path.

## Verification So Far

- Registry preflight:
  - `npm view repo-harness@0.4.2 version --json --registry
    https://registry.npmjs.org/`
  - Result: `E404`, proving `0.4.2` is not published yet.
  - `npm view repo-harness version dist-tags.latest --json --registry
    https://registry.npmjs.org/`
  - Result: `version=0.4.1`, `latest=0.4.1`.
- Version consistency:
  - `bun scripts/check-skill-version.ts --project .`
  - Result: passed; self-host repo is up to date at `0.4.2`.
- Local CLI smoke:
  - `bun src/cli/index.ts --version`
  - Result: `0.4.2`.
- Focused release metadata tests:
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts
    tests/skill-version.test.ts`
  - Result: `32 pass, 0 fail, 484 expect() calls`.
- Full release gate:
  - `bash scripts/check-npm-release.sh`
  - Result: pass.
  - Latest rerun summary: `689 pass, 0 fail, 6828 expect() calls across 66
    files`.
  - Deploy SQL order, architecture sync, task sync, brain manifest, brain sync,
    strict workflow, inspect, migration dry-run, and package dry-run all
    completed.
- Package dry run:
  - `npm pack --dry-run --json`
  - filename: `repo-harness-0.4.2.tgz`
  - entries: `291`
  - shasum: `16f1bc7cb9239fc35188de7f086a0937846b5be5`
- npm publish:
  - `npm publish --access public --registry https://registry.npmjs.org/`
  - Result: published `repo-harness@0.4.2` with `latest` dist-tag after the
    `prepublishOnly` release gate passed.
- Registry readback after publish:
  - `npm view repo-harness@0.4.2 version dist-tags dist.tarball gitHead
    dist.shasum --json --registry https://registry.npmjs.org/`
  - Returned `version=0.4.2`, `latest=0.4.2`,
    `gitHead=087c7be3e1febd50db0847cffe91286f888285df`, and
    `dist.shasum=16f1bc7cb9239fc35188de7f086a0937846b5be5`.
- Clean-room npm smoke:
  - `npx --yes --registry https://registry.npmjs.org/ repo-harness@0.4.2
    --version`
  - Result: `0.4.2`.
- GitHub release:
  - `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.4.2`

## Publish Artifacts

- npm package: `repo-harness@0.4.2`
- npm tarball: `https://registry.npmjs.org/repo-harness/-/repo-harness-0.4.2.tgz`
- npm shasum: `16f1bc7cb9239fc35188de7f086a0937846b5be5`
- Git tag: `v0.4.2`
- GitHub release:
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.4.2`

## Publish Status

- npm: published and read back as latest.
- GitHub release: published, non-draft, non-prerelease.
- Hold reason: none.

# repo-harness 0.10.0 Release Filing

- Date: 2026-07-14
- Package: `repo-harness@0.10.0`
- Base release: `v0.9.2`
- Release scope: minor release for the risk-aware harness kernel
  (lite/standard/strict profiles plus the effective-state resolver), the
  verification/evidence decoupling of contract gates, the npm-packaged agent
  fleet authority, and gstack removal.
- Publish status: **prepared, not published**. Version surfaces, changelog,
  and this filing are bumped on `main`; npm publish, the `v0.10.0` tag, and
  the GitHub release have not been executed.

## Scope

- Computes deterministic `lite`/`standard`/`strict` workflow profiles from a
  single risk floor with explicit-first prompt routing, a global SessionStart
  context budget, circuit breakers, and transactional host install profiles;
  `repo-harness state resolve --json` is the one effective-state resolver.
- Decouples benchmark evidence production from contract verification: verify
  gates consume tracked report bytes plus provenance instead of live-running
  the authoritative matrix; review fingerprints bind acceptance to
  implementation content (`base_ref`/`base_rev` demoted to metadata); the
  Human Review Card external-acceptance fallback is removed; benchmark arms
  delete their disposable host roots after result extraction.
- Replaces the remote `Fable-agents` fleet dependency with the npm-packaged
  `agents/fleet/*.md` authority and removes gstack from planning routes,
  policy, and install/update guidance.

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry
  https://registry.npmjs.org/` returned `version: 0.9.2` and
  `dist-tags.latest: 0.9.2` at prepare time.
- `npm pack --dry-run --json --ignore-scripts` reported
  `repo-harness-0.10.0.tgz` with 382 files.
- Version parity: `package.json`, `assets/skill-version.json`
  (version + templateVersion + 0.10.0 ledger entry), `.claude/.skill-version`
  stamp, and the five README variants all read `0.10.0`.

## Verification

- Source verification for the release line completed on merge of the
  verification-evidence-decoupling work-package (main `3df8738b`): full
  `bun test` 1392 pass / 1 pre-existing skip / 0 fail, typecheck, strict
  workflow checks, architecture/task sync, project inspection, adoption
  dry-run, and dual-gate acceptance (Claude gatekeeper PASS + Codex
  external acceptance ACCEPT with fingerprint binding).
- At prepare time: `bun scripts/check-skill-version.ts --project .` and
  `repo-harness run check-task-workflow --strict` pass on the bumped tree
  (recorded below after global refresh).
- Deferred to publish time: `bun run check:release` (full release gate
  including package dry-run and tarball install smoke on the release commit),
  CI green on the pushed commit.

## Publish Checklist

- [ ] Push the release-prep commit to `origin/main`.
- [ ] Confirm CI for the pushed commit is green.
- [ ] Run `bun run check:release` on the release commit.
- [ ] Publish `repo-harness@0.10.0` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.10.0` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.10.0`.
- [ ] Run `bash scripts/check-release-published.sh 0.10.0`.

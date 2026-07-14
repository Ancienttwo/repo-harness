# repo-harness 0.10.0 Release Filing

- Date: 2026-07-14
- Package: `repo-harness@0.10.0`
- Base release: `v0.9.2`
- Release scope: minor release for the risk-aware harness kernel
  (lite/standard/strict profiles plus the effective-state resolver), the
  verification/evidence decoupling of contract gates, the npm-packaged agent
  fleet authority, gstack removal, and the release-blocker hardening below.
- Publish status: **published 2026-07-15**. PR #77 merged at
  `9d4448494d919858de34f0a2169b5b029bd429f2`; npm `latest`, annotated tag
  `v0.10.0`, and the GitHub release all point to the released `0.10.0` source.

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
- Preserves the installed profile through update, rejects non-canonical
  install ownership paths, resolves root-Skill guidance through packaged docs,
  commits coding grants only after validation/config write, bounds OAuth
  request/client state, and removes the unreachable Bun PTY contract and
  dependency.

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry
  https://registry.npmjs.org/` returned `version: 0.9.2` and
  `dist-tags.latest: 0.9.2` at prepare time.
- `npm pack --dry-run --json --ignore-scripts` reported
  `repo-harness-0.10.0.tgz` with 393 files on the frozen source candidate.
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
- Candidate freeze: `bun run check:release` passed, including the complete CI
  gate, package dry-run, and tarball install smoke. All eight GitHub checks on
  PR #77 passed before merge.

## Release-blocker Candidate Evidence

- Pre-fix regressions are recorded in
  `.ai/harness/runs/20260714-0.10.0-release-blockers-pre-fix.log`: the prior
  source deletes a crafted external ownership path, loses `strict` on update,
  leaks `read_write` after invalid endpoint validation, exposes PTY fields,
  and lacks the bounded HTTP/OAuth seams.
- Focused candidate verification covered the global runtime, install profiles,
  status readback, MCP setup/HTTP/OAuth/process/coding tools, registry failure
  compensation, docs, and bootstrap surfaces with 0 failures; typecheck also
  passed.
- The frozen published source passed `bun run check:release`; package count is
  393 and installed tarball CLI bins start. The exact published source is merge
  commit `9d4448494d919858de34f0a2169b5b029bd429f2` from PR #77.

## Publication Evidence

- npm published `repo-harness@0.10.0` with `latest: 0.10.0`; registry integrity
  is `sha512-OUJxlshnphPI4fSCvMSA2pYWW/mUUH/fUPtqC0WjUs5WRAjLBUu9cfPXfEtn1bMIPQN6m/aSt7h7l+2Xcuerig==`
  and shasum `8e8278e61a0483453a5eb82c0ed0379803e96ec6`.
- Annotated tag `v0.10.0` was pushed at the published source commit.
- GitHub Release: <https://github.com/Ancienttwo/repo-harness/releases/tag/v0.10.0>.
- `bash scripts/check-release-published.sh 0.10.0` passed registry, dist-tag,
  tarball, tag, and local-version agreement.
- A disposable Bun global install from the public registry exposed
  `repo-harness` on `PATH`; `repo-harness --version` returned `0.10.0`.

## Accepted Residual Availability Risks

- One tunnel socket shares an OAuth rate-limit identity because no trusted
  proxy contract exists; forwarded headers remain intentionally untrusted.
- Unauthenticated dynamic client registration can fill the fixed 64-client,
  30-day capacity. The bound prevents unbounded state growth and does not grant
  authorization, but a filled capacity can deny new registrations until state
  expires or an operator resets the local OAuth state.

## Publish Checklist

- [x] Push the release-prep commit to `origin/main`.
- [x] Confirm CI for the pushed commit is green.
- [x] Run `bun run check:release` on the release commit.
- [x] Publish `repo-harness@0.10.0` to npm with the `latest` dist-tag.
- [x] Push annotated tag `v0.10.0` at the published source commit.
- [x] Create GitHub release `repo-harness 0.10.0`.
- [x] Run `bash scripts/check-release-published.sh 0.10.0`.

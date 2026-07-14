# repo-harness 0.10.0 Release Filing

- Date: 2026-07-14
- Package: `repo-harness@0.10.0`
- Base release: `v0.9.2`
- Release scope: minor release for the risk-aware harness kernel
  (lite/standard/strict profiles plus the effective-state resolver), the
  verification/evidence decoupling of contract gates, the npm-packaged agent
  fleet authority, gstack removal, and the release-blocker hardening below.
- Publish status: **release-blocker candidate, not published**. The source
  branch still requires merge plus green CI. npm publish, the `v0.10.0` tag,
  and the GitHub release require a separate explicit release authorization and
  have not been executed.

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
  gate, package dry-run, and tarball install smoke. GitHub CI on the pushed
  commit remains the remote merge gate.

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
- The frozen local source passed `bun run check:release`; package count is 393
  and installed tarball CLI bins start. Exact commit, PR/CI result, and merge
  commit remain pending until the candidate is committed and pushed.

## Accepted Residual Availability Risks

- One tunnel socket shares an OAuth rate-limit identity because no trusted
  proxy contract exists; forwarded headers remain intentionally untrusted.
- Unauthenticated dynamic client registration can fill the fixed 64-client,
  30-day capacity. The bound prevents unbounded state growth and does not grant
  authorization, but a filled capacity can deny new registrations until state
  expires or an operator resets the local OAuth state.

## Publish Checklist

- [ ] Push the release-prep commit to `origin/main`.
- [ ] Confirm CI for the pushed commit is green.
- [ ] Run `bun run check:release` on the release commit.
- [ ] Publish `repo-harness@0.10.0` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.10.0` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.10.0`.
- [ ] Run `bash scripts/check-release-published.sh 0.10.0`.

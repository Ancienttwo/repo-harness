# repo-harness 0.19.4 Release Preparation

- Integration base: `d1521de5b28dd9ee7cecaec33b4ec6b7122e4c4a` (origin/main after PR #455).
- Package / skill / template: `0.19.4`; previous published release: `0.19.2`. `0.19.3`
  was prepared (`c9c54705`) but never published — `npm view repo-harness dist-tags.latest`
  still reports `0.19.2`; this candidate does not attempt to explain or repair that gap.
- Scope: pin `archctx`/`archctx-contracts` to `0.5.13`, on top of the `0.5.12` pin and the
  fleet Bun-handoff fail-closed fix already merged in PR #455, plus that PR's new
  Bun-handoff regression coverage. No product source change in this PR beyond the
  dependency pin; version/changelog/checklist preparation only.
- Authorization: the owner approved pinning archctx 0.5.13 and preparing this release.
  npm publish, tag creation, GitHub Release and any global/runtime install refresh are
  separate orchestrator-authorized steps and are not claimed here.
- Status: preparation; no 0.19.4 publication or final acceptance is claimed.

## Evidence boundaries

This branch's own commits are the archctx 0.5.13 pin, this version/changelog/checklist
preparation, and the task-sync evidence record that follows it; the rest of the branch
tip is PR #455's already-merged `main` content and is not re-litigated here.

The dependency pin is checked three independent ways below: the regenerated lockfile's
integrity against the live registry, a real installed-binary capability handshake
compared between 0.5.12 and 0.5.13, and an AXR5 clean-room build from the tagged
`arch-context` source (`v0.5.13`, `aa93324`) installed into a disposable consumer. All
three agree with the published package. Canonical full release verification
(`check:release`), exact-candidate hosted CI and published/registry readback remain
pending until a maintainer runs them against the merged commit; this checklist records
local preparation evidence only, not a publish decision.

## Completion evidence

- Upstream registry packages and exact dependency lock: pass. `bun.lock` integrity for
  both packages matches `npm view <pkg>@0.5.13 dist.integrity` exactly; shasums also
  match the published registry facts.
- Capability gate: pass, no change needed. `archctx capabilities --json` from the
  installed 0.5.12 and 0.5.13 binaries is byte-identical apart from the version field
  (11 features, both handshakes); `ARCHCTX_REQUIRED_FEATURES` is unchanged.
- AXR5 clean-room build from tagged arch-context source: pass, `"status": "verified"`,
  built `archctx@0.5.13` / `archctx-contracts@0.5.13` from `arch-context` tag `v0.5.13`
  (`aa93324eb6d65bf30477c01e7ffc575a3a75503c`) and confirmed the packed consumer's
  capability handshake matches the published package.
- Real handshake in this repo: `architecture-projection status --json` reports
  `"version": "0.5.13"`, `"reason": "exact package-local capability handshake passed"`.
- Product/skill/template version consistency: pass, `0.19.4` across `package.json`,
  `assets/skill-version.json` and the five READMEs.
- Typecheck (`bun run check:type`) and hook/helper/reference-config projection checks:
  pass, no drift.
- Consumer-facing RPC error-shape change (archctx 0.5.13's developer-review methods now
  return HTTP 200 `AC_SCHEMA_INVALID` instead of HTTP 500): repo-harness has no
  `runtime-rpc-input-invalid` or `runtime-rpc-call-failed` matches and no HTTP 500
  handling tied to archctx RPC anywhere in `src/`; repo-harness only talks to archctx
  through the CLI capabilities/projection/refactor subprocess handshake, never the
  daemon's `developerReview.*` RPC methods, so nothing depends on the old shape.
- Targeted tests (the pin's own touched suites plus the fleet Bun-handoff suites):
  249 pass, 0 fail.
- Task-sync / workflow evidence: bound in the following commit
  (`docs(tasks): record archctx 0.5.13 pin work package`), not this one.
- Canonical full release verification (`check:release` / `check-npm-release.sh`),
  hosted CI governance lane, tarball-install smoke and the full test suite: run locally
  as part of this same PR's verification pass; see the PR description and task-sync
  notes for that evidence rather than restating it here.
- Exact-head Required / CI, tag, npm publish and `check:release-published`: pending —
  explicitly out of scope for this PR per the dispatch that authored it.

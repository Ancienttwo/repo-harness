# repo-harness 0.19.5 Release Preparation

- Integration base: `43b7d72d` (origin/main after PR #461).
- Package / skill / template: `0.19.5`; previous published release: `0.19.4` (tag `v0.19.4`).
- Scope: archctx/archctx-contracts `0.6.0` pin, fleet model/effort remap (#459, #460),
  fleet ownership-manifest fixes (#458), AXR5 readback refresh. Version/changelog/checklist
  preparation only in this PR.
- Authorization: the owner approved preparing 0.19.5 as a patch release.
  npm publish, tag creation and GitHub Release are separate steps and are not claimed here.
- Status: preparation; no 0.19.5 publication or final acceptance is claimed.

## Completion evidence

- archctx 0.6.0: no code change needed. `archctx-contracts` differs only by version literals;
  the installed 0.6.0 `capabilities --json` reports the protocol ids repo-harness asserts.
  Only schema change is `accepted-committed-change` v1 -> v2, unreferenced here.
- AXR5 clean-room: `"status": "verified"` from `arch-context` tag `v0.6.0` (`597a4161`),
  built on a disposable `--linker hoisted` clone. Readback's `projection.status:
  human-action-required` / codeGraph `unavailable` were not investigated.
- Version consistency: `0.19.5` across `package.json`, `assets/skill-version.json`, five READMEs.
- Exact-head Required / CI, tag, npm publish and `check:release-published`: pending.

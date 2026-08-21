# repo-harness 0.16.2 Release Filing

- Date: 2026-08-21
- Package: `repo-harness@0.16.2`
- Base release: `v0.16.1`
- Source range: `v0.16.1..0a9eb31d` (6 commits on `main` plus the
  artifact-hygiene commit carried on `codex/release-0-16-2`)
- Release-prep branch: `codex/release-0-16-2`
- Final candidate commit: `(pending)` — assigned when the candidate merges to
  `main`
- Release scope: patch. MCP issue #204 runtime fixes (#207: initialize session
  reservation released on construction failure; one stale workspace no longer
  aborts the listing), MCP HTTP sessions bound to the startup profile with
  fail-closed config-flip handling (#210), atomic architecture queue lock
  owner-record publication via staged hard-link creation (#211), and the
  artifact-hygiene rules for comments/PR text in the global working rules and
  generated agent contracts.
- Version strategy: `0.16.2` because the range is fixes plus guidance
  hardening; no new consumer-visible CLI verbs or hook behaviors.
- Changelog correction shipped with this filing: the two `[Unreleased]` items
  (Codex TOML `sandbox_mode` fail-closed validation, EXECUTION_BOUNDARY
  persona de-dup) are ancestors of tag `v0.16.1` and therefore shipped in
  0.16.1; they are re-homed into the `[0.16.1]` section marked "recorded
  belatedly" rather than misattributed to 0.16.2.
- Publish status: **pending** — this preparation did not publish, tag, create
  a GitHub Release, or merge to `main`.

## Authority Boundary

- Release metadata changes no product behavior; the shipped implementation
  range is already merged on `main` at `ea98c6c8` except the artifact-hygiene
  commit `0a9eb31d`, which rides this candidate branch.
- npm `latest`, `v0.16.2`, GitHub Release, tarball metadata, local version
  fields, and installed runtime must resolve to one immutable release.

## Gate Evidence (at candidate content)

| Gate | Result |
|------|--------|
| `bun run check:type` | pass |
| `bash scripts/check-deploy-sql-order.sh` | pass |
| `bash scripts/check-architecture-sync.sh` | pass (blocking=0, dead_letters=0) |
| `bash scripts/check-task-sync.sh` | pass (after notes/ledger sync) |
| targeted suites (skill-version, workflow-contract, readme-dx, assembly ×2, output-parity, reference-configs-projection, scaffold-parity) | 97 pass / 0 fail |
| `bun run check:release` (full gate incl. full test suite + check-ci + tarball smoke + unpublished-version proof) | pass — `[tarball-smoke] OK: repo-harness-0.16.2.tgz installs and packaged CLI bins start.` `[ci] OK` `[release] OK: npm package gate passed.` |

## Publish Follow-through (post-merge, user-authorized)

1. Merge `codex/release-0-16-2` PR into `main`.
2. `bun run check:release` at the merged commit.
3. `npm publish` (this machine uses web-auth:
   `script -q /dev/null npm publish --auth-type=web --browser=false` + open the
   authorization URL).
4. Tag `v0.16.2` at the merged commit; GitHub Release with the `[0.16.2]`
   changelog section.
5. `bun run check:release-published` readback; refresh the selected Bun-global
   runtime; drain acceptance for the architecture projection after refresh.

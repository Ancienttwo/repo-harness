# repo-harness 0.14.2 Release Filing

- Date: 2026-08-10
- Package: `repo-harness@0.14.2`
- Base release: `v0.14.1`
- Source range: `v0.14.1..candidate`
- Release scope: make `repo-harness update` reconcile the exact ArchContext
  dependency closure, propagate its Node runtime contract, and refresh the
  profile-owned Waza, Mermaid, and CodeGraph toolchain with version readback.
- Publish status: **pending publish**. Registry, tag, GitHub Release, and
  selected Bun-global runtime are not claimed until their readbacks pass.

## Authority Boundary

- `repo-harness` owns global runtime reconciliation and host tool projection.
- `archctx@0.4.1` and `archctx-contracts@0.4.1` are mandatory exact production
  dependencies. ArchContext owns its package-local CodeGraph `1.5.0` and
  requires Node `>=24 <26`.
- The global CodeGraph CLI/MCP is a separate user-level tooling scope and is
  refreshed to the product manifest's exact `1.5.0` requirement.
- Mutable Waza and Mermaid sources remain explicit behind
  `--with-external-skills`; ordinary update does not execute an unpinned
  provider. Full-profile packaged skills still refresh from this release.
- Architecture output remains Markdown with Mermaid source only; this release
  adds no HTML renderer or browser runtime.

## Required Release Sequence

- [x] Verify dependency readback, non-destructive failure, and Node-runtime
      regression coverage.
- [ ] Run `bun run check:release` on the candidate commit.
- [ ] Merge the candidate to `main` and push the exact release commit.
- [ ] Publish `repo-harness@0.14.2` to npm `latest`.
- [ ] Create and push annotated tag `v0.14.2` and stable GitHub Release.
- [ ] Run `bash scripts/check-release-published.sh 0.14.2`.
- [ ] Install exact Bun-global `repo-harness@0.14.2`; run `update --json` and
      verify exact repo-harness, ArchContext, Node, CodeGraph, Waza, and Mermaid
      readback.
- [x] Record the user-authorized Claude-review waiver without claiming a
      Claude pass.

## Rollback

- Before npm publication: abandon or revert this release-prep commit.
- After npm publication: never move or reuse `v0.14.2`; correct forward with a
  new patch release. The previous registry version remains installable by exact
  version.

# repo-harness 0.14.0 Release Filing

- Date: 2026-08-09
- Package: `repo-harness@0.14.0`
- Base release: `v0.13.2`
- Source range: `v0.13.2..candidate`
- Release scope: ship the AXR1-AXR8 architecture-source-tree integration,
  consume exact public `archctx@0.4.0` and `archctx-contracts@0.4.0`, promote
  this repository's projection/freshness gates to strict, and prove the
  selected Bun-global runtime reaches fixed-point clean readiness.
- Publish status: **pending publish**. Registry, tag, GitHub Release, selected
  runtime, and Stop/readiness are not claimed until their readbacks pass.

## Authority Boundary

- ArchContext owns architecture model/projection writes and renders Markdown
  containing Mermaid `flowchart` plus `sequenceDiagram` sources.
- repo-harness owns the runtime trigger, drain, freshness gate, and host Stop
  decision. A major module change emits a typed architecture refresh signal;
  it is not reconstructed from prose or a fallback parser.
- `archctx` and `archctx-contracts` resolve from this package's exact public
  dependencies. No sibling checkout, file dependency, or PATH-owned provider
  is accepted as release evidence.
- Mermaid remains external authoring tooling. No HTML, Chromium, or Mermaid
  package is added to the production dependency tree.

## Required Release Sequence

- [x] Verify exact public ArchContext dependency resolution and package lock.
- [ ] Run `bun run check:release` on the candidate commit.
- [ ] Merge the candidate to `main` and push the exact release commit.
- [ ] Publish `repo-harness@0.14.0` to npm `latest`.
- [ ] Create and push annotated tag `v0.14.0` and stable GitHub Release.
- [ ] Run `bash scripts/check-release-published.sh 0.14.0`.
- [ ] Install exact Bun-global `repo-harness@0.14.0`; verify `status --json`,
      10/10 ArchContext capability authority, strict architecture gates, and
      clean Stop/readiness with no pending/retry/dead-letter work.
- [ ] Record the user-authorized typed Claude-review waiver without claiming a
      Claude pass.

## Rollback

- Before npm publication: abandon or revert this release-prep commit.
- After npm publication: never move or reuse `v0.14.0`; correct forward with a
  new patch release. Strict self-host gates may be reverted independently only
  with evidence naming the unresolved projection/freshness incident.

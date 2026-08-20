> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.2.4 Publish Notes

## Context

`repo-harness@0.2.4` was already prepared with a release filing, benchmark
evidence, and package metadata, but the filing still recorded npm publish as
blocked. The release task was to close the actual npm upload and update the
tracked release artifact.

## Decisions

- Use the local `_ops/env/npm.md` token only through a temporary npmrc. This
  preserved the repo boundary around ignored operations state and avoided
  changing global npm auth.
- Keep the publish target on the official npm registry:
  `https://registry.npmjs.org/`.
- Treat the first `npm publish` failure as a machine-local npm cache problem,
  not a package readiness problem. The release gate had already passed, and the
  failure was `EACCES` under `~/.npm/_cacache` during the final npm pack/cache
  step before upload.
- Re-run `npm publish` with a temporary `NPM_CONFIG_CACHE` instead of deleting or
  force-overwriting the global npm cache.

## Evidence

- `npm run check:release` passed before publish: 581 pass, 6 skip, 0 fail.
- The successful `npm publish --registry https://registry.npmjs.org/ --access
  public` reran the full `prepublishOnly` gate and published
  `repo-harness@0.2.4`.
- Registry readback reported version `0.2.4`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.2.4.tgz`, shasum
  `e55df4758f61a6f272325802379db142243b244e`, and
  `gitHead = ca54c14d3d74f1cf9ac4b6db6d3da81b37a55340`.
- Clean-room npx smoke passed from an empty temp directory with a temporary npm
  cache: `repo-harness@0.2.4 --version` returned `0.2.4`, and
  `repo-harness@0.2.4 init --help` displayed the expected init command surface.

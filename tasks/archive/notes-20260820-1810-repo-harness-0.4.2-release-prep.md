> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.4.2 Release Prep Notes

## Scope

Prepare the npm release metadata and user-facing release docs for
`repo-harness@0.4.2`.

## Decisions

| Decision | Why | Tradeoff |
|---|---|---|
| Use `0.4.2` | `repo-harness@0.4.1` is the npm latest, and `0.4.2` is unpublished. The post-0.4.1 diff is a compatible package/template update around PRD/Sprint planning and helper runtime isolation. | Treat the new command facade as part of the still-compatible 0.4.x workflow line instead of cutting a minor release. |
| Keep one package/template version line | `0.4.0` retired the separate generated workflow compatibility line, and no new compatibility split was introduced by this slice. | Downstream generated stamps move together to `repo-harness@0.4.2+template@0.4.2`. |
| Mark publish steps pending | This slice updates release-required documents and metadata only; npm publish, registry readback, tag, and GitHub release still need explicit maintainer action. | The release filing is a prep artifact until the release gate and publish/readback are run. |

## Verification Notes

- `npm view repo-harness@0.4.2 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the version is not published yet.
- `npm view repo-harness version dist-tags.latest --json --registry https://registry.npmjs.org/`
  returned `version=0.4.1`, `latest=0.4.1`.
- `bun scripts/check-skill-version.ts --project .` passed after updating
  `.claude/.skill-version`; the self-host repo is up to date at `0.4.2`.
- `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/skill-version.test.ts`
  passed: 32 pass, 0 fail, 484 expectations.
- `bash scripts/check-npm-release.sh` passed twice. Latest rerun: 689 pass, 0
  fail, 6828
  expectations across 66 files, plus deploy SQL order, architecture sync, task
  sync, brain manifest, brain sync, strict workflow, inspect, migration dry-run,
  and pack dry-run.
- `npm pack --dry-run --json` produced `repo-harness-0.4.2.tgz`, 291 entries,
  shasum `16f1bc7cb9239fc35188de7f086a0937846b5be5`.
- The raw token in `_ops/env/npm.env` was wrapped in a temporary npmrc for
  registry commands. The token was not committed.
- `npm publish --access public --registry https://registry.npmjs.org/`
  completed after the `prepublishOnly` gate passed.
- Registry readback returned `version=0.4.2`, `latest=0.4.2`,
  `gitHead=087c7be3e1febd50db0847cffe91286f888285df`, and
  `dist.shasum=16f1bc7cb9239fc35188de7f086a0937846b5be5`.
- Clean-room `npx --yes --registry https://registry.npmjs.org/
  repo-harness@0.4.2 --version` returned `0.4.2`.
- Tagged and released `v0.4.2` from commit
  `087c7be3e1febd50db0847cffe91286f888285df`.

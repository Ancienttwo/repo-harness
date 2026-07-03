# repo-harness 0.8.5 Release Prep Notes

## Context

The `0.8.5` patch line packages two post-`0.8.4` fixes:

- global working rules distribution hardening for the no-fallback product-code
  invariant;
- Bun global runtime repair for local workspace-source installs that hit
  `DependencyLoop`, plus packaged `sprint-backlog` target-root smoke coverage.

## Release Boundary

The first slice prepared the release files and version surfaces only. The
follow-up closeout published `repo-harness@0.8.5`, created `v0.8.5`, created the
GitHub release, and verified post-publish readback.

Version surfaces updated:

- `package.json`
- `assets/skill-version.json`
- `.claude/.skill-version`
- README current release lines, including localized READMEs
- `docs/CHANGELOG.md`
- `deploy/release-checklists/260704-repo-harness-0.8.5.md`

## Verification

Focused checks passed before the full release gate rerun:

- `bun src/cli/index.ts --version`
- `bun scripts/check-skill-version.ts --project .`
- `bun test tests/skill-version.test.ts tests/readme-dx.test.ts --timeout 30000`

The first `bun run check:release` attempt passed the full Bun test suite
(`1013 pass`, `1 skip`, `0 fail`) but stopped at `check-task-sync` because the
release prep lacked a `tasks/` synchronization file. This note is the task-sync
artifact for the release prep slice.

Final release gate:

- `bun run check:release` passed.
- Bun test suite: `1013 pass`, `1 skip`, `0 fail`, `10593 expect()`.
- Workflow checks, repository inspection, package dry-run, and tarball smoke
  passed.
- Tarball smoke readback: `repo-harness-0.8.5.tgz` installs and packaged CLI
  bins start.

Publish closeout:

- `npm publish --access public --registry https://registry.npmjs.org/`
  published `repo-harness@0.8.5` after rerunning `prepublishOnly`.
- Publish-time gate passed: `1013 pass`, `1 skip`, `0 fail`, `10593 expect()`;
  package dry-run and `repo-harness-0.8.5.tgz` tarball smoke passed.
- Registry readback returned `latest: 0.8.5`, gitHead
  `a8f8663bb50c9201f37bf17c617c7918d5988618`, shasum
  `b515499bf16cf73c766a96e6707306d872301826`, and matching integrity.
- Annotated tag `v0.8.5` was pushed and peels to
  `a8f8663bb50c9201f37bf17c617c7918d5988618`.
- GitHub release:
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.8.5`.
- `bash scripts/check-release-published.sh 0.8.5` passed.
- Clean-cache `npx -y --registry https://registry.npmjs.org/
  repo-harness@0.8.5 --version` returned `0.8.5`.

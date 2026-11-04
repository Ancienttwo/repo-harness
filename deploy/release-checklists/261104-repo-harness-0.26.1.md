# repo-harness 0.26.1 publication record

## Scope and authority

- Release-prep base: `origin/main` PENDING-1680-MERGE (#1683, #1680, the hook
  fix). The release-prep branch `release/0.26.1` starts on this base and
  merges no later main.
- Source commit: the head of the release-prep PR PENDING-PR. The publish
  candidate is the merge commit of that PR on `origin/main`. The owner
  records it below before publish.
- Previous release: 0.26.0, from the release-prep merge
  `4366cd90354bdf45a2cd3333f5813aec101591fa` (#1676). The owner published it
  to npm on 2026-11-04 (record `261104-repo-harness-0.26.0.md`, publication
  values from #1679).
  - Tag `v0.26.0`: annotated. Tag object:
    `1b93e61c5f21ef83bdb8129da15ab0878c7598f3`. Target:
    `4366cd90354bdf45a2cd3333f5813aec101591fa`.
- Merged range: PENDING-RANGE.
- The npm package goes from 0.26.0 to 0.26.1. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.26.1. These are the four version surfaces that
  #1676 changed.
- The release-prep PR changes no product code and no dependency version.
- Publish status: pending owner.
- Hold reason: none.

### Owner decision

M53 (#1690, relayed by advisor t11): fix #1680 fast and ship 0.26.1 as main
after the #1680 merge. No rollback to 0.25.4. The owner runs the publish with
the advisor; the agent does not tag, publish or create a GitHub release.

## Cause of the release

- Hook fix (#1680): in 0.26.0, each bundled `repo-harness-hook` run exited 1
  with `MANIFEST_MISSING` when the machine recorded an install state. So the
  edit, bash and subagent guards, the inbox, SessionStart and Stop did not
  run. The hook now reads the selection through an install-state read model
  that does not load the installer.
- Behavior change (#1680): the hook selection read no longer checks the
  ownership surfaces. `install`, `update`, `doctor` and `status` still check
  them.
- PENDING-RANGE-ENTRIES.
- The full list is in `docs/CHANGELOG.md`, section `[0.26.1]`.

## Publication steps for the owner

1. Merge the release-prep PR only after green `Required / CI` on its head.
2. Be at the machine when the publish starts. The npm web authentication link
   expires in about 5 minutes (0.26.0 run 1 expired, record
   `261104-repo-harness-0.26.0.md`).
3. Publish with the advisor publish script:

   ```bash
   publish-0.26.1.sh <merge sha> <release-prep PR>
   ```

   The script checks that the merge commit is on `origin/main`, that its
   tree equals the PR head tree, and that `package.json` and
   `docs/CHANGELOG.md` show 0.26.1. Then it runs the prepublish gate
   (`bash scripts/check-npm-release.sh --prepublish`), `npm pack`, and
   `npm publish --auth-type=web`. Open the link that npm prints.
4. npm read-back: the script waits up to 8 minutes. The 0.25.4 read-back took
   about 4 minutes. The script stops before the tag when the registry
   shasum differs from the local tarball.
5. The script tags `v0.26.1` on the merge commit, creates the GitHub release
   from the `[0.26.1]` CHANGELOG section, and runs
   `bash scripts/check-release-published.sh 0.26.1`. Record the values that
   its step 9 prints below.

## Upgrade steps for users

The owner's machine runs the 0.26.0 CLI with an install state of protocol 3,
selection `"all"` and 7 plugins (`architecture`, `cross-review`,
`peer-runtime`, `pi`, `platform`, `product`, `strategy-memory`), all at
0.26.0 (read-only read of `~/.repo-harness/install-state.json`,
2026-11-04).

1. Install the new CLI directly, then update:

   ```bash
   bun add -g repo-harness@0.26.1 --no-cache
   repo-harness update --version 0.26.1
   ```

   `update` runs from `src/cli/index.ts`, not from the hook bundle, so the
   0.26.0 fault does not stop it. A 0.26.0 state is protocol 3: no
   migration.
2. From 0.25.4 or earlier: the `[0.26.0]` Upgrade steps in
   `docs/CHANGELOG.md` apply, with 0.26.1 in place of 0.26.0.
3. Rollback after publish: there is no rollback to 0.25.4 (M53). A fault in
   0.26.1 gets a 0.26.2. Do not delete the tag.

### Post-update hook probe

Run after step 1. The probe runs the installed `repo-harness-hook` with the
recorded protocol 3 state, in a scratch adopted repository, for
`PreToolUse --route edit` and `Stop --route default` (the #1680 tarball smoke
shape, `scripts/check-tarball-install-smoke.sh`). Each run must exit 0 with
no error output. 0.26.0 exits 1 here with `MANIFEST_MISSING`.

PENDING-PROBE

### Post-update check

PENDING-CHECK-TABLE

## Hosted CI

PENDING-CI

## Acceptance environment

PENDING-ACCEPTANCE

## Readiness check

PENDING-READINESS

### Yellow flags

The owner accepts or repairs each flag before publish.

PENDING-FLAGS

## Release readiness items

- Skill eval evidence: unavailable for 0.26.1. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1). 0.26.1 makes no
  skill-effectiveness claim.

## Publication

- Publish candidate: pending owner.
- npm version: pending owner.
- Git tag: pending owner.
- Published tarball digest: pending owner.
- `bun run check:release-published`: pending owner.
- Owner machine upgrade and hook probe: pending owner.

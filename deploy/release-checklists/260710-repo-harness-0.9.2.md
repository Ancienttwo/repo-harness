# repo-harness 0.9.2 Release Filing

- Date: 2026-07-10
- Package: `repo-harness@0.9.2`
- Base release: `v0.9.1`
- Release scope: patch release for CLI environment diagnostics, hook execution
  intent classification, and the generated Codex GPT-5.6 agent fleet.
- Publish status: **prepared, not published**. npm authentication, tag, and
  GitHub release creation remain pending.

## Scope

- Runs the Bun registry lookup in `repo-harness doctor` from the package root,
  requires the stable PATH-visible Codex CLI version to be at least `0.144.0`,
  and suppresses irrelevant Codex warnings in Claude-only setup.
- Classifies explicit direct-change-and-commit requests as execution intent,
  without broadening generic change wording, questions, quoted text, negation,
  or contractions into executable requests.
- Sets the generated Codex `deep-reasoner` and `gatekeeper` defaults to GPT-5.6
  Sol with `xhigh` reasoning and `fast-worker` to GPT-5.6 Terra with `medium`
  reasoning.

## Preflight Evidence

- `git fetch origin main --tags --prune` completed before this filing; `main`
  matched `origin/main` at `1cb6b628e28a7d21ca2175a6a58f535ea9d5bd6f`.
- `npm view repo-harness version dist-tags --json --registry
  https://registry.npmjs.org/` returned `version: 0.9.1` and
  `dist-tags.latest: 0.9.1`.
- `gh release view v0.9.1 --repo Ancienttwo/repo-harness` confirmed the prior
  stable release; `gh release view v0.9.2 --repo Ancienttwo/repo-harness`
  returned `release not found`.
- `npm pack --dry-run --json --ignore-scripts` reported
  `repo-harness-0.9.2.tgz` with 366 files.

## Verification

- Prior merged source verification: full suite passed with 1108 tests, 1
  platform skip, and 0 failures; post-merge focused tests passed 57 tests with
  0 failures; contract verification passed 25/25.
- `bun scripts/check-skill-version.ts --project .`, `bun run check:hooks`, the
  focused doctor/init-hook/prompt-intents/README tests, and
  `bun run check:release` passed for this release-prep source. The release gate
  includes typecheck, hook projection, the full test suite, strict workflow
  checks, repository inspection, migration dry-run, package dry-run, and the
  tarball install smoke.
- `bash scripts/check-tarball-install-smoke.sh` passed and confirmed that
  `repo-harness-0.9.2.tgz` installs with packaged CLI bins starting.
- Pending: pushed-commit CI readback, npm publish, registry readback, tag,
  GitHub release, and `bash scripts/check-release-published.sh 0.9.2`.
- `npm whoami --registry https://registry.npmjs.org/` currently returns
  `ENEEDAUTH`; no publish attempt has been made.

## Publish Checklist

- [ ] Push the release-prep commit to `origin/main`.
- [ ] Confirm CI for the pushed commit is green.
- [ ] Publish `repo-harness@0.9.2` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.9.2` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.9.2`.
- [ ] Run `bash scripts/check-release-published.sh 0.9.2`.

# repo-harness 0.11.0 Release Filing

- Date: 2026-07-23
- Package: `repo-harness@0.11.0`
- Base release: `v0.10.0`
- Superseded candidate: unpublished `0.10.1`
- Release scope: evidence-ledger and recovery-view materializer convergence,
  SessionStart context composition and packet-budget verification, deterministic
  skill-surface discovery projections, and the current release-gate isolation
  fixes. The 0.10.1 version line was never published.
- Publish status: **pending publish**. No npm package, Git tag, or GitHub release
  is claimed by this filing.

## Candidate Evidence

- Version sources and public README projections are set to `0.11.0`; the
  generated stamp is `repo-harness@0.11.0+template@0.11.0`.
- The changelog keeps an empty `[Unreleased]` heading and records the candidate
  as `[0.11.0] - 2026-07-23`.
- `session-context.test.ts` was isolated from the host `~/.claude/settings.json`
  security scan by passing a temporary HOME. The product behavior is correct:
  the probe produced one security section with the host HOME and zero sections
  with an isolated HOME.
- `session-context-packet-panel.test.ts` inherited the same host setting and
  measured 188 tokens for `no-plan`; the isolated-HOME probe measured 0 tokens
  with exit code 0. The panel runner now gives each fixture an isolated HOME.
- Candidate verification commands and tarball contents are recorded after the
  release-gate run below.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm CI is green for the merged source commit.
- [ ] Run `bun run check:release` on the exact release commit.
- [ ] Publish `repo-harness@0.11.0` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.11.0` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.11.0` from `v0.11.0`.
- [ ] Run `bash scripts/check-release-published.sh 0.11.0` and retain its
      registry, dist-tag, tarball, tag, and local-version readback evidence.
- [ ] Refresh the operator install with the standard profile and verify
      `repo-harness --version` returns `0.11.0`.

## Candidate Verification Record

- `bun scripts/check-skill-version.ts --project .`: passed; package and template
  both report `0.11.0`, and the project stamp is current.
- `git diff --check`: passed with no output.
- Targeted session-context, packet-panel, skill-version, and README DX tests:
  68 passed, 0 failed, 455 assertions.
- `npm pack --dry-run --json --ignore-scripts`: reported
  `repo-harness-0.11.0.tgz` with 448 files. The allowlist contains no `_ops/`,
  `secrets/`, `.env`, or secret-file paths; no token values were read.
- `bun run check:release`: passed. The complete gate ran 2,038 tests with 2,038
  passed, 1 skipped, and 0 failed; hook/helper projections, typecheck, state
  boundaries, workflow checks, repository inspection, pack dry-run, and
  tarball-install smoke also passed. The first candidate run stopped only at
  the mechanically required `tasks/current.md` sync; the projection was then
  refreshed and the gate rerun successfully. No package publication was
  attempted.

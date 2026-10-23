# repo-harness 0.24.1 publication record

## Scope and authority

- Phase 1 base: `3a2124341a3be7cd9e775dd421e63c4bf0dafefe` (#884) on
  `origin/main`. This base is not final. See "Hold".
- Previous npm release: 0.23.1. Previous Git release: `v0.24.0`, annotated
  tag object `8bc8b79e2f296dc9c8abe0f5b614a5c3e5e5d8d2`, target
  `2d5ac2a034956dfd546d8b288144bfb7fa22fa82` (#877 squash).
- At the phase 1 base, the release adds 6 main commits after the `v0.24.0`
  target: #878 (#875), #863 (#862), #879 (refs #871), #882 (#881),
  #883 (#880) and #884 (#873).
- The npm package goes from 0.23.1 to 0.24.1. npm never published 0.24.0.
  So 0.24.1 also carries every 0.24.0 change to npm users.
- `archctx` and `archctx-contracts` stay at exact 0.9.1.
- This release preparation is release documentation. It has no changelog
  entry, as with #847, #865 and #876 for 0.24.0.
- The #884 entry is under "Fixed" and is not breaking. It removes the
  source-repo script `bun run architecture:writer`. That script was never a
  CLI command, MCP tool or JSON field. #864 added it after `v0.23.1`, so no
  npm release had it.

### Owner decisions (2026-10-23)

- Hold: "按 B：npm 先不发，等 4 个 issue 和 2 个 PR 都收完再说。"
- Later: "把 #863 的两个后续问题开成 issue，发版前也要修完。" These are
  #880 and #881.
- Later: "两个issues也修完再发吧".
- Version: "#871 关闭后发 0.24.1：保留 v0.24.0 的 tag 和 Release 不动，npm
  从 0.23.1 直接到 0.24.1。"

### Hold

- Gate issues: #862, #871, #873, #875, #880 and #881. All are closed except
  #871.
- #871 closes after the owner installs the archctx rolling writer
  (`repo-harness architecture-projection publish follow`) as a launchd
  service on the Mini, and the first rolling PR (branch
  `archctx/projection`) merges. That merge moves `main`.
- So the release base is final only after that merge. Phase 2 rebases onto
  the final `origin/main` and adds the new commits to the changelog and this
  record.

### Authorized scope

- Phase 1: the version bump, the changelog, this record, one dated status
  entry in the 0.24.0 record, one commit, a push and a draft PR. No test,
  typecheck or release gate.
- Phase 2: rebase, the release gates and the readiness check. The parent
  session sends the details.
- Merge, tag `v0.24.1`, the GitHub Release and `npm publish` need the
  owner's explicit GO.
- The `v0.24.0` tag and GitHub Release do not change.

## Upgrade step for users

- From 0.23.1: do every 0.24.0 upgrade step first. See the 0.24.0 section of
  `docs/CHANGELOG.md` and "Upgrade step for users" in
  `261021-repo-harness-0.24.0.md`:
  - run `repo-harness update`;
  - authorize the archctx `daemon upgrade` when `update` reports
    "Daemon readiness pending; verified packages retained.";
  - for legacy global rules without a recorded language, run
    `repo-harness update --report-language <x>` once;
  - read the breaking removals of #834.
- New remedies in 0.24.1:
  - A refused evidence log append names a recovery read. Run one, for
    example `repo-harness run decision-trail render`, then retry. (#863,
    #883)
  - A refused attempt ledger append, or the `attempt_ledger_unreadable`
    halt from a torn last line, needs
    `repo-harness state attempt-repair --json`. (#882)
  - The rolling writer is `repo-harness architecture-projection publish
    <status|once|follow>`. Run it in the target repository. It accepts
    proven observed major changes; the rolling PR merge is the acceptance.
    (#879, #884)

## Acceptance environment

- Pending for phase 2.

## Acceptance status

- Pending for phase 2. The gates run one at a time on the final base, as in
  `261021-repo-harness-0.24.0.md` "Acceptance status".
- Phase 1 ran only `git diff --check` and the changelog coverage check.

## Release readiness items

- Consumer architecture smoke: pending for phase 2.
- Skill eval evidence: pending for phase 2.
- Readiness yellow flags: pending for phase 2.

## Publication checklist

- Merge only after the owner's explicit GO and green hosted CI on the PR
  head.
- Create tag `v0.24.1` and the GitHub Release only after the owner's GO.
- The owner runs `npm publish` with web authentication personally, in the
  foreground. For 0.23.1, a background web-auth publish waited until the
  authentication link expired, and npm failed with `E404`.
- After publication, run `npm view repo-harness dist-tags`. Expect
  `latest: '0.24.1'`. In phase 1 the registry shows `{ latest: '0.23.1' }`.
- Then run `bun run check:release-published 0.24.1` with a temporary HOME.

## Rollback evidence

- Before publication, revert the release preparation commit.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status on 2026-10-23: phase 1. No `v0.24.1` tag, no GitHub Release and no
  npm publication.

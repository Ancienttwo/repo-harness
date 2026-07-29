# repo-harness 0.11.3 Release Filing

- Date: 2026-07-29
- Package: `repo-harness@0.11.3`
- Base release: `v0.11.2`
- Source range: `v0.11.2..candidate`
- Release scope: add ChatGPT delegate mode (a repo-owned dual-agent GPT Pro
  protocol with explicit Claude/Codex host transports), enforce a mandatory
  pre-spawn Gitleaks scan over the exact rendered PromptBundle, and add
  explicit host skill projection commands for the `repo-harness-chatgpt`
  package.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `80460452` (PR #135) adds `references/delegate.md`, a 15-rule
  transport-agnostic delegate protocol (task brief with `EXECUTION_BOUNDARY`,
  sentinel envelope bound to baseline/bundle SHA-256, baseline snapshot
  including WIP diff, isolated-worktree acceptance chain with no 3-way merge
  rescue, bounded 2-round escalation, delegation evidence under
  `.ai/harness/chatgpt/delegations/`), plus two explicit host transports:
  Claude via the existing Oracle consult/continue chain and Codex via its
  built-in browser with visible-completion and sentinel authority.
- The same commit closes two P1 gaps found during independent acceptance: the
  engine now runs a required Gitleaks scan over the exact rendered
  PromptBundle (prompt, inline files, and followups) before any session-store
  write or provider spawn, fail-closed on a missing binary, an incompatible
  version, unparsable output, or findings, with followup consults inheriting
  the scan requirement from session metadata; and it adds explicit opt-in
  `install-skill`/`uninstall-skill` host projection commands for the
  previously undiscoverable `repo-harness-chatgpt` package, using
  realpath-validated symlinks that fail closed on unowned destinations and
  roll back idempotently.
- The skill-surface pin now covers 6 references (`setup.md`, `consult.md`,
  `continue.md`, `read-back.md`, `bridge.md`, `delegate.md`) with the router
  byte limit raised from 2048 to 2560
  (`tests/skill-surface/chatgpt-package.test.ts`).
- Version sources and localized README projections are `0.11.3`; the generated
  stamp is `repo-harness@0.11.3+template@0.11.3`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.11.3` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.11.3` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.11.3` from `v0.11.3` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.11.3` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- Version consistency, strict workflow, contract, and full release gates are
  recorded in `tasks/reviews/20260729-1707-release-0-11-3.review.md` before the
  release candidate is merged.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the single release-prep commit.
- After npm publication: never move/reuse `v0.11.3`; correct forward with a new
  patch release.

# repo-harness 0.11.1 Release Filing

- Date: 2026-07-24
- Package: `repo-harness@0.11.1`
- Base release: `v0.11.0`
- Release scope: replace host install profiles with `minimal` and `full`,
  default fresh installs to `full` with 7/11 Codex hook projections, require
  explicit protocol-1 migration, and repair primary-worktree child delegation
  under macOS Bash 3.2 plus evidence-ledger review-subject self-reference. The
  full `v0.11.0..candidate` range also includes user-managed agent-fleet
  acceptance, immutable evidence genesis, typed status/archive authority,
  archive-candidate binding, QA score normalization, state-concurrency barrier
  ordering, and Claude provider-setting isolation.
- Publish status: **pending publish**. No npm package, Git tag, or GitHub release
  is claimed by this filing until the readbacks below pass.

## Candidate Evidence

- The profile migration was merged to `main` with focused migration, projection,
  status, and agent-fleet coverage plus a subject-bound Sol Max review and
  explicit user waiver.
- `--accept-user-managed` preserves validated custom agent-fleet definitions
  without treating unverified or role-mismatched files as accepted ownership.
- Evidence genesis and archive prediction remain bound to immutable source
  authority; historical terminal classification consumes the same typed
  receipt contract as live status and closeout.
- QA score labels, state concurrency readiness, and Claude routing-provider
  settings each carry focused regression coverage for their post-0.11.0 fixes.
- The protected ship path reproduced `child_args[@]: unbound variable` before
  finish, merge-gate, push, or PR. The candidate uses Bash 3.2-compatible
  conditional array expansion and tests both empty and populated forwarding.
- Source and packaged ship helpers remain byte-identical.
- Adoption-generated `.gitignore` and review-subject normalization both classify
  `.ai/harness/evidence/` as operational runtime state, preventing receipt
  emission from changing the semantic subject.
- Version sources and localized README projections are set to `0.11.1`; the
  generated stamp is `repo-harness@0.11.1+template@0.11.1`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm CI is green for the merged source commit.
- [ ] Run `bun run check:release` on the exact release commit.
- [ ] Publish `repo-harness@0.11.1` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.11.1` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.11.1` from `v0.11.1`.
- [ ] Run `bash scripts/check-release-published.sh 0.11.1` and retain registry,
      dist-tag, tarball, tag, and local-version readback evidence.
- [ ] Reinstall from npm, explicitly migrate installed state to `full`, refresh
      both adapters, and verify protocol 2, 11/11 Codex hooks, and agent fleet.

## Candidate Verification Record

- Bash, review-subject, adoption, manifest, and workflow targeted suites passed:
  79 tests, 0 failures. The initial pre-subject-stability release gate passed
  2,067 tests with 1 platform skip and 0 failures, but is superseded because
  the release-blocking subject-stability repair changed the candidate.
- The final `bun run check:release` result is recorded after semantic freeze in
  `tasks/reviews/20260724-0633-release-0-11-1.review.md` and the typed harness
  evidence projection; this semantic filing deliberately does not self-embed a
  post-freeze log hash.
- Pending npm, Git tag, GitHub Release, Bun-global install, profile migration,
  hook projection, and agent-fleet readbacks.

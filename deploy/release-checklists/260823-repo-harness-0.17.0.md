# repo-harness 0.17.0 Release Filing

- Date: 2026-08-23
- Package: `repo-harness@0.17.0`
- Base release: `v0.16.2` (`ba2babbbdb09`)
- Product source range: `v0.16.2..1fce23bf8f88` (54 commits)
- Release-prep branch: `codex/release-0-17-0`
- Candidate commit: bound by the release PR Head after the metadata commit
- Release scope: minor. The range adds consumer-visible Fleet,
  Publication, Feedback, Task Inbox, GPT Pro advisory orchestration, and MCP
  contracts plus a Bun 1.4 runtime floor.
- Publish status: **candidate preparation**. npm publish, tag creation, GitHub
  Release, merge to `main`, and installed-runtime refresh have not occurred.

## Release Content

### Publication and review lifecycle

- Deterministic immutable `PublicationReceiptV1` with reconstructible PR marker
  and git-common-dir cache.
- Lease protocol 2 `reviewing` lifecycle with current-publication pointer,
  same-owner reopen, takeover through reserving/bind, abandon, and raw-steal
  protection.
- Crash recovery and provider-target integration reconcile for merged,
  ancestor, absorbed, and closed-unmerged outcomes.
- Fenced `MergeReadinessV1` on exact PR Head/base, provider facts, local
  evidence, current publication, and Lease generation.

### Fleet coordination and communication

- Deterministic cross-repo `FleetOffersV1` and `fleet acquire` returning a
  fully bound `WorkEnvelopeV1`.
- `FleetBoardSnapshotV1` and non-overlapping JSONL watch projection with
  repository health, readiness, feedback, inbox, and attention ownership.
- Immutable provider feedback events, separate delivery receipts, repair
  redispatch, and same-token no-progress escalation.
- Immutable task/claim messages with turn-boundary delivery and supersession.
- Coding MCP mirrors for Fleet offer/acquire and publication
  readiness/reopen/takeover.

### Agent and runtime behavior

- GPT Pro browser orchestration is a commit-bound advisory planner/reviewer;
  local Codex retains mutation and acceptance authority.
- Contract worktrees resolve package-owned helper and test-runner dependencies.
- Bun `>=1.4.0` is required across package and installer/runtime checks.
- Fleet acquire workflow markers remain confined to the execution worktree.

## Semantic Version Decision

`0.17.0` is required rather than `0.16.3`. The previous patch filing justified
`0.16.2` by the absence of new consumer-visible CLI verbs. This range adds
multiple public commands, versioned JSON contracts, MCP tools, and Lease
protocol behavior. A patch number would contradict the repository's release
policy and understate the integration surface presented to users.

## Authority Boundary

- This candidate changes release metadata and workflow evidence only; product
  implementation is the already accepted source range on `main`.
- npm `latest`, tag `v0.17.0`, GitHub Release, tarball metadata, source commit,
  version files, and installed runtime must eventually resolve to one immutable
  release.
- Registry publication, tag creation, GitHub Release, merge, and global runtime
  mutation require a separate explicit authorization after the candidate PR is
  reviewed and green.

## Candidate Gate Evidence

| Gate | Candidate result |
| --- | --- |
| `npm view repo-harness@0.17.0` unpublished proof | pass through `check:release` |
| `bun run check:type` | pass |
| `bun test --timeout 60000` | pass: 2990 passed, 2 skipped, 0 failed |
| repository required checks | pass |
| `bun run check:release` | pass |
| tarball install smoke | pass: packed `repo-harness-0.17.0.tgz` installs and packaged CLI bins start |
| GitHub Required/CI on release PR | pending |

## Publish Follow-through (post-merge, separately authorized)

1. Merge the reviewed release PR into `main`.
2. Re-run `bun run check:release` at the exact merged commit.
3. Publish `repo-harness@0.17.0` to npm.
4. Create tag `v0.17.0` at the same merged commit and publish the GitHub
   Release from the `0.17.0` Changelog section.
5. Run `bun run check:release-published` to bind registry metadata, dist-tag,
   tarball integrity, tag, installed CLI, and installed hook runtime.
6. Refresh the selected Bun-global runtime and drain architecture projection
   acceptance after refresh.

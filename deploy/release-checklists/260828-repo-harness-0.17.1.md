# repo-harness 0.17.1 Release Filing

- Date: 2026-08-28
- Package: `repo-harness@0.17.1`
- Base release: `v0.17.0` (`cc64a1049dfb`)
- Product source range: `v0.17.0..683eafd4fbb7` (148 commits)
- Release-prep branch: `codex/release-0-17-1`
- Candidate commit: bound by the release PR Head after the metadata commit
- Release scope: patch on the existing early-access module-engineer line. The
  range delivers the ME program closeout — persistent module engineers, the
  local operator control board, read-only delegation admission, verified
  evidence context, interface change authority, integration acceptance, the
  engineer MCP profile — plus an ArchContext 0.4.7 pin and fixture isolation
  fixes.
- Publish status: **candidate preparation**. npm publish, tag creation, merge
  to `main`, and installed-runtime refresh have not occurred.

## Release Content

### Persistent module engineers

- Durable engineer records with capability bindings through `engineer
  create/enroll/bind/retire`, and read-only projection through
  `board/status/inspect/show/list`.
- `engineer offers` and `engineer acquire` hand a bound work envelope to an
  authenticated engineer principal; claims carry the principal actor rather
  than only the worktree identity.
- Durable task- and claim-scoped engineer inbox through
  `engineer send/receive/ack`, with immutable messages that supersede on
  takeover.

### Control plane surfaces

- `operator serve` runs a loopback-authenticated human control board over the
  engineer fleet, backed by the bundled `build:operator-web` client. The board
  is a projection surface, not a second mutation authority.
- `delegation` compiles a profile and capability set, admits a delegated run,
  dispatches from a frozen argv template, and collects observations. Admission
  is fail-closed against an admitted profile and a writability-checked
  contract.
- `verified-context` compiles a verified-evidence catalog, binds a decision to
  it, and persists the receipt; catalog and receipt writes are validated.
- `interface-change` records proposals against the scheduler projection
  authority and drives their human transition.
- `integration` reads the acceptance envelope, contract, and matrix and records
  product acceptance.

### Runtime behavior

- The MCP `engineer` profile exposes ten engineer tools and is exclusive:
  a non-engineer tool under that profile returns `TOOL_NOT_AVAILABLE`.
- Provider thread effects resolve through a dedicated adapter, and the
  thread-effect status read is pure.
- Cross-review on a Codex host uses the official Codex plugin bound to an
  immutable subject.
- ArchContext is pinned to 0.4.7; the projection manifest carries explicit
  restamp provenance.
- Test fixtures allocate HOME through `mkdtemp` outside the repo under test.

## Semantic Version Decision

`0.17.1` rather than `0.18.0`. `0.17.0` is already the early-access release
line for this module surface (the `engineer`/`operator`/`delegation` command
family and the engineer MCP tool surface); this range is an iteration delivery
within the same early-access line rather than the first appearance of a new
public surface, so the patch number holds and no minor bump is taken.

## Authority Boundary

- This candidate changes release metadata only; product implementation is the
  already accepted source range on `main`.
- npm `latest`, tag `v0.17.1`, tarball metadata, source commit, version files,
  and installed runtime must resolve to one immutable release.
- Registry publication, tag creation, merge, and global runtime mutation are
  covered by the current owner authorization for the 0.17.1 release.

## Candidate Gate Evidence

| Gate | Candidate result |
| --- | --- |
| `git status` clean at `683eafd4`, `main == origin/main` | pass |
| `npm view repo-harness version` before publish | `0.17.0`, dist-tag `latest: 0.17.0` |
| `bun test --timeout 60000` | pass: 3184 passed, 2 skipped, 0 failed (262 files, 967.13s) |
| `bash scripts/check-deploy-sql-order.sh` | pass |
| `bash scripts/check-architecture-sync.sh` | pass: blocking=0, dead_letters=0, uncommitted=0 |
| `bash scripts/check-task-sync.sh` | pass: no changes detected |
| `repo-harness run check-task-workflow --strict` | pass |
| `bun src/cli/index.ts init --repo . --dry-run` | pass: 0 operations |
| `bun run check:release` | recorded at candidate time |
| tarball install smoke | recorded post-publish |
| GitHub Required/CI on release PR | pending |

## Publish Follow-through

1. Merge the reviewed release PR into `main`.
2. Create tag `v0.17.1` at the merged commit and push it.
3. Publish `repo-harness@0.17.1` to npm.
4. Run `bun run check:release-published` to bind registry metadata, dist-tag,
   tarball integrity, tag, installed CLI, and installed hook runtime.
5. Refresh the selected Bun-global runtime and confirm `repo-harness --version`
   reports `0.17.1`.

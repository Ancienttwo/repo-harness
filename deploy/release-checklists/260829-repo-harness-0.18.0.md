# repo-harness 0.18.0 Release Filing

- Date: 2026-08-29
- Package: `repo-harness@0.18.0`
- Base release: `v0.17.1` (`97468edb933a`)
- Product source range: `v0.17.1..35ad134c9de6` (4 commits)
- Release-prep branch: `codex/release-0-18-0`
- Candidate commit: bound by the release PR Head after the metadata commit
- Release scope: minor. The range rebuilds the local operator control board as
  an attention-first worklist with a resident detail pane, bumps
  `FLEET_BOARD_PROTOCOL` from 1 to 2 to carry human task labels, and opens the
  board's single write channel as an authenticated task-message POST. It also
  adds zh/en board internationalization and the canonical brand marks.
- Publish status: **candidate preparation**. npm publish, tag creation, merge
  to `main`, and installed-runtime refresh have not occurred.

## Release Content

### Operator board v2: attention-first worklist

- The board replaces the five-column kanban with a single prioritized worklist
  — needs you, mergeable, unreadable repo, agent in progress, external, done —
  with the last three groups collapsed by default. The left rail anchors and
  the separate Repositories section are removed.
- The detail pane is resident. With nothing selected it renders the repo ×
  stage matrix and repo health.
- A persistent status bar reports relative data age, `seq`, and consistency.
  A stale snapshot desaturates the surface and turns the age indicator red;
  `changed_during_read` marks the status bar and the affected rows without
  replacing their stage labels.
- `FleetBoardCardV1` gains `task_label` and `task_index`, projected from
  `row.task` and `row.index` as preimages of the same authority rather than as
  a second source. The digest basis changes with them, so
  `FLEET_BOARD_PROTOCOL` moves from `1` to `2`.
- Attention semantics are recolored — user amber, agent neutral blue, external
  purple, danger reserved for real errors — and carrot accent as a UI
  affordance is constrained by the `--carrot-*` tokens to mean human write.
  Brand identity art is the documented exception: its orange is a brand color
  and carries no interaction semantics.

### Task message write channel

- `POST /api/v1/fleet/tasks/{repository_id}/{task_id}/messages` exposes the
  existing `fleet message` effect as the board's one write action, under
  `sender_kind: 'operator'` with a fixed `control-board` sender id.
- The endpoint requires an `Origin` header (GET behavior is unchanged),
  resolves `repository_id` through the registry, enforces `read_write` access,
  and mirrors the 8 KiB body limit at the HTTP layer.
- The composer sits collapsed at the foot of the detail pane, treats its fence
  as the confirmation, refuses to send under `read_only`,
  `changed_during_read`, `stale`, or `degraded`, carries a client-side
  `message_id` for idempotency, and drives delivery feedback from the
  authoritative `unread_count` instead of a local sent list.
- The footer contract reads `observe-only · one write: task message`, and the
  negative test is upgraded from "no writes" to an "exactly one write"
  invariant guarded on both the server and the client.

### Board internationalization and brand marks

- A single in-repo dictionary module `src/operator-web/i18n.ts` provides zh/en
  strings with no third-party dependency. The language switch lives in the
  status bar, persists through `localStorage` behind `try/catch` on both read
  and write, and initializes from `navigator.language` with `en` as the
  default and the anchor for test assertions.
- Blocker codes are translated in both languages with the raw code shown
  alongside. Task labels, repo names, ids, and SHAs are not translated.
- The board adopts the canonical pixel logo, favicon, and mascots.

### Documentation and workflow closeout

- `README.md` and `docs/design/DESIGN-local-human-control-board-v1.md` are
  aligned with the rebuilt board.
- `scripts/check-tarball-install-smoke.sh` accounts for the new client assets.
- The `operator-board-redesign` slice is closed out: its contract is marked
  fulfilled and its plan, contract, review, and notes are archived
  (`184f3008`, `0ba78fe6`, `35ad134c`).

## Semantic Version Decision

`0.18.0` rather than `0.17.2`. The range adds a new public write surface — the
task-message POST endpoint and its board composer — and bumps
`FLEET_BOARD_PROTOCOL` from `1` to `2`, changing the `FleetBoardCardV1` payload
and its digest basis. Those are additive capability and protocol changes on the
operator/fleet surface, not an iteration inside an already-shipped shape, so a
minor bump is taken. No public API was removed and no existing call signature
changed incompatibly, so the change is not breaking.

## Authority Boundary

- This candidate changes release metadata only; product implementation is the
  already accepted source range on `main`.
- npm `latest`, tag `v0.18.0`, tarball metadata, source commit, version files,
  and installed runtime must resolve to one immutable release.
- Registry publication, tag creation, merge, and global runtime mutation are
  covered by the current owner authorization for the 0.18.0 release.

## Candidate Gate Evidence

| Gate | Candidate result |
| --- | --- |
| `git status` clean at `35ad134c`, `main == origin/main` | pass |
| `npm view repo-harness version` before publish | `0.17.1`, dist-tag `latest: 0.17.1` |
| `bun run check:release` | recorded at candidate time |
| `bun run smoke:tarball-install` | recorded at candidate time |
| `bun run check:type` | recorded at candidate time |
| GitHub Required/CI on release PR | pending |

## Publish Follow-through

1. Merge the reviewed release PR into `main`.
2. Create tag `v0.18.0` at the merged commit and push it.
3. Publish `repo-harness@0.18.0` to npm.
4. Run `bun run check:release-published` to bind registry metadata, dist-tag,
   tarball integrity, tag, installed CLI, and installed hook runtime.
5. Refresh the selected Bun-global runtime and confirm `repo-harness --version`
   reports `0.18.0`.

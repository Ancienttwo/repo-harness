# repo-harness 0.19.1 Release Filing

- Date: 2026-09-12
- Package: `repo-harness@0.19.1`
- Base release: `v0.19.0` (`a8b5620308a3`)
- Integration base: `2bea52c1` (`main` after PR #410).
- Release branch: `codex/release-0-19-1`.
- Candidate commit: bound by the release PR head and final verification receipt.
- Release scope: patch, by release-owner decision. The range is additive on top
  of 0.19.0 rather than a new layer: it bounds the two unbounded surfaces under
  `.ai/harness/` and adds the operator command that reclaims a backlog the Stop
  path can no longer reach, moves architecture projection execution settings from
  repository policy to `~/.repo-harness/config.json#architecture`, and adds the
  `auto-campaign` bounded standard turn, a repository-scoped operator board,
  explicit fleet registry pruning, and proactive measured refactor
  recommendations behind the existing user-approval gates.
  The range does add public CLI surface (`run evidence-gc`, `fleet` registry
  pruning) and relocates a settings authority, which a strict semver reading
  would place in a minor. Recorded here so the next release owner sees the
  choice rather than inferring the range from the number.
- Publish status: **pending**.

## Release Content

Merged into `main` since `v0.19.0` (PR order):

| PR | Change |
| --- | --- |
| #399 | Installation ownership on upgrade; Herdr repository pin seeding |
| #400 | Architecture projection manifest rebind |
| #402 | `auto-campaign` bounded standard turn skill |
| #403 | Repository-scoped operator board |
| #404 | Explicit fleet registry pruning |
| #405 | Stop run summary retention and `repo-harness run evidence-gc` |
| #406 | Campaign preparation retry before any runtime effect |
| #407 | BRC native host execution checkpoint (docs) |
| #401 | Architecture projection as global configuration |
| #408 | Proactive measured refactor recommendations |
| #410 | Evidence retention contract record correction |

See `docs/CHANGELOG.md#0191---2026-09-12` for the behavioral detail.

## Upgrade Notes

- **Existing repositories carry an evidence checkpoint backlog.** Checkpoint
  retention shipped in 0.19.0 but runs only inside a successful publish. After
  upgrading, the next successful Stop prunes the backlog on its own. Run
  `repo-harness run evidence-gc --repo . --dry-run` to see the reclaimable bytes,
  and `repo-harness run evidence-gc --repo .` when that Stop will not come --
  a repository whose evidence ledger was reset, or one that no longer runs the
  harness. Measured on the author's machine: 9.7 GB in a single repository,
  10.5 GB across eight.
- **Architecture projection settings move to the user level.** Repository `init`
  removes the retired repository-local execution settings and reports readiness.
  An explicit `disabled` choice is preserved. Provider versions stay
  package-owned; nothing to edit by hand.
- **`runs/verification-*.log` has no retention owner.** Failure diagnostics from
  `verification-execution.ts` are never retention candidates (not `.json`) and
  accumulate. They are small and tied to failed checks; left deliberately.

## Verification

- [ ] `bun run check:release` (full release gate, includes `scripts/check-ci.sh`)
- [ ] `bun run check:hooks`, `check:helpers`, `check:reference-configs`
- [ ] `bash scripts/check-task-workflow.sh --strict`
- [ ] `bash scripts/check-task-sync.sh`
- [ ] `bun src/cli/index.ts init --repo . --dry-run`
- [ ] Release PR CI green on the candidate head
- [ ] Tag `v0.19.1` on the merge commit
- [ ] `npm publish` and `bun run check:release-published`
- [ ] Bun-global runtime refreshed; `repo-harness --version` reports `0.19.1`
- [ ] `repo-harness run evidence-gc --dry-run` resolves from the installed runtime

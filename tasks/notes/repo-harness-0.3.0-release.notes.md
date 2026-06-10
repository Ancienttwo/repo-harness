# repo-harness 0.3.0 Release Notes

## Scope

Prepare and publish the npm/CLI release line `repo-harness@0.3.0` after the
post-0.2.4 sprint program layer, central-first hook runtime, prompt verdict
protocol, edit-layer enforcement, merged PostToolUse observer, and legacy alias
retirement landed on `main`.

## Decisions

| Decision | Why | Tradeoff |
|---|---|---|
| Bump only the npm/CLI package line to `0.3.0`; keep generated workflow compatibility at `5.2.3` | The shipped changes are package/runtime surface changes, while generated project model compatibility did not intentionally advance | README must keep the two version lines explicit |
| Update canonical `README.md` Mermaid diagrams for sprint projection and central-first SessionStart runtime | These are user-facing architecture paths for the new release | Localized README diagrams are updated where this repo maintains a Chinese mirror; other localized docs only receive release pointer updates |
| Keep npm auth local to a temporary npmrc sourced from `_ops/env/npm.md` | Current global npm auth returns `E401`, and `_ops` is the established local secret surface | Do not print or commit token values; do not mutate global npm config |
| Use release filing plus final tag/GitHub release after npm readback | Prior releases preserve npm `gitHead` on a release-prep commit and final release filing on the tagged closeout commit | Two-step closeout is more explicit than a single publish/tag command |

## Verification

- Focused preflight passed:
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts`
- First full release gate run reached:
  - `bun test`: 632 pass, 0 fail
  - `bash scripts/check-deploy-sql-order.sh`: pass
  - `bash scripts/check-task-sync.sh`: failed because this task note did not
    exist yet.
- Second full release gate run passed:
  - `bash scripts/check-npm-release.sh`
  - `bun test`: 632 pass, 0 fail
  - `bash scripts/check-deploy-sql-order.sh`: pass
  - `bash scripts/check-task-sync.sh`: pass
  - `bash scripts/check-task-workflow.sh --strict`: pass
  - `bun scripts/inspect-project-state.ts --repo . --format text`: pass
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`: pass
  - `npm pack --dry-run --json`: pass

## Follow-up In This Slice

- Publish `repo-harness@0.3.0`, run registry readback and clean-room `npx`
  smoke, then update the release filing to `Published`.

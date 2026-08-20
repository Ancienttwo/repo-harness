> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.4.0 Release Prep Notes

## Scope

Prepare the npm release metadata and user-facing release docs for
`repo-harness@0.4.0`.

## Decisions

| Decision | Why | Tradeoff |
|---|---|---|
| Use `0.4.0`, not `0.3.1` | The post-0.3.0 diff adds public workflow and CLI surfaces: state snapshot, architecture queue gates, contract-run, heartbeat triage, route evals, and generated template sync | Treat as a minor release instead of a patch |
| Retire the separate `5.x` generated workflow compatibility line | Maintainer direction: old `v5.x` can retire; keeping it would leave generated `.skill-version` stamps on `5.2.3` while npm reports `0.4.0` | Generated projects now see the next migration as `5.2.3 -> 0.4.0`, but future release/readback has one version line |
| Update README Mermaid for the loop system | The old diagram showed only plan -> contract -> worktree -> verify -> closeout and omitted heartbeat, state snapshot/eval evidence, architecture queue, and contract-run delegation | English and Chinese diagrams are updated; other localized docs keep release pointers only |
| Add `check-architecture-sync.sh` to the npm release gate | `package.json` and root required checks expose the architecture sync gate; `prepublishOnly` should enforce it before publish | Release gate takes one additional shell check |

## Verification Notes

- `npm view repo-harness@0.4.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the version is not published yet.
- Focused checks passed before the Mermaid update:
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts`
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/skill-version.test.ts`
  - `bun scripts/check-skill-version.ts --project .`
- Focused checks passed after the README Mermaid and version-stamp updates:
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts tests/skill-version.test.ts`
  - 31 pass, 0 fail.
- First full release gate reached `bun test`: 678 pass, 0 fail, then failed at
  `bash scripts/check-task-sync.sh` because this task note did not exist yet.
- Second full release gate passed:
  - `bash scripts/check-npm-release.sh`
  - 678 tests passed across 67 files.
  - Deploy SQL order, architecture sync, task sync, brain manifest, brain sync,
    strict workflow, and npm package gate all passed.
- Final package dry run passed:
  - `npm pack --dry-run --json`
  - `repo-harness-0.4.0.tgz`, 290 entries, shasum
    `88b5877750392991d78c6042ab96245d1bdb8246`.

## Follow-up In This Slice

- Commit the verified release prep.
- Tag and create the GitHub release for `v0.4.0`.
- Leave npm publishing to the maintainer.

> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.4.3 Release Prep Notes

## Scope

Prepare the next npm/package release line after `repo-harness@0.4.2`.

## Decisions

| Decision | Rationale | Consequence |
| --- | --- | --- |
| Use `0.4.3` | The maintainer requested 0.4.3, and `repo-harness@0.4.2` is already published on npm. | Release gate must reject 0.4.2 reuse and pass registry uniqueness for 0.4.3. |
| Keep one package/template version line | `0.4.0` retired the separate generated workflow compatibility line, and this slice does not introduce a compatibility split. | Downstream generated stamps move together to `repo-harness@0.4.3+template@0.4.3`. |
| Refresh current handoff inside release gate | Clean checkouts do not contain ignored `.ai/harness/handoff/current.md`; writing only a resume packet makes strict workflow fail. | `check-npm-release.sh` now runs `prepare-handoff.sh` with resume refresh disabled before running `codex-handoff-resume.sh`. |

## Verification

- `npm view repo-harness@0.4.3 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target version is unpublished before publish.
- `bun src/cli/index.ts --version` returned `0.4.3`; `status --json` returned
  CLI version `0.4.3` and `8` managed routes.
- `bash scripts/check-npm-release.sh` passed after the version bump, including
  `bun test` (`706 pass`, `0 fail`), task/workflow checks, inspector,
  self-migration dry-run, and npm pack dry-run.
- Visible `npm pack --dry-run --json` inspection reported
  `repo-harness-0.4.3.tgz`, `270` files, included the new docs/init-hook/guard
  surfaces, and excluded the retired duplicate reference-doc assets.
- Isolated detached-worktree verification found the missing-current-handoff
  release gate blocker, which was fixed by refreshing current handoff before
  resume generation. The second isolated detached-worktree run of
  `bash scripts/check-npm-release.sh` passed with `706 pass`, `0 fail`, and
  `[release] OK: npm package gate passed`.

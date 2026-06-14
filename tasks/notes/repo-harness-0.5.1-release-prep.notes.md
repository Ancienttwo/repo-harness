# repo-harness 0.5.1 Release Prep Notes

## Scope

Prepare the npm/package release line `repo-harness@0.5.1` for the CodeGraph
readiness resolver patch.

## Decisions

| Decision | Rationale | Consequence |
| --- | --- | --- |
| Use `0.5.1` | The change fixes setup/readiness behavior without changing the public command lifecycle added in `0.5.0`. | Treat this as a patch release. |
| Prefer the platform bundle before `.bin/codegraph` | The repo-local npm shim can hang while `@colbymchenry/codegraph-<platform>-<arch>/bin/codegraph` returns immediately. | Self-host and downstream checks keep the local dependency boundary without falling back to global CodeGraph. |
| Sync the helper template | Generated repos receive `assets/templates/helpers/check-agent-tooling.sh`, not the self-host root script. | The published package fixes downstream readiness checks as well as this checkout. |

## Verification Plan

- Run the bounded CodeGraph update from setup check advisory:
  `bun update @colbymchenry/codegraph && bash scripts/ensure-codegraph.sh --sync`.
- Verify `repo-harness setup check --target codex --check-updates --json`
  reports CodeGraph `update=up-to-date`, no `fail`, and no `needs_agent`.
- Run focused CodeGraph/tooling tests and the full release gate before publish.

## Verification

- `bun update @colbymchenry/codegraph && bash scripts/ensure-codegraph.sh --sync`
  completed successfully; CodeGraph stayed on `1.0.1` and the project index
  synced through the local platform bundle.
- `repo-harness setup check --target codex --check-updates --json` reported
  `fail=0`, `needs_agent=0`, and CodeGraph `update=up-to-date`.
- Focused tests passed:
  `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/check-agent-tooling.test.ts tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts tests/tooling/codegraph-integration.test.ts`
  returned `41 pass`, `0 fail`.
- A first full release gate run hit a transient full-suite subprocess signal in
  `ship-worktrees should put dirty main closeout on a PR branch`; the focused
  reproduction passed.
- Final release gate passed with conservative test settings:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `744 pass`, `0 fail`, followed by workflow checks, repository
  inspection, migration dry-run, npm pack dry-run, and `[release] OK`.
- `npm pack --dry-run --json` reported `repo-harness-0.5.1.tgz`, `280` files,
  package size `4680843`, unpacked size `6509904`, shasum
  `4bd65926c5516ff1b461ea9ec272c407250a7957`, and included both
  `scripts/check-agent-tooling.sh` and
  `assets/templates/helpers/check-agent-tooling.sh`.

# Readiness Filing: repo-harness workflow-darwin-readiness

Date: 2026-06-06
Filing ID: 260606-repo-harness-workflow-darwin-readiness
Status: Readiness-only, not published

## Naming

This is a readiness filing, not an npm package release. It uses the release
checklist directory because the workflow contract requires readiness yellow
flags to be filed with either an accepted reason or a repair command before a
release report treats them as understood.

## Scope

- Package: `repo-harness` (no version published in this filing)
- Branch: `main`
- Source base before readiness commit: `9eb43d0`
- Working-tree slice: Workflow Darwin optimization and readiness yellow closeout.
- Public CLI semantics: unchanged.

## Hard Readiness Requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CodeGraph CLI, MCP config, and project index | Pass | `bash scripts/check-agent-tooling.sh --host both --json` reported `codegraph.status = present`, local version `0.9.9` selected, Codex MCP configured, Claude MCP configured with `always_load = true`, project index up-to-date. |
| Codex automation skills `health`, `check`, `mermaid` | Pass | Same tooling report reported `codex_automation_profile.status = present` with no missing skills. |
| Waza `think`, `hunt`, `check`, `health` in both hosts | Pass | Same tooling report reported `waza.status = present`; Claude and Codex host `staging_sync = synced`. |

## Yellow Flags

| Flag | Disposition | Reason / Repair Command |
|------|-------------|-------------------------|
| Waza Codex staging drift | Repaired | Ran `for d in think hunt check health; do rsync -a --delete "$HOME/.agents/skills/$d/" "$HOME/.codex/skills/$d/"; done; mkdir -p "$HOME/.codex/rules"; for f in anti-patterns.md chinese.md durable-context.md english.md; do cp "$HOME/.agents/rules/$f" "$HOME/.codex/rules/$f"; done`, then verified with `diff -qr` for skills and `cmp -s` for shared rules. |
| gbrain doctor warning | Accepted yellow | `gbrain doctor --json --fast` returned `status = warnings`, `health_score = 95`; the only warning was `connection: Skipping DB checks (--fast mode, URL present from config-file-path)`. CLI is present, Codex MCP is configured, Claude MCP is disabled by current host policy. Full DB repair is outside this repo slice; repair surface is `gbrain doctor --json` followed by fixing the configured DB URL or intentionally migrating/syncing the brain with `gbrain sync --repo /Users/ancienttwo/Projects/agentic-dev`. |
| CodeGraph local/global version drift | Accepted yellow | The same readiness report showed local `codegraph` `0.9.9`, global `0.9.6`, and `using=local`. This repo intentionally uses the local dev dependency for self-host checks; repair surface for host parity is updating the global install or continuing to rely on the local binary. |
| Historical skill eval benchmark was all dry-run | Repaired | Ran `bun run benchmark:skills -- --agent codex --profile with_skill --eval route-workflow-check --iteration darwin-fulltest-route-fix`; `evals/benchmark.md` now reports `full_test_count = 1`, `dry_run_ratio = 0.0%`, `grader_pass_rate = 100.0% (4/4)`, and `effectiveness_authority = authoritative`. |

## Verification

- `gbrain doctor --json --fast` passed as parseable JSON with `status = warnings`, `health_score = 95`.
- `bash scripts/check-agent-tooling.sh --host both --json` passed after Waza sync and reported no Waza drift.
- `bun test tests/check-agent-tooling.test.ts` passed: 8 pass, 0 fail.
- `bun run benchmark:skills -- --agent codex --profile with_skill --eval route-workflow-check --iteration darwin-fulltest-route-fix` passed with 1 full test, 0 dry-run records, and 4/4 graders.

## Publish Status

- npm: not published.
- GitHub release: not created.
- Hold reason: readiness-only filing for yellow-flag accounting; package release remains out of scope.

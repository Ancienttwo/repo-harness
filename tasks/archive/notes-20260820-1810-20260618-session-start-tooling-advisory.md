> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# SessionStart Tooling Advisory Frequency

## Context

The SessionStart hook had a weekly TTL for `repo-harness setup check --check-updates`, but it rendered the cached update report on every SessionStart while the cache was fresh. A 2026-06-14 cached report still contained Waza and CodeGraph update actions even though a live `repo-harness setup check --target codex --check-updates --json` on 2026-06-18 reported both as `update=up-to-date`.

## Decision

Keep the weekly setup-check TTL, but add a per-report render marker under `.ai/harness/security/`. A cached report now renders at most once; when the report is refreshed after the TTL, the new file mtime causes one new advisory render. Stale reports are no longer rendered while an async refresh is being scheduled.

## Verification

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts` -> 126 pass, 0 fail.
- `bash -n assets/hooks/session-start-context.sh .ai/hooks/session-start-context.sh`
- Forced local advisory cache refresh with `REPO_HARNESS_TOOLING_ADVISORY_FORCE=1 REPO_HARNESS_TOOLING_ADVISORY_SYNC=1`; normal SessionStart then reported no Waza/CodeGraph update advisory.

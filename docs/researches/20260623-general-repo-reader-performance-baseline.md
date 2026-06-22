# General Repo Reader Performance Baseline

Date: 2026-06-23

Source task: `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`

## Scope

This records the first reproducible baseline for the general repo reader
performance slice. The benchmark fixture intentionally disables CodeGraph in
order to isolate the filesystem walker, snapshot cache, entry metadata cache,
pagination, read, and search behavior.

Benchmark entrypoint:

```bash
bun run benchmark:mcp-reader -- --entries <count> --json
```

## 10k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 10000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 672.21 ms |
| warm manifest first page | 360.91 ms |
| list_tree root depth 1 | 344.89 ms |
| read_file first chunk | 341.80 ms |
| warm literal search | 763.39 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `10109`
- `counts.files`: `10005`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `141606912`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=10108`, `misses=1`
- search matches: `10`

## 100k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 100000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 18411.08 ms |
| warm manifest first page | 4318.82 ms |
| list_tree root depth 1 | 4320.39 ms |
| read_file first chunk | 4391.59 ms |
| warm literal search | 4404.87 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `100109`
- `counts.files`: `100005`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `621821952`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=100108`, `misses=1`
- search matches: `50`
- search `truncated`: `true`

This proves the generated 100k fixture can complete without OOM and returns
paginated results. It does not satisfy the proposed Sprint 2 SLO: warm manifest
first page is still above 2 seconds, ordinary read first chunk is above 500 ms,
and warm search is above 2 seconds.

## Decision

The path-aware response cache key and entry metadata cache close the
cache-key/invalidation slice, but they do not close streaming manifest or the
100k/500k performance gate. The next performance slice should move snapshot
revalidation away from repeated whole-repo walks. The 100k warm path now avoids
full content hashing for unchanged files, but it still stats and sorts the full
visible tree before serving first-page manifest, read, tree, or search results.

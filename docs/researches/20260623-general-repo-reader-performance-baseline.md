# General Repo Reader Performance Baseline

> Retirement note (2026-10-04): The batch C research and evaluation tools are retired. Commands for those retired tools describe history. They are not current execution instructions. Other tools keep their own current status. Use the [pre-retirement source](https://github.com/Ancienttwo/repo-harness/tree/bb6a657204a7dc4aef1ddfe069c92ec0207f40a4) for removed paths.

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
| cold manifest first page | 101.05 ms |
| warm manifest first page | 76.37 ms |
| list_tree root depth 1 | 79.93 ms |
| read_file first chunk | 0.67 ms |
| warm literal search | 499.84 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `10109`
- `counts.files`: `10005`
- `counts.content_deferred`: `9019`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `133677056`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=999`, `misses=9110`
- search matches: `10`

## 100k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 100000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 821.85 ms |
| warm manifest first page | 733.76 ms |
| list_tree root depth 1 | 782.31 ms |
| read_file first chunk | 0.74 ms |
| warm literal search | 779.04 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `100109`
- `counts.files`: `100005`
- `counts.content_deferred`: `99010`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `416284672`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=999`, `misses=99110`
- search matches: `50`
- search `truncated`: `true`

This proves the generated 100k fixture can complete without OOM, returns
paginated results, and satisfies the proposed Sprint 2 warm-path SLO on this
machine: warm manifest first page is below 2 seconds, read first chunk is below
500 ms, and warm search is below 2 seconds.

## 500k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 500000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 11393.94 ms |
| warm manifest first page | 12201.90 ms |
| list_tree root depth 1 | 12641.15 ms |
| read_file first chunk | 3.67 ms |
| warm literal search | 12668.28 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `500109`
- `counts.files`: `500005`
- `counts.content_deferred`: `499010`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `1677410304`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=999`, `misses=499110`
- search matches: `50`
- search `truncated`: `true`

This proves the generated 500k fixture can complete without OOM and returns
paginated results. The 500k warm path is a recorded baseline, not an SLO pass.

## Decision

The path-aware response cache key and entry metadata cache close the
cache-key/invalidation slice. The streaming manifest page path closes the
`S2-PERF-001` memory-shape requirement for `repo_manifest`: it traverses the
visible tree to prove counts and digest but stores only the requested page of
entries. Non-page file content metadata is deferred and surfaced through
`counts.content_deferred`; returned page entries, `stat_file`, `read_file`, and
`search_text` still compute content hashes when content is actually returned.

The 10k, 100k, and 500k baselines close `S2-PERF-004`. The 100k warm-path SLO
is satisfied on this machine. The 500k baseline remains a future optimization
target rather than a Sprint 2 exit blocker.

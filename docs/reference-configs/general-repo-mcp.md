# General Repo MCP Reference

Status: General repository API reference
Source PRD: `docs/prds/20260622-1700-gpt-codegraph.prd.md`

This document is the operator and developer reference for the repo-harness MCP
general repo API. It covers the tool contract, repo administration, privacy
boundary, workflow-tool boundary, and known limits.

## Contract

The registered repo whitelist is the repo authorization boundary. GPT-facing
requests use `repo_id` and repo-relative paths; local absolute roots stay in the
server-side registry. Inside a registered repo, the general repo API always
refuses the git directory. Outside it, `.ignore` is the only content-level
exclusion rule.

CodeGraph is the indexed metadata and code-navigation backend. It is not the
permission engine. Every path is checked by repo-harness before adapter calls,
and every path returned by CodeGraph is checked again against root containment
and `.ignore`. Files that CodeGraph does not index remain manifest-visible and
their visible text is read through the same guarded filesystem path. CodeGraph
is metadata and navigation support, never a read-authorization decision.

The MCP server advertises one deterministic tool schema for an enabled reader.
Before a mutation, call `get_repo_capabilities`: `write_tools` is populated and
the mutation executes only when the selected registered repo has
`accessMode: "read_write"`.

## Repo Administration

Adopted repos are registered in `~/.repo-harness/registered-repos.json` by
`repo-harness init`.
Use `discover_harness_repos` from the MCP client to discover the registered
`repo_id` before calling general repo tools. `list_allowed_roots` is only for
the separate session-local workspace capability.

One stdio server serves every registered repository.
Stale registry entries are ignored unless the live repo still carries
repo-harness adoption markers. External non-repo local roots are outside the
adopted-repo boundary and require explicit `--allow-root` authorization when
the server starts.

Read/write access is an operator decision in the registry. Do not grant
`read_write` for routine planning. Mutation calls retain revision preconditions
and are denied for every `read_only` repo.

Every general repo tool refuses a path that has a `.git` segment, at any depth,
with `PATH_DENIED`. The match ignores case, so `.GIT` and `.Git` are refused too.
The check runs on the logical path and on the physical path
after realpath, for reads and writes. A write to `.git/hooks/*` or `.git/config`
runs code on the next local `git` command. `repo_manifest` and `list_tree` do
not list `.git` entries.

Outside the git directory, `.ignore` is the only content filter for this API. Do
not rely on `.gitignore`, file extensions, dotfile status, hidden directories, or
CodeGraph indexing as an authorization rule. If a path must not be visible to
GPT, put it in `.ignore` or do not register that repo.

CodeGraph readiness is checked by:

```bash
bash scripts/ensure-codegraph.sh --sync
repo-harness setup check --target codex --check-updates --json
```

The expected healthy state is `index=up-to-date` and configured MCP entries for
the selected agent host.

## Tool Reference

All general repo tools use `repo_id`. Path fields are repo-relative strings.
Responses include consistency fields where relevant: `snapshot_id`,
`snapshot_state`, `index_revision`, `ignore_digest`, `partial`, and
`next_cursor`.

| Tool | Purpose | Write |
|---|---|---|
| `get_repo_capabilities` | Report registry read/write mode, limits, and visible tool surface. | No |
| `repo_manifest` | Page through the complete visible file set. | No |
| `list_tree` | Return one tree page for a directory prefix. | No |
| `stat_file` | Return metadata, hashes, binary/text status, and index metadata. | No |
| `read_file` | Read one text or byte chunk with range/continuation support. | No |
| `read_files` | Read multiple files within byte and count budgets. | No |
| `search_text` | Literal search over visible text files with guarded fallback. | No |
| `write_file` | Create or replace one regular file with revision preconditions. | Yes |
| `apply_patch` | Patch one existing text file with `expected_sha256`. | Yes |
| `move_path` | Move one regular file with source hash and target must-not-exist guard. | Yes |
| `delete_path` | Delete one regular file with `expected_sha256`. | Yes |
| `refresh_repo_index` | Sync CodeGraph after mutations and clear stale snapshots. | Yes |

Stable error codes include `REPO_NOT_ALLOWED`, `WRITE_DISABLED`,
`INVALID_RELATIVE_PATH`, `PATH_OUTSIDE_REPO`, `SYMLINK_ESCAPE`, `PATH_DENIED`,
`PATH_IGNORED`, `NOT_FOUND`, `NOT_A_FILE`, `BINARY_CONTENT`, `INVALID_RANGE`,
`PAYLOAD_LIMIT_REACHED`, `SNAPSHOT_STALE`, `INDEX_UNAVAILABLE`, `INDEX_STALE`,
`REVISION_CONFLICT`, `TARGET_EXISTS`, `PARTIAL_FAILURE`, and
`INTERNAL_ADAPTER_ERROR`.

## JSON Examples

Get capabilities:

```json
{
  "repo_id": "repo_a5b76eee64af71c3"
}
```

Expected response shape:

```json
{
  "repo_id": "repo_a5b76eee64af71c3",
  "access_mode": "read_only",
  "writable": false,
  "read_tools": ["repo_manifest", "list_tree", "stat_file", "read_file", "read_files", "search_text"],
  "write_tools": []
}
```

Manifest first page:

```json
{
  "repo_id": "repo_a5b76eee64af71c3",
  "page_size": 100
}
```

Read one file:

```json
{
  "repo_id": "repo_a5b76eee64af71c3",
  "path": "README.md",
  "line_range": [1, 80]
}
```

Search visible text:

```json
{
  "repo_id": "repo_a5b76eee64af71c3",
  "query": "repo_manifest",
  "paths": ["docs"],
  "max_results": 20
}
```

Create a new file in a write-enabled repo:

```json
{
  "repo_id": "repo_read_write",
  "path": "docs/researches/example.md",
  "content": "Decision note\n",
  "must_not_exist": true
}
```

Patch an existing file:

```json
{
  "repo_id": "repo_read_write",
  "path": "docs/researches/example.md",
  "expected_sha256": "8d8fca...",
  "edits": [
    {
      "old_text": "Decision note\n",
      "new_text": "Decision note\n\nFollow-up: re-read repository capabilities.\n"
    }
  ]
}
```

Move a file:

```json
{
  "repo_id": "repo_read_write",
  "from_path": "docs/researches/example.md",
  "to_path": "docs/researches/example-archived.md",
  "expected_sha256": "8d8fca...",
  "must_not_exist": true
}
```

Delete a file:

```json
{
  "repo_id": "repo_read_write",
  "path": "docs/researches/example-archived.md",
  "expected_sha256": "91a42b..."
}
```

Refresh CodeGraph after a mutation:

```json
{
  "repo_id": "repo_read_write",
  "paths": ["docs/researches/example.md"],
  "mutation_id": "mcpmut_..."
}
```

## Privacy And Audit

Authorized file content is not implicitly redacted from successful read/search
tool responses. The safety boundary is that content must not be written to
server logs, metrics labels, trace rows, audit records, or error stacks.

Audit and observability records may include tool name, actor/profile, repo id,
operation, relative-path counts, path digest, hash summaries, status, error
code, duration, correlation id, mutation id, and index event id. They must not
include file bodies, patch text, local absolute roots, tokens or other secrets.

## Migration Guide

Workflow-artifact tools such as `list_workflow_files`, `read_workflow_file`,
`latest_checks`, and related writers are bounded workflow operations. Use them
only when the task is specifically about repo-harness workflow artifacts.

For repository analysis, migrate prompts and integrations to the general repo
flow:

1. Call `discover_harness_repos`.
2. Capture the selected registered `repo_id` from discovery.
3. Call `get_repo_capabilities` and honor the registry-derived `write_tools`.
4. Use `repo_manifest` for completeness proof.
5. Use `list_tree`, `stat_file`, `read_file`, `read_files`, and `search_text`
   for actual inspection.
6. Use write tools only after explicit operator approval and only with revision
   preconditions.
7. Call `refresh_repo_index` after successful writes.

## Snapshot Consistency and Cache

Reader responses carry `snapshot_id`, `index_revision`, `ignore_digest`, and
`indexed` metadata. A stale client snapshot returns `SNAPSHOT_STALE` instead of
silently mixing versions. Responses also expose `snapshot_state`, the snapshot
TTL/expiry, and a bounded in-process snapshot cache marker.

- `snapshot_cache.key` is scoped by tool and repo-relative path set;
  `snapshot_cache.snapshot_key` identifies the underlying repo snapshot.
- Entry metadata is cached separately by repo, registry revision, `.ignore`
  digest, relative path, and current stat signature, so warm unchanged
  manifest/stat/read calls skip repeated hash and binary probes without hiding
  file, registry, or `.ignore` changes.
- An explicit `snapshot_id` on `stat_file`/`read_file` reuses the cached snapshot
  and validates only the requested file hash instead of rebuilding the full repo
  snapshot.
- When CodeGraph reports a now-missing indexed path, or metadata that no longer
  matches the filesystem, the snapshot becomes `index_lagging` while authorized
  read/stat fallback stays available.
- For large manifests, `repo_manifest` streams the visible tree and keeps only
  the requested page in memory. Page entries carry exact content hashes;
  off-page content metadata is deferred and reported as
  `counts.content_deferred` until a later manifest page, `stat_file`,
  `read_file`, or `search_text` returns it.

Successful writes leave the index pending and append an invalidation event to
`.ai/harness/mcp/index-events.jsonl`. `refresh_repo_index` runs CodeGraph sync
for the repo, invalidates reader snapshots, records refresh success or
dead-letter failure in that same event log, and returns the new `snapshot_id`,
`index_revision`, `index_state`, refresh strategy, and optional mutation lag when
called with `mutation_id`.

The one-time large-repo reader benchmark is retired. Its historical results
remain in `docs/researches/20260623-general-repo-reader-performance-baseline.md`.
Use the affected MCP reader tests for current behavior checks.

## Server Profiles

`repo-harness mcp serve --profile <profile>` selects the tool surface. The
default `planner` profile is read-and-plan only: the client reads workflow and
repo state, writes PRD artifacts, and holds no default source-code write
access, arbitrary shell execution, or agent runner. The `executor` profile
reads `.ai/harness/**` and writes check artifacts.

MCP does not start agents. The task owner directs an explicitly addressed
agent through the herdr skill.

## Known Limits

Current known limits:

- CodeGraph 1.0.1 does not expose stable path-only refresh through the bundled
  CLI adapter; `refresh_repo_index` may use repo-level sync and reports
  `path_refresh_supported:false`.
- Full-text `search_text` uses guarded filesystem fallback when CodeGraph cannot
  prove complete repo-text search.
- Binary files are visible as metadata, but v1 does not parse arbitrary binary
  formats.
- Directory creation, recursive delete, and symlink mutation are intentionally
  disabled in v1.
- Hosted telemetry is not required. Local metrics, traces, reports, and alerts
  live under ignored `.ai/harness/mcp/` and `.ai/harness/runs/` paths.

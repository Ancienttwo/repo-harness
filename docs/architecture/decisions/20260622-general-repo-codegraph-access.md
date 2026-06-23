# General Repo Access Through CodeGraph

> Status: Accepted for Sprint 0 contract freeze
> Source PRD: `plans/prds/20260622-1700-gpt-codegraph.prd.md`
> Source sprint: `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`
> Date: 2026-06-22

## Context

The existing MCP reader was built for repo-harness planning surfaces and guarded
workflow artifacts. The new product boundary is broader: a user-approved repo
should be available to GPT for complete analysis, except paths excluded by that
repo's `.ignore` file.

The critical risk is mixing authorization with indexing. CodeGraph is the read
and search backend, but it is not the policy engine. A stale or incomplete
CodeGraph index must never become the access-control decision, and CodeGraph
omissions must never be treated as proof that a file is inaccessible.

## Decision

Repo-harness owns authorization, path policy, ignore policy, snapshot semantics,
mutation safety, and audit boundaries. CodeGraph owns indexed code discovery and
symbol/text retrieval where it can provide them.

The external MCP contract uses `repo_id` plus repo-relative paths. Local
absolute paths are server-side registry data and are not accepted by GPT-facing
tools.

For a registered repo:

- The repo whitelist is the repo-level authorization boundary.
- `.ignore` is the only content-level exclusion source for the general repo API.
- `.gitignore`, `.rgignore`, dotfile status, file extension, hidden directory
  status, workflow-artifact status, and CodeGraph's own indexing filters are not
  implicit policy.
- Canonical root containment and symlink containment are always enforced before
  CodeGraph calls and again on CodeGraph-returned paths.
- CodeGraph-unindexed ordinary text files remain manifest-visible and use secure
  filesystem read fallback when policy allows them.
- Authorized file content is not implicitly redacted in tool responses for this
  API. Logs, traces, metrics, errors, and audit records must not include file
  content.
- Write tools are rejected for read-only repos. Write access requires an
  explicit repo-level `read_write` capability; tool availability is advertised
  through `get_repo_capabilities.write_tools`.
- Every overwriting write, patch, move, or delete operation requires a revision
  precondition such as `expected_sha256`; new file creation requires an explicit
  must-not-exist precondition.

## Tool Boundary

Sprint 0 freezes the read contract for:

- `get_repo_capabilities`
- `repo_manifest`
- `list_tree`
- `stat_file`
- `read_file`
- `read_files`
- `search_text`

The current write implementation covers `write_file` create/replace,
`apply_patch`, `move_path`, `delete_path`, and `refresh_repo_index`.

`write_file` and `apply_patch` commit filesystem truth first, return an index
invalidation record with `index_state: pending` when CodeGraph is available, and
append an index invalidation event under `.ai/harness/mcp/index-events.jsonl`.
The same mutation result shape is used by `move_path` and `delete_path`; the
event log stores mutation ids, invalidation ids, relative paths, hash summaries,
index revisions, and retry instructions, but never file bodies or patch text.
`apply_patch` is text-only and supports structured `old_text`/`new_text` edits
plus guarded unified diff hunks. Both patch modes require an exact
`expected_sha256` file precondition; each edit/hunk also acts as a local text
precondition and returns `REVISION_CONFLICT` if it no longer matches. Existing
file replacements preserve the file mode bits used by the target. Filesystem
mtime changes as part of the commit, and ownership, xattrs, and platform-specific
metadata are not preserved in this portable v1 mutation layer.

`move_path` is a regular-file-only mutation. It requires the source
`expected_sha256`, refuses symlink moves, requires the target parent directory to
already exist, and requires `must_not_exist: true` for the target path.
`delete_path` also deletes only regular files and requires `expected_sha256`.
Directory creation, empty-directory mutation, and recursive delete are explicitly
disabled in v1; directory targets fail before any filesystem mutation. This
keeps tree-shape changes out of the first mutation layer while still closing the
lost-update contract for file moves and deletes.

The explicit `refresh_repo_index` tool requires the same `read_write` repo
capability, reuses the same path guard and `.ignore` policy for requested paths,
runs the adapter refresh, invalidates in-process repo snapshots, records refresh
success or failure in the index event log, then returns the new snapshot and
CodeGraph revision. Requested refresh paths may be recently deleted paths so
delete and move invalidations can still be synchronized. Callers may pass the
mutation id returned by the write tool; when the matching invalidation event is
still in the recent event window, refresh responses include mutation-to-refresh
lag and the source event id. Refresh failures are written as dead-letter events
with retry metadata and the manual recovery command
`bash scripts/ensure-codegraph.sh --sync`. The bundled CLI adapter uses repo-level
`codegraph sync` because the local CodeGraph CLI surface does not expose a stable
path-only refresh command; responses report `path_refresh_supported:false` so
callers do not assume true incremental reindexing.

## Snapshot Contract

Every read response carries the same public consistency fields:

- `repo_id`
- `snapshot_id`
- `index_revision`
- `ignore_digest`
- `stale`
- `partial`
- `next_cursor`

If a request cannot be served from one coherent snapshot, the tool returns a
stale or partial state instead of silently mixing manifest, search, and read
results from different versions.

## Invariants

- A path is authorized before CodeGraph is called.
- Every path returned by CodeGraph is checked again against canonical root
  containment and `.ignore`.
- `repo_manifest` is the visible file-set authority. Search results cannot be
  used as a completeness proof.
- Transport limits produce pagination, chunking, or explicit errors. They do not
  remove files from the manifest.
- Binary and unsupported files remain visible through metadata even when text
  content is unavailable.

## Tradeoffs

This decision deliberately keeps the first production implementation smaller
than the final product surface. It accepts a secure filesystem walker fallback
for manifest parity because local CodeGraph 1.0.1 does not expose enough stable
inventory and snapshot metadata to make CodeGraph the only source of truth.

The cost is more server-side policy code in Sprint 1 and Sprint 2. The benefit
is that repo-harness keeps a single authorization model and can prove that GPT
analysis is not limited to whatever CodeGraph happened to index.

## Out Of Scope

- Arbitrary local filesystem access outside registered repos.
- Shell, process execution, remote Codex execution, or browser automation.
- MCP mutation of the repo whitelist itself.
- Full binary parsing.
- Production write tools before read-plane parity, snapshot behavior, and index
  lag handling are verified.

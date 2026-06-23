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

The current write implementation covers `write_file` create/replace and
`refresh_repo_index`. Patch, move, and delete remain implementation-gated until
their Sprint 3 slices land.

`write_file` commits filesystem truth first and returns an index invalidation
record with `index_state: pending` when CodeGraph is available. The explicit
`refresh_repo_index` tool requires the same `read_write` repo capability,
reuses the same path guard and `.ignore` policy for requested paths, runs the
adapter refresh, invalidates in-process repo snapshots, then returns the new
snapshot and CodeGraph revision. The bundled CLI adapter uses repo-level
`codegraph sync` because the local CodeGraph CLI surface does not expose a
stable path-only refresh command; responses report
`path_refresh_supported:false` so callers do not assume true incremental
reindexing.

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

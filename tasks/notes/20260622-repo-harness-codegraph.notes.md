# 20260622 repo-harness CodeGraph general repo access notes

## Slice

Sprint 0 contract freeze for `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`.

## Decisions

- Do not change the production MCP reader in this slice. Its legacy deny globs,
  `.gitignore` handling, hidden-file defaults, and redaction behavior are known
  conflicts with the new PRD and belong to Sprint 1 after the contract is
  frozen.
- Add a versioned schema and a CI contract test before adding runtime adapter
  code. This keeps Sprint 0 reviewable and prevents a partial implementation
  from accidentally widening access without manifest parity.
- Treat CodeGraph 1.0.1 as the indexed metadata/search backend, not the manifest
  source of truth. Local CLI evidence does not expose complete repo inventory,
  stable snapshot handles, file hashes, or mutation APIs.

## Tradeoffs

- The S0 test uses a local fake CodeGraph inventory in the test file instead of
  adding a production adapter abstraction. This avoids committing an interface
  before Sprint 1/S2 implementation pressure is clearer.
- The tracked fixture uses ordinary text files for portability; the CI contract
  test materializes empty, large, binary, internal symlink, external symlink, and
  symlink-chain cases at runtime. Race/fault cases remain Sprint 1/S2/S3 test
  work because they require the production guard and mutation planes.

## Open Follow-up

- Sprint 1 must replace legacy MCP reader filtering with the general repo
  Registry, Path Guard, and `.ignore` policy rather than layering the new API on
  top of current `COMMON_DENY_GLOBS`.

## Sprint 1 Runtime Notes

- The first runtime slice adds a separate general repo access service rather
  than changing `WorkspaceManager` in place. The older workspace tools keep
  their compatibility behavior; the new `repo_id` tools implement the PRD
  contract.
- `repo_manifest` is walker-backed in this slice and marks entries
  `indexed:false`. CodeGraph metadata merge, real index revisions, shared
  snapshot lifecycle, and cache/performance work remain Sprint 2.
- Reads open the canonical in-repo target after path and symlink checks. This
  reduces symlink-swap exposure with the Node filesystem APIs available here,
  but a stronger fd-relative/openat design still belongs in the S2/S4 security
  pass if the runtime grows native bindings.

## Sprint 2 Adapter/Snapshot Notes

- The CodeGraph integration is a bounded CLI adapter over
  `codegraph files --format flat --json`. Its output is treated as indexed
  metadata only. Secure filesystem walking remains the manifest source of truth
  because the Sprint 0 spike proved CodeGraph inventory is not a complete repo
  file list.
- Every CodeGraph-returned path is normalized, resolved under the canonical repo
  root, and checked against `.ignore` before metadata is merged. Returned paths
  that are ignored, missing, directories, or outside the repo increment
  `codegraph.filtered_paths` instead of widening access.
- `snapshot_id` is deterministic from repo identity, registry revision,
  `.ignore` digest, CodeGraph revision, and the manifest digest. A caller-provided
  stale `snapshot_id` returns `SNAPSHOT_STALE` rather than silently mixing
  manifest/search/read versions.
- `.ai/harness/mcp/audit.log` is not included in the snapshot revision digest.
  The audit file remains visible according to `.ignore`; the exclusion is only
  to prevent the reader's own append-only audit side effect from invalidating the
  snapshot it just returned.
- CodeGraph CLI `query` is symbol search, not complete repo full-text search.
  `search_text` therefore keeps the policy-consistent filesystem fallback while
  surfacing whether each matched file is present in CodeGraph indexed metadata.

## Sprint 2 Snapshot Cache/Index-Lag Notes

- Snapshot TTL is currently a bounded in-process memoization contract:
  5 minutes, at most 16 snapshots. The cache key includes repo id, registry
  revision, `.ignore` digest, and the validated snapshot id. A hit is only
  reported after the reader recomputes the current manifest digest and confirms
  the snapshot id still matches; this preserves stale detection for file,
  registry, and `.ignore` changes.
- `snapshot_state` is `ready` when the filesystem-backed snapshot can be served,
  and `index_lagging` when CodeGraph metadata proves the index is behind the
  filesystem. Secure walker traversal errors remain represented by the existing
  `partial` and `walker_errors` fields, because a partial manifest can still be
  served with explicit completeness metadata. CodeGraph lag evidence is limited
  to stale indexed paths that no longer resolve and indexed files whose
  CodeGraph size differs from the current filesystem size.
- This slice does not claim the full S2 performance target. Manifest generation
  still walks the complete visible tree to compute counts, hashes, and the
  manifest digest. The remaining performance slice must measure 10k/100k/500k
  fixtures and decide whether to introduce a true streaming inventory structure.

## Sprint 2 Cache-Key/Performance Notes

- Public `snapshot_cache.key` is now scoped by tool and repo-relative path set;
  `snapshot_cache.snapshot_key` names the underlying repo snapshot. This keeps
  `repo_manifest`, `stat_file`, `read_file`, `read_files`, `list_tree`, and
  `search_text` from presenting a single repo-wide cache key for path-specific
  work.
- Entry metadata has a bounded in-process cache keyed by repo id, registry
  revision, `.ignore` digest, repo-relative path, and the current stat
  signature. Warm snapshot revalidation can reuse unchanged metadata without
  re-hashing and binary-probing every unchanged file. File changes, `.ignore`
  changes, and registry revision changes produce different cache keys.
- `docs/researches/20260623-general-repo-reader-performance-baseline.md`
  records the first reproducible baseline. The 10k fixture completed with a
  warm manifest first page at 76.37 ms and warm search at 499.84 ms. The 100k
  fixture completed without OOM, returned paginated results, and met the
  warm-path SLO: manifest 733.76 ms, read first chunk 0.74 ms, and search
  779.04 ms.
- The walker optimization removes the per-entry `resolveRepoPath` hot path for
  manifest traversal and constructs metadata directly from the directory entry
  and one `lstat`. Explicit `snapshot_id` stat/read calls can reuse a cached
  snapshot and validate the requested file hash instead of rebuilding the full
  repo snapshot. This preserves stale detection for the requested file while
  removing whole-repo revalidation from ordinary warm read chunks.
- `repo_manifest` now uses a streaming page builder: it walks the visible tree
  to prove counts and a metadata-revision digest, but retains only the requested
  page entries. The current page still carries exact content hashes; non-page
  file content metadata is counted as `content_deferred` and is computed when a
  later page, `stat_file`, `read_file`, or `search_text` actually returns
  content.
- Metadata-only traversals no longer populate the bounded entry metadata cache.
  This avoids 500k sequential cache-thrash when the visible entry count exceeds
  the 200k cache cap; exact content metadata remains cached for returned page
  entries and read/stat paths.
- The 500k fixture now completes: manifest 12201.90 ms warm first page, read
  first chunk 3.67 ms, warm search 12668.28 ms, with
  `counts.content_deferred=499010`. This records the Sprint 2 baseline and
  leaves 500k latency as a future optimization target rather than an open S2
  checklist item.

## 2026-06-23 write_file slice

- The first Sprint 3 mutation slice adds only `write_file` create/replace. It
  reuses the general repo registry, Path Guard, `.ignore` policy, audit writer,
  snapshot fields, and filesystem fallback path instead of adding a parallel
  write service.
- `read_only` repos return `WRITE_DISABLED`. `read_write` is sourced only from
  the registered repo entry and surfaced through `get_repo_capabilities`.
- New files require `must_not_exist: true`; replacing existing files requires
  `expected_sha256`. Missing or stale preconditions return
  `REVISION_CONFLICT`, and `must_not_exist` on an existing file returns
  `TARGET_EXISTS`.
- Writes use a temporary file in the same canonical parent directory, fsync the
  file, then atomically rename into place. The first slice requires the parent
  directory to already exist; directory creation, recursive delete, patch,
  move, and delete stay out of scope.
- CodeGraph refresh is explicit pending state in this slice:
  `index_state: "pending"` with `refresh_repo_index_required` when CodeGraph is
  available, or `failed` when no index is available. The process-local snapshot
  and metadata caches are invalidated after successful writes so immediate
  read/stat calls see filesystem truth.

## 2026-06-23 refresh_repo_index slice

- The index-sync slice adds `refresh_repo_index` as a read_write-gated mutation
  companion rather than making `write_file` block on CodeGraph. This keeps the
  filesystem commit boundary small and makes index lag explicit to the caller.
- Requested refresh paths are repo-relative, deduplicated, and resolved through
  the same canonical root, symlink, and `.ignore` guard used by read/write
  tools. Empty `paths` means repo-level refresh.
- The CLI adapter uses `codegraph sync <repo>` and then reads
  `codegraph files --format flat --json` for the new revision. Path-only
  refresh is reported as unsupported with `path_refresh_supported:false` because
  the local CodeGraph CLI does not expose a stable path incremental contract.
- `write_file` now returns an `index.invalidation_id` and
  `index.refresh_tool`. `refresh_repo_index` returns before/after index
  revisions, the adapter revision, refresh strategy, snapshot id, and
  `index_state: ready|index_lagging|failed`.
- Search still uses the existing CodeGraph-metadata plus guarded filesystem
  fallback path. This slice makes the index state observable; it does not claim
  a CodeGraph-only full-text backend.

## 2026-06-23 apply_patch slice

- `apply_patch` is implemented as an existing-file text mutation, not as a
  create/update hybrid. Missing files return `NOT_FOUND`; binary targets return
  `BINARY_CONTENT`.
- The tool requires `expected_sha256` for the whole file before any patch
  preconditions are evaluated. Stale file hashes, missing `old_text`, ambiguous
  structured edits, and mismatched unified diff hunks all fail before writing.
- Structured edits are the primary API shape: each edit replaces one exact
  `old_text` with `new_text`. Repeated text requires a 1-based `occurrence` so
  the caller cannot accidentally patch an ambiguous match.
- Unified diff support is intentionally constrained to guarded hunks with
  surrounding old/context lines. Pure insertion hunks without context are
  rejected until there is a stronger insertion precondition shape.
- The write path reuses the `write_file` atomic same-directory temp + fsync +
  rename commit and shared mutation response. Existing file mode bits are
  preserved; mtime changes and platform-specific metadata are not preserved in
  the portable v1 mutation layer.

## 2026-06-23 move/delete path mutation slice

- `move_path` and `delete_path` deliberately target regular files only. Moving
  or deleting symlinks, directories, empty directories, or recursive trees stays
  disabled in v1 so the first path-mutation surface does not create unbounded
  tree semantics.
- `move_path` requires the source `expected_sha256`, requires the target parent
  directory to already exist, and requires `must_not_exist: true` for the target.
  Stale source hashes and existing targets fail before `rename`.
- `delete_path` requires `expected_sha256` and returns the deleted file metadata.
  Directory targets fail before any filesystem mutation; `recursive: true`
  returns an explicit unsupported-policy error.
- Successful move/delete mutations invalidate snapshots and return the same
  pending CodeGraph refresh contract as `write_file` and `apply_patch`.

## 2026-06-23 failure injection, index recovery, and audit slice

- Mutation fault injection is intentionally test-only and env-gated through
  `REPO_HARNESS_MCP_MUTATION_FAULT_POINT`. The supported fault points sit after
  temp-file fsync and before atomic rename, before move rename, and before
  delete unlink. They model the pre-commit boundaries for disk/permission,
  interrupted-process, and rename/delete failures without adding a public MCP
  option.
- Successful mutations now append `.ai/harness/mcp/index-events.jsonl`
  invalidation events. The event log is ignored runtime state, separate from
  `.ai/harness/mcp/audit.log`, and carries mutation id, invalidation id, relative
  paths, hash summaries, index revision, and retry metadata without file bodies
  or patch text.
- `refresh_repo_index` accepts an optional `mutation_id` so callers can trace
  the refresh back to the invalidation event and measure mutation-to-refresh lag.
  It also accepts recently deleted repo-relative paths so move/delete old paths
  can be synchronized instead of failing `NOT_FOUND` before refresh.
- Refresh failures write dead-letter index events with retry metadata and the
  manual recovery command `bash scripts/ensure-codegraph.sh --sync`; the tool
  still returns the adapter error to the caller.
- General repo MCP audit entries now include actor/profile, repo id, operation,
  relative paths, mutation id, index invalidation/event ids, hash summaries,
  result, duration, and rejection error code. The logged input remains hashed,
  not embedded, so file contents and patch bodies do not enter the audit log.

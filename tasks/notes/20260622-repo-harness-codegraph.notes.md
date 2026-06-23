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

## 2026-06-23 mutation lock root hardening slice

- Mutation path locks moved from repo-local `.ai/harness/mcp/locks` to
  repo-harness home under `mcp/mutation-locks/<repo_id>/...`.
- Reason: the old repo-local lock ancestor was attacker-controllable through a
  symlinked `.ai/harness/mcp/locks`; lock coordination must not depend on
  repo-controlled filesystem ancestry.
- Validation: after creating the lock root, the runtime confirms the root is a
  real directory and its realpath remains inside repo-harness home. Repo-local
  symlinked lock roots are ignored by mutation tools.
- Tradeoff: this closes repo-controlled symlink escape and recursive removal
  under untrusted repo paths; stale-lock lease/recovery remains a separate P2
  slice, and `move_path` link/unlink atomicity remains a separate P1 slice.

## 2026-06-23 move_path atomic no-replace slice

- `move_path` no longer commits through hard-link plus source unlink. The commit
  path now uses platform atomic no-replace rename primitives:
  Darwin `renamex_np(RENAME_EXCL)`, Linux `renameat2(RENAME_NOREPLACE)` through
  `syscall`, and Windows `MoveFileExW` without replace.
- Reason: mutation locks and post-lock precondition checks prevent tool-level
  races, but they do not make two namespace operations (`link` then `unlink`)
  atomic. A crash or kill between those operations can permanently expose both
  paths.
- Validation: tests now pin `commitMoveNoOverwrite` away from `linkSync` plus
  `rmSync(source.canonicalPath)`, and inject a target after final preconditions
  but before the native commit to verify the target is not overwritten.
- Tradeoff: unsupported platforms/filesystems fail closed with
  `MOVE_COMMIT_FAILED` instead of falling back to the old non-atomic sequence.
  Stale mutation-lock lease/recovery remains a separate P2 slice.

## 2026-06-23 snapshot ignore-policy revision slice

- Snapshot validation now treats `.ignore` as part of the authorization
  revision, not just as a pre-walk filter. Each validation pass safely rereads
  `.ignore`, compares policy digest and file identity, then walks under the
  validation policy and rereads `.ignore` again before publishing or caching the
  snapshot.
- Reason: `.ignore` itself is deliberately excluded from manifest output, so a
  content-only or identity-only `.ignore` change could previously evade the
  metadata digest while leaving `stale=false`.
- Validation: reader tests now inject `.ignore`-only races for complete
  snapshots, manifest-page snapshots, and same-content `.ignore` replacement.
  The expected behavior is retry under the new policy, not publishing the stale
  old authorization view.
- Tradeoff: validation performs two small `.ignore` reads per snapshot build
  attempt. This keeps the fix local and fail-closed without adding a new
  revision manager or exposing `.ignore` in manifests.

## 2026-06-23 rollout gate provenance slice

- `scripts/mcp-rollout-gate.ts` now binds its release evidence to source
  provenance: base SHA, head SHA, current git SHA, head/current match, PR number
  clean/dirty tree state, CI workflow/run metadata, and a SHA-256 digest of the
  canonical JSON payload.
- The gate now requires `provenance.status="bound"` before returning `ok=true`.
  Dirty trees, missing PR/CI provenance, missing git revision data, or
  head/current mismatches fail closed even when shadow, canary, and rollback
  checks individually pass.
- Canary evidence now records an observation window, read-only rollout config,
  request volume by tool, error rate, latency summary, shadow mismatch counts,
  and rollback trigger records. This changes canary from a one-time status word
  into a bounded observation artifact.
- Tradeoff: the implementation uses local `git` plus GitHub Actions
  environment/event metadata and keeps the artifact digest self-contained by
  hashing the report with `provenance.artifact_digest.value=null`. No sidecar
  artifact file or external release-evidence service was added.
- Validation adjustment: two migration apply tests now use the existing
  `MIGRATION_INTEGRATION_TIMEOUT` budget like adjacent migration apply tests.
  The assertions are unchanged; under local full-suite load these subprocesses
  exceeded their previous hard-coded 30s limits.

## 2026-06-24 hook-latency split remediation

- PR #35 was already merged before the P1-5 review finding was actioned, so the
  split had to be done as a post-merge remediation on `main` rather than by
  rewriting the PR branch.
- The remediation removes the runtime hook-latency implementation from the
  CodeGraph rollout line by reversing the code/test changes from `2d16229`
  (`post-tool-observer.sh`, hook runtime, hook tests) and `53d4353`
  (`prompt-guard.sh` state-refresh latency changes). `tasks/current.md` was
  refreshed from current state instead of reverting historical status snapshots.
- S4 MCP security, observability, rollout, release-gate, and later provenance
  fixes remain in place. The hook-latency research artifact remains as
  background evidence, but the executable hook/runtime change now requires a
  separate hook-runtime review and rollback unit before reintroduction.
- Validation boundary: hook projection parity and hook runtime/dispatcher tests
  are the primary checks because the change deliberately touches `.ai/hooks`,
  `assets/hooks`, `src/cli/hook/runtime.ts`, and hook behavior tests, not the MCP
  reader implementation.

## 2026-06-23 S4 security hardening slice

- Root validation now stores a first-observed directory identity for each
  canonical repo root inside the long-lived MCP process. `resolveRepo` compares
  the live identity to that first observation, so a repo id fails closed if the
  root disappears or is replaced at the same canonical path. This is deliberately
  process-local: a fresh MCP process can adopt the replacement after normal
  registry/policy checks, while a running process does not silently switch trust
  to a different directory.
- Generic thrown adapter errors and blocked `GeneralRepoAccessError` messages
  are redacted before MCP response/audit emission. The audit writer still
  performs its own final error-field redaction, and index refresh events use the
  same redaction path for adapter-provided messages.
- Security regression tests now cover path parser fuzz samples, ignored refresh
  paths, guarded patch parser rejection, malicious CodeGraph absolute/
  Windows-like/NUL paths, same-path root replacement, missing root, manifest
  partial reporting for disappearing entries and POSIX permission-denied
  directories, byte-budget continuation/errors, and audit/index-event absence of
  file content or secret-bearing adapter errors.
- Independent Claude read-only review was run on the S4 diff. The first pass
  found a redaction consistency gap in the blocked audit branch; the follow-up
  fix was applied, local tests passed, and the second pass reported no P1
  findings.
- Residual risk: root identity relies on filesystem `dev:ino:birthtimeMs`.
  Filesystems with unavailable birthtime and immediate inode reuse could
  theoretically miss a same-path replacement. This is still stricter than the
  previous realpath-only guard and remains fail-closed for normal remove,
  replace, or symlink target changes observed in the test fixture.

## 2026-06-23 S4 observability slice

- General repo MCP tool calls now generate a response/audit/metrics/trace
  correlation id. The id is returned as `correlation_id`, recorded on audit
  entries as `correlationId`, and written to both
  `.ai/harness/mcp/metrics.jsonl` and `.ai/harness/mcp/trace.jsonl`.
- Metrics stay content-free: they include repo id, tool, operation, status,
  error code, duration, CodeGraph revision/latency, path count, path digest,
  bytes returned/written, partial/fallback flags, manifest parity failures,
  stale snapshots, index lag, write conflicts, atomic write failures, reindex
  failures, and path escape attempts. Raw paths and file bodies are intentionally
  excluded from metric labels.
- Trace rows are deliberately coarse-grained rather than fake subspan timings:
  they record the observed route from MCP gateway through policy, path/ignore
  guard, CodeGraph or filesystem backend, and response. This preserves a useful
  chain for canary/debugging without inventing precision the runtime does not
  measure.
- `scripts/mcp-observability-report.ts` is a local JSONL aggregator, not a
  hosted telemetry dependency. It produces dashboard rows grouped by repo, tool,
  and CodeGraph revision, separates failed-call error rate from blocked policy
  rejections, caps input to the latest 100k metrics/trace events, and emits
  alerts for path escape spikes, high index lag, incomplete manifests, and
  reindex dead-letter failures.
- `.ai/harness/mcp/metrics.jsonl` and `.ai/harness/mcp/trace.jsonl` are added
  to setup-managed ignore entries. The MCP runtime directory is treated as an
  internal revision path for snapshot digests so observability writes do not
  invalidate a user's `snapshot_id` between related tool calls.
- Claude diff-only review found no P1 issues. Its P2s drove follow-up fixes for
  large-log max latency aggregation, blocked-vs-failed reporting, manifest-only
  parity failure accounting, snapshot stability coverage, and escape-input
  redaction assertions.

## 2026-06-23 S4 migration slice

- Added `McpPolicy.generalRepo` as the rollout boundary for general repo access:
  `general_repo_read`, `repo_write`, `fs_fallback`, `shadow_compare`,
  `canary_repos`, and `rollback_to_legacy_tools`. Local MCP config persists the
  same flags under `rollout.generalRepo`; environment overrides give operators
  a one-process rollback/canary path without editing registry state.
- Defaults are closed by default: general repo read is disabled, repo write is
  disabled, filesystem fallback is disabled, shadow mode is disabled, and
  rollback is disabled. Operators must explicitly opt in to read and fallback;
  both repo `read_write` capability and rollout `repo_write=true` are still
  required before mutation tools are listed or executed.
- Legacy `read_workflow_file` now preferentially calls the new `read_file`
  service, then reshapes/redacts the result into the old artifact response. It
  deliberately falls back to the old bounded workflow path when rollback mode is
  active or when a file exceeds the new single-call read chunk. That preserves
  existing workflow clients while exercising the new repo service in normal
  migration traffic.
- `fs_fallback=false` does not hide files from manifest/stat. It blocks
  unindexed file content reads with `INDEX_UNAVAILABLE` and records skipped
  fallback search candidates as partial search output. This preserves the
  invariant that index/fallback limits are observable constraints, not
  permission denials.
- Added `scripts/mcp-rollout-gate.ts` as the local release/canary gate for this
  migration. It compares legacy workflow file listing/read compatibility against
  the new manifest/tree/search path, validates rollback tool-surface behavior,
  selects configured canaries, and records CodeGraph ignore recheck status.
- Self-host rollout gate passed with `shadow=pass`, `canary=ready`, and
  `rollback=pass`. The live global registry currently contains one adopted
  read-only canary, this repo, classified as medium. The script supports
  configured 1-3 canaries and `--require-three-canaries`; the later release-exit
  gate should use that stricter mode once small/large registered canaries exist.

## 2026-06-23 S4 documentation and exit slice

- Folded S4 security, observability, migration, rollout, documentation, and exit
  evidence into module PR #35 after closing the superseded fine-grained PRs. The
  reviewable module boundary is now the S4 module branch.
- Added `docs/reference-configs/general-repo-mcp.md` as the public reference for
  general repo MCP tool examples, repo administration, `.ignore` policy,
  CodeGraph health, privacy/audit, workflow-artifact migration, rollout flags,
  and known limits.
- Added `deploy/runbooks/general-repo-mcp-codegraph.md` for index stale,
  CodeGraph down, manifest incomplete, mutation conflict, reindex dead-letter,
  write-disable, fallback-disable, and rollback operations.
- Added `deploy/release-checklists/260623-repo-harness-codegraph-general-repo.md`
  to keep Sprint 4 release evidence distinct from npm publish authority.
- README and the ChatGPT MCP setup guide now link to the reference and runbook;
  the setup guide generator was updated so future generated guides keep the same
  general repo entrypoints.
- Sprint 4 machine-verifiable exit criteria are local-gated, but human
  release/test/security signoff and the post-fix external review remain the PR
  review/merge gate and are not self-signed by the implementing agent.

## 2026-06-23 review granularity consolidation

- User feedback: the open PR stack was too fine-grained to review efficiently.
  The review boundary is now the sprint module, not each implementation slice.
- Keep S0 and S1 as module-sized PRs because they already map to contract
  freeze and first runtime reader module boundaries.
- Replace S2's five incremental PRs with one S2 module PR covering snapshots,
  manifest/search/read integration, caching, performance baselines, and
  streaming manifest behavior.
- Replace S3's five incremental PRs with one S3 module PR covering write-file,
  index refresh, guarded patch, move/delete, recovery, and mutation audit.
- Replace S4's three incremental PRs with one S4 module PR covering security,
  observability, migration, rollout gate, documentation, and machine-verifiable
  exit evidence.
- Close the superseded small PRs after the replacement module PRs exist, leaving
  their branches intact for audit history.

## 2026-06-24 mutation lock stale recovery

- Follow-up for external review P2-1: directory mutation locks in the trusted
  `REPO_HARNESS_HOME/mcp/mutation-locks/<repo_id>` root could survive a killed
  process and block later writes forever.
- The reclaim rule is deliberately narrow. A later writer only reclaims a lock
  when `owner.json` has the same repo id and relative path and the recorded PID
  is no longer live. Live owners, malformed owners, missing owners, or mismatched
  repo/path metadata remain fail-closed as `REVISION_CONFLICT`.
- Reclaim first renames the stale lock directory to a unique sibling path before
  removal, then retries atomic `mkdir`. Release now removes only locks whose
  owner token still matches the process-created token, so a cleanup path cannot
  remove a replacement lock.

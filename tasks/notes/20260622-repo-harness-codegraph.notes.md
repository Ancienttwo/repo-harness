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

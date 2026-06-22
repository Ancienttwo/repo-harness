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

# Runbook: General Repo MCP CodeGraph Operations

Status: Active operations runbook
Applies to: repo-harness MCP general repo tools

## Healthy State

Run the normal readiness checks from the repo root:

```bash
bash scripts/ensure-codegraph.sh --sync
repo-harness setup check --target codex --check-updates --json
bun scripts/mcp-observability-report.ts --repo . --out .ai/harness/runs/mcp-observability-report.json
```

Expected results:

- CodeGraph reports ready and `index=up-to-date`.
- Setup check exits 0 with no failed checks.
- Observability report exits 0 when no alert thresholds fire.

## Index Stale

Symptoms:

- setup check reports CodeGraph `index=stale`;
- tool responses include `snapshot_state: "index_lagging"`;
- observability alert `index-lag-threshold` fires.

Actions:

```bash
bash scripts/ensure-codegraph.sh --sync
```

If a write mutation returned `mutation_id`, call `refresh_repo_index` for the
changed paths. If `refresh_repo_index` dead-letters, run the sync command above
and retry the tool once.

## CodeGraph Down

Symptoms:

- `ensure-codegraph.sh` reports missing or unavailable CodeGraph;
- `read_file` on indexed metadata cannot use the adapter;

Actions:

1. Run `bash scripts/ensure-codegraph.sh --sync`.
2. If CodeGraph remains unavailable, general repository reads continue through
   the guarded filesystem path; inspect `codegraph` response metadata before
   relying on index freshness.
3. Keep mutation authorization governed by the registered repo `accessMode` and
   its revision preconditions; do not weaken path or ignore policy.

## Manifest Incomplete

Symptoms:

- tool response has `partial:true` with walker errors;
- observability alert `manifest-incomplete` fires.

Actions:

1. Inspect `.ignore` first; policy exclusions are expected to be absent.
2. Check for permission-denied directories, external symlinks, or files being
   created/deleted during traversal.
3. Re-run the affected MCP tool after the filesystem settles.
4. If incomplete manifests persist, do not rely on a complete-repository claim
   until the walker error is resolved.

## Mutation Conflict

Symptoms:

- write tools return `REVISION_CONFLICT`;
- `write_conflicts` increases in the observability report.

Actions:

1. Re-read the file with `stat_file` or `read_file`.
2. Recompute the intended edit against the new `sha256`.
3. Retry with the new `expected_sha256`.
4. Do not bypass the precondition. A conflict is the expected lost-update guard.

## Reindex Dead Letter

Symptoms:

- `refresh_repo_index` reports failure;
- `.ai/harness/mcp/index-events.jsonl` contains a dead-letter event;
- observability alert `reindex-dead-letter` fires.

Actions:

```bash
bash scripts/ensure-codegraph.sh --sync
```

If sync succeeds, call `refresh_repo_index` again with the original
`mutation_id` and changed paths when they are still known.

## Evidence To Attach To Release Review

- PR links for security, observability, and documentation modules.
- `bun test` summary.
- `bun run check:type`.
- observability report output and report path.
- setup check JSON summary.
- hosted GitHub checks for the module PR.
- registered repository access modes used for any mutation acceptance evidence.

# Workstream: OAR dependency preparation

> **Status**: completed
> **Capability ID**: `runtime-harness-mcp-sidecar`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `mcp-sidecar`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
> **Scope Authority**: The user authorized PR #481 rebase, verification and push. Do not merge.

## Scope

Rebase PR #481 onto main at `ec0de40f`. Upgrade the OAR pin from 0.10.2 to
0.13.3 and its required Pi graph from 0.99.2 to 1.0.0. Keep other locked
versions, the existing Generic review host and the approved D4 policy.
Raise the root Node minimum to 24. Keep the existing <26 upper bound.
Push only `codex/oar-0133-bump`. Do not merge.

## Verification boundary

The new owning test exercises the real public Session API with both ambient
type environments and a strict source-error control. This was absent from the
existing policy/transport tests; it is not a provider/adapter simulation.
Run the frozen install and root typecheck with Node 24. Run the full suite
with `--timeout 60000 --max-concurrency 1` on this PR. Compare its failure
list to the recorded baseline. Rerun only failing files in a fresh detached
worktree at the main commit. The user accepted the MCP goal case as known
flaky. Record its raw result and exclude only that case from the new-failure
count. New failures must be zero. Record results in `/tmp/481-report.md`.
Keep raw logs in the report's named temporary evidence directory.

## Durable conclusion

See [OAR dependency preparation](../../../../docs/researches/oar-dependency-preparation.md)
for the runtime boundary, Node 24 requirement, D4's full declaration-body scope
and unchanged upstream issues. No new production abstraction or adapter was
needed. The new test file owns an independently meaningful declaration
boundary, this workstream satisfies task sync, and the research document keeps
the reusable configuration conclusion at a human reading entrypoint.

The existing CLI/provider integration stays on main's implementation. Live
provider acceptance remains outside this dependency upgrade. No runtime code
or release version changes are needed.

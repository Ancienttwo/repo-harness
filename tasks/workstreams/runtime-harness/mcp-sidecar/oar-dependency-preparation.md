# Workstream: OAR dependency preparation

> **Status**: completed
> **Substantive Change SHA256**: `sha256:a619ba1044c5b5415a2bedcbcb5dcc182e11c0dd040135df32e7fd1fcea20ede`
> **Capability ID**: `runtime-harness-mcp-sidecar`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `mcp-sidecar`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
> **Scope Authority**: Explicit OAR 0.13.3 and D4 decisions, followed by user authorization to create and merge an independent PR

## Scope

From main at `f831c581`, add the exact OAR 0.13.3 dependency and resolved Pi 1.0
graph, preserve prior locked versions, and apply the approved D4 type-checking
policy. Align the root Node minimum to 24 for the required dependency while
retaining the existing <26 upper bound. The latest create-and-merge instruction releases the earlier LOCAL-only
publication boundary for this independent preparation slice. #476 remains
separate; its review/isolation implementation is not copied or merged here.
#473's admission commit and D's unmerged ancestry are excluded from this branch.

## Verification boundary

The new owning test exercises the real public Session API with both ambient
type environments and a strict source-error control. This was absent from the
existing policy/transport tests; it is not a provider/adapter simulation.
Dependency graph, public import/lifecycle, root typecheck, package smoke and
required repository-integrity evidence are recorded under the ignored
`.ai/harness/runs/oar-bump/` directory. Canonical diff binding is recorded below.

## Durable conclusion

See [OAR dependency preparation](../../../../docs/researches/oar-dependency-preparation.md)
for the runtime boundary, Node 24 requirement, D4's full declaration-body scope
and unchanged upstream issues. No new production abstraction or adapter was
needed. The new test file owns an independently meaningful declaration
boundary, this workstream satisfies task sync, and the research document keeps
the reusable configuration conclusion at a human reading entrypoint.

Actual CLI/provider integration and security capabilities remain separate and
unverified. No unrelated runtime, source or release-version changes; Node metadata is
aligned only to the new required package boundary.

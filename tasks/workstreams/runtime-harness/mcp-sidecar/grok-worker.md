# Workstream: Grok interactive worker (phase 1)

> **Status**: completed
> **Substantive Change SHA256**: `sha256:3c54a859f2dadca0cd9c637723b6c994d4fc85e6429d2a9bf60b10db51a7cc99`
> **Capability ID**: `runtime-harness-mcp-sidecar`
> **Functional Block**: `src/cli/mcp`
> **Matched Prefix**: `src/cli/mcp`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `mcp-sidecar`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
> **Scope Authority**: Owner request, 2026-10-02, branch `feat/grok-herdr-worker` from `9aef6693`
> **Current Slice**: completed-grok-interactive-worker-admission

## Completed scope

Grok is admitted by the MCP runner type, CLI/environment/config parser, tool
schema and admission checks. New setup, no-config runtime and doctor defaults
agree on `codex,grok`; existing operator allowlists remain unchanged and runner
enablement is still explicit. Generated guide documents interactive transport
and unverified capabilities. No task-session, Herdr transport, Generic review
or Receipt implementation changes. No main/E2/S4 worktree changes.

## Evidence

- Durable P1/P2/P3, canary commands, observations and controls:
  [Grok Herdr canary](../../../../docs/researches/grok-herdr-worker-canary.md).
- Existing MCP focused suites: 70 pass, 0 fail; existing disposable Herdr
  lifecycle suite: 6 pass, 0 fail. `bun run check:type`: exit 0.
- Hook/helper/reference projections, deploy SQL order, architecture sync,
  strict workflow, project-state inspect and init dry-run: exit 0.
- Task-sync: exact substantive diff digest above, consumed by `check-task-sync.sh`.
- Local diff review: enablement, agent allowlist and explicit-endpoint fences
  are retained; no new dependency, abstraction or test file. Two new cases in
  existing owning test files and a Grok case in the existing lifecycle fixture.

## Runtime findings and bounded follow-up

Real `grok 1.0.44` passed readiness, `agent === "grok"`, active working detection
and request-bound atomic `result_ref` writing. Herdr saw the A/B question as
`working`, not `blocked`; its blocked wait timed out. Unlisted Bash `touch`
executed under `dontAsk` on this operator installation, which imports a Claude
`bypassPermissions` default; strict deny-by-default behavior is not proven.
Read-only and resume capabilities stay `unverified`. Scratch pane was closed
and absence confirmed; final CLI version restored to 1.0.44 after its automatic
update on exit. MCP/hooks controls and overlay limitations are in the canary.

The next relevant runtime slice is to reproduce the question-dialog detection
against Herdr's Grok manifest and constrain the fix to that one dialog surface.
Before any read-only/permission capability claim, separately establish an
isolated permission-policy canary without inherited bypass configuration.
Generic review and Receipt remain phase 2 after E2 merges; no work on them is
included here. This branch is for push and Draft PR only, with no merge.

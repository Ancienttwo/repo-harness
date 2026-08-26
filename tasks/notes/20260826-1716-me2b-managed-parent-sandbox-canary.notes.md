# Implementation Notes: me2b-managed-parent-sandbox-canary

> **Status**: Active
> **Plan**: plans/plan-20260826-1716-me2b-managed-parent-sandbox-canary.md
> **Contract**: tasks/contracts/20260826-1716-me2b-managed-parent-sandbox-canary.contract.md

## Design Decisions

- The canary uses no model turn. It tests the Host sandbox directly so Provider prose cannot enter the trust path.
- The repository fixture is disposable. Existing Task, Lease, Binding, Publication, Acceptance and Git working bytes are not canary inputs or outputs.
- Static read-only denial is only a control. Admission depends on revoking an already-running Parent at a later effect boundary without process replacement.

## Open Questions

- None. The runtime is not admitted; reopening is bound to the two Host capabilities recorded in the PRD and research.

## Exact Evidence

- Executable: `/opt/homebrew/Caskroom/codex/0.149.0/bin/codex`, `sha256:f4a74117b8142cda581c95ff753abf4508b5636d89682c1ed77e4a9249af8963`.
- Read-only control: exit 1, sentinel absent, stderr digest `sha256:6520107146fe90b4f424c141da366fdf77c3e3fdb9d3f27d0606b2a1da868977`.
- Workspace-write control: exit 0, sentinel present, empty stderr digest `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Long-lived Parent: wrote before and after revocation checkpoint, exit 0, empty stderr.
- Decision: `runtime_not_admitted` for exactly `dynamic_parent_revocation_unavailable`, `parent_write_survived_revocation`, and `child_principal_at_effect_unavailable`.

## Verification Classification

- The full repository suite produced 3146 pass, 2 platform skips and one 120-second HRD-09 timeout. The exact timed-out file passed alone in 89.35 seconds, so the failure is classified as full-suite resource contention rather than an ME-2B regression.
- Re-running the Host canary from inside an already sandboxed Codex task makes both nested Seatbelt launches fail with exit 71. That nested result is not runtime-admission evidence; the decision remains bound to the earlier Host-level run above. Contract verification intentionally runs the deterministic classifier, not a nested live Host probe.
- The first architecture freeze reported `verified-flow-proof-changed` for 20 existing capabilities while this isolated worktree had no CodeGraph index. The owner approved that exact refresh boundary. After `bash scripts/ensure-codegraph.sh --init`, ArchContext recomputed the semantic classification as `mode=none`; the approved reference was not consumed because there was no semantic delta. Only deterministic generated-region proof refreshes are projected.

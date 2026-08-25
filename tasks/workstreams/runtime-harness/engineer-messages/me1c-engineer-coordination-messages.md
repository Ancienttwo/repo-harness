# Workstream: ME-1C Engineer Coordination Messages

> **Status**: blocked
> **Capability ID**: runtime-harness-engineer-messages
> **Source Plan**: plans/plan-20260825-1443-me1c-engineer-coordination-messages.md
> **Current Slice**: runtime-admission-canary

## Durable Progress

- Approved direction preserves TaskMessageV1 wire bytes and extracts only shared mechanics.
- ModuleMessageV1 owns stable Engineer/capability communication; assignment messages add exact Binding fences.
- Durable event and pending receipt precede every optional Provider transport effect.
- Provider transport and persistent Thread lifecycle remain ME-3A; Task, Lease, Decision, Interface, Publication and Acceptance remain separate authorities.

## Verification

- Focused schema/store/CLI/MCP fault matrix, Task byte goldens, typecheck, architecture/task/workflow gates, project-state inspection and init dry-run pass.
- Full suite passes 3,087 / 3,089 tests with two platform skips and zero failures after replacing the worktree-only dependency symlink with a real local install.
- Acceptance and publication are intentionally blocked until the Runtime Admission Canary proves exactly one Codex turn, lost-ack reconciliation and byte-identical Task/Lease/Fleet authorities.

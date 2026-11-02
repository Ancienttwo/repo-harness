---
schemaVersion: archcontext.adr/v1
title: Surface contract for read-only projections of core state
status: accepted
decidedAt: 2026-11-02
appliesTo:
  - capability.runtime-harness.operator
  - capability.runtime-harness.mcp-sidecar
  - capability.organization.task-fleet
---

# ADR-0002: Surface contract for read-only projections of core state

- Status: Accepted.
- Date: 2026-11-02
- Origin: #1353 (#1287 step 1d). Proposal:
  https://github.com/Ancienttwo/repo-harness/issues/1353#issuecomment-6562512130.
  Decision (rule and act classification):
  https://github.com/Ancienttwo/repo-harness/issues/1353#issuecomment-6562568049.
  Decision (ChatGPT surface deleted in #1354):
  https://github.com/Ancienttwo/repo-harness/issues/1353#issuecomment-6562820759.

## Context

#1287 splits repo-harness into a core and plugins. A surface plugin shows
core state to a person or to another agent: the operator console and MCP. The
ChatGPT surface goes away in #1354. The plugin rules of #1287 say that a plugin
reads core state, owns no authoritative data and keeps no second copy. This
ADR fixes how a surface reads.

The Fleet snapshot already reads in this way. `projectOperatorFleetSnapshot`
(`src/core/operator/fleet-snapshot.ts`) projects the core read model
`FleetBoardSnapshotV2`, refuses an unknown source version, versions its own
browser payload, keeps the source digest, drops machine-local paths and does
not classify cards again.

## Decision

A surface reads core state only as a typed projection that core owns. Each
datum has one authority, one reader and one projection.

### What a surface may read

| Datum | Authority | Projection |
|---|---|---|
| Workflow state of a repository | `resolveEffectiveStateReadOnly` → `EffectiveStateV2`, decoded by `decodeEffectiveState` (`src/core/state/types.ts`) | `CompactEffectiveState` (`src/cli/mcp/state-tools.ts`) |
| Fleet board | `collectFleetBoard` (`src/effects/fleet/board.ts`) → `FleetBoardSnapshotV2`, decoded by `decodeFleetBoardSnapshot` (`src/core/fleet/board.ts`) | `OperatorFleetSnapshotV1` (`src/core/operator/fleet-snapshot.ts`) |
| Merge readiness of one pull request | `collectPullRequestMergeReadiness` → `PullRequestReadinessV2` (`src/core/publication/merge-readiness.ts`) | the same type |
| Registered repositories and access mode | `readRepoHarnessRegistryStrictSnapshot` (`src/effects/repo-registry.ts`) | registry entries without absolute paths |
| Check and assessment records | no surface reader yet | to define in a later decision (#1353 S3) |
| Acceptance receipts | the Review contract (#1287 step 1c) | through that contract |

These are plugin state, not core state, and this contract does not cover
them: task-agent sessions and Herdr panes, the architecture map and history,
Dev Activity and CI test artifacts that the operator collects. A surface
reads plugin state only through the contract of the plugin that owns it.

### Versions

- Each projection has an integer `protocol` and a literal `kind`.
- Core gives one decoder for each projection that crosses a process or HTTP
  boundary. The decoder checks `protocol` and `kind` first and refuses an
  unknown pair.
- On a refusal the surface shows that datum as unavailable. It does not read
  raw files instead, keep the last good copy, or map the fields that it knows.
  Other data still show.
- Any change of shape gives a new protocol. Core serves one protocol for each
  datum, and the same change updates every surface in this repository.
- The version of a surface payload is separate from the version of its
  source. The payload carries the source digest when the source has one.
- When plugins get a manifest (#1287 phase 2), the manifest names the `kind`
  and `protocol` pairs that the plugin reads, and core refuses to enable a
  plugin on a mismatch.

The Event contract (`repo-harness.bot-event/v1`,
`assets/herdr/webhook-notify/bot-event.mjs`) is the sibling contract. An
event is a pushed notice that the reader checks again at the source. A
projection is pulled state. Both use a versioned envelope and one decoder in
core that refuses the first invalid field.

### What a surface never does

1. Write core state: `.ai/harness/**` state and evidence, the registry, task
   state and publication records.
2. Keep a second authority. A display copy holds its observation time and the
   source digest. Core and other surfaces never read it back, and it is never
   stored under `.ai/`. A plugin-owned cache of provider data under the
   repo-harness home is display data only.
3. Parse a core file itself. A surface uses the decoder.
4. Derive a value again: classify, count or infer attention from labels.
5. Import the internals of another plugin, for example `src/effects/terminal/*`
   or `src/effects/architecture/*`.

### Acts

An act changes state, so it is outside this contract. Operator POST routes,
the MCP `publication_merge` tool and the MCP write tools are acts. Each act
calls a core command. `worktrees_cleanup` deletes worktrees, so it must call
the core worktree command, not raw git. #1287 step 1e checks this.

## Consequences

- `decodeFleetBoardSnapshot` replaces the inline protocol check in
  `projectOperatorFleetSnapshot`, and it also refuses another `kind`.
- A contract module (`src/core/surface/`) and a shared error type come with
  step 1e, when the import rule has more than one consumer.
- The MCP readiness tool does not decode: it gets a typed value in the same
  process, so no boundary exists.
- Known reads that break this rule, at the time of this decision: operator
  task execution state imports `src/effects/terminal/*` (#1353 S4, after 1c);
  MCP `harness_status` has no version, `list_workflow_files` and
  `read_workflow_file` return raw `.ai/harness/*` files, and `latest_checks`
  orders evidence by file time (#1353 S3). The MCP planner write tools and the
  ChatGPT bridge are deleted in #1354.

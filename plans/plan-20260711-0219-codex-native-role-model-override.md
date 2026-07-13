# Plan: Codex native-role model override

> **Status**: Blocked
> **Created**: 20260711-0219
> **Slug**: codex-native-role-model-override
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused fleet/advisor regression tests, root required checks, installed-host inspection, and a real native-subagent canary.
> **Rollback Surface**: Revert this branch and reinstall the prior fleet definitions.
> **Task Contract**: `tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md`
> **Task Review**: `tasks/reviews/20260711-0219-codex-native-role-model-override.review.md`
> **Implementation Notes**: `tasks/notes/20260711-0219-codex-native-role-model-override.notes.md`

## Agentic Routing

- Selected route: sequential bug hunt with an isolated upstream-source research pass
- Routing reason: the native runtime contract had to be proven before installer changes could be accepted.
- Due diligence:
  - P1 map: GPT-5.6 selects MultiAgentV2 from the Codex model catalog; its reserved flat `spawn_agent` schema carries `task_name/message/fork_turns`, while `[agents.<name>]` TOML registration belongs to the separate role-aware `agent_type` surface.
  - P2 trace: advisor requests a worker -> flat V2 spawn emits only `task_name` -> Codex creates `/root/<task_name>` with `agent_role:null` -> child inherits the parent Sol/xhigh model and effort.
  - P3 decision rationale: the same-name TOML hypothesis was falsified in a real canary. The candidate installer changes were rolled back rather than shipping configuration that passes file tests but cannot affect GPT-5.6 V2 runtime behavior.

## Approach

1. Capture the initial namespace-mismatch hypothesis and a failing regression guard.
2. Install same-name role TOMLs and run native V2 canaries with plain files, explicit `[agents.worker]` registration, and `use_agent_identity`.
3. Trace oh-my-openagent v4.16.2/v4.16.3 model-catalog guards, agent registration, and V2 team transport from source.
4. Falsify the candidate design, restore repo and host fleet state, and stop at the platform capability boundary.

## Model Matrix

| Role | Model | Effort | Boundary |
|---|---|---|---|
| Main orchestrator | `gpt-5.6-sol` | `xhigh` | Existing user-level session default; unchanged |
| `explorer` | `gpt-5.6-terra` | `medium` | Read-heavy mapping; read-only |
| `worker` | `gpt-5.6-terra` | `xhigh` | Isolated implementation slices |
| `reviewer` | `gpt-5.6-sol` | `high` | Correctness/security/regression review; read-only |

## Scope

- In scope: Codex role definitions, fleet installation/inspection, advisor alignment, downstream policy/docs parity, regression tests, workflow artifacts, and local installed-state canary.
- Out of scope: Claude role renames, delegation trigger semantics, alternate runners, provider changes, recursive subagents, telemetry, and model-dashboard integration.

## Task Breakdown

- [x] Capture a failing pre-fix regression guard.
- [x] Run plain-file, registered-role, identity-enabled, and metadata-schema native canaries.
- [x] Trace oh-my-openagent GPT-5.6 orchestration from tagged source.
- [x] Restore the repo diff and the prior local managed fleet.
- [x] Fail closed without commit or merge after the runtime falsifier triggered.

## Blocker

Current GPT-5.6 MultiAgentV2 cannot satisfy all three required invariants at once: native flat subagents, a Sol/xhigh root, and a Terra/xhigh worker. Achieving per-role model selection now requires either a future Codex V2 schema that safely exposes role/model metadata or an explicitly approved non-native runner; both are outside this plan.

> **Archived**: 2026-08-26 07:03
> **Related Plan**: plans/archive/plan-20260826-0257-me2a-me3b-readonly-delegation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-0703

# Implementation Notes: me2a-me3b-readonly-delegation

> **Status**: Active
> **Plan**: plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md
> **Contract**: tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md
> **Review**: tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md
> **Last Updated**: 2026-08-26 02:58
> **Lifecycle**: notes

## Design Decisions

- Native `SubagentStart` role/model/config observations remain useful identity evidence but its `sandbox_mode` is configuration-derived and cannot admit read-only execution.
- The first supported runtime is a one-shot Codex CLI effect with exact `--sandbox read-only --ephemeral --ignore-user-config --json` argv, frozen executable/version/profile/capability bytes and protected-path snapshots.
- `DelegationRoleProfileV1` is a logical profile projection. The adapter must not state or imply that Provider-native `agent_type` selected it.
- Lost acknowledgement is at-most-once: after launch claim the adapter never starts another process; unknown outcomes become `reconciliation_required`.
- WorkerResult is untrusted evidence and has no mutation edge to Task, Lease, Publication or Acceptance.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Native child with TOML `sandbox_mode` | Reject for P0 | Real explorer canary created the sentinel, so the declaration is not effective permission evidence. |
| One-shot Codex CLI read-only subprocess | Use | Real Seatbelt canary denied the same mutation and exposed a bounded Provider-owned effect without a new runtime loop. |
| Generic Worker Host/daemon | Reject | No observed need; duplicates Provider scheduling, conversation and recovery authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Native canary: main `03db824da319ece33155fcca1e08303da5751d36`; exact `touch .me2a-native-readonly-canary` exited 0 and created the file; controlled sentinel removed afterward.
- Codex CLI canary: the historical `0.147.0` probe established denial feasibility. The production `0.149.0` contract resolves Codex from Host PATH and freezes its realpath/version/bytes, but does not invoke a model for capability proof. Exact `codex sandbox --permission-profile :read-only --include-managed-config ... /usr/bin/touch` must exit 1 with the exact two denied sentinel paths and unchanged snapshots; failed proof attempts retain a process receipt but cannot publish capability.
- Implementation readback (2026-08-26): `bun src/cli/index.ts delegation capability --input <bounded-input> --format json` completed on the real Host with `codex-cli 0.149.0`, capability `sha256:f1981b75d3c11bda1edd96e96bed0b9b0c5ae22970dd842381a2f5f4a412974a`, process receipt `sha256:7b7eb995778ffb3edb583d2bbbfd1ba8dc4a5e421d6103a38ba6571bf5f931f9`, identical before/after snapshot `sha256:9d8e8e2289cbdb35fbb9c9910a5448c637434e35673782c895bf1996ba5dfdd0`, and no sentinel residue. The temporary CLI input was removed after readback.
- Architecture acceptance (2026-08-26): ArchContext classified P1 and P2 as `proven` with selectors `4/4`. Human event `event.user-approval-20260825-me1b-through-me2b` accepted `changeset.docs-projection-c78a52213ee113d1` for `node-added,relation-changed` across `capability.runtime-harness.delegated-runs` and `capability.runtime-harness.engineer-bindings`; projection receipt `sha256:e4ec883e93a00eb0232e6b66a0e218190d3ac408b385a0e315825b4785a461a0` was applied as `accepted-semantic-delta`.
- Final verification (2026-08-26): focused delegation 11/11, architecture inventory 7/7, installed-copy 13/13, system-Python runtime smoke 14/14, typecheck and every required repository gate passed. The final unsandboxed full suite reached 3,122 pass and two platform skips; its only failure was the unrelated Homebrew `python3` startup timeout in the runtime-smoke probe, whose exact test file passed completely with `/usr/bin/python3`.
- Test isolation: the fake Codex capability probe now runs through the real bounded CLI in a child with its own `PATH`. This removes process-global `PATH` mutation that could race another Bun test file while preserving the production rule that callers cannot inject an executable.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

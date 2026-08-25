> **Archived**: 2026-08-26 01:09
> **Related Plan**: plans/archive/plan-20260825-2339-me1b-engineering-overlay.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-0109

# Implementation Notes: me1b-engineering-overlay

> **Status**: Active
> **Plan**: plans/plan-20260825-2339-me1b-engineering-overlay.md
> **Contract**: tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md
> **Review**: tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md
> **Last Updated**: 2026-08-25 23:39
> **Lifecycle**: notes

## Design Decisions

- ME-1B 是独立 read model，不是 `HumanControlSnapshot` 或 Fleet cache。Planning Graph、Fleet Board、Engineering Overlay、Organization Attention 保持不同 schema 与 authority。
- 每个 Profile/Binding/Claim/message/Provider component 读取两次；任一 authority unreadable 输出 `degraded`，任一 digest 改变输出 `changed_during_read`。输出使用第二次完整 observation，不拼接 mixed generation。
- Registry 是枚举与 repository identity authority，因此使用既有 strict reader，并把 exact registry bytes digest 写入 `registry_revision`；malformed registry 直接 typed failure，不走 legacy empty-registry fallback。
- Delegation 与 memory 在 owning PRD 交付前固定为 `unsupported`；ME-1B 不从 Session、Worker 或本地启发式规则推导它们。
- ArchContext 的 injected effect reads 无法由静态 call selector 证明；P2 flow 只声明可静态证明的 closed-schema projection/validation path，authority reads 由 P1 relations 与 deterministic tests 覆盖，不为工具证明增加 production wrapper。

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Composite Human Control snapshot | Rejected | 会制造新的 join/caching authority；最小批准只需要独立 CLI/JSON views。 |
| 普通 registry reader | Rejected | 其 legacy malformed-to-empty 语义会把丢失 authority 伪装成 unregistered repository。 |
| Strict registry reader + exact digest | Selected | 复用现有单一 parser，fail closed，并让 snapshot 明确绑定 enumeration authority bytes。 |
| 为 ArchContext 新增 direct-call wrapper | Rejected | 只为静态证明改变 production call shape 没有产品价值；缩窄 flow 到真实且可证明的 projection boundary。 |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused behavior/type gate: `bun test tests/unit/me1b-engineering-overlay.test.ts tests/cli/engineer.test.ts tests/cli/sprint.test.ts --timeout 60000` (`11 pass`, `0 fail`) and `bun run check:type`.
- Complete repository gate: `bun test --timeout 60000` (`3104 pass`, `2 platform skips`, `0 fail`; 3106 tests across 252 files).
- Root required checks: deploy SQL order, architecture sync (`blocking=0`, `dead_letters=0`), task sync, strict workflow, project-state inspection and init dry-run all passed after the final code/docs projection.
- Architecture projection: P1/P2 `proven`, selectors `3/3`; Human acceptance event `event.user-approval-20260825-me1b-through-me2b` accepted the `entrypoint-changed,verified-flow-proof-changed` delta for `capability.runtime-harness.engineering-overlay`, followed by a no-delta manifest restamp.
- Inventory gates: `tests/architecture-projection-e2e.test.ts` and `tests/capability-archcontext-export.test.ts` bind 16 capability/component nodes, 25 relations, 18 required flows and 22 projection targets.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

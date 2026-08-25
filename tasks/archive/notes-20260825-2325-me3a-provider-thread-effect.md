> **Archived**: 2026-08-25 23:25
> **Related Plan**: plans/archive/plan-20260825-2120-me3a-provider-thread-effect.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260825-2325

# Implementation Notes: me3a-provider-thread-effect

> **Status**: Active
> **Plan**: plans/plan-20260825-2120-me3a-provider-thread-effect.md
> **Contract**: tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md
> **Review**: tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md
> **Last Updated**: 2026-08-25 22:06
> **Lifecycle**: notes

## Design Decisions

- `effect_started` 表示 host action 已被 admission，而非证明 Provider 已执行；它必须在 action 返回前持久化。进程在两者之间崩溃时会保守进入 reconcile-only，牺牲自动恢复以换取 zero duplicate turn。
- Codex positive correlation 固定为 `host_id + provider_thread_id + provider_turn_id + provider_user_message_id + provider_assistant_message_id`，并同时绑定 ME-1C `message_event_digest`；缺一不可成功。
- Provider capability 是 operator-recorded observation，不由 CLI presence、文档或 adapter 名称推断；restricted Engineer MCP 只能读取 capability/effect current。
- `start` 在 `intent_persisted -> effect_started` 之前重新读取 ME-1C event/receipt，并要求 exact event digest、`pending` state 和同一 delivery attempt；prepare 与 action admission 之间已有其他权威 delivery 时不再发出 host action。
- Human architecture acceptance 固定为 `changeset.docs-projection-f646e47931537512` / `event.user-approval-20260825-control-plane-me3a`，覆盖 engineer-bindings、engineer-messages、engineer-scheduling、mcp-sidecar 和 provider-thread-effects。最终 ArchContext classification 为 `accepted-semantic-delta`，projection receipt `sha256:1bed1ee91abd479c6938eae1d887e2a7dcb324b7dfb876b502a5015eb4f3771a`；队列重放 `job-03beaeb459a7f3acd00510df` 成功且 dead-letter 清零。

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| repo-harness 直接调用 Codex/App Server | Rejected | host 已拥有 runtime 与 secret/stream lifecycle；在 repo 中实现会形成第二 Provider runtime |
| start 后自动 retry | Rejected | acknowledgement loss 无法区分 effect 未发生与已发生；blind retry 会产生 duplicate turn |
| immutable journal + deterministic current projection | Selected | 保留可审计 intent/observation chain，并能在 event fsync 后、current publication 前崩溃时恢复 |
| linked worktree 无 CodeGraph index 时继续接受全仓 unprovable | Rejected | primary 已显式 opt in `.codegraph`；在当前 worktree 重建 index 后，ME-3A P1/P2 selector 才能收敛为 provider-thread-effects 单一能力的可证明变化 |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused behavior gate: `bun run check:type && bun test tests/unit/me3a-provider-thread-effect.test.ts tests/unit/me1c-module-inbox.test.ts tests/cli/engineer.test.ts tests/cli/mcp-engineer-tools.test.ts --timeout 60000` (`15 pass`, `0 fail`)
- Closed inventory gates: `tests/architecture-projection-e2e.test.ts`, `tests/capability-archcontext-export.test.ts` and the Engineer OAuth E2E now bind 15 capabilities, 21 projection targets and the exact eight restricted Engineer tools.
- Complete repository gate: `bun test --timeout 60000` (`3097 pass`, `2 platform skips`, `0 fail`; 3099 tests across 250 files).
- Change Assessment routes the three new/extended core-effect paths through the already-executed deterministic suite and real git-common-dir runtime readback; no semantic reviewer replacement or fallback evidence was added.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

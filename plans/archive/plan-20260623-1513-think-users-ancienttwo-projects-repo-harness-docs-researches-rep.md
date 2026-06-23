# Plan: think 你研究一下：/Users/ancienttwo/Projects/repo-harness/docs/researches/repo-harness 钩子时延与 LLM 提供商限流

> **Status**: Archived
> **Created**: 20260623-1513
> **Slug**: think-users-ancienttwo-projects-repo-harness-docs-researches-rep
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: think 你研究一下：/Users/ancienttwo/Projects/repo-harness/docs/researches/repo-harness 钩子时延与 LLM 提供商限流
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md`
> **Task Review**: `tasks/reviews/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.review.md`
> **Implementation Notes**: `tasks/notes/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: think 你研究一下：/Users/ancienttwo/Projects/repo-harness/docs/researches/repo-harness 钩子时延与 LLM 提供商限流
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.md`
- Sprint contract: `tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md`
- Sprint review: `tasks/reviews/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.review.md`
- Implementation notes: `tasks/notes/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md`
- Review file: `tasks/reviews/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.review.md`
- Implementation notes file: `tasks/notes/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.contract.md`, `tasks/reviews/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.review.md`, and `tasks/notes/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260623-1513-think-users-ancienttwo-projects-repo-harness-docs-researches-rep.md`; after execution revert branch `codex/think-users-ancienttwo-projects-repo-harness-docs-researches-rep` or the generated task artifacts

## Captured Planning Output

## Goal
把 `docs/researches/repo-harness 钩子时延与 LLM 提供商限流归因研究报告.md` 转成可执行的诊断计划：用当前 repo-harness hook runtime 和真实 provider 请求证据区分“本地同步 hook 开销”与“LLM provider 限流/服务波动”，并只在证据指向本地 hot path 时进入最小实现优化。

## Success Criteria
- 明确给出本地 hook 时间、provider HTTP 时间、网络/代理时间三者的测量边界。
- 用同一台机器、同一 repo、同一类 payload 的 hook-only / hook-on / hook-off / provider-direct A/B 数据完成归因。
- 若本地 hook 是主因，定位到具体 event.route 和具体脚本，而不是笼统归咎 repo-harness。
- 若 provider 是主因，保留 repo-harness 不改动，并把后续动作限定到 provider client 层限流、退避或账户额度排查。
- 任意代码改动都必须有窄测试、typecheck、workflow check 和 rollback 面；没有证据不做实现。

## Scope
- In scope: `src/cli/hook/runtime.ts` 的 hook dispatch 计时面、`src/cli/hook/route-registry.ts` 的 route 边界、`assets/hooks/` 与 `.ai/hooks/` 的实际脚本来源、`docs/reference-configs/hook-operations.md` 的诊断文档、`docs/researches/` 的研究结论落地、必要的本地 benchmark/runbook 脚本或文档。
- In scope: 只读测量 payload、hook-only 回放、hook-on/off A/B、provider direct timing 命令设计。
- Out of scope: 全局禁用用户 hook、修改 `~/.codex/hooks.json` 或 `~/.claude/settings.json`、重写 hook runtime 为 async、在 repo-harness 内实现 provider SDK 限流器、提交 API key 或真实 provider 请求体、改动 `_ops/`。

## Constraints
- 遵守 repo-harness 本地规则：中文汇报，先证据后结论，`tasks/current.md` 只是派生 read model。
- hook source 是 central-first/runtime referenced；诊断前必须确认实际运行的是 packaged `assets/hooks/`、repo `.ai/hooks/`，还是用户级 installed copy。
- 不把 README/product loop 叙事当 runtime truth；runtime truth 以 `route-registry.ts`、`runtime.ts`、实际 hook source 和命令输出为准。
- Provider 状态和 rate limit 是时间敏感事实；需要 live header/timing 或状态页证据，不能只靠旧研究报告。
- 任何新增日志不得记录 prompt、file content、secret、provider request body 或本机绝对路径标签。

## P1 Architecture Map
- Components: host adapter (`Codex`/`Claude`) -> `repo-harness-hook` bin -> `runHook()` -> `resolveHooksDir()` -> `route-registry.ts` route -> shell scripts under resolved hooks dir -> host returns to model/provider request path.
- Strong dependencies: `src/cli/hook/runtime.ts`, `src/cli/hook/route-registry.ts`, `assets/hooks/`, `.ai/hooks/`, `.ai/harness/workflow-contract.json`, `docs/reference-configs/hook-operations.md`.
- Weak/external dependencies: installed global hook copy, Bun startup cost, shell tools (`bash`, `git`, `jq`/Bun fallback), filesystem speed, provider APIs, network/proxy.
- Runtime entrypoints: `repo-harness-hook SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop --route <id>` and host-managed hook adapter invocations.
- Authoritative verification: hook replay timings, `git status`, `repo-harness-hook` output, `bun test tests/hook-runtime.test.ts`, `bun run check:type`, workflow checks.
- Out of scope boundary: LLM provider SDK implementation and account quota management live outside repo-harness unless another repo owns that client.

## P2 Concrete Trace
- Local hook trace: host emits event JSON -> `repo-harness-hook` reads stdin -> `runHook()` resolves repo root with `git rev-parse` -> checks opt-in workflow contract -> resolves hooks dir -> looks up event.route -> executes route scripts serially via `spawnSync('bash', ...)` -> each script may call `git`/`jq`/`find`/`wc`/`tail`/Bun -> hook returns exit status to host.
- Provider trace: only after hook returns does the host continue to model/provider HTTP -> DNS/connect/TLS -> API TTFB -> possible 429/503/Retry-After/backoff -> model response.
- Pressure point: “Agent 慢”不能直接归因；必须先测 hook wall time 和 provider timing，否则会混淆本地同步 shell 子进程与远端限流/排队。
- Error paths: hook non-opt-in fast return、script timeout/nonzero exit、provider 429/503、network/proxy connect/TLS delay、payload capture缺失。

## P3 Decision Rationale
- 当前同步 hook 设计可能是为了 deterministic guard、shell portability 和 fail-closed/fail-open policy 的清晰边界；不能用大规模 async rewrite 作为第一刀。
- 必须保留的 invariant: hook gating 不读取 repo 外内容，不泄露正文/secret，不改变 provider 请求语义，不让诊断日志成为新的热路径或隐私面。
- Tradeoff: 第一阶段先测量，必要时只加 env-gated per-script latency/timeout；优化必须由测量结果驱动。
- 10x scale: 如果工具调用量和 subagent 并发放大，`PostToolUse.always`、trace rotation、重复 `jq`/`git` 子进程和 SessionStart context assembly 会先成为瓶颈；provider 侧则会先表现为 429/503/backoff。
- Smallest coherent change: 先补诊断可观测性和 runbook，不动行为；只有 hook-only 数据证明本地慢点时才改一个脚本或 runtime 计时面。

## Fragile Assumptions
- 研究报告里的外部 provider 状态可能已过期，需要 live verification。
- 实际 hook source 可能不是当前 repo `.ai/hooks/`，需要 `resolveHooksDir()` 读回或 installed copy readback。
- 没有真实 host payload 时，人工 payload 只能做近似 benchmark，不能证明真实会话时延。
- macOS/Linux 的 `time`、`strace`、`perf` 工具可用性不同；计划必须允许降级到 `/usr/bin/time` 和 shell loop。

## Rejected Alternatives
- 直接禁用 repo-harness hooks：会破坏 workflow contract，且不能解释 provider 慢。
- 直接重写 hook runtime 为 async：改动大，风险高，且未证明 bottleneck。
- 直接把结论归因给 provider：没有 header/timing/429/503 证据前不成立。
- 在 repo-harness 内加入 provider rate limiter：边界错误，除非 repo-harness 本身成为 provider client。

## Public API, Config, and File Interface Changes
- Phase 0/1 default: no product API change;只新增或更新诊断文档/计划和本地 benchmark evidence。
- If implemented after evidence: `src/cli/hook/runtime.ts` may add env-gated stderr diagnostics such as `REPO_HARNESS_HOOK_SLOW_MS` and `REPO_HARNESS_HOOK_TIMEOUT_MS`; default behavior must preserve existing hook routing and exit semantics.
- If benchmark script is added: it must live under `scripts/` or docs runbook, accept repo-local payload paths, and never require API keys.
- Any runtime metrics/logs must avoid file bodies, prompt content, secrets, raw provider request body, and absolute-path labels.

## External Dependencies and Secrets
- No new package dependency is required for the diagnosis plan.
- Optional local tools: `/usr/bin/time` is baseline; `hyperfine`, `strace`, `perf`, `py-spy`, `tcpdump` are optional diagnostics, not required CI dependencies.
- Provider tests require user-owned env vars such as `OPENAI_API_KEY` only in local shell; no secret may be read from or written to tracked files.

## Verification Plan
- Confirm actual hook source and route surface: inspect `src/cli/hook/runtime.ts`, `src/cli/hook/route-registry.ts`, resolved hook dir, and `assets/hooks/`/`.ai/hooks/` parity where relevant.
- Capture or synthesize minimal event payloads for `SessionStart.default`, `PreToolUse.edit`, `PostToolUse.edit`, `PostToolUse.always`, and `PostToolUse.bash`.
- Run hook-only timing with `/usr/bin/time` across repeated samples and record p50/p95.
- Run hook-on/off A/B only in an isolated copy/worktree so production workflow config is not mutated.
- Run provider direct timing only when an API key is already available in shell and never log request/response bodies.
- If code changes are made later: run `bun test tests/hook-runtime.test.ts`, `bun run check:type`, `bash scripts/check-task-sync.sh`, and `bash scripts/check-task-workflow.sh --strict`.

## Rollback and Failure Handling
- Draft-only capture rollback: remove the generated `plans/plan-*.md` if the planning artifact is superseded before execution.
- Runtime instrumentation rollback: revert the single runtime commit; env-gated diagnostics can be disabled by unsetting the new vars or setting a very high threshold.
- Benchmark script rollback: delete the script and docs references; no data migration exists.
- Provider test failure handling: classify as external/network/provider evidence; do not mutate repo-harness code to mask provider errors.

## Phase Independence
- Phase A: Evidence capture only. No runtime changes.
- Phase B: Add per-script latency/timeout instrumentation only if Phase A cannot identify script-level bottlenecks.
- Phase C: Optimize exactly one measured local hot path, such as SessionStart cold path, repeated JSON parsing, or trace rotation.
- Phase D: If provider-bound, stop repo changes and hand off to provider client/account quota/runbook work.

## Task Breakdown
- [ ] Confirm actual installed/resolved hook source and route list for this repo.
- [ ] Prepare safe replay payloads for the hot events without recording secrets or prompt bodies.
- [ ] Measure hook-only wall/user/sys time for SessionStart, edit pre/post, bash post, and always post routes.
- [ ] Run hook-on versus hook-off A/B in an isolated copy or worktree.
- [ ] Run provider direct timing only with user-provided local env keys and redact all request/response content.
- [ ] Classify root cause as local hook, filesystem, provider, network/proxy, or mixed using recorded evidence.
- [ ] If local hook is proven, implement one smallest measured optimization or env-gated latency instrumentation.
- [ ] Update research/runbook/notes with evidence and exact rollback surface.
- [ ] Run the narrow hook tests, typecheck, task sync, and strict workflow checks for any implementation diff.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Confirm actual installed/resolved hook source and route list for this repo.
- [ ] Prepare safe replay payloads for the hot events without recording secrets or prompt bodies.
- [ ] Measure hook-only wall/user/sys time for SessionStart, edit pre/post, bash post, and always post routes.
- [ ] Run hook-on versus hook-off A/B in an isolated copy or worktree.
- [ ] Run provider direct timing only with user-provided local env keys and redact all request/response content.
- [ ] Classify root cause as local hook, filesystem, provider, network/proxy, or mixed using recorded evidence.
- [ ] If local hook is proven, implement one smallest measured optimization or env-gated latency instrumentation.
- [ ] Update research/runbook/notes with evidence and exact rollback surface.
- [ ] Run the narrow hook tests, typecheck, task sync, and strict workflow checks for any implementation diff.

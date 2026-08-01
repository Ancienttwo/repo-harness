# Plan: Codex delegation runner: App Thread dispatch default, native spawn fallback

> **Status**: Executing
> **Created**: 20260802-0309
> **Slug**: codex-app-thread-dispatch
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260802-0309-codex-app-thread-dispatch.md`; after execution revert branch `codex/codex-app-thread-dispatch` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md`
> **Task Review**: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`
> **Implementation Notes**: `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260802-0309-codex-app-thread-dispatch.md`
- Sprint contract: `tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md`
- Sprint review: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`
- Implementation notes: `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260802-0309-codex-app-thread-dispatch.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260802-0309-codex-app-thread-dispatch.md`.

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
- Contract file: `tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md`
- Review file: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`
- Implementation notes file: `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260802-0309-codex-app-thread-dispatch.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260802-0309-codex-app-thread-dispatch.md`; after execution revert branch `codex/codex-app-thread-dispatch` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260802-0309-codex-app-thread-dispatch.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md`, `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`, and `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260802-0309-codex-app-thread-dispatch.md`; after execution revert branch `codex/codex-app-thread-dispatch` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Flip the Codex-side delegated-runner preference from native MultiAgentV2 `spawn_agent` to Codex App Thread dispatch (`codex_app__create_thread` with the role's exact model and reasoning effort), so per-role model routing actually holds. The native V2 flat spawn schema carries only `task_name/message/fork_turns` and cannot select Luna: a fast-worker dispatch silently inherits the parent model (falsified canary recorded in `plans/plan-20260711-0219-codex-native-role-model-override.md:52-54`, Status: Blocked). App Thread creation accepts an explicit `model` + `thinking` per thread, which is the only Codex surface that can honor `fast-worker = gpt-5.6-luna/max`. Native spawn demotes to an evidence-gated declared fallback; the existing codex-exec → main-thread degradation ladder on the SAME contract is unchanged.

## Source

External reference: `zjp1997720/zhijian-skills` skill `codex-model-routing-team` (README.zh-CN.md plus `references/{surface-selection-policy,routing-policy,thread-lifecycle}.md`, fetched 2026-08-02). Adopt its mechanism only — App-Thread-first dispatch with explicit model/thinking, thread materialization and archive gates, pre-declared fallback chains, requested-vs-observed model separation. Do NOT adopt its model roster or caps: this repo keeps its own fleet mapping (`fast-worker` → luna/max, `deep-worker`/`gatekeeper` → terra/xhigh via `AGENT_TARGET_OVERRIDES` in `scripts/install-agent-fleet.sh`) and its own tighter caps (`delegation.max_agents=2`, `strict_max_agents=3`, `max_depth=1`). User approved implementation in-session on 2026-08-02.

## P1 map

- `.ai/harness/policy.json#delegation` (lines ~212-225): `preferred_runners`, `runner_rule`, `rule` — the machine-readable runner authority (self-hosted hand-authored; no assets seed, `defaultPolicy()` in `src/core/adoption/standard-plan.ts` has no delegation key).
- `src/cli/hook/subagent-handler.ts`: `runDelegationAdvisor()` (:247-371) — `sharedRules` (:316-332) with the `fork_turns="none" on spawn_agent` rule (:325) and the runner-preference sentence naming `spawn_agent` (:351). `SubagentStart` evidence path (:456-636) is runner-agnostic and stays untouched.
- `src/cli/hook/session-context.ts`: `codexDelegationAutoContext()` (:1307-1322) — duplicate standing-authorization copy of the `fork_turns="none" on spawn_agent` wording.
- `docs/reference-configs/external-tooling.md` + `assets/reference-configs/external-tooling.md` (byte-identical pair): `.md -> .toml` mapping section (:433-481) and the configuration-readiness vs runtime-routing-readiness split (:518-538).
- Tests pinning behavior: `tests/subagent-handler.test.ts:180,188`; `tests/session-context.test.ts:482-483`.
- Untouched but load-bearing context: `scripts/install-agent-fleet.sh` model maps, `.codex/agents/*.toml` fixtures, `scripts/check-agent-tooling.sh` `native_role_routing` aggregation, EXECUTION_BOUNDARY byte-parity across the four delegated-runner surfaces (`src/cli/mcp/tools.ts:602-605`).
- No thread-based path exists anywhere yet (repo-wide grep for `create_thread`/`App Thread`: zero hits) — this is greenfield wording/policy work, no code spawns anything itself.

## P2 trace

Current path: UserPromptSubmit delegation trigger → `runDelegationAdvisor` reads `policy.json#delegation` → emits "Native subagent (spawn_agent) is the preferred parallelism accelerator..." (subagent-handler.ts:351) + `fork_turns` rule (:325); on `delegation.mode=auto`, SessionStart injects the same spawn_agent wording (session-context.ts:1311-1321). The Codex orchestrator then calls flat V2 `spawn_agent`; the child materializes with `agent_role: null` and inherits the parent model, so luna roles never run on luna. SubagentStart evidence records the mismatch after the fact. Pressure point: the advisor/policy layer names the wrong preferred runner; everything downstream is faithful to it.

## P3 decision

The advisor/policy layer is guidance to the Codex orchestrator, not spawning code, so the fix is re-pointing the preferred runner and encoding the thread protocol in the same authoritative surfaces, preserving four invariants:

1. **No model-ID literals under `src/`** — the advisor references "the role's installed `~/.codex/agents/<role>.toml`" for model/effort; `scripts/install-agent-fleet.sh` stays the single model-mapping authority.
2. **Evidence discipline unchanged** — `SubagentStart`-based `native_role_routing` evidence stays scoped to the native fallback path; a genuinely absent canary remains advisory `unverified`, so `check-agent-tooling.sh --strict-readiness` semantics do not change. Thread-path model claims are verified by official thread reads (requested vs observed model recorded separately), never assumed from the create call.
3. **EXECUTION_BOUNDARY byte parity** across contract-run worker prompt, delegation advisor hook, subagent start context, and MCP codex-goal is untouched.
4. **Fail-closed fallback** — a role whose exact model/effort the native live spawn schema does not accept must NOT fall back to native spawn (that silently inherits the parent model — a semantic fallback); it degrades to codex-exec, then sequential main-thread, on the SAME contract, with the degradation recorded in the contract-run manifest.

Rejected alternative: porting the skill's RoutePlan/ledger Python validators — new machinery with no second consumer; the repo's contract + manifest + delegation state file already carry the audit surface.

## In scope

- `.ai/harness/policy.json#delegation`:
  - `preferred_runners` → `["subagent", "codex-app-thread", "codex-subagent", "codex-exec", "main-thread"]`.
  - `runner_rule` → rewrite: the active task contract stays the authoritative brief; per host the preferred accelerator is native subagent (Claude host) or Codex App Thread via `codex_app__create_thread` (Codex host) created with the role's exact `model` and reasoning effort from the installed `~/.codex/agents/<role>.toml`; native codex-subagent (`spawn_agent`) is a declared fallback only when the App Thread tools are unavailable AND the live spawn schema accepts the role's exact model/effort combination; otherwise degrade to codex-exec, then sequential main-thread, on the SAME contract; degradation is recorded, never silent.
  - `rule` prose: touch only if it names spawn semantics that contradict the above.
- `src/cli/hook/subagent-handler.ts` (`runDelegationAdvisor` only):
  - Replace the :351 runner sentence: Codex App Thread (`codex_app__create_thread`) is the preferred parallelism accelerator that consumes the contract brief — one thread per bounded workstream, passing the role's exact `model` and reasoning effort from the installed `~/.codex/agents/<role>.toml` and inlining that TOML's developer_instructions plus the contract brief as the thread's first message. Native `spawn_agent` is the declared fallback only under the fail-closed condition above; keep the existing degradation-recording sentence.
  - Scope the :325 rule to the native fallback path ("On the native spawn_agent fallback, pass fork_turns=\"none\"...").
  - Add compact thread-lifecycle rules to `sharedRules`: unique task id per creation attempt; a `pendingWorktreeId` is not a thread id — confirm materialization via an official thread read before counting the worker as running; record requested vs observed runtime model separately and treat unverified model claims as unverified; adopt results only after reading the thread's final turn; archive completed threads one at a time; thread workers must not create further threads, agents, or background tasks.
  - Keep the existing "role labels describe responsibilities only" caveat and extend it to the thread path.
- `src/cli/hook/session-context.ts` `codexDelegationAutoContext()`: rewrite the standing-authorization block thread-first with the same fail-closed native-fallback wording; keep the `# Delegation Standing Authorization` header and the `spawn no more than ${maxAgents}` phrasing (valid for both surfaces) to minimize test churn.
- `docs/reference-configs/external-tooling.md` + `assets/reference-configs/external-tooling.md` (kept byte-identical): update the `.md -> .toml` mapping runtime-claims paragraph and the readiness-split section — role TOMLs now feed BOTH surfaces (native `agent_type` selection and App Thread dispatch projection); native MultiAgentV2 cannot carry Luna; App Thread is the default Codex dispatch path; `native_role_routing` evidence stays scoped to the native fallback; thread-path model evidence comes from official thread reads.
- Tests: update `tests/subagent-handler.test.ts` and `tests/session-context.test.ts` assertions/fixtures that break; add assertions pinning the new runner-preference sentence (substring on `codex_app__create_thread` and the fail-closed native-fallback condition) and the new `preferred_runners` passthrough.

## Out of scope

- Any new hook route, CLI helper, or evidence field for thread-path routing (no `thread_role_routing` machinery this slice).
- The skill's RoutePlan/ledger/preflight Python scripts and JSON schemas.
- `scripts/install-agent-fleet.sh` / `assets/templates/helpers/install-agent-fleet.sh` model maps, `.codex/agents/*.toml` fixtures, `scripts/check-agent-tooling.sh` and its tests.
- Cap changes (`max_agents`, `strict_max_agents`, `max_depth`, circuit breakers stay as-is).
- Anything under the real `~/.claude/` or `~/.codex/`; live runtime canary of `create_thread` accepting `gpt-5.6-luna` (recorded as a post-merge runtime-readiness follow-up, consistent with the config-vs-runtime readiness split).

## Exit Criteria

- `bun test tests/subagent-handler.test.ts tests/session-context.test.ts` passes.
- `bun test` (full suite) passes.
- `cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md` reports no difference.
- `rg -n "gpt-5.6" src/` still returns zero hits (no model-ID literals under src/).
- `repo-harness run check-task-workflow --strict` passes; `bash scripts/check-task-sync.sh` and `bash scripts/check-architecture-sync.sh` run and their output is reported as-is.
- `bun src/cli/index.ts init --repo . --dry-run` succeeds.

## Task Breakdown

- [ ] Update `.ai/harness/policy.json#delegation` runner list and runner_rule/rule prose.
- [ ] Rewrite the delegation advisor runner-path and sharedRules thread-lifecycle wording in `src/cli/hook/subagent-handler.ts`.
- [ ] Rewrite the standing-authorization block in `src/cli/hook/session-context.ts`.
- [ ] Update `docs/reference-configs/external-tooling.md` and sync `assets/reference-configs/external-tooling.md` byte-identically.
- [ ] Update/extend `tests/subagent-handler.test.ts` and `tests/session-context.test.ts`.
- [ ] Run full verification suite and report output as-is.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Update `.ai/harness/policy.json#delegation` runner list and runner_rule/rule prose.
- [ ] Rewrite the delegation advisor runner-path and sharedRules thread-lifecycle wording in `src/cli/hook/subagent-handler.ts`.
- [ ] Rewrite the standing-authorization block in `src/cli/hook/session-context.ts`.
- [ ] Update `docs/reference-configs/external-tooling.md` and sync `assets/reference-configs/external-tooling.md` byte-identically.
- [ ] Update/extend `tests/subagent-handler.test.ts` and `tests/session-context.test.ts`.
- [ ] Run full verification suite and report output as-is.

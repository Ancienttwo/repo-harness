# Harness Engineering Frameworks Baseline

> **Date**: 2026-06-17
> **Status**: Sprint baseline
> **Source Sprint**: `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
> **Source PRD**: `plans/prds/repo-harness Plan to Closeout 工作流对标报告.md`

## Judgment

repo-harness is already aligned with the strongest public harness patterns:
repo-local instructions, file-backed state, worktree isolation, contract-scoped
execution, review gates, and resumable handoff. The next optimization is not a
new runtime. It is a clearer separation between machine truth, human review, and
agent resume context.

The Sprint should therefore harden five surfaces:

- filing consistency: one vocabulary for PRD, Sprint, Task Contract, Task Review
- human review compression: one card that exposes verdict, risk, checks, and rollback
- contract profiles: task type controls default writable scope
- trace/eval evidence: runs become gradeable harness traces, not only logs
- delegation boundaries: explorer, worker, and verifier roles cannot silently widen scope

## External Patterns

| Source | Pattern | Harness implication |
|---|---|---|
| Claude Code memory docs | `CLAUDE.md` and auto memory are loaded as context, while blocking behavior belongs in hooks. Source: https://code.claude.com/docs/en/memory | repo-harness should keep root instructions short and advisory; enforcement belongs in scripts, hooks, policy, and checks. |
| Claude Code subagents docs | Subagents isolate context and can carry tool restrictions and separate purpose. Source: https://code.claude.com/docs/en/sub-agents | Delegation should be role-scoped: read-only explorer, bounded worker, read-only verifier. |
| Codex AGENTS.md docs | Instructions compose from global/project/nested files and should stay concrete and scoped. Source: https://developers.openai.com/codex/guides/agents-md | root `AGENTS.md` should remain a map; reference configs and capability contexts hold detail. |
| Codex sandbox docs | Autonomy is controlled by sandbox and approval policy boundaries. Source: https://developers.openai.com/codex/concepts/sandboxing | Task contracts need explicit writable scope and safer defaults by task profile. |
| Codex worktree docs | Worktrees are stable task isolation units, with branch/worktree constraints. Source: https://developers.openai.com/codex/app/worktrees | Contract-level worktree-first remains the right execution model. |
| OpenAI agent evals docs | Traces, datasets, graders, and eval runs make workflow regressions visible. Source: https://developers.openai.com/api/docs/guides/agent-evals | `.ai/harness/runs/*.json` should become gradeable trace evidence. |
| OpenAI guardrails/human-review docs | Automated checks and human approval serve different gates. Source: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals | Machine checks should not replace review; review should expose the exact side effect risk. |
| SWE-agent paper | Agent-computer interface design materially affects software-engineering performance. Source: https://arxiv.org/abs/2405.15793 | repo-harness should treat scripts, contracts, and evidence shape as product surface. |
| OpenHands paper | Agent platforms need sandboxed execution, multi-agent coordination, benchmarks, and human-facing interfaces. Source: https://arxiv.org/abs/2407.16741 | Delegation and review UX are first-class harness work, not optional docs polish. |
| Harness-Bench paper | Model capability should be evaluated together with harness configuration, including context, tools, state, permissions, tracing, and recovery. Source: https://arxiv.org/abs/2605.27922 | repo-harness needs local trace/eval output so harness changes can be compared across runs. |

## Repo-Harness Current State

| Surface | Current role | Gap |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | root context and operating rules | correct direction; must stay short to avoid context bloat |
| `.ai/harness/policy.json` | machine-readable workflow contract | strong base; missing typed review/result and task profile policy |
| `plans/prds/` | upper planning intent | now useful for PRD-level workflow analysis |
| `plans/sprints/` | ordered long-task backlog | needs row checkbox updates to be treated as sprint state |
| `plans/plan-*.md` | execution plan per row | should name evidence, allowed paths, and stop condition |
| `tasks/contracts/` | allowed paths and done gate | default allowed paths are too broad for docs-only or closeout-only tasks |
| `tasks/reviews/` | human/evaluator judgment | too verbose for quick reviewer decisions; needs Human Review Card |
| `.ai/harness/checks/latest.json` | latest verification snapshot | should expose schema and review/profile/acceptance fields |
| `.ai/harness/runs/` | raw run snapshots | should become immutable trace evidence suitable for local graders |
| `.ai/harness/handoff/` | session resume | markdown is useful, but typed companion would reduce resume ambiguity |
| `tasks/current.md` | generated read model | should remain orientation only, never an active checklist |
| `tasks/todos.md` | deferred-goal ledger | should not be used as sprint backlog or active task source |

## Gap Analysis

### Filing and terminology

The repo now has the correct three-layer model: PRD, Sprint, Task Contract.
The high-risk drift is legacy wording and paths such as `tasks/todo.md`,
`tasks/sprints/`, "Sprint Contract" where the actual artifact is a task-level
execution contract, and review templates that still force humans to read the
whole artifact before finding the decision.

### Human review

The existing review template has enough information, but it is optimized for
completeness rather than fast decision-making. A reviewer should see verdict,
change type, intended versus actual files, commands, external acceptance,
residual risk, required action, and rollback in the first screen.

### Contract scope

The existing contract template defaults to broad source/test paths. That is
acceptable for early migration, but it weakens the contract when the task is
docs-only, ledger-closeout, eval-only, or delegated-run. The profile should
drive the default writable surface.

### Trace/eval

The run evidence currently proves that commands ran. It does not yet prove that
the run is a structured harness trace. The Sprint should add a minimal schema
with task profile, active plan, contract, review, worktree, branch, commands,
guards, handoffs, acceptance, files changed, allowed-paths result, status,
failure class, and next step.

### Delegation

Delegation metadata exists, but the contract should make role boundaries
operationally legible: parent owns narration and gates, explorer is read-only,
worker edits only within allowed paths, verifier checks against the contract
exit criteria rather than inventing a new rubric.

## Harness Engineering 10 Rules

1. Repo files are authority; chat is transient.
2. Instructions advise; hooks and checks enforce.
3. Worktree or sandbox is the execution boundary.
4. A task contract defines both permissions and done.
5. Review is for humans first and must expose a decision quickly.
6. Runs are traces, not just command logs.
7. Current status is derived and never a handwritten kanban.
8. Delegation must be role, budget, and permission scoped.
9. Eval before cutover; traces should grade workflow regressions.
10. Migration must preserve user-authored files and avoid absorbing unrelated dirt.

## Sprint Implications

- HE-02 should run before template expansion so new artifacts do not preserve old paths.
- HE-03 and HE-04 should move together because review `Change type` and contract
  `Task Profile` must agree.
- HE-05 should consume the profile and review card fields instead of inventing a
  separate trace taxonomy.
- HE-06 should point handoff/resume to the new trace/check fields and keep
  `tasks/current.md` as generated orientation.
- HE-07 should dogfood bounded delegation only after profiles and traces exist.
- HE-08 should use the stabilized terminology so onboarding docs do not encode
  obsolete names.

## Verification Surface

- `grep -n "Harness Engineering 10 Rules" docs/researches/20260616-harness-engineering-frameworks.md`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md --strict --read-only`

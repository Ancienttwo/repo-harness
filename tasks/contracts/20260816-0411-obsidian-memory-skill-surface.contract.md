# Task Contract: obsidian-memory-skill-surface

> **Status**: Active
> **Plan**: plans/plan-20260816-0411-obsidian-memory-skill-surface.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-16 04:11
> **Review File**: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`
> **Notes File**: `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

obsidian-memory（跨项目 Obsidian 长期记忆判断层）目前只是两侧手工副本：无版本、无完整性保障、无 authority 边界固化。若不收编进 skill-surface 发布链，Claude/Codex 两侧会漂移（本轮已实际发现官方 Obsidian skills 只装了 Codex 侧），且「vault 是 repo → brain 单向投影层、hooks 永不调用」的边界只存在于散文，无测试守护，未来任何人把 vault 读写塞进 hook 都不会被抓住。

## Goal

按源计划 plans/plan-20260816-0411-obsidian-memory-skill-surface.md 的 Scope T1-T5 交付：`assets/skills/obsidian-memory/SKILL.md` 收编现行 `~/.claude/skills/obsidian-memory/SKILL.md` 内容；manifest 注册 `kind:"facade"` 条目并同步 `expectedProjections`；`scripts/check-agent-tooling.sh` 声明 `obsidian-markdown`/`obsidian-cli` 为 runtime-referenced 依赖（镜像 CODEX_AUTOMATION_SKILLS 形状，缺失报 gap 不硬断）；新增 `tests/skill-surface/obsidian-memory-contract.test.ts` 固化边界；`docs/reference-configs/external-tooling.md` 加声明段；`tasks/todos.md` 落 SessionStart 提示行 deferred 条目。

## Scope

- In scope: assets/skills/obsidian-memory/、assets/skill-commands/manifest.json、scripts/check-agent-tooling.sh、tests/skill-surface/、既有 skill-surface/installed-copy-sync 测试的 fixture 对齐、docs/reference-configs/external-tooling.md、tasks/todos.md。
- Out of scope: 任何 hook handler（src/cli/hook/ 只读不改）、SessionStart section、sync-brain-docs/brain-manifest 链路、vendor 官方 obsidian skills、vault 内容操作。EXECUTION_BOUNDARY：未列项是禁区，不顺手改进。
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若 `tests/installed-copy-sync.test.ts` 在 copy 模式下无法将新 facade 条目投影为两侧同构副本（即 facade 机制并不天然覆盖新条目），则「零安装代码、纯 manifest 注册」的方向错误。最便宜证点：先加 manifest 条目 + assets 目录，跑 `bun test tests/installed-copy-sync.test.ts tests/skill-surface`，再写其余部分。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260816-0411-obsidian-memory-skill-surface.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`
- Notes file: `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md
  - tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md
  - tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md
  - assets/skills/obsidian-memory/
  - assets/skill-commands/manifest.json
  - scripts/check-agent-tooling.sh
  - tests/
  - docs/reference-configs/external-tooling.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/skills/obsidian-memory/SKILL.md
    - tests/skill-surface/obsidian-memory-contract.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md
  tests_pass:
    - path: tests/skill-surface/obsidian-memory-contract.test.ts
    - path: tests/installed-copy-sync.test.ts
    - path: tests/skill-surface/catalog.test.ts
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

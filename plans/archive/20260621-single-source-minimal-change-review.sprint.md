# Sprint V2: Single-Source Minimal-Change Hooks + Deep Diff Review

> **Status**: Done

```yaml
sprint_id: 20260621-single-source-minimal-change-review
status: Done
target_branch: codex/single-source-minimal-change-review
duration: 12 engineering days
risk: high
owners:
  engineering: TBD
  reviewer: TBD
source_research:
  - DietrichGebert/ponytail
  - Ancienttwo/repo-harness
target_release: next-minor
```

## PRD

Source PRD: collapse repo-harness minimal-change hook work into the existing hook/runtime/policy workflow while first removing the duplicate human-edited hook source between `assets/hooks/` and `.ai/hooks/`. The product promise is a native repo-harness path for minimal-change guidance and deep diff review without importing Ponytail runtime state, commands, or adapters.

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|---|---|---|---|---|
| 1 | [x] | Establish canonical hook source projection | inline | `bun run check:hooks` passes and the self-host `.ai/hooks/` projection matches `assets/hooks/`. | PR 0 |
| 2 | [x] | Add minimal-change policy and fixed session context | inline | Policy parsing and context rendering are covered by tests and remain advice-only by default. | PR 1 |
| 3 | [x] | Collect objective minimal-change edit signals | inline | Post-edit signal collection records deterministic file, diff, dependency, and test-surface facts without blocking edits. | PR 2 |
| 4 | [x] | Add severity-ranked deep diff review rubric | inline | Review routing can render a deterministic rubric ordered by severity and mapped to existing review evidence. | PR 3 |
| 5 | [x] | Invalidate stale review evidence after diff changes | inline | Done/review gates can detect when recorded review evidence predates the implementation diff fingerprint. | PR 4 |
| 6 | [x] | Package, migrate, document, and release the completed hook flow | inline | Adoption, migration, docs, and release gates prove the full minimal-change workflow from package surfaces. | PR 5 |

## 0. Execution Snapshot

### 2026-06-21 PR0 progress

Completed the single-source hook projection foundation:

- Added `assets/hooks/projection.json`.
- Added `scripts/sync-hook-sources.ts`.
- Added `bun run sync:hooks` and `bun run check:hooks`.
- Generated `.ai/hooks/.projection.json`.
- Made `assets/hooks/` the canonical human-edited root and `.ai/hooks/` the deterministic self-host projection.
- Classified package-only files: `projection.json`, `codex.hooks.template.json`, `settings.template.json`.
- Classified repo-only files: none.
- Confirmed Codex lifecycle scripts are shared canonical files with route owners, not repo-only exceptions.
- Updated central install and repo-pinned scaffold/migration copy paths to skip package-only files.
- Added audit evidence: `docs/researches/20260621-hook-source-projection-audit.md`.

Verified:

- `bun run check:hooks`
- `bun run check:type`
- `bun test tests/hook-source-projection.test.ts tests/workflow-contract.test.ts tests/hook-shim-resolution.test.ts`
- `bun test --timeout 60000 --max-concurrency 4` — 890 pass, 0 fail.
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`

### 2026-06-21 PR1 progress

Completed the minimal-change policy and context foundation:

- Added `src/cli/hook/minimal-change-policy.ts`.
- Added `src/cli/hook/minimal-change-context.ts`.
- Added `src/cli/hook/minimal-change-cli.ts`.
- Added `repo-harness-hook minimal-change context --phase session|execution`.
- Added `.ai/harness/policy.json` / generated policy `minimal_change` defaults.
- Added `assets/hooks/minimal-change-context.sh` and `assets/hooks/lib/minimal-change.sh`.
- Added SessionStart context injection without changing route tuple/order.
- Added execution-only prompt advice through existing `prompt-guard.sh`.
- Preserved v1 advice-only behavior: `enforce` normalizes to `advice`, `blocking=false`, and `mode=off` emits byte-empty output.
- Updated package-only hook templates so direct SessionStart templates include `minimal-change-context.sh`.
- Added audit evidence: `docs/researches/20260621-minimal-change-policy-context-audit.md`.

Verified:

- `bun run check:type`
- `bun run check:hooks` — 24 files, `sha256:6d1beda78332605787c7fdbc68d0daeac9a0f50c8ad6ac8d90b62bf9e724ca53`.
- `bun test tests/minimal-change-policy.test.ts tests/cli/hook.test.ts tests/hook-source-projection.test.ts`
- `bun test tests/hook-contracts.test.ts tests/bootstrap-files.test.ts tests/cli/route-registry.test.ts tests/hook-shim-resolution.test.ts tests/workflow-contract.test.ts`
- `bun test tests/scaffold-parity.test.ts`
- `bun test --timeout 60000 --max-concurrency 4` — 897 pass, 0 fail.
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict` — first run reported stale handoff freshness; `bash scripts/prepare-codex-handoff.sh` refreshed `current.md`/`resume.md`; rerun passed.
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`

### 2026-06-21 PR2 progress

Completed the minimal-change edit signal foundation:

- Added `src/cli/hook/diff-fingerprint.ts` as the shared diff fingerprint primitive for signal and future freshness work.
- Added `src/cli/hook/minimal-change-signals.ts` with schema v1 report generation, path containment checks, bounded git facts, package.json dependency diffing, protected-change detection, abstraction candidates, deterministic sorting, fingerprint dedupe, and atomic report writes.
- Extended `repo-harness-hook minimal-change` with `signals --phase post-edit --path <path>`.
- Added `assets/hooks/minimal-change-observer.sh` and projected `.ai/hooks/minimal-change-observer.sh`.
- Updated `PostToolUse.edit` internal script order to `post-edit-guard.sh`, then `minimal-change-observer.sh`, without changing the route tuple/order.
- Preserved advice-only behavior: `minimal_change.mode=off` writes no report, observer stdout is empty, and failures remain fail-open.
- Added audit evidence: `docs/researches/20260621-minimal-change-signals-audit.md`.

Verified:

- `git diff --check`
- `bun run check:type`
- `bun run check:hooks` — 25 files, `sha256:5f6c6cf6740e392ea2cceec06751d61f373900ab67ffa7191ee3a0c0ad60623d`.
- `bun test tests/minimal-change-signals.test.ts`
- `bun test tests/minimal-change-signals.test.ts tests/hook-runtime.test.ts tests/cli/route-registry.test.ts`
- `bun test tests/cli/hook.test.ts tests/hook-source-projection.test.ts tests/hook-contracts.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/scaffold-parity.test.ts`
- `bun test --timeout 60000 --max-concurrency 4` — 903 pass, 0 fail.
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict` — first post-PR2 run reported `docs/reference-configs/hook-operations.md` over the 100-line brain stub limit and stale handoff freshness; docs were compacted to 100 lines, `bash scripts/prepare-codex-handoff.sh` refreshed handoff, and rerun passed.
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`

### 2026-06-21 PR3 progress

Completed the severity-ranked review rubric foundation:

- Added `src/cli/hook/review-rubric.ts` with `REVIEW_RUBRIC_VERSION = 1`, fixed P0/P1/P2/P3 order, eight review dimensions, required finding shape, no-findings guidance, and the rule that minimal-change/YAGNI is maintenance cost only.
- Added `repo-harness-hook review-rubric --format prompt|text` through a dynamic import in `src/cli/hook-entry.ts`.
- Added a hidden full CLI fallback `repo-harness review-rubric`.
- Updated `assets/hooks/prompt-guard.sh` so only the existing `REVIEW_RELEASE` branch injects the rubric into local `/check` guidance and peer external acceptance prompts.
- Preserved route ownership: no new `UserPromptSubmit` route/script, no file writes, no `/check` execution, no host JSON envelope changes.
- Added audit evidence: `docs/researches/20260621-review-rubric-audit.md`.

Verified so far:

- `bun run check:type`
- `bun run check:hooks` — 25 files, `sha256:6e743a44061306e5f0d82610b562c396e914f8793adaded031e7b80a0c22e9bb`.
- `bun test tests/review-rubric.test.ts tests/hook-runtime.test.ts tests/cli/hook.test.ts tests/hook-source-projection.test.ts`

### 2026-06-21 PR4 progress

Completed review freshness invalidation:

- Extended `src/cli/hook/diff-fingerprint.ts` with implementation review fingerprints for branch, staged, unstaged, and untracked changes.
- Added `repo-harness-hook review-fingerprint --format json` through the lightweight hook entrypoint plus hidden full CLI fallback.
- Updated review/release prompt guidance to print the current implementation diff fingerprint and metadata lines for review artifacts.
- Updated review templates and plan/todo projection helpers so new reviews include `Review Rubric Version`, `Reviewed Diff Fingerprint`, and `Reviewed Scope`.
- Added Done-gate freshness comparison in `prompt-guard.sh`: fresh fingerprints pass, missing legacy metadata warns, malformed/unknown/stale metadata blocks with `ReviewFreshnessGuard`.
- Added Stop-time stale review nudges in `stop-orchestrator.sh` without blocking Stop or emitting a second decision envelope.
- Excluded review/check evidence and hook runtime state from the implementation fingerprint so the guard is not invalidated by its own evidence writes.
- Added audit evidence: `docs/researches/20260621-review-freshness-audit.md`.

Verified so far:

- `bun run check:type`
- `bun test tests/review-freshness.test.ts tests/hook-runtime.test.ts tests/review-rubric.test.ts tests/hook-source-projection.test.ts` — 124 pass, 0 fail.

### 2026-06-21 PR5 progress

Completed packaging, migration, documentation, and release readiness:

- Bumped the next-minor release line to `repo-harness@0.8.0` in `package.json`, `assets/skill-version.json`, and localized README current-release surfaces.
- Strengthened `scripts/check-tarball-install-smoke.sh` so the tarball must contain canonical `assets/hooks/` shared runtime plus package-only templates, must not ship `.ai/hooks/`, and must prove installed central bundle digest parity against packaged canonical assets.
- Strengthened `tests/hook-shim-resolution.test.ts` so `scripts/repo-harness.sh install` proves `~/.repo-harness/hooks/` matches canonical managed hook bytes and executable bits.
- Kept packaged bash installs quiet by auto-trusting only source checkouts, not npm package `scripts/` directories that are not Git repos.
- Confirmed `repo-harness@0.8.0` is unpublished on npm and `repo-harness@0.7.4` is already published, so the next-minor release line is required for a passing release gate.
- Added audit evidence: `docs/researches/20260621-package-release-parity-audit.md`.

Verified:

- `bash -n scripts/repo-harness.sh scripts/check-tarball-install-smoke.sh`
- `bun test tests/hook-shim-resolution.test.ts tests/bootstrap-files.test.ts`
- `bash scripts/check-tarball-install-smoke.sh`
- `bun test tests/skill-version.test.ts tests/readme-dx.test.ts`
- `bun run check:release` — npm unpublished-version gate passed for `repo-harness@0.8.0`; full CI gate passed with 914 tests, 0 fail; tarball smoke passed.

## 1. Sprint Goal

把 Ponytail 最有价值的“最小实现阶梯”与“反过度工程审查”能力，以 **repo-harness 原生 hook/runtime/policy 形态**接入现有工作流：

1. 先把 hook runtime 收敛为 **一个人工维护源**：`assets/hooks/`。
2. 将 `.ai/hooks/` 改为面向 repo-harness self-host 的确定性生成投影，不再手工双改。
3. 保留 `~/.repo-harness/hooks/`、packaged `assets/hooks/`、repo-pinned `.ai/hooks/` 三种运行物料，但它们全部从同一作者源派生。
4. 在执行开始时注入短小、稳定的最小实现原则。
5. 仅对 execution intent 提供最小改动建议，不干扰 planning/review/passive prompts。
6. 在编辑后收集客观 diff/dependency/file-count 信号。
7. 在既有 `REVIEW_RELEASE → Waza /check → external acceptance` 流程中加入深度 diff-review rubric。
8. Review 必须覆盖隐藏副作用、兼容性、边界、性能、安全、命名、测试与未来维护成本，并按严重程度稳定排序。
9. 在 Stop 阶段生成一次非阻断的 minimal-change review 证据；Done gate 可识别已记录 review 在后续 diff 变化后失效。
10. 保持 Claude Code 与 Codex hook 协议、公开 route tuple、信任哈希顺序不变。
11. 默认 `advice`；minimal-change 本 Sprint 不引入强制阻断。

## 2. 背景与关键架构结论

### 2.1 Cherry-pick 的是原则，不是 Ponytail runtime

引入：

- “能不写就不写 → 标准库 → 平台原生能力 → 已有依赖 → 一行实现 → 最少新增代码”的决策阶梯。
- 不创建未被需求驱动的抽象、扩展点、wrapper、future-proof scaffolding。
- 优先删除/收缩已有代码，而非叠加新层。
- 审查标签：`delete`、`stdlib`、`native`、`dependency`、`yagni`、`shrink`。
- 安全边界：不得以精简为由移除验证、数据安全、错误处理、安全控制、可访问性、明确需求或必要测试。

不引入：

- `.ponytail-active` 独立状态文件。
- Ponytail 自己的 Claude/Codex JSON 适配。
- `/ponytail` 命令解析器。
- 另起一套 plugin lifecycle。
- 每次 hook 都读取整份 SKILL.md。
- Sprint 1 中的 blocking/enforce 模式。
- 以 LOC 减少量作为唯一成功指标。

### 2.2 必须遵守的 repo-harness 约束

- `src/cli/hook/route-registry.ts` 中 `(event, routeId, matcher)` 是公开 host adapter contract。
- route 顺序不能变化；Codex 会对 adapter entry 做信任哈希。
- script 名称及同一路由内 script 数组属于内部实现，可扩展，但不得改 route tuple/order。
- `src/cli/hook-entry.ts` 是高频、并发调用的轻量入口，不得 cold-load 完整 CLI。
- SessionStart 可聚合多个脚本的 context。
- UserPromptSubmit 应只有一个 decision 所有者：现有 `prompt-guard.sh`。
- Stop 应只有一个 decision 所有者：现有 `stop-orchestrator.sh`。
- PostToolUse/edit 可增加静默 observer；observer 只写证据，不输出 host decision。
- `.ai/harness/policy.json` 当前 self-host 固定 `"hook_source": "repo"`；`.ai/hooks/` 必须继续存在，但应由 `assets/hooks/` 确定性生成，禁止成为第二个人工维护源。
- downstream 默认仍应走 packaged central-first resolution，不能要求用户复制 Ponytail runtime。


### 2.3 Hook source authority：一个作者源，多个投影

当前不是简单的“两个目录应完全相同”：

- `src/cli/hook/runtime.ts` 的 packaged path 已固定为 `assets/hooks/`。
- npm package 的 `files` 已包含 `assets/`，但不包含 `.ai/`。
- self-host checkout 通过 `"hook_source": "repo"` 执行 `.ai/hooks/`。
- bash install chain 还会生成 `~/.repo-harness/hooks/`。
- `assets/hooks/` 含 package-only adapter templates：
  - `codex.hooks.template.json`
  - `settings.template.json`
- `.ai/hooks/` 当前还存在三个非 route-registry 文件：
  - `codex-delegation-advisor.sh`
  - `subagent-start-context.sh`
  - `subagent-stop-quality.sh`

因此 Sprint V2 采用：

```text
assets/hooks/                         # 唯一人工维护源
  ├─ projection.json                 # 分类 manifest
  ├─ *.sh / lib/**                   # shared runtime
  └─ *.template.json                 # package-only

        │ sync/check
        ├───────────────────────────┐
        ▼                           ▼
.ai/hooks/                    ~/.repo-harness/hooks/
self-host generated projection     installer projection
```

**明确决策：**

1. `assets/hooks/` 是 canonical authoring root。
2. `.ai/hooks/` 是 checked-in generated projection，以支持当前 repo-pin 和 source checkout dogfood。
3. `~/.repo-harness/hooks/` 保持安装产物，不成为作者源。
4. `src/cli/hook/runtime.ts::packagedHooksDir()` 不改，降低兼容风险。
5. `ROUTES` 的公开 tuple/order 不改。
6. package-only templates 不投影到 `.ai/hooks/`。
7. repo-only 文件默认不允许；现有三个额外脚本必须经 `rg` 审计：
   - 有 live owner/reference：迁入 canonical source 或显式列入 `repo_only`，并补测试。
   - 无 live reference：删除或归档。
8. CI 校验的是 manifest-defined projection，不是粗暴比较两个目录。
9. downstream 自定义 hooks 继续遵循 adoption ownership policy：preserve/merge，不得被 source-repo sync 逻辑覆盖。

建议 manifest：

```json
{
  "version": 1,
  "canonical_root": "assets/hooks",
  "projection_target": ".ai/hooks",
  "package_only": [
    "projection.json",
    "codex.hooks.template.json",
    "settings.template.json"
  ],
  "repo_only": []
}
```

规则：

- 除 `package_only` 外，canonical root 下所有文件都属于 shared projection。
- target 中 canonical 没有、且不在 `repo_only` 的文件视为 unclassified drift。
- `--check` 只读并失败。
- `--write` 原子复制 managed files，但不静默删除 unclassified files；要求开发者先分类。
- 比较 byte content、relative path、POSIX executable bit。
- projection digest 不含时间戳，保证 deterministic。
- prepublish/CI 只运行 `--check`，不得在发布过程中偷偷改工作区。

### 2.4 Deep diff review：值得加入，但只在 review route 激活

用户提供的 flow 很有价值：

> Review 当前 diff，重点检查隐藏副作用、破坏兼容性、边界情况、性能风险、安全风险、命名误导、测试不足和未来维护成本，并按严重程度排序。

但不应作为每次 Edit/Write 后的自动审查：

- 语义 review 需要完整 diff、active contract、周边调用关系与验证证据。
- 每次编辑触发会产生高延迟、重复噪声和大量不稳定结论。
- PostToolUse observer 应继续只收集 objective signals。
- repo-harness 已有 `REVIEW_RELEASE` intent、Waza `/check`、external acceptance 和 `tasks/reviews/` completion gate，最合适的是增强现有路径，而不是新增并行 review hook。

推荐挂载点：

1. `UserPromptSubmit/default`
   - 仍由 `prompt-guard.sh` 单独拥有输出。
   - 当 TypeScript classifier 返回 `REVIEW_RELEASE` 时，注入 versioned review rubric。
   - 不新增 route/script。
2. External acceptance prompt
   - 将相同 rubric 注入 peer review prompt。
   - 保持“do not edit/write files”。
3. `tasks/reviews/<slug>.review.md`
   - 记录 severity-ordered findings、diff scope 和可选 fingerprint。
4. Done gate
   - 新 review 带 fingerprint 时，fingerprint 变化视为 stale review。
   - 旧 review 没有 fingerprint 时 v1 只 warning，避免升级即破坏现有工作流。
5. Stop
   - 只提示 missing/stale review，不在每次 Stop 自动执行完整模型审查。

建议 rubric：

```text
Review the complete current change set against the active contract and existing behavior.
Scope: branch diff against target, staged diff, unstaged diff, and untracked files.
Inspect relevant surrounding code; do not limit review to changed lines.
Do not edit or write files.

Prioritize:
1. Hidden side effects: state, lifecycle, concurrency, ordering, retries, idempotency.
2. Backward compatibility: APIs, config, data formats, migrations, host protocols.
3. Boundary/error cases: empty, missing, malformed, large, partial, timeout, cancellation.
4. Performance/resource risks.
5. Security, privacy, permissions, trust-boundary risks.
6. Misleading names or contracts.
7. Missing, weak, or incorrectly scoped tests.
8. Future maintenance cost, unnecessary abstraction, duplication, or dependency growth.

Return findings first, ordered P0 → P1 → P2 → P3.
Every finding must include file:line, impact, evidence/reproduction,
the smallest safe fix, and a regression test.
Do not report style-only nits.
If there are no findings, say "No findings" and list residual risks/test gaps.
```

Severity：

| Level | Definition |
|---|---|
| `P0` | 可利用安全问题、数据丢失、不可逆破坏、系统级不可用 |
| `P1` | 明确 correctness/compatibility regression，合并前必须修 |
| `P2` | 重要边界、性能、测试或维护风险，应在当前 Sprint 处理 |
| `P3` | 低风险命名/可维护性/简化建议，不阻塞 |

## 3. Non-goals

- [ ] 不增加新的公开 HookEvent。
- [ ] 不增加新的 RouteId。
- [ ] 不修改任何 route 的 matcher。
- [ ] 不重新排序 `ROUTES`。
- [ ] 不修改用户级 `~/.codex/hooks.json` 或 `~/.claude/settings.json` 的 adapter tuple。
- [ ] 不在 PreToolUse 阶段推断“是否过度工程”并阻止编辑。
- [ ] 不执行网络请求、包搜索、模型调用或安装命令。
- [ ] 不在每次编辑后执行完整测试、全仓 AST 扫描或完整 `git status` 深分析。
- [ ] 不自动删除代码或依赖。
- [ ] 不把安全、验证、数据完整性、可访问性、测试视作可精简项。
- [ ] 不实现 `strict`/`enforce` 阻断；只保留未来 schema 扩展位。
- [ ] 不新增面向用户的 `repo-harness minimize` CLI 命令。
- [ ] 不直接 vendor Ponytail SKILL/plugin 文件。
- [ ] 不删除 central-first、repo-pin 或 installed bundle 运行模式；只消除多作者源。
- [ ] 不通过 symlink 解决 projection；Windows、npm tarball 与 downstream copy 必须继续工作。
- [ ] 不在本 Sprint 完成 route registry 注释中提到的 Phase 2 sealed hooks。
- [ ] 不在每次 PostToolUse/edit 或每次 Stop 自动调用模型做完整语义 review。
- [ ] 不让 minimal-change finding 覆盖 correctness/security/compatibility finding 的严重程度。
- [ ] 不把 style-only nit 纳入 mandatory review findings。

## 4. Definition of Done

### Functional

- [ ] `.ai/harness/policy.json` 支持 `minimal_change` 配置，缺省为 `advice`。
- [ ] `mode=off` 时所有新增行为完全静默，且不生成新证据。
- [ ] SessionStart 注入不超过 180 English words 或等价长度的固定规则块。
- [ ] 最小实现提示只附加到 `embedded_approved_plan`、`bug_fix_execution`、`plan_execution_projection`、`general_execution`。
- [ ] planning、review、passive status、done 等 intent 不收到执行型 minimal-change 提示。
- [ ] PostToolUse/edit 写出版本化 objective signals，且不输出 decision JSON。
- [ ] Stop 生成/刷新最终 review 证据，但仍由 `stop-orchestrator.sh` 单独拥有 host response。
- [ ] protected concern 命中时只记录保护原因，不给删除/收缩建议。
- [ ] 同一 diff fingerprint 不重复追加相同事件。
- [ ] 报告 findings 最多 5 条，稳定排序，可重现。
- [ ] 任何解析失败都 fail-open，不阻断当前会话。

### Compatibility

- [ ] `ROUTES` 中 event/routeId/matcher tuple 和数组顺序与基线完全相同。
- [ ] Claude Code 协议 smoke test 通过。
- [ ] Codex 协议 smoke test 通过。
- [ ] `hook_source=repo` 自托管路径通过。
- [ ] packaged `assets/hooks` 路径通过。
- [ ] repo-local hook 缺失时仍遵守 runtime 现有 soft-missing 行为。
- [ ] 安装、迁移、recursive copy、sync tests 覆盖新增文件。
- [ ] 不新增 runtime npm dependency。

### Single-source hook authority

- [ ] `assets/hooks/` 是唯一人工维护 root。
- [ ] `.ai/hooks/` shared runtime 可由一条命令确定性重建。
- [ ] `bun run check:hooks` 在任何 content/path/mode drift 时失败。
- [ ] `bun run sync:hooks` 二次执行产生空 diff。
- [ ] package-only templates 不出现在 `.ai/hooks/`。
- [ ] `.ai/hooks/` 不存在未分类文件。
- [ ] 当前三个额外 self-host scripts 均有删除或明确归属结论。
- [ ] npm tarball、`~/.repo-harness/hooks/` installer copy、repo-pin projection 的 shared runtime digest 一致。
- [ ] downstream custom hooks preservation tests 继续通过。

### Deep review

- [ ] `REVIEW_RELEASE` prompt 注入固定 review rubric。
- [ ] planning、implementation、passive prompts 不注入 review rubric。
- [ ] external acceptance prompt 使用相同 rubric version。
- [ ] findings 输出 contract 要求 P0/P1/P2/P3 排序。
- [ ] 每条 finding 要求 `file:line`、impact、evidence、smallest safe fix、test。
- [ ] 无 findings 时要求明确写出 residual risks/test gaps。
- [ ] review-only path 明确禁止修改文件。
- [ ] 新 review 可记录 implementation diff fingerprint。
- [ ] fingerprint 存在且 stale 时 Done gate 阻断。
- [ ] legacy review 缺 fingerprint 时 v1 仅 warning。
- [ ] evidence/review 文件自身不进入 implementation fingerprint，避免自失效。

### Performance

- [ ] 新 observer 只检查当前事件对应 path、受影响 manifest 与一次 bounded git diff。
- [ ] 不使用全仓 `find`/递归 AST scan。
- [ ] fixture repo 中 PostToolUse/edit 新增中位开销目标 `<100ms`。
- [ ] fixture repo 中新增 p95 开销目标 `<200ms`。
- [ ] `repo-harness-hook` 其他 route 的冷启动无显著回归；允许阈值 `<=10%`。
- [ ] 连续并发调用不产生损坏 JSON 或部分写入文件。

### Quality

- [ ] 新增核心模块 unit coverage 达到项目现有 coverage gate。
- [ ] protected fixtures 的误报数为 0。
- [ ] opportunity fixtures 中至少 4/5 能产出正确 objective signal。
- [ ] 所有新增 shell 文件通过仓库现有 shell/static checks。
- [ ] `bun run check:type` 通过。
- [ ] `bun run check:ci` 通过。
- [ ] release/package checks 通过。
- [ ] README、中文 README、reference config、changelog 更新完成。

## 5. Proposed Policy Contract

在 `.ai/harness/policy.json` 增加：

```json
{
  "minimal_change": {
    "version": 1,
    "mode": "advice",
    "session_context": true,
    "prompt_advice": true,
    "post_edit_observer": true,
    "stop_review": true,
    "max_findings": 5,
    "max_context_words": 180,
    "new_dependency": "warn",
    "new_file": "observe",
    "new_abstraction": "warn",
    "protected_concerns": [
      "security",
      "validation",
      "data_loss",
      "error_handling",
      "accessibility",
      "explicit_requirement",
      "tests"
    ],
    "report_path": ".ai/harness/checks/minimal-change.latest.json",
    "event_dedupe": true
  }
}
```

### Policy semantics

| Field | Semantics |
|---|---|
| `mode=off` | 不注入 context、不分析、不写报告 |
| `mode=advice` | 注入指导、收集信号、输出非阻断审查 |
| `mode=enforce` | v1 解析为 `advice` 并记录 unsupported warning；不得阻断 |
| `new_dependency=warn` | 仅当 manifest diff 可证明新增依赖时产生信号 |
| `new_file=observe` | 记录新增文件，不单独判定为问题 |
| `new_abstraction=warn` | 仅对可解释的轻量启发式产生 candidate，不自动定罪 |
| `protected_concerns` | 任何命中均优先于 shrink/delete 建议 |
| `max_findings` | 对稳定排序后的候选做上限裁剪 |
| `report_path` | 必须位于 `.ai/harness/` operational state 下 |

### Precedence

```text
correctness
> explicit requirement
> security / validation / data integrity / accessibility
> workflow contract / approved plan
> verification evidence
> minimal-change advice
```

## 6. Target Architecture

```text
Host adapter
  └─ repo-harness-hook <event> --route <route>
      └─ src/cli/hook/runtime.ts
          ├─ SessionStart/default
          │   ├─ session-start-context.sh
          │   ├─ minimal-change-context.sh       [NEW]
          │   └─ security-sentinel.sh
          │
          ├─ UserPromptSubmit/default
          │   └─ prompt-guard.sh
          │       └─ prompt-guard-decide
          │           └─ minimal-change prompt advice [NEW, single decision owner]
          │
          ├─ PostToolUse/edit
          │   ├─ post-edit-guard.sh
          │   └─ minimal-change-observer.sh      [NEW, stdout silent]
          │       └─ minimal-change-signals
          │           └─ .ai/harness/checks/minimal-change.latest.json
          │
          └─ Stop/default
              └─ stop-orchestrator.sh
                  └─ minimal-change final review [NEW, single decision owner]
```

## 7. File-level Change Map

### Canonical hook-source infrastructure

- [ ] `assets/hooks/projection.json`
  - 唯一 projection classification manifest。
- [ ] `scripts/sync-hook-sources.ts`
  - `--check` / `--write`。
  - recursive copy、digest、mode、unclassified drift。
- [ ] `tests/hook-source-projection.test.ts`
  - canonical/projection/install parity。
- [ ] `.ai/hooks/.projection.json`
  - generated deterministic source digest；无时间戳。
- [ ] `package.json`
  - `sync:hooks`、`check:hooks`。
- [ ] `scripts/check-ci.sh`
  - 调用 `bun run check:hooks`。
- [ ] `scripts/check-npm-release.sh`
  - release 前只读校验 projection/tarball。

### Review rubric and freshness

- [ ] `src/cli/hook/review-rubric.ts`
  - versioned rubric、severity definitions、stable renderer。
- [ ] `src/cli/hook/diff-fingerprint.ts`
  - branch/staged/unstaged/untracked implementation scope fingerprint。
  - 与 minimal-change signals 共用，禁止平行实现。
- [ ] `tests/review-rubric.test.ts`
- [ ] `tests/review-freshness.test.ts`
- [ ] 修改 canonical `assets/hooks/prompt-guard.sh`
- [ ] 修改 canonical `assets/hooks/lib/workflow-state.sh`
- [ ] 修改 `scripts/plan-to-todo.sh` 使用的 review scaffold/template canonical source。
- [ ] 通过 `bun run sync:hooks` 生成对应 `.ai/hooks/` 投影。

### New TypeScript files

- [ ] `src/cli/hook/minimal-change-policy.ts`
  - schema type、default、normalization、fail-open parsing。
- [ ] `src/cli/hook/minimal-change-context.ts`
  - SessionStart 固定规则块。
  - execution intent 的短 advice。
  - protected concern 说明。
- [ ] `src/cli/hook/minimal-change-signals.ts`
  - bounded diff facts。
  - manifest adapter。
  - deterministic fingerprint。
  - report serialization。
- [ ] `src/cli/hook/minimal-change-cli.ts`
  - hook-only 子命令分发。
  - 禁止 import commander/full CLI。
  - 支持 `context`、`signals`、`review` 三个 action。

### New repo-pinned hook files

- [ ] `.ai/hooks/minimal-change-context.sh`
- [ ] `.ai/hooks/minimal-change-observer.sh`
- [ ] `.ai/hooks/lib/minimal-change.sh`

### New packaged hook files

- [ ] `assets/hooks/minimal-change-context.sh`
- [ ] `assets/hooks/minimal-change-observer.sh`
- [ ] `assets/hooks/lib/minimal-change.sh`

### New tests

- [ ] `tests/minimal-change-policy.test.ts`
- [ ] `tests/minimal-change-context.test.ts`
- [ ] `tests/minimal-change-signals.test.ts`
- [ ] `tests/minimal-change-protocol.test.ts`
- [ ] `tests/minimal-change-performance.test.ts`
- [ ] `tests/fixtures/minimal-change/` fixture tree

### New docs

- [ ] `docs/reference-configs/minimal-change-hooks.md`
- [ ] `plans/sprints/20260621-minimal-change-hooks.sprint.md`（本文件）
- [ ] 可选：`plans/prds/20260621-minimal-change-hooks.prd.md`
- [ ] 可选：`docs/researches/ponytail-hook-cherry-pick.md`

### Existing files to modify

- [ ] `src/cli/hook-entry.ts`
  - 添加 hook-only 子命令。
  - 使用 bounded/dynamic import，避免给所有 route 增加冷启动成本。
- [ ] `src/cli/hook/route-registry.ts`
  - 仅修改 SessionStart/default 与 PostToolUse/edit 的 `scripts` 数组。
  - 不改 tuple、matcher、route 顺序。
- [ ] `src/cli/hook/prompt-guard-decision.ts`
  - 仅 execution intents 附加 minimal-change advice。
- [ ] `src/cli/commands/prompt-guard-decision.ts`
  - 如最终 host payload 在该层渲染，则在这里注入 advice；先通过 call graph 确认唯一输出点。
- [ ] `.ai/hooks/prompt-guard.sh`
  - 保持 adapter 角色，不新增第二份 decision。
- [ ] `.ai/hooks/stop-orchestrator.sh`
  - 调用 final review helper，写证据并把摘要合并到现有 Stop guidance。
- [ ] `assets/hooks/prompt-guard.sh`
- [ ] `assets/hooks/stop-orchestrator.sh`
- [ ] `.ai/harness/policy.json`
- [ ] policy 的 canonical managed source：
  - `src/core/adoption/manifest-templates.ts`
  - `src/core/adoption/workflow-contract-asset.ts`
  - `assets/workflow-contract.v1.json`
  - 具体落点由 Story 0 的 `rg` 结果确定；不得只改生成物。
- [ ] `tests/hook-contracts.test.ts`
- [ ] `tests/hook-runtime.test.ts`
- [ ] `tests/hook-protocol.test.ts`
- [ ] `tests/hook-shim-trust.test.ts`
- [ ] `tests/hook-recursive-copy.test.ts`
- [ ] `tests/installed-copy-sync.test.ts`
- [ ] `README.md`
- [ ] `README.zh-CN.md`
- [ ] `docs/CHANGELOG.md`

## 8. Hook-specific Design

### 8.1 SessionStart/default

目标 route 内部 scripts：

```ts
scripts: Object.freeze([
  'session-start-context.sh',
  'minimal-change-context.sh',
  'security-sentinel.sh',
])
```

Checklist：

- [ ] 保持 route 位置不变。
- [ ] 保持 `event='SessionStart'`。
- [ ] 保持 `routeId='default'`。
- [ ] 不增加 matcher。
- [ ] context script 从 stdin 消费统一 hook input。
- [ ] 使用 `HOOK_REPO_ROOT`，不自行猜 repo root。
- [ ] 读取 policy 失败时 exit 0。
- [ ] `mode=off` 时 stdout 为空。
- [ ] 输出为纯 context，由 runtime 现有 SessionStart aggregation 统一封装。
- [ ] 不写独立 activation flag。
- [ ] 不读取整份 Ponytail SKILL。
- [ ] 固定文案可快照测试。

建议 context：

```text
Minimal-change policy:
1. Confirm new code is necessary.
2. Prefer platform/stdlib, then an already-installed dependency.
3. Prefer the smallest direct implementation over new wrappers or extension points.
4. Delete or shrink obsolete code before adding layers.
5. Preserve explicit requirements, security, validation, data safety,
   error handling, accessibility, and runnable tests.
Before completion, justify each new dependency, file, and abstraction.
```

### 8.2 UserPromptSubmit/default

不增加第二个 route script。扩展现有 prompt guard decision/rendering：

```ts
type PromptGuardResult = {
  action: PromptGuardAction
  // existing fields...
  advisoryContext?: string[]
}
```

Checklist：

- [ ] 先定位 `classifyPromptGuardIntent` → decision → host JSON 的完整 call graph。
- [ ] 仅 `PROMPT_GUARD_EXECUTION_INTENTS` 命中时调用 minimal-change renderer。
- [ ] blocked action 原因保持原样；minimal-change 不覆盖 plan/spec/evidence gate。
- [ ] 如果 action 已 block，可不追加 minimal-change advice，减少噪声。
- [ ] `mode=off` 时 result byte-for-byte 与基线一致。
- [ ] planning/review/passive/done intent byte-for-byte 与基线一致。
- [ ] Claude 与 Codex 的 decision envelope 不新增未知顶层协议字段。
- [ ] advice 放进现有允许的 message/reason/additionalContext 字段。
- [ ] 不在 shell 中二次拼接 JSON。
- [ ] prompt 中已明确要求架构/抽象时，不做“禁止抽象”的误导；只要求证明必要性。

### 8.3 PostToolUse/edit

目标 route 内部 scripts：

```ts
scripts: Object.freeze([
  'post-edit-guard.sh',
  'minimal-change-observer.sh',
])
```

Observer 行为：

- 读取本次 Edit/Write 的 path。
- 只对受影响 path 和识别出的 dependency manifest 做 bounded diff。
- 生成 objective signals。
- 原子写入 report。
- stdout 永远为空。
- error 仅写简短 stderr，并 exit 0。

Checklist：

- [ ] 不改变 PostToolUse/edit tuple。
- [ ] observer 放在 `post-edit-guard.sh` 后。
- [ ] shell 只做 hook input/CLI adapter，不实现复杂 JSON parser。
- [ ] 使用临时文件 + rename 原子写。
- [ ] 并发写使用 lock 或 compare-and-swap/fingerprint。
- [ ] 无 git repo、detached state、untracked file、binary file 均 fail-open。
- [ ] 文件超大时只取 `git diff --numstat` 和 bounded header。
- [ ] binary change 记录 `binary=true`，不读取内容。
- [ ] manifest 只解析被修改的已知文件。
- [ ] 未知 ecosystem 不猜测新依赖。
- [ ] 不从变量名/类名直接判定“过度抽象”；只产生 candidate。
- [ ] protected path/keyword 不能直接等同安全，必须由 report 标为 `needs_human_review`。
- [ ] 不调用测试。
- [ ] 不输出 host decision JSON。
- [ ] dedupe fingerprint 覆盖 `HEAD/base + path + staged/unstaged diff hash + policy version`。

### 8.4 Stop/default

不增加第二个 Stop route script。扩展 `stop-orchestrator.sh`：

1. 在现有 stop review 前/中调用 `minimal-change review`。
2. 刷新 report。
3. 将最多 5 条摘要合并到现有 capture guidance。
4. 仍由 stop-orchestrator 生成唯一 host response。
5. v1 不阻断 Stop。

Checklist：

- [ ] Stop route tuple/order 不变。
- [ ] 不新增第二份 JSON envelope。
- [ ] `mode=off` 时现有 output byte-for-byte 不变。
- [ ] report 缺失时可现算一次 bounded summary。
- [ ] report stale 时刷新。
- [ ] 最终摘要包含：
  - 新依赖及理由。
  - 新文件数量及必要性。
  - 新 abstraction candidates。
  - 可删除/收缩项。
  - protected changes。
- [ ] findings 只作为 review prompts，不自动改代码。
- [ ] Stop 不因为 minimal-change finding 非零退出。
- [ ] handoff 中只记录 report path + verdict，不粘贴大段 diff。
- [ ] 与现有 plan self-review、evidence contract 的优先级一致。

## 9. Report Schema

目标文件：

```text
.ai/harness/checks/minimal-change.latest.json
```

Schema v1：

```json
{
  "version": 1,
  "policy_version": 1,
  "mode": "advice",
  "generated_at": "RFC3339",
  "repo_root": ".",
  "base_ref": "HEAD",
  "fingerprint": "sha256:...",
  "scope": {
    "paths": [],
    "manifest_paths": []
  },
  "signals": {
    "files_changed": 0,
    "files_added": 0,
    "files_deleted": 0,
    "loc_added": 0,
    "loc_deleted": 0,
    "binary_files": [],
    "dependency_manifests_changed": [],
    "new_dependencies": [],
    "new_file_paths": [],
    "abstraction_candidates": []
  },
  "protected_changes": [],
  "findings": [
    {
      "tag": "dependency",
      "path": "package.json",
      "severity": "advice",
      "evidence": "dependency X was added",
      "question": "Can the platform, stdlib, or an existing dependency cover this?"
    }
  ],
  "verdict": "lean"
}
```

### Allowed tags

- `delete`
- `stdlib`
- `native`
- `dependency`
- `yagni`
- `shrink`

### Verdict

- `disabled`
- `lean`
- `review`
- `unknown`

### Determinism

- [ ] paths 按 locale-independent byte order。
- [ ] findings 按 severity/tag/path/evidence 稳定排序。
- [ ] 时间字段不得参与 fingerprint。
- [ ] 同输入产生相同 signals/findings/verdict。
- [ ] error state 不输出半成品 JSON。
- [ ] schema version 不支持时 fail-open 并记录 `unknown`。

## 10. Dependency Manifest Adapters

Sprint 1 最小范围：

| Ecosystem | Manifest | Signal |
|---|---|---|
| Node/Bun | `package.json` | dependencies/devDependencies/optionalDependencies/peerDependencies 新 key |
| Python | `pyproject.toml` | 只在已有 parser/可靠 bounded parser 可用时支持，否则 Sprint 2 |
| Rust | `Cargo.toml` | 同上 |
| Go | `go.mod` | 新 require 行 |
| Ruby | `Gemfile` | 不做语义 parser，只记录 manifest changed |
| JVM | `build.gradle*`, `pom.xml` | 只记录 manifest changed |

Rules：

- [ ] Sprint 1 必须完整支持 `package.json`。
- [ ] 不为 TOML/XML 引入新 runtime dependency。
- [ ] 没有可靠 parser 时只输出 `manifest_changed`，不声称 `new_dependency`。
- [ ] workspace lockfile 变化本身不视为新增依赖。
- [ ] devDependency 仍记录，但 severity 不高于 advice。
- [ ] 删除依赖属于 positive shrink signal，不自动建议更多删除。
- [ ] 已有 dependency 从 dev 移到 prod 需单独标记，不算“新增 key”。

## 11. Protected Concerns Rules

以下变化不得生成 delete/shrink 建议：

- [ ] authn/authz、permissions、secrets、crypto、安全 header。
- [ ] input validation、schema validation、sanitization。
- [ ] transaction、backup、rollback、atomic write、data migration safeguards。
- [ ] retry/timeout/cancellation/error propagation。
- [ ] accessibility attributes、keyboard navigation、screen-reader behavior。
- [ ] 明确验收条件要求的代码。
- [ ] smoke/unit/integration/regression tests。
- [ ] 用于证明 non-trivial logic 的最小 runnable check。
- [ ] license/compliance/audit logging。
- [ ] concurrency/locking/idempotency correctness。

实现原则：

- Hook 不做最终语义判断。
- 信号只能将候选提升为 `protected_changes` 或 `needs_human_review`。
- 不确定时不报 finding。
- correctness/safety 优先于 net-negative LOC。

## 12. Epic Backlog

---


## Epic -1 — Canonical Hook Source / Projection Foundation

> 该 Epic 必须先于任何新 hook 文件合并。否则本 Sprint 会继续扩大双维护债务。

### Story HS-000: Audit and classify every hook artifact

**Existing paths**

- `assets/hooks/`
- `.ai/hooks/`
- `scripts/repo-harness.sh`
- `scripts/hook-shim.sh`
- `src/cli/hook/runtime.ts`
- `src/cli/hook/route-registry.ts`
- `src/core/adoption/operations.ts`
- `tests/hook-dedup.test.ts`
- `tests/hook-recursive-copy.test.ts`
- `tests/installed-copy-sync.test.ts`
- `tests/scaffold-parity.test.ts`
- `tests/migration-script.test.ts`

**Checklist**

- [ ] 保存 `find assets/hooks -type f -print0 | sort -z` 清单。
- [ ] 保存 `find .ai/hooks -type f -print0 | sort -z` 清单。
- [ ] 对同名文件比较 SHA-256 和 executable bit。
- [ ] 列出 package-only：
  - [ ] `codex.hooks.template.json`
  - [ ] `settings.template.json`
- [ ] 对以下 self-host-only 文件执行全仓 `rg -n`：
  - [ ] `codex-delegation-advisor.sh`
  - [ ] `subagent-start-context.sh`
  - [ ] `subagent-stop-quality.sh`
- [ ] 检查 host settings/templates 是否直接引用上述文件。
- [ ] 检查 route registry 是否引用上述文件。
- [ ] 检查 tests/docs/install scripts 是否引用上述文件。
- [ ] 每个额外文件记录 disposition：
  - [ ] `promote_to_canonical`
  - [ ] `repo_only_with_owner`
  - [ ] `delete_as_dead`
  - [ ] `archive_as_legacy`
- [ ] 对 `assets/hooks/lib/**` 与 `.ai/hooks/lib/**` 做 recursive drift audit。
- [ ] 记录 `~/.repo-harness/hooks/` installer 的实际 source path/copy rule。
- [ ] 确认 adoption 是否复制 full runtime、只复制 lib、或 preserve custom files。
- [ ] ADR 明确：author source、projection、package-only、repo-only、custom ownership。

**Acceptance**

- [ ] 每个现存 hook artifact 都有唯一分类。
- [ ] 不允许“暂时两个地方都改”作为 disposition。
- [ ] 未发现的运行时引用不会在 source collapse 后断裂。

### Story HS-001: Add projection manifest and deterministic sync command

**New**

- `assets/hooks/projection.json`
- `scripts/sync-hook-sources.ts`
- `.ai/hooks/.projection.json`

**Modify**

- `package.json`

**Checklist**

- [ ] `assets/hooks/` hard-coded 为 canonical root；不从 cwd 猜测。
- [ ] target hard-coded/validated 为 repo root 下 `.ai/hooks/`。
- [ ] manifest schema versioned。
- [ ] 默认命令为 `--check`，避免误写。
- [ ] `--write` 使用 temp file + atomic rename。
- [ ] recursive directory creation。
- [ ] copy exact bytes。
- [ ] preserve canonical executable bit。
- [ ] reject symlink escape。
- [ ] reject `..` / absolute manifest paths。
- [ ] package-only 不复制。
- [ ] repo-only 不从 canonical 删除。
- [ ] target unclassified files：报错并列出；不静默删除。
- [ ] target missing managed file：`--check` fail，`--write` restore。
- [ ] target modified managed file：`--check` fail，`--write` overwrite。
- [ ] target wrong mode：`--check` fail，`--write` repair。
- [ ] `.projection.json` 只含 schema/source/digest/file count，不含 timestamp/absolute path。
- [ ] digest 使用 relative path + bytes + normalized mode。
- [ ] 输出稳定排序。
- [ ] 无新增 npm dependency。
- [ ] package scripts：
  ```json
  {
    "sync:hooks": "bun scripts/sync-hook-sources.ts --write",
    "check:hooks": "bun scripts/sync-hook-sources.ts --check"
  }
  ```
- [ ] `bun run sync:hooks && git diff` 可审查。
- [ ] 第二次 `bun run sync:hooks` 空 diff。

**Acceptance**

- [ ] `.ai/hooks/` shared runtime 可从 canonical root 重建。
- [ ] 同输入产生相同 digest 和字节。
- [ ] unclassified drift 不会被吞掉。

### Story HS-002: CI, release, installer and adoption parity

**Modify**

- `scripts/check-ci.sh`
- `scripts/check-npm-release.sh`
- `scripts/repo-harness.sh`
- `src/core/adoption/operations.ts`
- existing hook copy/sync tests

**Checklist**

- [ ] `check-ci.sh` 运行 `bun run check:hooks`。
- [ ] `check-npm-release.sh` 运行 `bun run check:hooks`。
- [ ] prepublish 只 check，不 write。
- [ ] package tarball 包含 canonical shared runtime 和 package-only templates。
- [ ] package tarball 不依赖 `.ai/hooks/`。
- [ ] installed `~/.repo-harness/hooks/` 从 canonical package assets 派生。
- [ ] installed bundle digest 可与 canonical manifest 比较。
- [ ] `src/cli/hook/runtime.ts::packagedHooksDir()` 保持不变。
- [ ] `hook_source=repo` 仍解析 `.ai/hooks/`。
- [ ] `REPO_HARNESS_HOOK_SOURCE=central|repo|absolute` 语义不变。
- [ ] ordinary downstream adopt 不突然收到 full `.ai/hooks/`。
- [ ] pinned downstream sync 只更新 managed files。
- [ ] custom/unknown downstream hook preserve。
- [ ] rollback 不删除 custom hooks。
- [ ] 更新：
  - [ ] `tests/hook-dedup.test.ts`
  - [ ] `tests/hook-recursive-copy.test.ts`
  - [ ] `tests/installed-copy-sync.test.ts`
  - [ ] `tests/scaffold-parity.test.ts`
  - [ ] `tests/migration-script.test.ts`
  - [ ] `tests/hook-runtime.test.ts`
  - [ ] `tests/hook-shim-resolution.test.ts`
- [ ] 新增 `tests/hook-source-projection.test.ts`。

**Acceptance**

- [ ] authoring 只改 `assets/hooks/`。
- [ ] source checkout、npm package、installed central bundle 行为等价。
- [ ] downstream customization contract 无回归。
- [ ] route tuple/order/trust snapshot 无变化。

### Story HS-003: Developer guardrails

**Checklist**

- [ ] `assets/hooks/AGENTS.md` 写明 canonical authoring rule。
- [ ] `.ai/hooks/.projection.json` 供 tooling 判断 generated target。
- [ ] CI 错误明确提示：
  ```text
  Edit assets/hooks/<path>, then run bun run sync:hooks.
  ```
- [ ] PR template/reviewer checklist 增加 `bun run check:hooks`。
- [ ] 文档说明 physical projections ≠ multiple sources of truth。
- [ ] 不使用 symlink。
- [ ] 不在 generic downstream PreToolUse 中阻止 custom hook 编辑。
- [ ] source repo 如需 generated-file warning，只在 marker 存在时启用，且不改变 downstream 默认行为。

**Acceptance**

- [ ] 开发者错误编辑 `.ai/hooks` 会在本地/CI 获得可执行修复指令。
- [ ] 新增 hook 的开发说明只要求改 canonical root 一次。

---

## Epic 0 — Baseline、Call Graph 与 Contract Freeze

### Story MC-000: Pin baseline and create evidence packet

**Likely files**

- `.ai/harness/policy.json`
- `src/cli/hook/route-registry.ts`
- `src/cli/hook-entry.ts`
- `src/cli/hook/runtime.ts`
- `src/cli/hook/prompt-guard-decision.ts`
- `src/cli/commands/prompt-guard-decision.ts`
- `.ai/hooks/prompt-guard.sh`
- `.ai/hooks/stop-orchestrator.sh`

**Checklist**

- [ ] 记录实现开始时的 `git rev-parse HEAD`。
- [ ] 记录 `git status --short`，确保不覆盖无关改动。
- [ ] 运行 `bun install` 或仓库规定的依赖准备流程。
- [ ] 运行基线 `bun test`。
- [ ] 运行基线 `bun run check:type`。
- [ ] 运行基线 hook protocol/trust/copy tests。
- [ ] 保存基线耗时。
- [ ] 导出当前 `ROUTES` 的 tuple snapshot。
- [ ] 导出当前 Claude/Codex adapter snapshot。
- [ ] 定位 policy canonical source：
  ```bash
  rg -n '"hook_source"|edit_plan_gate|workflow-contract' \
    .ai/harness assets src tests
  ```
- [ ] 定位 prompt guard 唯一 JSON renderer：
  ```bash
  rg -n 'runPromptGuardDecideCli|additionalContext|hookSpecificOutput|decision' \
    src/cli .ai/hooks assets/hooks tests
  ```
- [ ] 定位 Stop host output 唯一所有者。
- [ ] 记录 `.ai/hooks` 与 `assets/hooks` drift 基线。
- [ ] 创建 Sprint active marker，遵守仓库现有 sprint workflow。
- [ ] 将本 Story 展开为 decision-complete plan/contract/worktree。

**Acceptance**

- [ ] baseline commit、测试结果、route tuple、adapter snapshot 均已保存。
- [ ] canonical policy source 已明确，不再用“可能”路径。
- [ ] UserPromptSubmit/Stop 各自的唯一 host output owner 已确认。
- [ ] 基线失败有记录且未被新代码掩盖。

### Story MC-001: Architecture decision record

**Checklist**

- [ ] 记录“不 vendor Ponytail runtime”。
- [ ] 记录“advisory-only”。
- [ ] 记录“no new public route tuple”。
- [ ] 记录“single decision owner for Prompt/Stop”。
- [ ] 记录“objective signals in hot path; semantic review at Stop”。
- [ ] 记录“both repo-pinned and packaged copies”。
- [ ] 记录“不引入 runtime dependency”。
- [ ] 记录 fail-open/error policy。
- [ ] Reviewer 批准 ADR。

**Acceptance**

- [ ] 每个关键约束都有 rationale 和 rejected alternatives。
- [ ] ADR 与本 Sprint 没有冲突。

---

## Epic 1 — Policy 与 Context Core

### Story MC-100: Implement minimal-change policy parser

**New file**

- `src/cli/hook/minimal-change-policy.ts`

**Checklist**

- [ ] 定义 `MinimalChangeMode = 'off' | 'advice' | 'enforce'`。
- [ ] 定义 versioned interface。
- [ ] 提供 immutable defaults。
- [ ] unknown field 忽略。
- [ ] unknown mode → `advice` 或 fail-open default，并有测试。
- [ ] `enforce` 在 v1 normalize 为 `advice`，且 `blocking=false`。
- [ ] path 必须限制在 repo `.ai/harness/` 下。
- [ ] `max_findings` bounded，例如 1–20。
- [ ] `max_context_words` bounded。
- [ ] malformed JSON 不抛到 hook runtime。
- [ ] 不 import commander。
- [ ] 不 import adoption/full CLI。
- [ ] 只使用 Bun/Node 内置模块和现有依赖。
- [ ] 单元测试覆盖 missing/partial/malformed/unknown/future version。

**Acceptance**

- [ ] parser 在所有错误输入下返回安全、非阻断配置。
- [ ] `mode=off` 可确定性禁用全部 feature。
- [ ] no new dependency。

### Story MC-101: Implement fixed context renderer

**New file**

- `src/cli/hook/minimal-change-context.ts`

**Checklist**

- [ ] renderer 输入为 normalized policy + phase/intent。
- [ ] SessionStart 文案稳定且短。
- [ ] execution prompt advice 不超过 100 words。
- [ ] protected concern 文案不可省略。
- [ ] 不复制整份 Ponytail SKILL。
- [ ] 不引用 benchmark 百分比。
- [ ] 不鼓励 code golf。
- [ ] explicit requirement 优先级写清楚。
- [ ] snapshot tests。
- [ ] 中英文仓库内容不影响固定英文 hook context；文档可双语。

**Acceptance**

- [ ] 固定输入得到 byte-stable 输出。
- [ ] off mode 输出空字符串。
- [ ] context word budget 通过测试。

### Story MC-102: Implement hook-only minimal-change CLI

**New file**

- `src/cli/hook/minimal-change-cli.ts`

**Modify**

- `src/cli/hook-entry.ts`

**Proposed commands**

```text
repo-harness-hook minimal-change context --phase session
repo-harness-hook minimal-change signals --phase post-edit
repo-harness-hook minimal-change review --phase stop
```

**Checklist**

- [ ] 在 `hook-entry.ts` 的 event parser 之前识别命令。
- [ ] 优先 dynamic import 或证明静态 import 足够轻。
- [ ] 不加载 commander。
- [ ] context stdout 只输出 text/context。
- [ ] signals stdout 为空，错误走 stderr。
- [ ] review stdout 只输出给 stop-orchestrator 消费的内部 JSON，不直接作为 host envelope。
- [ ] 每个 action 有明确 exit code。
- [ ] stdin 只读一次。
- [ ] 支持并发调用。
- [ ] malformed stdin exit 0/fail-open。
- [ ] cold-start benchmark 加入测试。

**Acceptance**

- [ ] 其他 hook command 基线输出无变化。
- [ ] event route usage error 保持原样。
- [ ] CLI hot path 没有 full CLI import。

---

## Epic 2 — SessionStart Integration

### Story MC-200: Add minimal-change context hook

**New files**

- `.ai/hooks/minimal-change-context.sh`
- `.ai/hooks/lib/minimal-change.sh`
- `assets/hooks/minimal-change-context.sh`
- `assets/hooks/lib/minimal-change.sh`

**Modify**

- `src/cli/hook/route-registry.ts`

**Checklist**

- [ ] shell 使用 `set -euo pipefail`，但所有 feature failure 转为 exit 0。
- [ ] source 现有 `hook-input.sh`/shared helper pattern。
- [ ] 复用 `HOOK_REPO_ROOT`。
- [ ] 定位 `repo-harness-hook` 的方式与 `prompt-guard.sh` 一致。
- [ ] 不使用 `.ponytail-active`。
- [ ] 读取 policy 后调用 hook-only CLI。
- [ ] stdout 只含 context。
- [ ] `mode=off` stdout 为空。
- [ ] route scripts 改为：
  ```ts
  ['session-start-context.sh', 'minimal-change-context.sh', 'security-sentinel.sh']
  ```
- [ ] 不改 route tuple/order。
- [ ] repo 和 assets copy 内容一致。
- [ ] executable bit 一致。
- [ ] missing script behavior 有测试。
- [ ] SessionStart multi-context aggregation 有测试。
- [ ] Claude/Codex smoke test。

**Acceptance**

- [ ] 新 context 在 SessionStart 可见。
- [ ] security sentinel 仍执行。
- [ ] route public snapshot 不变。
- [ ] packaged/repo-pinned 都通过。

---

## Epic 3 — Prompt Guard Integration

### Story MC-300: Attach advice to execution intents

**Modify**

- `src/cli/hook/prompt-guard-decision.ts`
- `src/cli/commands/prompt-guard-decision.ts`
- `.ai/hooks/prompt-guard.sh`
- `assets/hooks/prompt-guard.sh`

**Checklist**

- [ ] 不新增 UserPromptSubmit script。
- [ ] 复用 `PROMPT_GUARD_EXECUTION_INTENTS`。
- [ ] `isExecutionIntent` 如需复用则导出，或在同模块内组合。
- [ ] decision matrix action 不变。
- [ ] block/advice/allow action 名称不变。
- [ ] 现有 evidence/contract gate 优先。
- [ ] 只有最终允许执行的路径附加 minimal advice。
- [ ] 用户明确要求新抽象/依赖时 advice 改为“justify”，而不是“remove”。
- [ ] prompt 中含安全、验证、可访问性、测试时保护优先。
- [ ] shell 不负责 JSON 拼接。
- [ ] Claude payload schema 不变。
- [ ] Codex payload schema 不变。
- [ ] mode off byte-for-byte regression test。
- [ ] planning intent regression test。
- [ ] passive status regression test。
- [ ] execution intent positive tests。
- [ ] plan block tests 保持原期望。

**Acceptance**

- [ ] 仅 execution intent 出现 minimal-change advice。
- [ ] 无双 JSON、无多余 stdout。
- [ ] 现有 prompt guard contract 全部通过。

---

## Epic 4 — Post-edit Objective Signals

### Story MC-400: Implement signal collector

**New file**

- `src/cli/hook/minimal-change-signals.ts`

**Checklist**

- [ ] 输入包含 repo root、edited path、policy、optional base ref。
- [ ] 使用 `git diff --numstat` 或等价 bounded command。
- [ ] 单次只处理本次 path + changed manifest。
- [ ] untracked file 能记录 `new_file_paths`。
- [ ] deleted file 能记录 positive deletion signal。
- [ ] rename 不双计 added/deleted。
- [ ] binary 不读取内容。
- [ ] `package.json` 解析新增/删除/移动 dependency。
- [ ] lockfile 不单独判新增依赖。
- [ ] 其他 manifest 仅记录 changed，除非有可靠 parser。
- [ ] abstraction candidates 规则公开、可测试、低置信度。
- [ ] 无法证明时不产生 finding。
- [ ] protected candidates 优先移入 `protected_changes`。
- [ ] max findings 裁剪。
- [ ] deterministic order。
- [ ] fingerprint 不含时间。
- [ ] report 原子写。
- [ ] concurrent write 测试。
- [ ] report parent dir 不存在时安全创建。
- [ ] path traversal 拒绝。
- [ ] symlink escape 拒绝或安全 normalize。
- [ ] error fail-open。

**Acceptance**

- [ ] objective signals schema v1 通过。
- [ ] package.json 新依赖、已有依赖、删除依赖测试通过。
- [ ] binary/rename/untracked/concurrent cases 通过。

### Story MC-401: Add post-edit observer hook

**New files**

- `.ai/hooks/minimal-change-observer.sh`
- `assets/hooks/minimal-change-observer.sh`

**Modify**

- `src/cli/hook/route-registry.ts`

**Checklist**

- [ ] scripts 改为：
  ```ts
  ['post-edit-guard.sh', 'minimal-change-observer.sh']
  ```
- [ ] route tuple/order 不变。
- [ ] observer 读取标准 hook input。
- [ ] 只在 Edit/Write 事件触发，由 route matcher 保证。
- [ ] stdout 永远为空。
- [ ] stderr 只输出短错误。
- [ ] exit 0。
- [ ] mode off 立即返回。
- [ ] dedupe 命中立即返回。
- [ ] repo/assets copies 一致。
- [ ] executable bit 一致。
- [ ] report path 写入成功。
- [ ] runtime 遇 observer soft failure 仍继续。
- [ ] no host decision output test。

**Acceptance**

- [ ] 编辑后 report 更新。
- [ ] 重复相同输入不重复工作。
- [ ] PostToolUse protocol 不受影响。

---

## Epic 5 — Stop Review 与 Handoff Evidence

### Story MC-500: Implement final review renderer

**Modify/new**

- `src/cli/hook/minimal-change-cli.ts`
- `src/cli/hook/minimal-change-context.ts`
- `src/cli/hook/minimal-change-signals.ts`

**Checklist**

- [ ] review 读取 latest report。
- [ ] fingerprint stale 时进行 bounded refresh。
- [ ] 最多 5 条 findings。
- [ ] 每条 finding 一行。
- [ ] tag 使用允许集合。
- [ ] 提问式建议，不直接命令删除。
- [ ] protected changes 单独分组。
- [ ] 无 finding 输出 `lean`。
- [ ] 不把 LOC 作为唯一 verdict。
- [ ] report missing/error → `unknown`，不阻断。
- [ ] internal JSON 与 host JSON 明确区分。
- [ ] stable snapshots。

**Acceptance**

- [ ] lean/review/unknown/disabled 四种结果有测试。
- [ ] 不泄露大 diff 或绝对用户路径。

### Story MC-501: Integrate into stop-orchestrator

**Modify**

- `.ai/hooks/stop-orchestrator.sh`
- `assets/hooks/stop-orchestrator.sh`

**Checklist**

- [ ] 不增加 Stop route script。
- [ ] 调用 helper 的位置不破坏现有 handoff refresh。
- [ ] plan self-review 先后次序有明确 rationale。
- [ ] minimal review 只追加 guidance/evidence。
- [ ] 唯一 host response 仍由 stop-orchestrator 输出。
- [ ] mode off byte-for-byte regression。
- [ ] finding 存在时仍 exit 0。
- [ ] existing stop block/allow semantics 不变。
- [ ] handoff 记录 report path、verdict、fingerprint。
- [ ] repo/assets copies 一致。
- [ ] Claude/Codex Stop protocol tests。
- [ ] no double JSON test。

**Acceptance**

- [ ] Stop 阶段用户/agent 能看到简短 review。
- [ ] 找到问题也不阻断。
- [ ] 现有 Stop orchestrator contract 不回归。

---


## Epic 5A — Deep Diff Review Rubric and Freshness

### Story RV-500: Implement versioned review rubric renderer

**New**

- `src/cli/hook/review-rubric.ts`
- `tests/review-rubric.test.ts`

**Modify**

- `src/cli/hook-entry.ts`

**Checklist**

- [ ] 定义 `REVIEW_RUBRIC_VERSION = 1`。
- [ ] 固定八个审查维度。
- [ ] 固定 severity order：P0/P1/P2/P3。
- [ ] 明确完整 diff scope：
  - [ ] branch diff against target
  - [ ] staged
  - [ ] unstaged
  - [ ] untracked
- [ ] 明确可读 surrounding code，不限 changed lines。
- [ ] 明确 review-only：不编辑、不写文件。
- [ ] 每条 finding 必填：
  - [ ] severity
  - [ ] title
  - [ ] `file:line`
  - [ ] impact
  - [ ] evidence/reproduction
  - [ ] smallest safe fix
  - [ ] regression test
- [ ] 禁止 style-only nits。
- [ ] 无 findings 时输出 `No findings` + residual risks/test gaps。
- [ ] minimal-change/YAGNI 只作为维护成本维度，不自动升级到 P0/P1。
- [ ] output stable snapshot。
- [ ] review-rubric command 使用 dynamic import，不影响普通 hook cold start。
- [ ] malformed args fail-open/advisory。
- [ ] 不 import full commander CLI。

**Acceptance**

- [ ] rubric 不依赖 Ponytail runtime。
- [ ] 同一 version 输出 byte-stable。
- [ ] 可供 local `/check` 与 external acceptance 复用。

### Story RV-501: Integrate rubric into existing review intent path

**Canonical modify**

- `assets/hooks/prompt-guard.sh`

**Generated**

- `.ai/hooks/prompt-guard.sh`

**Checklist**

- [ ] 不新增 UserPromptSubmit route/script。
- [ ] 只在现有 `PG_FACT REVIEW_RELEASE` 分支调用 rubric renderer。
- [ ] Waza `/check` route hint 保持。
- [ ] external acceptance 并行提示保持。
- [ ] peer prompt 包含相同 rubric version。
- [ ] peer prompt 继续要求：
  - [ ] acceptance only
  - [ ] do not run `/check`
  - [ ] do not edit files
  - [ ] do not write files
- [ ] prompt 包含 active plan/contract/review/checks paths。
- [ ] output 仍由 `prompt-guard.sh` 单独拥有。
- [ ] Claude host output 测试。
- [ ] Codex host output 测试。
- [ ] implementation prompt 不出现 rubric。
- [ ] planning prompt 不出现 rubric。
- [ ] review false-positive prompts 不出现 rubric。
- [ ] explicit “review current diff” 出现 rubric。
- [ ] review/release classifier regression corpus。
- [ ] 修改 canonical 后通过 projection 生成 repo copy。

**Acceptance**

- [ ] 用户给出的 review flow 能自动出现在 review route 上。
- [ ] 不增加日常 edit latency。
- [ ] 不产生第二份 decision JSON。

### Story RV-502: Add implementation diff fingerprint

**New/shared**

- `src/cli/hook/diff-fingerprint.ts`
- `tests/review-freshness.test.ts`

**Reuse**

- `src/cli/hook/minimal-change-signals.ts`

**Checklist**

- [ ] minimal-change report 与 review freshness 共用一套 fingerprint，不平行实现。
- [ ] fingerprint 输入包含：
  - [ ] selected base/target identity
  - [ ] HEAD
  - [ ] staged diff
  - [ ] unstaged diff
  - [ ] untracked path + bounded content digest
- [ ] stable relative path sorting。
- [ ] 不含 timestamp、absolute path。
- [ ] 排除 review/evidence operational files：
  - [ ] active `tasks/reviews/*.review.md`
  - [ ] `.ai/harness/checks/**`
  - [ ] fingerprint/report temp files
- [ ] generated files是否排除必须由 contract 明确，不用猜测。
- [ ] binary files 用 metadata/content hash，不把 binary 写入 prompt。
- [ ] symlink、rename、delete、untracked、empty repo fixtures。
- [ ] 大文件采用 bounded hashing policy，并在 fingerprint schema 记录。
- [ ] base 无法解析时返回 `unknown`，不伪造 freshness。
- [ ] concurrent invocation deterministic。
- [ ] 性能只在 review/done 时发生，不放在每次 Edit hot path。

**Acceptance**

- [ ] review artifact 自身更新不会令 fingerprint 自失效。
- [ ] implementation diff 任意实际变化会改变 fingerprint。
- [ ] 相同 diff 在不同 absolute checkout path 得到相同 fingerprint。

### Story RV-503: Persist and enforce review freshness compatibly

**Canonical modify**

- `assets/hooks/lib/workflow-state.sh`
- `assets/hooks/prompt-guard.sh`
- `assets/hooks/stop-orchestrator.sh`

**Existing scaffold**

- `scripts/plan-to-todo.sh`
- 由 MC-000 定位的 canonical review template/source

**Checklist**

- [ ] review scaffold 增加：
  ```markdown
  > **Review Rubric Version**: 1
  > **Reviewed Diff Fingerprint**: sha256:...
  > **Reviewed Scope**: branch+staged+unstaged+untracked
  ```
- [ ] local `/check` prompt 要求写入 fingerprint。
- [ ] external acceptance prompt 要求引用同一 fingerprint。
- [ ] `workflow_review_fingerprint` parser 只读、容错。
- [ ] `workflow_review_is_fresh` 使用 shared CLI/helper。
- [ ] 新 review fingerprint stale：
  - [ ] Done gate block
  - [ ] 指示重新运行 `/check` 和 peer acceptance
- [ ] legacy review 缺 fingerprint：
  - [ ] v1 warning
  - [ ] 不因升级立即 block
  - [ ] 下一次 `/check` 自动升级格式
- [ ] malformed fingerprint：
  - [ ] warning/unknown
  - [ ] 不把 malformed 当 pass
- [ ] Stop 只在 missing/stale 时输出简短 nudge。
- [ ] Stop 不运行完整语义 review。
- [ ] review pass 与 external acceptance pass 的原有 gate 不弱化。
- [ ] checks evidence 原有 gate 不弱化。
- [ ] canonical hook 修改后 projection sync。
- [ ] workflow-state tests。
- [ ] prompt-guard done tests。
- [ ] Stop protocol tests。

**Acceptance**

- [ ] review 后继续修改实现会使完成证据失效。
- [ ] 老项目平滑升级。
- [ ] 不出现 review 文件写入导致自身永久 stale 的循环。

### Story RV-504: Review-quality evaluation corpus

**Fixtures**

- hidden state mutation
- host protocol compatibility break
- empty/malformed input boundary
- quadratic hot-path regression
- path traversal / permission risk
- misleading function/API name
- missing regression test
- unnecessary wrapper/dependency
- style-only nit
- clean diff

**Checklist**

- [ ] 每个 fixture 有 expected severity。
- [ ] P0/P1/P2/P3 排序稳定。
- [ ] style-only nit 不应成为 finding。
- [ ] clean diff 输出 No findings + residual risk。
- [ ] minimal-change finding 不掩盖 correctness finding。
- [ ] 每个 expected finding 要求 evidence + smallest safe fix + test。
- [ ] reviewer blind evaluation。
- [ ] false positive/false negative 记录。
- [ ] dogfood 目标：
  - [ ] P0/P1 precision 100%
  - [ ] unsafe advice 0
  - [ ] vague finding 0
  - [ ] file:line coverage 100%

**Acceptance**

- [ ] rubric 显著强于“只看语法/明显 bug”的 baseline。
- [ ] 输出可直接写入现有 review artifact。

---

## Epic 6 — Adoption、Packaging 与 Migration

### Story MC-600: Update managed policy source

**Checklist**

- [ ] 根据 MC-000 结果修改 canonical source，不只改 `.ai/harness/policy.json`。
- [ ] downstream 新安装默认 `minimal_change.mode=advice`。
- [ ] migrate 对已有显式配置执行 preserve/merge。
- [ ] 用户显式 `off` 不被升级覆盖。
- [ ] unknown custom fields 保留。
- [ ] dry-run upgrade plan 显示新增 default。
- [ ] rollback 不删除用户自定义内容。
- [ ] workflow contract schema 如需更新则 versioned。
- [ ] adoption unit tests。
- [ ] migration fixture tests。
- [ ] inspect/doctor 输出能说明当前 mode（仅在已有输出模型允许时）。

**Acceptance**

- [ ] fresh init、migrate、upgrade、rollback 四条路径通过。
- [ ] explicit override 保留。
- [ ] 旧 repo 不因缺少字段失败。

### Story MC-601: Project canonical hook changes into runtime copies

> 不再“同时维护两棵树”。所有实现首先修改 `assets/hooks/`，然后运行 projection。

**Checklist**

- [ ] minimal-change hook 只在 `assets/hooks/` 手工创建。
- [ ] review-rubric shell integration 只在 `assets/hooks/` 手工修改。
- [ ] shared lib 只在 `assets/hooks/lib/` 手工修改。
- [ ] 运行 `bun run sync:hooks` 生成 `.ai/hooks/`。
- [ ] 运行 `bun run check:hooks`。
- [ ] projection digest 更新且 deterministic。
- [ ] recursive projection 覆盖 nested lib。
- [ ] executable bits 一致。
- [ ] npm package files 已包含 canonical assets。
- [ ] installed copy tests。
- [ ] self-host `hook_source=repo` tests。
- [ ] central-first packaged tests。
- [ ] sync drift tests。
- [ ] source repo unclassified file tests。
- [ ] downstream custom hook preserve tests。
- [ ] missing managed hook upgrade 行为符合 ownership contract。

**Acceptance**

- [ ] 一个手工改动点生成全部运行投影。
- [ ] package tarball、repo-pin、installed central bundle shared digest 一致。
- [ ] custom hooks preserved。
- [ ] `.ai/hooks/` 无人工维护差异。

---

## Epic 7 — Tests、Evaluation 与 Performance

### Story MC-700: Contract and protocol regression

**Modify**

- `tests/hook-contracts.test.ts`
- `tests/hook-runtime.test.ts`
- `tests/hook-protocol.test.ts`
- `tests/hook-shim-trust.test.ts`

**Checklist**

- [ ] baseline tuple snapshot 与实现后完全相同。
- [ ] route 数量不变。
- [ ] route order 不变。
- [ ] matcher 不变。
- [ ] SessionStart internal scripts 扩展符合预期。
- [ ] PostEdit internal scripts 扩展符合预期。
- [ ] Prompt/Stop internal script 数量不变。
- [ ] Claude SessionStart aggregation。
- [ ] Codex SessionStart aggregation。
- [ ] Claude prompt decision。
- [ ] Codex prompt decision。
- [ ] Claude Stop decision。
- [ ] Codex Stop decision。
- [ ] no duplicate JSON。
- [ ] missing script soft behavior。
- [ ] nonzero observer fail-open。
- [ ] concurrent invocation。

**Acceptance**

- [ ] adapter trust snapshot 不变。
- [ ] 所有 host protocol tests 通过。

### Story MC-701: Safety evaluation fixtures

创建至少以下 fixtures：

1. **one-off dependency**
   - 为一个简单格式化任务新增包。
   - 期望：`dependency` finding。
2. **stdlib replacement**
   - 新依赖功能可由 stdlib 覆盖。
   - 期望：dependency + stdlib review question。
3. **existing dependency reuse**
   - package 已存在。
   - 期望：不报 new dependency。
4. **unnecessary wrapper**
   - 仅转发一个现有 API。
   - 期望：`shrink` 或 `yagni` candidate。
5. **duplicate helper**
   - 同一小逻辑第二份实现。
   - 期望：candidate。
6. **security validation**
   - 新增输入校验。
   - 期望：protected；不得 delete/shrink。
7. **data-loss safeguard**
   - 新增 atomic write/backup。
   - 期望：protected。
8. **accessibility**
   - 新增 aria/keyboard handling。
   - 期望：protected。
9. **regression test**
   - 新增最小测试。
   - 期望：protected。
10. **explicit requested abstraction**
    - approved plan 明确要求 public interface。
    - 期望：仅 justify，不要求删除。
11. **binary file**
    - 期望：不读取内容。
12. **unknown ecosystem manifest**
    - 期望：只报 changed，不猜 dependency。

**Checklist**

- [ ] 每个 fixture 有 expected report。
- [ ] protected false positive = 0。
- [ ] opportunity signal recall >= 4/5。
- [ ] output deterministic。
- [ ] findings <= configured max。
- [ ] no automatic code changes。
- [ ] reviewer 手工检查 wording。

### Story MC-702: Performance and concurrency

**Checklist**

- [ ] 记录基线 hook-entry cold start。
- [ ] 记录实现后 cold start。
- [ ] SessionStart 100 次采样。
- [ ] PostEdit observer 100 次采样。
- [ ] Stop review 50 次采样。
- [ ] 1k file fixture。
- [ ] 大 `package.json` fixture。
- [ ] binary diff fixture。
- [ ] 10 并发写 report。
- [ ] 50 并发 hook runtime 调用。
- [ ] 检查无 partial JSON。
- [ ] 检查无 deadlock。
- [ ] 检查无 orphan temp file。
- [ ] 检查 mode off 快路径。
- [ ] 生成 benchmark evidence。

**Acceptance**

- [ ] PostEdit median `<100ms` 目标达成，或给出有数据的 waiver。
- [ ] PostEdit p95 `<200ms` 目标达成，或给出有数据的 waiver。
- [ ] 其他 route 冷启动回归 `<=10%`。
- [ ] 并发测试稳定。

---

## Epic 8 — Documentation、Dogfood 与 Release

### Story MC-800: Documentation

**Checklist**

- [ ] `docs/reference-configs/minimal-change-hooks.md`：
  - architecture。
  - policy schema。
  - host behavior。
  - report schema。
  - fail-open。
  - protected concerns。
  - opt-out。
  - troubleshooting。
- [ ] `README.md` 添加 feature 与配置片段。
- [ ] `README.zh-CN.md` 同步。
- [ ] `docs/CHANGELOG.md` 记录。
- [ ] 明确该能力借鉴原则，不 vendor Ponytail。
- [ ] 不引用未经本仓验证的 benchmark。
- [ ] 说明 advice 不是 correctness/security review 替代品。
- [ ] 说明 `mode=enforce` v1 不阻断。
- [ ] 说明 report 是 operational evidence，不应提交或应遵循现有 ignore policy。
- [ ] 文档命令实际执行验证。

**Acceptance**

- [ ] 文档与当前实现/schema 一致。
- [ ] 中英文配置字段一致。
- [ ] 无过时 route 名称。

### Story MC-801: Dogfood on repo-harness

**Checklist**

- [ ] self-host `hook_source=repo` 开启 advice。
- [ ] 至少 20 个 SessionStart 样本。
- [ ] 至少 30 个 Edit/Write 样本。
- [ ] 至少 10 个 Stop 样本。
- [ ] 记录新增依赖发现。
- [ ] 记录新文件提示。
- [ ] 记录 protected cases。
- [ ] 标记每条 finding：useful / noise / unsafe。
- [ ] useful precision 目标 `>=80%`。
- [ ] unsafe finding 必须为 0。
- [ ] 修正 wording/heuristic 后重新跑 regression。
- [ ] mode off 回滚演练。
- [ ] packaged hook source smoke test。

**Acceptance**

- [ ] dogfood evidence 进入 `.ai/harness/checks/` 或现有 run evidence。
- [ ] unsafe finding = 0。
- [ ] reviewer 批准默认 advice。

### Story MC-802: Release readiness

**Checklist**

- [ ] `bun test`
- [ ] `bun run test:coverage`
- [ ] `bun run check:type`
- [ ] `bun run check:ci`
- [ ] `bun run check:release`
- [ ] package tarball inspect。
- [ ] installed-copy smoke test。
- [ ] fresh init smoke test。
- [ ] migrate smoke test。
- [ ] Claude Code host smoke test。
- [ ] Codex host smoke test。
- [ ] changelog。
- [ ] release note。
- [ ] rollback note。
- [ ] no new dependency verification。
- [ ] no route tuple/order diff verification。
- [ ] active Sprint 状态更新为 Done。
- [ ] handoff/current.md 刷新。
- [ ] archive/close contract/worktree。

**Acceptance**

- [ ] 所有 release gates 通过。
- [ ] next-minor release 可发布。
- [ ] rollback 只需 policy `mode=off` 或 revert feature PR，不需重装 host adapters。

## 13. 12-Day Execution Plan

### Day 1 — Baseline / authority audit

- [ ] MC-000。
- [ ] MC-001 ADR Draft。
- [ ] HS-000。
- [ ] route/adapter snapshots。
- [ ] policy source 与 output ownership call graph。
- [ ] 三种 runtime materialization source/copy path。
- [ ] 当前 hook tree SHA/mode diff。
- [ ] benchmark baseline。

**Daily exit:** 每个 hook 文件有分类，所有运行链路有 source map。

### Day 2 — Canonical projection core

- [ ] HS-001。
- [ ] `projection.json`。
- [ ] `sync-hook-sources.ts`。
- [ ] `sync:hooks` / `check:hooks`。
- [ ] deterministic digest。
- [ ] package-only exclusion。
- [ ] extra self-host file disposition。

**Daily exit:** `.ai/hooks` 可以由 `assets/hooks` 一键重建，二次运行空 diff。

### Day 3 — Projection CI / release / adoption parity

- [ ] HS-002。
- [ ] HS-003。
- [ ] hook-dedup/recursive-copy/installed-copy/scaffold/migration tests。
- [ ] `check-ci.sh` / `check-npm-release.sh`。
- [ ] tarball smoke。
- [ ] custom-hook preservation。
- [ ] source checkout repo-pin smoke。

**Daily exit:** 单作者源基础设施先独立可合并。

### Day 4 — Minimal-change policy / context / CLI core

- [ ] MC-100。
- [ ] MC-101。
- [ ] MC-102。
- [ ] policy/context unit tests。
- [ ] hook-entry cold-start 初测。

**Daily exit:** 本地可运行 minimal-change context，off/advice 正常。

### Day 5 — SessionStart / execution prompt integration

- [ ] MC-200。
- [ ] MC-300。
- [ ] 只改 canonical hook source。
- [ ] projection sync。
- [ ] SessionStart aggregation。
- [ ] execution intent matrix。
- [ ] planning/passive/off byte regression。

**Daily exit:** 执行路径收到简短 advice，其他 intent 无噪声。

### Day 6 — Signals core

- [ ] MC-400。
- [ ] report schema。
- [ ] package.json dependency adapter。
- [ ] binary/rename/untracked。
- [ ] atomic write。
- [ ] shared fingerprint primitive 起步。

**Daily exit:** bounded diff 可生成 deterministic objective report。

### Day 7 — PostEdit observer

- [ ] MC-401。
- [ ] canonical observer hook。
- [ ] projection sync。
- [ ] stdout-silent/protocol tests。
- [ ] concurrency/dedupe。
- [ ] median/p95 初测。

**Daily exit:** 编辑后只更新证据，不抢占 host decision。

### Day 8 — Deep review rubric

- [ ] RV-500。
- [ ] RV-501。
- [ ] rubric snapshots。
- [ ] REVIEW_RELEASE classifier regression。
- [ ] local `/check` + external acceptance prompt integration。
- [ ] no-edit/no-write contract。

**Daily exit:** 用户请求 review current diff 时自动获得结构化深审 rubric。

### Day 9 — Review freshness

- [ ] RV-502。
- [ ] RV-503。
- [ ] implementation diff fingerprint。
- [ ] evidence exclusions。
- [ ] legacy warning/new stale blocking。
- [ ] review scaffold。
- [ ] Done/Stop protocol tests。

**Daily exit:** review 后继续改实现能够可靠使证据 stale，且无自失效循环。

### Day 10 — Stop review / adoption / packaging

- [ ] MC-500。
- [ ] MC-501。
- [ ] MC-600。
- [ ] MC-601。
- [ ] single Stop owner。
- [ ] fresh init/migrate/upgrade/rollback。
- [ ] packaged/repo-pin/installed parity。

**Daily exit:** minimal-change 与 deep review 都进入既有 completion chain。

### Day 11 — Full regression / evaluation / performance / docs

- [ ] MC-700。
- [ ] MC-701。
- [ ] MC-702。
- [ ] RV-504。
- [ ] MC-800。
- [ ] MC-801 dogfood。
- [ ] protected false positive = 0。
- [ ] review unsafe finding = 0。
- [ ] latency/concurrency evidence。

**Daily exit:** public adapter contract 无变化，质量与性能证据可审查。

### Day 12 — Release gate / rollback / closeout

- [ ] MC-801 reviewer sign-off。
- [ ] MC-802。
- [ ] `bun run check:hooks`。
- [ ] full CI/release/tarball。
- [ ] Claude/Codex smoke。
- [ ] central/repo-pin/absolute override smoke。
- [ ] review freshness rollback。
- [ ] minimal-change `mode=off` rollback。
- [ ] changelog/release notes。
- [ ] Sprint/contract/worktree closeout。

**Daily exit:** 可合并、可发布、可关闭，并且以后新增 hook 只改一处。

## 14. Suggested PR Slices

### PR 0 — `refactor(hooks): establish assets/hooks as the single authoring source`

范围：

- projection manifest。
- sync/check command。
- `.ai/hooks` generated projection。
- extra self-host hook audit。
- CI/release parity。
- installed/repo-pin/adoption tests。

Merge gate：

- [ ] route tuple/order unchanged。
- [ ] runtime resolution unchanged。
- [ ] second sync empty diff。
- [ ] no unclassified files。
- [ ] custom hooks preserved。
- [ ] tarball/installed/repo-pin parity。

### PR 1 — `feat(hooks): add minimal-change policy and session context`

范围：

- policy parser。
- context renderer。
- hook-only CLI。
- SessionStart integration。
- execution prompt advice。
- canonical hook edits + projection。

Merge gate：

- [ ] mode off byte regression。
- [ ] SessionStart host smoke。
- [ ] no duplicate prompt decision。
- [ ] `check:hooks` pass。

### PR 2 — `feat(hooks): collect minimal-change edit signals`

范围：

- signal collector。
- PostEdit observer。
- report schema。
- dependency adapter。
- shared diff fingerprint primitive。
- atomic/dedupe/concurrency tests。

Merge gate：

- [ ] stdout silent。
- [ ] objective-only。
- [ ] performance target。
- [ ] protected fixtures。
- [ ] no new dependency。

### PR 3 — `feat(review): add severity-ranked deep diff review rubric`

范围：

- review-rubric module。
- REVIEW_RELEASE integration。
- external acceptance prompt。
- review output contract。
- evaluation corpus。

Merge gate：

- [ ] review-only/no-write。
- [ ] P0→P3 stable ordering。
- [ ] file:line/evidence/fix/test required。
- [ ] no style-only noise。
- [ ] implementation/planning prompts unchanged。

### PR 4 — `feat(review): invalidate stale review evidence`

范围：

- shared diff fingerprint。
- review scaffold metadata。
- workflow-state freshness parser。
- Done/Stop integration。
- legacy compatibility。

Merge gate：

- [ ] review file does not self-invalidate。
- [ ] implementation change invalidates fingerprint。
- [ ] legacy missing fingerprint warning-only。
- [ ] single Prompt/Stop output owner。
- [ ] protocol tests pass。

### PR 5 — `chore(adoption): package, migrate, document and release`

范围：

- canonical policy source。
- adoption/migration/init/upgrade。
- docs/changelog。
- dogfood/performance evidence。
- release tests。

Merge gate：

- [ ] packaged/repo-pin/installed parity。
- [ ] custom hook preservation。
- [ ] package tarball。
- [ ] full release checks。
- [ ] rollback verified。

## 15. Developer Tracking Checklist

### Start of every Story

- [ ] Sprint row selected through existing backlog helper.
- [ ] Decision-complete plan created/approved.
- [ ] Execution contract generated.
- [ ] Dedicated worktree started when required.
- [ ] Baseline tests scoped and recorded.
- [ ] Likely files confirmed by `rg`/call graph。
- [ ] Unrelated dirty files excluded。
- [ ] Acceptance criteria copied into plan。

### During implementation

- [ ] Keep route tuple/order unchanged。
- [ ] Edit hook runtime only under `assets/hooks/`。
- [ ] Run `bun run sync:hooks` after canonical hook edits。
- [ ] Never hand-fix generated `.ai/hooks/` drift。
- [ ] Keep host output ownership single。
- [ ] Keep feature advisory-only。
- [ ] Keep hot path bounded。
- [ ] Update repo and packaged hook copies together。
- [ ] Add test with every behavior change。
- [ ] Fail-open on parse/runtime error。
- [ ] Do not add dependencies。
- [ ] Do not weaken security/validation/tests。
- [ ] Update evidence after each validation run。

### Before review

- [ ] `git diff --stat` reviewed。
- [ ] New files justified。
- [ ] New abstractions justified。
- [ ] New dependencies count = 0。
- [ ] Public API/route snapshot reviewed。
- [ ] Shell stdout inspected。
- [ ] Claude payload inspected。
- [ ] Codex payload inspected。
- [ ] Mode off regression run。
- [ ] Protected fixtures run。
- [ ] Performance sample run。
- [ ] `bun run check:hooks` passed。
- [ ] Projection contains no unclassified files。
- [ ] Packaged/repo-pin/installed shared digest checked。
- [ ] Handoff updated。

### Before merge

- [ ] Story acceptance complete。
- [ ] Reviewer checklist complete。
- [ ] Contract evidence complete。
- [ ] `bun run check:ci`。
- [ ] Targeted protocol/trust/copy tests。
- [ ] No partial/temp artifacts。
- [ ] No report file accidentally committed unless repo policy expects it。
- [ ] Worktree clean。
- [ ] PR scope matches Story。
- [ ] Sprint row status updated。

## 16. Test Command Matrix

先以仓库实际 scripts 为准；以下命令在 Story MC-000 中校准。

```bash
# Core
bun test
bun run test:coverage
bun run check:type
bun run check:hooks
bun run check:ci

# Canonical hook projection
bun run sync:hooks
git diff --exit-code -- .ai/hooks
bun test tests/hook-source-projection.test.ts
bun test tests/hook-dedup.test.ts
bun test tests/hook-recursive-copy.test.ts
bun test tests/installed-copy-sync.test.ts
bun test tests/scaffold-parity.test.ts
bun test tests/migration-script.test.ts

# Targeted existing contracts
bun test tests/hook-contracts.test.ts
bun test tests/hook-runtime.test.ts
bun test tests/hook-protocol.test.ts
bun test tests/hook-shim-trust.test.ts
bun test tests/hook-recursive-copy.test.ts
bun test tests/installed-copy-sync.test.ts

# New
bun test tests/minimal-change-policy.test.ts
bun test tests/minimal-change-context.test.ts
bun test tests/minimal-change-signals.test.ts
bun test tests/minimal-change-protocol.test.ts
bun test tests/minimal-change-performance.test.ts
bun test tests/review-rubric.test.ts
bun test tests/review-freshness.test.ts

# Release
bun run check:release
```

Manual smoke template：

```bash
# Verify tuple/order is unchanged
git diff -- src/cli/hook/route-registry.ts

# Verify no new runtime dependency
git diff -- package.json bun.lock

# Verify repo/assets copies
diff -u .ai/hooks/minimal-change-context.sh \
        assets/hooks/minimal-change-context.sh
diff -u .ai/hooks/minimal-change-observer.sh \
        assets/hooks/minimal-change-observer.sh
diff -u .ai/hooks/lib/minimal-change.sh \
        assets/hooks/lib/minimal-change.sh

# Verify report validity
jq . .ai/harness/checks/minimal-change.latest.json

# Verify observer is stdout-silent
# Use the repository's existing hook test fixture/input generator rather than
# inventing a host payload by hand.
```

## 17. Risk Register

| Risk | Impact | Mitigation | Gate |
|---|---|---|---|
| 鼓励 code golf，损害可维护性 | High | protected precedence；advice-only；不以 LOC 单指标 | safety fixtures |
| 安全/验证代码被误判 | Critical | protected concerns；不确定不报；unsafe finding=0 | MC-701 |
| Hook latency | High | bounded path/diff；dynamic import；dedupe；benchmark | MC-702 |
| Prompt/Stop 双 JSON | Critical | 单一 output owner；不增加对应 route script | protocol tests |
| Codex trust 重提示 | High | tuple/order/matcher snapshot 不变 | trust tests |
| `.ai/hooks` 与 `assets/hooks` 漂移 | High | `assets/hooks` 单作者源；deterministic projection；CI check | HS-001/002 |
| package-only 与 shared files 被错误合并 | High | projection manifest + classification audit | HS-000/001 |
| self-host 额外脚本误删导致隐藏回归 | Critical | 全仓 reference audit + explicit disposition | HS-000 |
| sync 命令覆盖 downstream custom hook | Critical | source-repo projection 与 adoption ownership 分离；unknown preserve | HS-002 |
| review rubric 在普通 prompt 中产生噪声 | Medium | 仅现有 REVIEW_RELEASE intent 激活 | RV-501 |
| review 后代码变化但旧 pass 仍被接受 | High | diff fingerprint + stale gate | RV-502/503 |
| review fingerprint 被 review 文件自身写入改变 | High | operational evidence exclusions | RV-502 |
| review 输出充斥 style-only nit | Medium | output contract + fixture eval | RV-500/504 |
| 并发 report 损坏 | High | atomic rename + lock/fingerprint | concurrency tests |
| 多生态依赖误判 | Medium | Sprint 1 完整支持 package.json；其余保守 | fixture matrix |
| 与 anti-simplification/first-principles 冲突 | High | precedence：correctness/contract > minimal advice | context tests |
| 用户无法关闭 | Medium | policy `mode=off` 快路径 | off regression |
| Migration 覆盖自定义 config/hooks | Critical | preserve/merge；ownership contract | adoption tests |
| report 造成 repo noise | Medium | operational path；遵守现有 ignore policy | docs/packaging |
| 通过路径关键词判断安全不可靠 | High | 关键词只标 `needs_human_review`，不最终分类 | safety review |

## 18. Rollout Plan

### Phase A — Internal dogfood

- [ ] repo-harness self-host 开启 `advice`。
- [ ] 收集 20 sessions / 30 edits / 10 stops。
- [ ] precision `>=80%`。
- [ ] unsafe finding = 0。
- [ ] 关闭 feature 不需改 host adapters。

### Phase B — Packaged default

- [ ] fresh init 默认 `advice`。
- [ ] existing explicit config preserved。
- [ ] release notes 提供 `mode=off`。
- [ ] 监控 latency/issue feedback。

### Phase C — Future consideration, not this Sprint

只有以下条件全部满足，才讨论 enforce：

- [ ] 至少两个版本 dogfood。
- [ ] useful precision `>=90%`。
- [ ] unsafe finding 持续为 0。
- [ ] hook overhead 达标。
- [ ] 有明确可逆、可解释 blocking contract。
- [ ] 单独 PRD/Sprint。
- [ ] 默认仍不是 enforce。

## 19. Rejected Alternatives

### A. 直接复制 Ponytail plugin hooks

拒绝原因：

- 重复 host protocol 适配。
- 产生第二份状态文件。
- 破坏 repo-harness central-first/runtime abstraction。
- packaging/migration 复杂度上升。

### B. 新增 `/ponytail` 命令

拒绝原因：

- repo-harness 已有 policy、planning、hook state。
- 命令模式与持久配置容易漂移。
- Sprint 1 只需 repo policy 控制。

### C. 在 PreToolUse/edit 阻断

拒绝原因：

- 编辑前没有 diff 证据。
- 高误报。
- 与现有 plan/worktree gate 叠加噪声。
- 可能阻止安全修复/验证代码。

### D. UserPromptSubmit 增加第二个 script

拒绝原因：

- 两个 script 可能各自输出 host decision。
- 执行顺序与 block short-circuit 复杂。
- 应由现有 prompt guard 统一决策和渲染。

### E. Stop 增加第二个 script

拒绝原因：

- Stop 协议通常只应有一个最终响应。
- 与 stop-orchestrator 的 handoff/plan self-review 冲突。
- 应作为现有 orchestrator 的内部证据步骤。

### F. 每次编辑后运行 AI review

拒绝原因：

- latency、成本、非确定性、并发问题。
- hook 应只收集 objective signals。
- 语义审查由 agent 在 Stop/显式 review 阶段完成。

### G. 以 net-negative LOC 作为 release gate

拒绝原因：

- 小代码不等于正确代码。
- 新功能、安全、测试常需要净新增。
- LOC 只能做观察指标。

## 20. Final Sprint Acceptance Sign-off

### Engineering

- [ ] Scope complete。
- [ ] No public route contract change。
- [ ] No new runtime dependency。
- [ ] No minimal-change blocking mode。
- [ ] `assets/hooks/` is the only authoring source。
- [ ] `.ai/hooks/` is a clean deterministic projection。
- [ ] Packaged/repo-pin/installed parity。
- [ ] Review rubric only activates for review intent。
- [ ] Review freshness compatibility behavior verified。
- [ ] Tests and performance evidence complete。

### Safety/Correctness Review

- [ ] Validation protected。
- [ ] Security protected。
- [ ] Data integrity protected。
- [ ] Error handling protected。
- [ ] Accessibility protected。
- [ ] Explicit requirements protected。
- [ ] Tests protected。
- [ ] Unsafe finding = 0。

### Release Owner

- [ ] Init/migrate/upgrade/rollback complete。
- [ ] Claude/Codex smoke complete。
- [ ] Docs/changelog complete。
- [ ] Rollback via `mode=off` verified。
- [ ] Release gate complete。

### Sprint Close

- [ ] Sprint status → Done。
- [ ] Active marker cleared/advanced。
- [ ] Contract archived/closed。
- [ ] Worktree finished/cleaned。
- [ ] Handoff refreshed。
- [ ] Follow-up issues filed separately：
  - multi-ecosystem semantic manifest adapters。
  - explicit manual review command/Skill。
  - longitudinal precision telemetry。
  - enforce-mode research。

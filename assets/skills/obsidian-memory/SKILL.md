---
name: obsidian-memory
description: |
  Cross-project long-term memory over the user's Obsidian brain vault: recall relevant
  notes before a task, and persist distilled conclusions (decisions, pitfalls, solutions,
  progress) back after a task. The vault is an aggregation/projection layer — repo-local
  artifacts stay the per-project source of truth, and sync direction is repo → brain.
  Explicitly invoked by the model or operator; never executed from hooks. Use when the
  user asks to recall project memory, persist lessons to Obsidian, initialize a project
  sub-vault, or when closing a significant task whose conclusions are worth keeping.
  Triggers: 检索记忆, 查一下知识库, 沉淀经验, 记到 Obsidian, 更新知识库, 复盘沉淀,
  初始化记忆库, recall project memory, persist lessons, update the brain vault,
  knowledge base brain. Do not use for repo-runtime contracts (tasks/, docs/ stay
  authoritative in-repo), raw conversation archiving, or storing secrets.
---

# obsidian-memory — 跨项目长期记忆（Obsidian brain vault）

## Outcome Contract

- Outcome: 任务开始前从 vault 召回相关背景；任务结束后把「未来有用」的结论沉淀回对应项目 sub-vault，并维护索引。
- Done when: 召回的笔记已作为线索并入当前上下文（并经现状复核），或新增/更新的笔记已落盘且 sub-vault `index.md` 同步。
- 权威模型（不可违反）: repo 内 artifact（`tasks/`、`docs/`、`MEMORY.md`、代码）是各项目的 source of truth；vault 只是跨项目聚合投影层，方向恒为 **repo → brain**。vault 与现状冲突时，现状赢，且顺手修正 vault。
- 双读者: vault 的读者是 agent **和用户本人**。笔记必须是人能直接阅读学习的成文——完整句子、讲清 why 与 tradeoff，不写 agent 速记、不堆原始日志；`index.md` 是人的阅读入口。
- 边界: 本 skill 只能由模型或用户显式调用。hooks 永不执行它——hook 层最多发 `[BrainPromote]` 类建议文本，不读写 vault 状态。

## Vault 解析（fail-closed）

1. 读 `~/.repo-harness/config.json` 的 `brainRoot`。
2. 缺失或路径不存在 → 停止并告知用户配置（`repo-harness update --brain-root <path>` 或手改 config），**不扫描磁盘猜 vault、不临时新建 vault root**。
3. 项目 sub-vault 为 `<brainRoot>/<project-slug>/`；`<project-slug>` 取 repo 目录名或用户指定名。

## Phase init · 建立项目 sub-vault

仅在 sub-vault 不存在或用户明确要求时执行：

1. 创建 `<brainRoot>/<project-slug>/`，内含 `index.md` 与按需的 `decisions/`、`patterns/`、`references/`、`runbooks/`（对齐 vault 既有分类，不发明新分类学）。
2. `index.md` 记项目一句话背景、长期偏好、当前进度指针、各子目录链接；用 wiki-link 挂进 vault 根 `index.md` 的 Domains 列表。
3. **依赖官方 Obsidian skills（硬依赖）**：任何创建或修改 vault 内 `.md` 的动作必须同时调用官方 `obsidian-markdown` skill（frontmatter、wiki-links、callouts 等格式权威）；需要对运行中 vault 做搜索/打开/任务操作时用官方 `obsidian-cli` skill。本 skill 只负责判断与索引（写什么、何时写、如何组织），不自定 Markdown 方言。两个官方 skill 缺失时 fail-closed 报告，不降级手写格式。

## Phase recall · 任务前召回

1. 先读 sub-vault `index.md`，再按任务关键词 `rg` 该 sub-vault（必要时扩到相邻 domain），选出最相关的 ≤3 篇笔记读全文。
2. 召回内容一律当**待复核线索**，不当事实：涉及文件、命令、版本的记忆先对现状验证再采用。
3. sub-vault 不存在 → 报告无记忆可召回，询问是否 init；不静默跳过也不硬造背景。

## Phase persist · 任务后沉淀

1. 提取候选：关键决策及理由、踩坑根因与解法、可复用方案/模式、失败方案及拒因、进度里程碑。
2. **价值闸门**——同时满足才写：未来会再用到（对 agent 复用或对用户学习二者居其一即可）；不是 repo artifact 已记录内容的复述（已有的写一行 wiki-link 指回 repo 路径，不复制正文）；不是一次性/临时信息。
3. **敏感闸门**——写盘前扫描内容：密码、API key、token、私钥、真实 env 值一律不落 vault；命中即改写为占位符或放弃该条。
4. 写入对应子目录并更新 sub-vault `index.md`；同类主题已有笔记则更新原文件，不另开重复页；发现过时结论直接改掉。
5. 在 repo-harness 管理的仓库里，`docs/reference-configs/` 类文档的外化走既有 `repo-harness brain promote`/`sync` 通道，本 skill 不与其重复搬运。

## 与既有记忆层的分工

| 层 | 归属 | 存什么 |
|----|------|--------|
| repo `tasks/lessons.md`、`docs/researches/`、`MEMORY.md` | 各项目 source of truth | 项目内可执行的规则与知识 |
| `~/.claude/memory/`、`GLOBAL.md` | 会话运行时记忆 | 用户偏好、跨项目工作规律 |
| Obsidian vault（本 skill） | 跨项目聚合投影 | 蒸馏后的决策/模式/坑/进度，供人和多 runtime 复用 |

同一事实只在权威层写正文，其余层写指针。

## Gotchas

| 情况 | 规则 |
|------|------|
| 想在 hook 里自动触发 | 禁止；hook 只发建议文本，沉淀由模型在收尾流程显式调用 |
| brainRoot 未配置 | fail-closed 停止并指路，不猜路径 |
| 记忆与现状矛盾 | 现状赢；修正或删除过时笔记 |
| 每轮任务都想写一笔 | 只沉淀过价值闸门的内容；无货则明说本轮无可沉淀 |
| 大段对话/代码想整段存档 | 不存原文，存结论 + 指回 repo 的链接 |
| 含敏感值的配置经验 | 用 `<PLACEHOLDER>` 改写后再存 |

## Provenance

- 2026-08-16 由用户的「Obsidian 作为跨项目 AI 知识库大脑」提案落地；经评审否决 hook 实现路线，采用 skill + 显式收口，对齐 repo-harness `brain-manifest.json` 的既有 invariant（hooks 不读写外部 vault 状态）。
- 双侧安装：`~/.claude/skills/obsidian-memory/` 与 `~/.codex/skills/obsidian-memory/` 内容一致，用 `cmp` 校验。

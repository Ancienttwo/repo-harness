# Plan: 收窄受影响测试选择（#745）

> **Status**: DRAFT。等 owner 批准。只是设计，不含实现代码。
> **Created**: 20261015-1646
> **Slug**: affected-test-selection-745
> **Artifact Level**: design
> **Baseline**: `main@1c52e348`（含 #748 三分片、#750 设计、#751 平台任务按需触发）
> **Branch**: `docs/affected-test-selection-design-745`
> **Refs**: #745。前一份设计：`plans/plan-20261014-1817-ci-on-demand-tests-745.md`。它的第一阶段已由 #751 合并。本文替换它的 §3（第二阶段），其他部分不变。相关：#747（纯文档 PR）、#749（已关闭，移动 acceptance 库没有改变选择数）。
> **Verification Boundary**（本文档）：链接和范围检查。不跑产品测试。下文的数字来自本地回放，方法在 §9。
> **Rollback Surface**: 只增加这一个文件。`git revert <squash-commit>`。

## 0. P1 / P2 / P3

**P1 现状**
- `scripts/select-ci-coverage.ts` 的 `selectAffectedTests`（`:60`）建一张反向依赖图，再从每个改动路径做反向闭包，收集 `tests/**/*.test.ts(x)`。
- 图里有两种边：
  - import 边：`Bun.Transpiler.scanImports`（`:84`），只扫 `src/`、`scripts/`、`tests/`。
  - 字面量边：源码里每个引号字符串（`:87`，包括注释）去查一张 key 表。key 表给每个路径登记它的全部目录前缀和文件名后缀（`:74-78`），一段目录名（`docs`、`tests`、`assets`）也是 key。
- 闭包不分边的种类，全部继续传播（`:107`）。
- 找不到测试消费者的非文档路径让选择失败：`Affected coverage is unknown`（`:112`）。这是 fail closed。
- 文档路径只选 `scripts/ci-documentation-consumers.ts` 找到的消费者（#747）。这个扫描器已经有一个有边界的 AST 路径求值器 `values()`（`:35`）。
- 平台任务（`home-isolation`、`native-oar`）在 #751 后按自己的 import 闭包触发，不读 `selectAffectedTests` 的结果。本文不改它们。

**P2 追踪**（一个普通代码 PR，今天的真实路径）
1. PR 改 `src/core/docs/docs-graph.ts`。
2. 这个文件没有直接的 CLI 依赖。但 `src/cli/index.ts:129` 有子命令名 `'docs'`。这个普通单词命中一段目录 key `docs`，于是 `src/cli/index.ts` 被登记成 `docs/**` 下每个文件的消费者。
3. 同样的单词匹配和目标仓库路径字面量（例如 `src/core/adoption/standard-plan.ts:306` 的 `"tasks/lessons.md"`）把大量文件连到 CLI 和其他枢纽。
4. 73 个测试文件直接 import 或 spawn `src/cli/index.ts`。闭包经过 CLI 后覆盖几乎全部测试。
5. 结果：选中 334 个（共 374 个）。`verify` 三个分片跑满。
6. 压力点：字面量边把「普通单词」「注释」「目标仓库路径」都当成本 checkout 的文件读取。

**P3 决定**
- 字面量边只接受**路径值**。普通单词和注释不再匹配 key。一段目录 key 保留。
- `src/` 里的路径值只有锚定到模块位置时才算边（`import.meta.dir`、`import.meta.url`、`__dirname` 及其派生值）。其他路径值属于 CLI 管理的目标仓库，不产生边。import 边不变。
- 目录边是数据边：只在第一跳使用，不继续传播。
- 补三条显式规则：删除路径、依赖清单、孤儿文件。见 §4。
- 预期中位数从 344 降到 200 以下。剩下的下限是 CLI 枢纽，本文不处理，见 §7。
- 现状为什么是这个形状（推断）：字面量正则最早是为了不漏掉 `join(ROOT, 'assets', 'partials')` 这类拆段读取。当时 PR 跑全量，假边的代价没有被测量。#747 只修了文档路径这一侧。
- 10 倍规模时先坏的：路径求值器的组合上限。`values()` 在超过 256 个组合时抛错，选择失败。这是 fail closed，但测试文件变多后会更常见。

## 1. 问题和实测

最近 120 个 first-parent main 提交里，117 个改代码，3 个只改文档。用每个提交自己的树回放（方法见 §9），今天的选择器给出：

| 指标 | 数值 |
| --- | --- |
| 代码提交的中位数 | 344 / 374 |
| p25 / p75 | 339 / 359 |
| 选择少于 100 的提交 | 0 |
| `coverage is unknown` | 0 / 117 |

这和 #745 里最近 25 次 PR 运行的 333 到 353 一致。回放的 V0 和真实的 `selectAffectedTests` 逐提交比较，差异为 0。

「unknown 为 0」有一部分是假覆盖。例：`scripts/check-tarball-install-smoke.sh` 只在 daily 的 `functional` lane 里执行（`scripts/check-ci.sh:205`）。PR 上它「被覆盖」，是因为别的测试写了单词 `'scripts'`。被选中的测试没有一个执行它。

## 2. 根因分解

| 变体 | 中位数 | p25 | 少于 100 | unknown 提交 |
| --- | --- | --- | --- | --- |
| V0 今天 | 344 | 339 | 0 | 0 |
| V1 去掉一段目录 key（#745 第 1 条） | 321 | 313 | 17 | 20（17%） |
| V2 V1 加「`src/` 不产生字面量边」（#745 第 1、2 条） | 218 | 26 | 39 | 24（21%） |
| V5 只认路径形字面量，去掉注释，去掉一段 key，目录边只走第一跳 | 223 | 189 | 17 | 20（17%） |
| V10 V5 加「`src/` 只认锚定路径」 | 189 | 79 | 27 | 24（21%） |
| **V11 V10 但保留一段目录 key** | **192** | **103** | **24** | **20（17%）** |
| V7 锚定规则用于所有文件（粗略近似） | 143 | 6 | 24 | 44（38%） |

（V7 的近似丢掉了真实边，例如 `readdirSync(join(import.meta.dir, 'fixtures'))`。它只说明下限的方向。）

从表里得出四点：

1. 一段目录 key 本身没有害处。有害的是普通单词去匹配它。V11 保留 key、只认路径值，中位数和 V10 相近，unknown 更少。#745 第 1 条应改成「普通单词不匹配」，一段 key 保留。
2. `src/` 的目标仓库路径是最大的假边来源。完全去掉 `src/` 的字面量边（V2）收益大，但丢掉真实读取。例如 `src/cli/chatgpt-skill/source.ts:44` 用 `PACKAGE_ROOT` 读 `references/*`。41 个 `src/` 文件用 `import.meta.dir`、`import.meta.url` 或 `__dirname` 定位本包文件。锚定规则区分这两类。
3. V1 的 82 个 unknown 路径里有 52 个是删除的文件，大多是被删除的测试文件。一个删掉的测试不需要任何测试来覆盖。这类阻塞来自规则缺口，删掉的测试没有需要覆盖的行为。
4. V11 剩下的 unknown 只有两类：`bun.lock`（12 个提交）和 `references/*.md`（经拆段 `join(root, 'references', reference)` 读取，正则看不到）。前者需要显式规则，后者需要 AST 求值。

CLI 枢纽是真实依赖：`src/cli/index.ts` 静态 import 467 个 `src/` 文件里的 384 个，73 个测试文件直接 import 或 spawn 它。只算 import 边和精确文件字面量边时，156 个测试能到达 CLI。V7 的分布在 130 左右有一个平台：任何 CLI 加载的模块改动都会选中这批测试。

## 3. 选项和取舍

| 选项 | 回放结果 | 决定 |
| --- | --- | --- |
| A. #745 原方案：删一段 key，`src/` 不产生字面量边 | 中位数 218，21% 的提交 fail closed（`bun.lock`、`references/*.md`、删除的测试、`scripts/*`） | 不采用。丢掉 `src/` 的真实读取，阻塞多 |
| B. 前一份设计 §3：AST 路径求值，不分锚点 | 正则近似 217；Codex 的隔离 AST 试验中位数至少 279（#745 评论），超过 240 的门槛 | 不采用原样。试验把目标仓库路径也当成路径值 |
| **C. AST 路径值 + `src/` 锚定 + 目录数据边 + 三条显式规则** | 正则近似 V11：192；AST 预计相近或更低 | **推荐** |
| D. C 之外再对 `tests/`、`scripts/` 用锚定规则 | 粗略近似 143，但需要跨文件的路径求值，否则漏边 | 现在不做。见 Q5 |
| E. CLI 按子命令懒加载 + 测试到子命令的映射 | 没有回放。需要产品重构和一个新的映射来源 | 现在不做。见 §7 |
| F. 运行时 test-impact map | 前一份设计 §4 已评估。静态 import 下运行时也加载整个 CLI | 现在不做 |

## 4. 推荐设计（选项 C）

### 4.1 规则

**R1 路径值。** 字面量边只来自路径求值器的结果。求值器从 `scripts/ci-documentation-consumers.ts:35` 的 `values()` 抽到 `scripts/lib/path-values.ts`，文档扫描器和选择器共用。两个真实消费者，所以这个共享模块成立。路径值包括：
- `join`、`resolve`、`URL`、`dirname`、`fileURLToPath` 的结果；
- 读文件、列目录、拷贝、spawn 调用的路径参数（扫描器 `:10-11` 的 `launchers`、`readers` 两个集合）；
- 含 `/` 或文件扩展名的独立字符串。

注释天然排除。普通单词（例如子命令名 `'docs'`）不是路径值，不匹配任何 key。

**R2 key 深度不变。** 保留所有深度的目录 key，包括一段 key。`join(PACKAGE_ROOT, 'references')` 求值成 `references`，它是一个真实的目录读取。

**R3 `src/` 锚定。** `src/` 里的路径值只有从模块位置推导出来时才产生边：`import.meta.dir`、`import.meta.url`、`__dirname`，以及由它们 `join`/`resolve`/`dirname` 得到的变量（例如 `PACKAGE_ROOT`）。从参数、`process.cwd()` 或其他运行时值推导的路径属于目标仓库，不产生边。锚定值的尾部求不出来时（`'*'`），按已求出的前缀产生目录边。这是保守的放宽。`tests/` 和 `scripts/` 在 checkout 里运行，它们的路径值照旧产生边。import 边对所有文件不变。

**R4 目录数据边。** 精确文件匹配和后缀匹配是普通边，继续传播。目录匹配是数据边：改动路径在目录里时，消费者被选中；但消费者不会因为目录里文件的依赖改变而被选中。实现上，数据边只在闭包的第一跳使用。实测 245 → 223（V4 → V5）。

**R5 删除路径。** 删除路径照常走 base 和 head 两张图（今天的 `previousSources` 已经提供 base 边）。如果它的消费者闭包里除了它自己只有同一 diff 里删除的文件，这个路径不需要测试，也不报 unknown。还有存活消费者时，规则不变。

**R6 依赖清单。** `package.json`、`bun.lock`、`bunfig.toml`、`tsconfig.json` 改动时选中全部测试。这是显式规则，替换今天靠单词匹配得到的偶然结果。120 个提交里有 21 个碰到这些文件；它们今天已经选中约 336 个。

**R7 孤儿文件。** 规则收紧后仍然没有消费者的路径，继续 fail closed。实现 PR 里逐个处理，处理方式沿用前一份设计 §3.2：
- 有真实读取者但求值器没认出来：修求值器，加回归用例。已知例子：`references/*.md`。
- 有行为但没有测试：加真实的消费者测试。已知例子：`scripts/axr5-archctx-clean-room.ts`，只由 `package.json` 的 `check:archctx-integration` 运行。
- 只由 daily lane 执行：见 Q2。已知例子：`scripts/check-tarball-install-smoke.sh` 和它列出的输入（`scripts/check-pi-package-smoke.ts`、`scripts/sync-pi-package.ts`）。

合并前，回放里的孤儿列表必须是空的。

### 4.2 不变量

- import 边一条不少。任何删除的边都属于四类之一：普通单词、注释、`src/` 未锚定的路径值、目录边的第二跳及以后。
- 无法解释的路径继续让选择失败。不加跳过，不回退到全量。
- 求值器的组合上限（256）超出时继续抛错。
- daily 全量测试照旧是兜底。

### 4.3 没有静默缺口的证明方式

回放工具对每个提交输出「V0 选中、新规则没选中」的测试，并给出 V0 闭包里第一条被删除的边和它的类别。验收要求：每一个被丢掉的测试都能归到 §4.2 的四类之一。归不进去的条目就是求值器漏边，按 R7 第一种处理。

## 5. 风险

- **自托管读取。** CLI 有时对本 checkout 自己运行，例如 `scripts/check-ci.sh` 的 `bun src/cli/index.ts init --repo . --dry-run`。这时 `src/` 的目标仓库路径指向本 checkout 的文件。R3 删掉这些边。缓解：这类路径大多是文档路径（#747 规则）；`tests/` 和 `scripts/` 的字面量边不受影响；§4.3 的报告会列出被丢掉的测试；daily 兜底。
- **求值器漏边。** 跨函数或跨文件传递的路径值求不出来。如果这是唯一的消费者，路径报 unknown，选择失败，可见。如果还有别的消费者，可能形成静默缺口。缓解：§4.3 的报告逐条归类；锚定值尾部未知时按前缀放宽（R3）。
- **根目录通配。** `join(ROOT, rel)` 这类 helper 在 `rel` 未知时求值成根目录，成为所有文件的数据边消费者。R4 限制它只在第一跳生效，但 import 这个 helper 的测试会在每次改动时被选中。实现 PR 的回放要单独报告这类消费者的数量和代价。
- **fail closed 变多。** 规则收紧后孤儿文件会让 PR 失败。缓解：R5、R6 先消掉已知的两类；R7 的孤儿在实现 PR 里清空后才合并。

## 6. 门槛

- 回放 120 个 first-parent main 提交，使用每个提交自己的树。
- 代码提交的中位数不超过 200。
- `coverage is unknown` 为 0（R5、R6 生效后；R7 的孤儿已处理）。
- §4.3 的丢弃报告里没有无法归类的条目。
- 达不到就不合并。第一阶段（#751）和三分片（#748）不受影响。

## 7. 剩下的下限：CLI 枢纽

规则 C 之后，任何被 CLI 加载的模块改动仍会选中约 130 到 150 个测试。按静态语义这是对的：这些测试启动整个 CLI，任何被加载模块的加载期错误都会让它们失败。

要继续降低，需要两件事一起做：
- CLI 按子命令懒加载（产品重构）；
- 一个「测试 → 子命令」的可信来源（静态解析 spawn 参数，或运行时记录）。

只做其中一件没有收益：懒加载后 `scanImports` 仍然看到动态 import 边。前一份设计 §4 的回放也说明，三种模型下懒加载都不改变中位数。

重新评估的条件：本文规则合并后，`verify` 单个分片仍超过 6 分钟，或者代码提交中位数仍超过 200。

## 8. 范围和改动清单（实现 PR，不是本 PR）

**做**：
- 新增 `scripts/lib/path-values.ts`：从扫描器移出 `values()`，加锚定信息（路径值是否从模块位置推导）。不写新的求值逻辑。
- `scripts/ci-documentation-consumers.ts` 改为 import 它。行为不变。
- `scripts/select-ci-coverage.ts` 的 `selectAffectedTests`：R1 到 R6。
- `tests/check-ci-job-split.test.ts` 增加用例：
  - 普通单词 `'docs'` 不连到 `docs/**`；
  - 注释里的路径不产生边；
  - `src/` 里未锚定的 `'tasks/lessons.md'` 不产生边，锚定的 `join(PACKAGE_ROOT, 'references', name)` 产生目录边；
  - `tests/` 里 `readdirSync(join(ROOT, 'assets'))` 仍然是 `assets/**` 的消费者（#745 列出的风险）；
  - 目录边只走第一跳；
  - 删除的测试文件不报 unknown；被存活文件引用的删除路径照常选择；
  - 清单文件选中全部测试；
  - 旧 import 边（`previousSources`）仍然生效。
- R7 产生的回归用例或消费者测试。
- 回放做成 `bun scripts/replay-ci-coverage.ts`，作为 §6 的验收命令。
- 同步 `docs/architecture/modules/verification/evals-checks.md` 和 `assets/skills/repo-harness-test/references/running.md` 里对选择规则的描述。

**不做**：
- 改 `src/cli/index.ts` 的加载方式。
- 改平台任务的触发（#751）、文档路径规则（#747）或分片（#748）。
- 改 daily 任务的内容或频率。
- 新增 PR label、手动强制开关或跳过清单。

## 9. 回放方法

本文的数字来自一次性脚本，不入库。方法：

1. `git rev-list --first-parent -n120 origin/main` 取提交。
2. 每个提交 `c`：
   - 改动路径：`git diff --name-only --no-renames -z c^ c`。
   - head 源码：`git ls-tree -r -z c` 列文件，`git cat-file --batch` 读 JS/TS 文件内容。
   - base 源码：同样读 `c^`，把改动路径的旧内容作为 `previousSources`。
3. 对每个变体建图、求闭包，记录选择数和 unknown 路径。V0 和真实的 `selectAffectedTests` 逐提交比较，差异必须为 0（这次回放为 0）。
4. 文档消费者用当前树的 `discoverDocumentationConsumers()` 结果（75 个）。只有 3 个纯文档提交，影响很小。

和 #745 评论里的回放的差别：那次用当前树的依赖图，本文用每个提交自己的树。当前树回放会把后来删掉的文件误报为 unknown，所以数字略有不同（V1：当前树 315 / 24 个 unknown，历史树 321 / 20 个）。

实现 PR 的验收命令：

```
bun run check:type
bun run test:files tests/check-ci-job-split.test.ts tests/ci-documentation-consumers.test.ts --timeout 60000 --max-concurrency 1
bun scripts/replay-ci-coverage.ts --commits 120
```

## 10. 回滚

- 实现 PR 一个 squash commit。`git revert <squash-commit>` 恢复正则字面量边。
- R7 加的测试可以留着，它们是真实覆盖。
- 合并后第一周：daily 全量测试如果出现「PR 上没选中、daily 才失败」的回归，把漏掉的边写成回归用例；如果是规则本身的问题，回滚。

## 11. 已决问题（Decided questions）

2026-10-15 Aimpact 决定：Q1–Q6 全部采用推荐默认值。

- **Q1 依赖清单（R6）**：【已决定：采用推荐】清单改动选全部测试，还是按 `package.json` 的字段区分（只有依赖字段才选全部，`scripts` 字段只选相关消费者）？推荐：全部测试。简单、诚实；这些提交今天已经选中约 90%。
- **Q2 只由 daily 执行的脚本**：【已决定：采用推荐】`scripts/check-tarball-install-smoke.sh` 这类路径在 PR 上从来不执行。选项：(a) 按 R7 继续 fail closed，直到有真实消费者；(b) 选择器输出 `daily-only` 并放行，执行面从 `scripts/check-ci.sh` 读取，不另存清单；(c) 像 #751 一样加一个按需的 PR lane。推荐：(b)。PR 的实际覆盖和今天一样，但缺口变成可见的输出。
- **Q3 门槛**：【已决定：采用推荐】中位数不超过 200、unknown 为 0、丢弃报告无未归类条目。推荐：按此执行。
- **Q4 `process.cwd()` 在 `src/` 里不算锚点**：【已决定：采用推荐】`src/` 的 `process.cwd()` 指目标仓库。推荐：不算锚点。`tests/` 和 `scripts/` 不受 R3 限制，这个问题只影响 `src/`。
- **Q5 `tests/` 的临时仓库路径**：【已决定：采用推荐】测试往临时仓库写 `tasks/...`、`docs/...` 时也产生假边。粗略近似显示收紧后中位数可到约 143，但需要跨文件的路径求值。推荐：这次不做，合并后用 §4.3 的报告再量一次。
- **Q6 前一份设计的 §3**：【已决定：采用推荐】本文替换它。推荐：不改旧文件，在实现 PR 描述里写明替换关系。

## 12. 推荐默认值（Recommended defaults）

owner 不另作决定时，实现 PR 按下面执行：

- 采用选项 C（R1 到 R7）。#745 的第 1、2 条按 §2 修正：普通单词不匹配，一段 key 保留；`src/` 只认锚定路径。
- Q1：依赖清单改动选全部测试。
- Q2：只由 daily 执行的路径输出 `daily-only` 并放行，执行面从 `scripts/check-ci.sh` 读取。
- Q3：门槛是中位数不超过 200、unknown 为 0、丢弃报告无未归类条目。
- Q4：`src/` 里的 `process.cwd()` 不算锚点。
- Q5：`tests/` 的临时仓库路径这次不收紧。
- Q6：旧设计文件不改，替换关系写在实现 PR 描述里。
- CLI 懒加载和运行时 map 不做，直到 §7 的条件成立。

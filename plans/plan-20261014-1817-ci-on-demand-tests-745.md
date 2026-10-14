# Plan: PR 按需跑测试和平台任务（#745）

> **Status**: DRAFT。等 owner 批准。只是设计，不含实现代码。
> **Created**: 20261014-1817
> **Slug**: ci-on-demand-tests-745
> **Artifact Level**: design
> **Baseline**: `main@bef3cc68`（含 #747 `e5dcb1ce`、#748 `bef3cc68`）
> **Branch**: `docs/ci-on-demand-design-745`
> **Refs**: #745。前置已合并：#747（文档 PR 只跑文档消费者）、#748（`verify` 三分片）。相关：#749（产品代码 import `scripts/` 形成的依赖枢纽）。
> **Verification Boundary**（本文档）：链接和范围检查。不跑产品测试。下文的数字来自本地回放，命令在 §7。
> **Rollback Surface**: 只增加这一个文件。`git revert <squash-commit>`。

## 0. P1 / P2 / P3

**P1 现状**
- `scripts/select-ci-coverage.ts` 选测试。代码路径走 import 边和字面量边的反向闭包（`:59`、`:75`、`:86`）。文档路径只走 `scripts/ci-documentation-consumers.ts` 的扫描结果（#747）。
- `.github/workflows/ci.yml` 的 PR 任务：
  - `verify`（`:122`）：三个分片跑选中的测试（#748）。
  - `test-home-isolation`（`:50`）：三个 OS 跑两个 HOME 隔离测试（`:73`）。macOS 上同一个 job 还装 Herdr，构建两个 OAR host，跑五个原生 OAR 验收测试（`:103`）。
  - `required`（`:339`）：唯一的 required status context `Required / CI`。
- 平台任务的跳过条件只有一个：`documentation == 'true'`（`:54`、`:351-354`）。
- daily 任务在 main 快照上跑全量测试、两个平台矩阵和上面的平台任务。

**P2 追踪**（一个普通代码 PR，今天的真实路径）
1. PR 改 `src/effects/state/` 下一个函数。
2. selection 选中约 337 个测试文件（374 个里）。`documentation=false`。
3. `verify` 三个分片各跑约 4 分钟。
4. `test-home-isolation` 在三个 OS 上启动。macOS 这一格跑原生 OAR 验收，约 400 秒，前面常在 GitHub macOS 队列里排 20 到 30 分钟。
5. `Required / CI` 要等 macOS 结束。PR 的墙钟时间由第 4 步决定。
6. 压力点有两个：
   - 平台任务和改动无关，每个代码 PR 都跑。
   - 测试选择接近全量，原因见 §1.2。

**P3 决定**
- 第一阶段：平台任务按改动触发。macOS 原生 OAR 任务只在改动碰到「平台敏感面」时跑。HOME 隔离矩阵只在改动碰到隔离测试的依赖时跑。daily 照旧全跑。
- 第二阶段：字面量边改成 AST 路径求值，去掉假边。目标是代码 PR 选中的测试减少约三分之一。
- 不做 CLI 懒加载，不做运行时 test-impact map。理由是实测，见 §4。
- 现状为什么是这个形状（推断）：#608 把原生 OAR 验收挂到 macOS HOME 隔离任务上，当时 PR 全量跑，按需触发没有意义。#483 把文档 lane 并进 `affected` 时，字面量匹配的副作用没有被测量。
- 10 倍规模时先坏的：平台任务的触发面。OAR host 的 bundle 输入越多，macOS 任务的触发率越高。

## 1. 问题

### 1.1 平台任务每次都跑

最近 117 个改代码的 main 提交里，macOS 原生 OAR 任务 117 次都跑了。HOME 隔离矩阵也一样。#747 之后只有纯文档 PR 会跳过。

### 1.2 测试选择接近全量

最近 116 个改代码的提交，中位数选中 337 个测试文件。原因是一个稠密的依赖核心。即使去掉一段目录 key，567 个 `src/` 和 `scripts/` 文件里仍有 484 个能被至少 250 个测试到达；其余文件都少于 50 个。

把核心连起来的边分两类。

假边：
- 注释里的路径。例：`src/core/state/coordination-identity.ts` 的注释写了 `` `src/cli/commands/sprint.ts` ``。
- 普通单词碰上路径 key。例：`src/cli/index.ts:128` 的子命令名 `'docs'`。
- 一段目录 key。`'docs'`、`'tests'`、`'assets'` 这类词匹配整个目录。

真边，但会继续传播：
- 目录字面量。例：`scripts/run-harness-profile-benchmark.ts` 拷贝 `'src/cli'`，于是「依赖」每个命令模块；它又被 `scripts/acceptance-receipt.ts` 在运行时加载，后者被 `src/effects/state/resolve-effective-state.ts` import。
- 真实 import 枢纽：`src/cli/index.ts` 静态 import 全部命令（CLI 一次加载 466 个 `src/` 文件里的 378 个），`src/effects/architecture/model-reader.ts`，以及产品代码 import `scripts/acceptance-receipt.ts`。

## 2. 第一阶段：平台任务按改动触发

### 2.1 触发面

selection 对 `affected` 模式算出两个标志。daily 模式两个标志都是 `true`。

**CI 实现面**（两个标志共用）：
- `.github/**`
- `package.json`、`bun.lock`、`bunfig.toml`、`tsconfig.json`
- `scripts/check-ci.sh`、`scripts/lib/**`、`scripts/select-*.ts`

**`native_oar=true`**，当任一改动路径属于：
- CI 实现面。
- `*.sh`。macOS 的 `/bin/bash` 是 3.2；#608 用原生任务发现过 `scripts/contract-worktree.sh` 的 bash 3.2 bug。
- 原生 OAR 测试文件本身，以及它们的本地 import 闭包，包括 `src/` 和 `scripts/` 模块。闭包规则和 HOME 一样。测试文件列表从 workflow 步骤 `Run native OAR acceptance tests` 读取，不另存一份。
- 两个 OAR host 的 bundle 输入。selection 用 `bun build --metafile` 构建 `package.json` 里 `build:oar-review-host` 和 `build:oar-coding-host` 的入口，读 metafile 的 `inputs`。今天每个 host 有 10 个输入，例如 `src/effects/terminal/task-session.ts`、`src/effects/terminal/herdr.ts`、`src/effects/review/review-isolation.ts`。
- `.ai/harness/policy.json`。`install-pinned-herdr` action 从这个文件读 Herdr 版本。只改版本号的 PR 也要跑原生 lane。

**`home_isolation=true`**，当任一改动路径属于：
- CI 实现面。
- 两个 HOME 隔离测试文件和它们的 import 闭包（只算 import 边）。测试文件列表从 workflow 步骤 `Run the isolation tests` 读取。今天这个闭包有 5 个文件。
- `bunfig.toml` 配置的测试 preload，以及它的 import 闭包。`tests/preload-home-isolation.test.ts` 在子进程里动态加载 `tests/preload-home-isolation.ts`，只看 import 边会漏掉它。两个闭包都从 preload 出发。

纯文档 diff 不碰任何触发面，所以两个标志都是 `false`。`documentation` 输出因此可以删掉，不再有两套跳过条件。

### 2.2 Workflow 形状

```
selection ──> verify (3 shards)                   ──┐
          ├─> home-isolation (ubuntu/windows/macos) ─┤──> required
          └─> native-oar (macos)                    ──┘
```

- `test-home-isolation` 拆成两个 job：
  - `home-isolation`：三 OS 矩阵，只跑隔离测试。
  - `native-oar`：只在 macOS，装 Herdr、记录文件系统、构建 host、跑原生验收。
- `home-isolation` 的条件：`mode == 'daily' || (mode == 'affected' && home_isolation != 'false')`。
- `native-oar` 的条件：`mode == 'daily' || (mode == 'affected' && native_oar != 'false')`。
- 标志缺失时任务照跑。
- `required` 的 needs 变成 `[selection, verify, home-isolation, native-oar]`。每个平台 job 只接受两种结果：`success`；或者标志是 `false` 且结果是 `skipped`。其他组合都失败。

### 2.3 回放效果（117 个改代码的提交）

| 任务 | 今天 | 第一阶段 |
| --- | --- | --- |
| macOS 原生 OAR | 117（100%） | 约 62%（只跟 `tests/` import 时是 47%） |
| 三 OS HOME 隔离 | 117（100%） | 约 33（28%） |

纯文档 PR 两项都是 0，和今天一样。不触发时，PR 墙钟时间由 `verify` 决定，约 4 分钟。

### 2.4 剩余风险

这一阶段假设 macOS 特有的失败集中在原生测试的 import 闭包、OAR host 代码、shell 脚本和 CI 实现里。原生闭包现在跟随 `src/` 和 `scripts/` import，所以原生测试直接或间接用到的模块都会触发原生 lane。剩下的缺口是不被原生测试 import 的模块：darwin 特有的行为（`sandbox-exec`、APFS、Herdr 二进制）在这些模块里要等 daily 才跑到。daily 失败会开修复 issue；main 最多红一天。

### 2.5 改动清单

- `scripts/select-ci-coverage.ts`：计算两个标志，写进 `GITHUB_OUTPUT`；删掉 `documentation` 输出。
- `.github/workflows/ci.yml`：拆 job；改条件和 `required`。
- `tests/check-ci-job-split.test.ts`：
  - 触发面的单元测试：bundle 输入（用固定的 metafile fixture）、`*.sh`、CI 实现面、测试文件、纯文档 diff。
  - CLI 测试：`GITHUB_OUTPUT` 的新行。
  - `required` 的组合测试：两个平台结果乘两个标志。
  - workflow 结构测试：两个 job 的条件、步骤和 needs。
- 文档：`docs/architecture/modules/verification/evals-checks.md` 的不变量 1 和一条历史记录；`assets/skills/repo-harness-test/references/running.md` 的 lane 说明。

### 2.6 验收

- `bun run check:type`
- `bun run test:files tests/check-ci-job-split.test.ts tests/ci-documentation-consumers.test.ts tests/check-ci-isolate-aggregation.test.ts --timeout 60000 --max-concurrency 1`
- 本地回放（§7）给出的触发率不高于 §2.3 的数字加 5 个百分点。
- 这个 PR 改了 `.github/**`，所以它自己的两个平台任务都会跑。合并后读回第一个不碰触发面的代码 PR：`native-oar` 和 `home-isolation` 是 `skipped`，`Required / CI` 是 `success`。

## 3. 第二阶段：AST 路径求值代替字面量正则

### 3.1 做什么

- 把 `scripts/ci-documentation-consumers.ts:35` 的路径求值（`values()`）抽到 `scripts/lib/path-values.ts`。文档扫描器和选择器共用它。两个真实消费者，所以这个共享模块成立。
- 选择器的字面量边改用这个求值器：
  - 只看代码里的表达式。注释自动排除。
  - 路径表达式指：`join`/`resolve`/`URL` 调用的结果；读文件、列目录、spawn 调用的路径参数；含 `/` 或文件扩展名的独立字符串。普通单词不算路径，例如命令名 `'docs'`。
  - `join(ROOT, 'assets', 'partials')` 求值成 `assets/partials`。今天的拆段路径消费者靠这个保留下来。
  - 精确文件和后缀匹配是普通边，继续传播。
  - 目录匹配是数据边：消费者依赖目录里的文件内容，但不继承那些文件自己的依赖。
- import 边不变。#747 的文档规则不变。

### 3.2 孤儿文件

规则收紧后，有些文件会失去消费者，选择器会对它们 fail closed。按正则近似的回放，目前有 78 个这样的文件，集中在 `evals/fixtures`、`assets/partials`、`assets/partials-agents`、`references/arch`、`assets/project-structures`、`assets/hermes`。

同一个 PR 里逐个处理：
- 有真实读取者但求值器没认出来：修求值器，加一个回归用例。
- 有行为但没有测试：加真实的消费者测试。
- 没有可执行行为（例如 `LICENSE`）：加进 `isDocumentationPath`，在 PR 描述里逐条说明。

合并前孤儿列表必须是空的。

### 3.3 预期和门槛

正则近似版（去注释、只认路径形字面量、去一段目录 key、目录边不传播）的回放结果：中位数 337 → 217，p25 161，但 116 个提交里有 18 个碰到孤儿文件。

门槛：
- 回放 120 个 main 提交，`coverage is unknown` 是 0。
- 代码提交的中位数选择数不超过 240。
- 达不到就不合并这一阶段。第一阶段不受影响。

### 3.4 改动清单

- 新增 `scripts/lib/path-values.ts`（从扫描器移出，不新写逻辑）。
- `scripts/ci-documentation-consumers.ts` 改为 import 它。
- `scripts/select-ci-coverage.ts` 的 `selectAffectedTests` 用它产生字面量边，加数据边语义。
- `tests/check-ci-job-split.test.ts`：注释、普通单词、拆段路径、目录数据边、旧 import 边的用例。
- 孤儿处理产生的测试或 `isDocumentationPath` 条目。
- 同步 `evals-checks.md` 和两份 skill 参考里对选择规则的描述。

### 3.5 验收

- `bun run check:type`
- `bun run test:files tests/check-ci-job-split.test.ts tests/ci-documentation-consumers.test.ts --timeout 60000 --max-concurrency 1`
- §7 的回放命令输出 `unknown: 0`，中位数不超过 240。
- 合并后第一周：daily 全量测试没有出现「PR 上没选中、daily 才失败」的回归。如果出现，把那条漏掉的边写成回归用例。

## 4. 不做什么，以及实测理由

| 选项 | 回放结果 | 决定 |
| --- | --- | --- |
| CLI 按子命令懒加载 | 三种模型下中位数都不变：337/337、217/217、152/152 | 不做。依赖图本身稠密，CLI 不是唯一枢纽 |
| 只删一段目录 key | 中位数 314，16% 的提交 fail closed | 不做。收益小，阻塞多 |
| 运行时 test-impact map | 上限约等于只算 import 边：中位数 152，116 个提交里 78 个含非代码文件，需要另外的数据规则 | 现在不做 |
| 用 `.archcontext` capability 路径触发 macOS 任务 | 没有回放 | 不做。glob 比 bundle 输入粗，还多一份映射 |

运行时 map 的可行性已经验证一半：`BUN_OPTIONS="--preload <file>"` 会传给子进程，preload 能在退出时读到 `Loader.registry`。named import 的 `fs` 读取抓不到，shell 脚本的读取也抓不到。重新评估的条件：第二阶段之后，`verify` 分片的单片时间仍超过 6 分钟。

## 5. 范围

**做**：§2 和 §3。两个阶段各自可以单独合并。第一阶段合并后系统完整可用；第二阶段失败不影响第一阶段。

**不做**：
- 改 `src/cli/index.ts` 的加载方式。
- 改 daily 任务的内容或频率。
- 拆产品代码里的 import 枢纽（例如 `src/effects/state/resolve-effective-state.ts` import `scripts/acceptance-receipt.ts`）。这是架构问题，记在 #749。
- 新增 PR label 或手动强制开关。

## 6. 回滚

- 每个阶段一个 squash commit，`git revert <squash-commit>` 回到上一个状态。
- 第一阶段回滚后，平台任务恢复每个代码 PR 都跑。
- 第二阶段回滚后，选择恢复正则字面量边。孤儿处理加的测试可以留着，它们是真实覆盖。

## 7. 回放方法

数字来自对 `origin/main` 最近 120 个 first-parent 提交的回放：用当前树的依赖图，代入每个提交的改动路径，跑 `selectAffectedTests` 或它的变体。纯文档提交单独计数。脚本是一次性的，不入库。第二阶段把这个回放做成 `bun scripts/replay-ci-coverage.ts` 的一个选项，作为 §3.5 的验收命令。

## 8. 待 owner 决定

- Q1：第一阶段的 macOS 触发面是否接受 §2.4 的剩余风险（darwin 特有问题最多晚一天发现）。推荐：接受。
- Q2：第二阶段的门槛（unknown 为 0、中位数不超过 240）。推荐：按此执行。

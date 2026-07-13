# 总判断

**核心病因不是 authoritative benchmark 本身需要 25–40 分钟，而是把“昂贵证据生产”“可重复的合同验证”“外部验收 freshness”三种生命周期完全不同的工作串成了一条可重入同步 gate。** 3×9 live matrix 有真实价值，甚至确实发现过单测难以暴露的安装、stdin/hook 和 profile 隔离问题；但把它写进合同 `commands_succeed`，再由每次 `verify-sprint` 无条件调用 `verify-contract`，属于明显的**职责错位**。Fingerprint freshness 也应保留，但当前绑定了 `base_ref/base_rev` 和 Git patch ancestry，防的是“目标分支动过”，不是“被评审的实现变过”；而 Human Review Card 在 canonical external acceptance 不可用时还能接管结论，又违反了仓库自己的单一事实来源和 fail-closed 原则。按你提供的实测，仅 6 次 matrix 就安排了约 **150–240 分钟**的重复昂贵工作，四轮外部验收合计约 **19 分 04 秒**；20 小时总墙钟的根因是重复触发放大，而不是模型 token 或某一条测试本身。合同常规验证应收敛到 **3–5 分钟，硬上限 10 分钟**；完整 matrix 应按最终内容摘要由独立 evidence producer **成功运行一次**。当前设计与 root `CLAUDE.md`/`AGENTS.md` 所要求的 SSOT、禁止稳态 fallback、一次迁移即删除旧路径直接冲突。([GitHub][1])

> 证据边界：仓库文件和 git blame 足以核实触发链、重复安装结构、fingerprint 语义以及后续补丁历史；“至少 6 次”、四轮具体时长、exit 143、ENOSPC、worktree 被删等精确运行事实来自你提供的实测。仓库保留了这些事故的结构原因和收口记录，但没有保留所有临时进程日志。

# 审计表

| 机制                                                                            | 实际防范的风险                                                                        | 判定                          | 证据与评审                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **完整 3 profiles × 9 scenarios authoritative matrix**                          | 单元测试、fixture 或 synthetic provider 无法证明真实 `claude -p`、hook、安装 profile 和隔离环境共同工作 | **必要，但只能作为一次性外部证据**         | 合同明确要求 full 3×9 matrix 通过，`tasks/contracts/...contract.md:30`；同时合同自己指出应先跑 focused suite 和跨三 profile 的单 scenario，最后才跑 full matrix，`:77–84`。研究结论记录 live matrix 找到了 inherited `BUN_INSTALL`、stdin/hook blocking、strict external-skills 三类真实缺陷，因此不能简单砍掉 matrix。([GitHub][1])                                                                                                              |
| **把 full matrix 放入 `commands_succeed`**                                       | 原意是避免 closeout 使用陈旧或 synthetic benchmark 报告                                    | **错位，而且因重试放大而过度**           | 合同 `:198–214` 的通用命令列表中，`:202` 直接运行 `benchmark:harness ... --require-authoritative`；`verify-contract.sh:769–777` 对每条命令直接执行，没有缓存、证据复用或成本分类；`verify-sprint.sh:453` 每次又严格调用该 verifier。于是“验证已有证据”被实现成了“重新生产证据”。([GitHub][1])                                                                                                                                                               |
| **每 arm 独立 workspace/HOME/provider state**                                    | 防止 profile/scenario 之间共享 hook、settings、凭证状态或工作区副作用，使 27 个结果互相污染                | **必要**                      | `run-harness-profile-benchmark.ts:269–278` 构造隔离 HOME/CODEX_HOME/BRAIN_ROOT；`:460–472` 为每个 profile/scenario 创建独立 `runRoot/workspace/hostRoot`。这个隔离直接保护 benchmark 的可信度，不应删除。([GitHub][2])                                                                                                                                                                                               |
| **每个 arm 都独立 adopt + install + 独立 `BUN_INSTALL`**                             | 试图证明每个 arm 都能从全新主机状态安装，不受前一 arm 影响                                             | **过度；把安装隔离放错了粒度**           | `run-harness-profile-benchmark.ts:280–306` 在每个 arm 内执行 adopt/profile/install；`:269–278` 把 `BUN_INSTALL` 放进每 arm 的独立 host root；`:644–652` 又逐 profile/scenario 顺序重复。安装正确性应按 profile 验证 3 次，不应按 scenario 验证 27 次。当前结构还直接放大 ENOSPC 风险；review 自己也把 repeated isolated-install overhead 和 interrupted-matrix temp space 列为下一优化点。([GitHub][2])                                                |
| **外部验收绑定精确实现内容**                                                              | 防止验收之后代码、staged/unstaged/untracked 内容被改变却仍沿用旧结论                                | **必要**                      | `workflow_review_freshness_status` 对 missing、malformed、unknown、mismatch 均不放行；`workflow_external_acceptance_status` 还检查 reviewer/source/P1 blocker，并要求 acceptance fingerprint 与当前实现一致。这是真正应该保留的 fail-closed 边界。([GitHub][3])                                                                                                                                                           |
| **Fingerprint 哈入 `base_ref/base_rev`，并以 `${baseRef}...HEAD` 的 Git patch 为内容** | 防止 target advance 后，旧 review 覆盖到未经考虑的新集成上下文                                    | **错位**                      | `diff-fingerprint.ts:463–478` hash 的是 `${baseRef}...HEAD` patch；`:489–506` 明确把 `base_ref`、`base_rev` 放进 fingerprint。运行时还通过 `--base` 传入 target tip；测试 `review-freshness.test.ts:1175–1214` 明确要求“即使 feature branch 未动，target advance 也必须 stale”。这把 ancestry 变化等同于实现变化，导致无关 rebase/main 推进也重验。([GitHub][4])                                                                              |
| **验收结论 commit 入库**                                                            | 将外部验收从瞬时会话转成可审计、可追溯的 durable conclusion                                        | **必要**                      | 仓库原则要求 raw checks/runs 只是缓存，durable conclusions 应进入 reviews/contracts/notes/research；因此“验收结论要 commit”本身是正确的。([GitHub][5])                                                                                                                                                                                                                                                             |
| **验收 commit 后再重新绑定、再起验收；靠 operational-path 例外避免自失效**                          | 修补“写入验收证据本身改变 HEAD，旧 fingerprint 立即失效”的循环                                      | **历史上过度；当前只修了一半**           | 当前 `diff-fingerprint.ts:495–499` 已明确不把 raw `head_rev` 哈入 payload，避免 review/check-only commit 使自己失效；`:376–396` 还排除一批 operational paths。git 历史依次出现 “bind authoritative matrix evidence”“post-rebase external acceptance”“keep generated benchmark evidence out of review freshness”，说明是在用例外追赶循环。自失效问题有所缓解，但 `base_rev` 仍在 fingerprint 内，所以 rebase/target advance 继续制造无关失效。([GitHub][4]) |
| **Canonical external acceptance 不可用时回退到 Human Review Card**                   | 试图在 hook/helper 缺失或 schema 尚未迁移时仍允许 closeout                                   | **过度，且违反 SSOT/fail-closed** | `verify-sprint.sh:510–517` 先调用 canonical `workflow_external_acceptance_status`；`:518–528` 在其为 `missing/unavailable` 时接受 Human Review Card 的 `pass/manual_override/not_required`。这正是仓库原则禁止的 dual authority 与 semantic fallback。Card 可以是显示投影，不能成为替代 authority。([GitHub][6])                                                                                                             |
| **Freshness 对缺失、格式错误、不可观测、内容不匹配 fail closed**                                 | 防止旧 review、损坏 review、Git 状态读取失败被误判为已验收                                         | **必要**                      | `.ai/hooks/lib/workflow-state.sh` 的 freshness 与 external acceptance 分支明确区分 missing/malformed/unknown/stale；相关测试覆盖错误 reviewer、错误 source、P1 blocker、缺失 rubric 和 fingerprint mismatch。这些检查成本很低，且防的是确切完整性事故，应保留。([GitHub][3])                                                                                                                                                             |
| **Benchmark 报告字节摘要与 implementation freshness 分开**                             | 防止 report JSON/Markdown 被修改，同时避免生成报告导致实现 review 自失效                            | **必要，且这是当前方向正确的一项**         | `workflow-state.sh` 已独立计算 benchmark report JSON/MD 的精确字节 fingerprint；`verify-sprint.sh:461–470` 对报告摘要 missing/invalid fail closed。研究文档也说明 generated reports 已从 implementation freshness 中分离。应继续使用，但绑定对象应从 commit 改成 benchmark-input digest。([GitHub][6])                                                                                                                              |
| **通用 `commands_succeed` 无墙钟预算、无进程组预算、无命令类别边界**                                | 提供灵活合同 DSL，允许任意项目命令作为 exit criterion                                           | **错位**                      | `verify-contract.sh:769–777` 只循环并用 `bash -c` 执行；没有 per-command 或 total timeout。合同的 delegation budget 甚至是 `wall_time_minutes: null`。`.ai/harness/policy.json` 也没有 verifier timeout/benchmark budget。任意命令能力本身不是问题，但进入强制 gate 后必须有固定上限，否则一条命令即可把 5 分钟 gate 退化成 40 分钟。([GitHub][7])                                                                                                       |
| **同一 focused tests 同时存在于 `tests_pass` 和 `commands_succeed`**                  | 试图同时证明测试文件存在并证明组合命令通过                                                          | **过度**                      | 合同 `:188–197` 已逐项执行测试文件，`:199–201` 又以三个组合命令重复执行同一批测试，之后还有 `bun test` 全量命令。这里有至少两套执行 authority；应只保留一个。([GitHub][1])                                                                                                                                                                                                                                                                    |

因此，四个应保留的核心防线只有：

1. **一次真实 full matrix**：防 synthetic/unit 无法暴露的 provider、hook、安装和 profile 交互缺陷。
2. **每 arm 运行态隔离**：防 scenario/profile 交叉污染；但安装准备不必每 arm 重做。
3. **内容级 freshness 且 fail closed**：防验收后真实实现被改。
4. **报告字节与 provenance 完整性**：防 evidence 被替换、截断或人工改写。

# 最小重构方案

目标状态只有三条路径：

```text
bounded deterministic verifier
            │
            ▼
 final implementation subject ──► authoritative evidence producer（最多一次/摘要）
            │                                      │
            └──────────────────────┬───────────────┘
                                   ▼
                       canonical external acceptance
                                   │
                                   ▼
                        artifact-only final closeout
```

## 1. 常规合同验证：只做确定性、可限时的验证

`verify-contract` 和 `verify-sprint` 的职责应限定为：

* 检查文件、allowed paths、schema、freshness、report digest；
* 执行单元测试、类型检查、静态检查和 dry-run；
* **不启动 provider、不执行 adopt/install、不生成 benchmark evidence、不访问网络**；
* 总墙钟硬上限 10 分钟，推荐目标 3–5 分钟；
* 超时必须杀整个子进程组，不能只杀外层 shell 留下 orphan provider/install。

合同仍可保留 `commands_succeed`，但它不再是“任意昂贵 shell DSL”。最小实现是不引入复杂分类系统，而是加两条硬约束：

1. 整个 verifier 固定 600 秒上限，不能通过 `.ai/harness/policy.json` 调大；
2. repo 自身的结构测试禁止 active contract/template 从 `commands_succeed` 引用 `benchmark:harness`、provider CLI、adopt 或非 dry-run install。

固定预算属于 verifier 的产品不变量，不应成为 policy 可调旋钮；否则未来只需把 10 改成 60 就能绕过回归保护。

## 2. Authoritative matrix：从 gate 移为独立证据生产

### 时机

只在以下条件同时满足后启动：

* deterministic verifier 已通过；
* implementation subject 已冻结；
* benchmark-relevant digest 与已有有效报告不同；
* 当前 work-package 的验收条件确实要求 live matrix。

普通不触碰 benchmark/runtime/install surface 的 work-package 应当跑 **0 次**。本合同这类 benchmark-bearing work-package，对每个最终 digest 跑 **1 次成功的完整 matrix**。

修复真实代码导致 digest 改变后，可以再跑一次；rebase、review commit、report commit、无关 main 推进均不能构成重跑理由。

### 身份

设一个明确的 **evidence producer** 身份：

* 可以是有 Claude 凭证的专用 CI runner；
* CI 不方便持有凭证时，可以是明确命名的 benchmark operator；
* 不能是 `verify-sprint`；
* 不能由 external reviewer 通过嵌套 `claude -p` 顺手重跑；
* reviewer 只消费 implementation、报告和 provenance。

这里不需要新增通用编排框架。继续使用现有 `benchmark:harness` 命令，但它只由 evidence job/operator 调用。

### 证据绑定

在现有 `profile-comparison.json` 中加入：

```json
{
  "benchmark_subject_sha256": "...",
  "runner_sha256": "...",
  "scenario_manifest_sha256": "...",
  "fixture_set_sha256": "...",
  "install_profile_inputs_sha256": "...",
  "provider": "claude",
  "authoritative": true
}
```

`benchmark_subject_sha256` 只覆盖会影响 matrix 语义的输入：

* runner；
* scenario manifest；
* fixtures/prompts；
* hook/runtime/install/profile 实现；
* provider invocation schema。

`source_commit` 可以保留为审计 metadata，但**不能参与有效性判断**。这样无关 rebase 不会失效，而真正改变 benchmark 行为的内容一定会失效。

`verify-sprint` 只做：

* 当前 benchmark subject digest 是否与报告一致；
* 是否恰好包含 3×9 唯一记录；
* 每项是否 authoritative；
* JSON/Markdown 精确字节摘要是否匹配；
* provenance 是否完整。

它绝不启动 provider。

## 3. Benchmark 内部：保留 arm 隔离，删除 arm 级重复安装

把当前 27 次 setup 改为：

```text
每 profile：
  prepare/adopt/install 一次
  ├─ clone/reflink → scenario 1 的独立 HOME/workspace
  ├─ clone/reflink → scenario 2 的独立 HOME/workspace
  └─ ...
```

即：

* **3 次 profile installation preparation**；
* **27 个独立可写运行 overlay**；
* package/download cache 共享，HOME/settings/workspace 不共享；
* setup 成功后立即生成不可变基底；
* 每个 arm 结束后提取必要结果并删除其可写临时目录；
* 不长期保留 27 份完整安装树。

这不会污染当前 benchmark 的 duration 指标，因为 runner 的计时本来就是在 setup 之后开始。它直接缓解 ENOSPC，又不削弱 scenario 隔离。([GitHub][2])

为了处理三次已发生的基础设施事故：

* **exit 143**：matrix 移出 10 分钟 gate，独立 evidence job 的硬上限设为 50 分钟，并由它拥有完整进程组。
* **ENOSPC**：3 份 profile base + 逐 arm 清理；启动前检查最小可用空间，运行中记录 peak temp bytes。
* **worktree 被删**：producer 从 frozen subject 创建自己拥有的不可变 checkout/snapshot，运行根目录不位于合同 worktree 下。并行会话删除合同 worktree，不再影响 matrix。

不建议此时再增加 checkpoint/resume、分布式 arm scheduler 或通用 artifact registry；一次稳定运行已经足够解决当前问题。

## 4. External acceptance：绑定“被评审内容”，不绑定 commit graph

将当前 fingerprint 的核心对象改成规范化的 `review_subject_sha256`：

```text
SHA256(
  sorted [
    path,
    file-kind,
    mode,
    deletion-marker,
    final-content-sha256
  ]
  + staged/unstaged/untracked final bytes
)
```

明确不纳入：

* `base_ref`
* `base_rev`
* `head_rev`
* commit SHA
* review/check/benchmark evidence 的字节

`base_rev` 可以作为验收 metadata 保留，用来判断 target 自验收后改了哪些路径，但不能成为 subject hash 的一部分。

### Rebase 与 main 并行推进规则

外部 acceptance 保持有效，当且仅当：

1. 重算后的 `review_subject_sha256` 未变；
2. target advance 的 changed paths 与 reviewed implementation paths 无交集；
3. rebase 未产生需要人工解决的冲突；
4. rebase 后的廉价 deterministic verifier 通过。

这意味着：

* main 在无关文件推进：**不重跑 matrix，不重新外部验收**；
* 单纯 rebase、commit ID 变化：**不重验**；
* acceptance/report commit：**不重验**；
* 实现内容、文件 mode、路径、删除状态改变：fail closed，重新验收；
* target 改了同一实现路径或冲突解决改变了内容：重新验收；
* benchmark-relevant subject 改变：重新跑一次 matrix。

这里把风险放在正确位置：外部 reviewer 证明“这些实现字节和这份证据可接受”；rebase 后的集成行为由廉价测试证明。让 reviewer 为每个无关 main commit 重新阅读同一内容，并不能增加相称的安全性。

## 5. 单一验收事实来源

`## External Acceptance Advice` 是唯一 external-acceptance authority，包含：

* verdict；
* reviewer identity；
* source/session reference；
* `review_subject_sha256`；
* benchmark evidence digest；
* blocker summary。

Human Review Card 只能是从该 section 生成或核对的**确定性投影**。Canonical section 缺失、损坏或 helper 不可用时必须失败，不能从 Card 回退。

顶层 evaluator review 可以继续有自己的 recommendation/fingerprint，因为那是另一位 reviewer 的独立 attestation；但 Card 不得成为第三个 authority。

# 文件级改动清单

| 文件                                                                         | 改动                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md` 及合同模板 | 删除 `:202` 的 live benchmark 命令；删除 `tests_pass` 与 `commands_succeed` 的重复测试执行；保留报告文件存在性和 report-validation 测试。                                                |
| `scripts/verify-contract.sh`                                               | 给整体执行加固定 600 秒预算和进程组终止；输出每条命令及总 duration；禁止 strict verifier 承担 evidence production。                                                                        |
| `scripts/verify-sprint.sh`                                                 | 只验证 benchmark artifact/digest；删除 Human Review Card external fallback `:518–528`；canonical helper unavailable 时 fail closed。                                |
| `src/cli/hook/diff-fingerprint.ts`                                         | 保留现有 `review-fingerprint` 命令入口，但将 hash 从 Git patch/ancestry 改为规范化 final-content subject；从 hashed payload 删除 `base_ref/base_rev`；`head_rev` 继续只作为 metadata。 |
| `assets/hooks/lib/workflow-state.sh`                                       | 在产品 source owner 中实现新的 subject freshness 和 canonical external acceptance。                                                                                  |
| `.ai/hooks/lib/workflow-state.sh`                                          | 通过仓库已有投影/sync 从 `assets` 生成，不再作为第二个手工 authority。                                                                                                           |
| `scripts/run-harness-profile-benchmark.ts`                                 | setup 从每 arm 调整为每 profile；保留每 arm HOME/workspace overlay；生成 `benchmark_subject_sha256`；采用 producer-owned snapshot 和逐 arm 清理。                               |
| `evals/harness/reports/profile-comparison.json/.md`                        | 携带 benchmark subject 和 provenance；commit 的报告继续受精确字节 hash 保护。                                                                                               |
| `tests/review-freshness.test.ts`                                           | 删除“任何 target advance 必须 stale”的断言；新增 unrelated target advance 保持有效、内容/path/mode/deletion 改变必 stale、同路径 target advance 必重新验收。                               |
| `tests/workflow-state-lib.test.ts`                                         | 删除 Card fallback 测试；保留 missing/malformed/unknown/mismatch fail-closed；检查 canonical acceptance 是唯一 authority。                                               |
| `tests/harness-benchmark-matrix.test.ts`                                   | 检查恰好 3×9、subject/provenance、每 profile 只 setup 一次、每 arm 运行态隔离仍成立。                                                                                           |
| `tests/helper-scripts.test.ts` / `tests/workflow-contract.test.ts`         | 检查 `verify-sprint` 不可触达 benchmark/provider；active contract/template 不可把 runtime-heavy producer 放入 `commands_succeed`；检查 600 秒总预算。                          |
| `.ai/harness/policy.json`                                                  | **不新增可调 verifier timeout 或 benchmark 重跑策略。** 这类成本边界是代码不变量，不能变成可放宽的 policy knob。                                                                            |
| `CLAUDE.md` / `AGENTS.md` 或对应参考文档                                          | 只补一条简短 invariant：fast verifier consumes evidence; it never produces runtime-heavy evidence。两份根文件通过现有投影保持一致。                                                |

# 明确删除清单

这是一次 cutover，不保留 v1/v2 双路径：

1. 删除合同 `commands_succeed` 中的 `benchmark:harness --require-authoritative`。
2. 删除 `tests_pass` 与组合 `bun test ...` 对同一测试文件的重复执行 authority。
3. 删除 `verify-sprint.sh:518–528` 的 Human Review Card external-acceptance fallback。
4. 删除“target tip 任意变化即使实现未变也 stale”的 freshness 语义和对应测试。
5. 从 review fingerprint hashed payload 删除 `base_ref`、`base_rev` 和 Git commit ancestry。
6. 删除 acceptance commit 后因 commit/rebase 而重新起 reviewer 的操作规约。
7. 删除 benchmark 每 scenario 重做 adopt/install 的 27 次 setup 路径，改为每 profile 3 次。
8. 删除 report pair 依赖 commit SHA/source commit 来判断有效性的路径；commit 只留作 metadata。
9. 删除 active closeout 对旧 rubric/legacy missing 的稳态兼容分支；在同一 work-package 迁移所有 active review 后，只接受新 schema。Archived historical reviews不参与 active gate，不需要兼容 reader。
10. 删除 Human Review Card 中手工维护的 external verdict，或将其改成自动投影并加 drift check，不能继续允许人工独立填写。

保留的机制只有 subject freshness、canonical acceptance、report byte integrity、arm runtime isolation 和一次性 full matrix；没有并行新增旧/新 evaluator、没有长期 alias，也没有双写迁移期。这符合仓库 `Code Optimization Principles` 对 SSOT、无稳态兼容层、fail-closed 和同 work-package 删除旧 authority 的要求。([GitHub][5])

# 一次性迁移步骤

1. **先反转测试语义**：写入“同内容 rebase 不 stale”“内容改变必 stale”“Card 不可接管 acceptance”“verifier 不可触达 benchmark”的新测试。
2. **实现新 subject fingerprint**：在 `diff-fingerprint.ts` 切换为规范化内容摘要；保留 target revision 仅作 metadata/overlap 检查。
3. **一次性升级 active review schema**：迁移所有仍会进入 closeout 的 active review；删除旧 parser/fallback，而不是兼容两种格式。
4. **切断昂贵调用链**：从合同与模板移除 matrix command；给 verifier 加固定预算。
5. **改造 producer setup**：每 profile prepare 一次，27 个隔离 overlay；加入 subject/provenance。
6. **对最终 candidate 跑一次 authoritative matrix**，生成新报告。
7. **外部 reviewer 对同一 subject 和报告签一次 canonical acceptance**。
8. **commit 报告与验收结论**；最后一次 `verify-sprint` 只做廉价测试、freshness 和 artifact digest，不再启动 provider。

迁移过程中不保留“旧 fingerprint 或新 fingerprint 任一个通过”的 OR 分支；那会重新制造 dual authority。

# 防回归约束

## 1. 墙钟预算是硬断言

`verify-contract --strict`：

* 总预算：**600 秒**；
* 单条命令预算：不超过剩余总预算，建议单项上限 300 秒；
* 超时结果：明确标记 `failure_class=verification_budget`；
* 终止整个进程组：TERM 后短暂 grace，再 KILL；
* report 记录每项 duration 和 total duration。

即使以后有人误把 matrix 加回来，也只会在 10 分钟内失败，不可能重新默默耗掉 40 分钟。

## 2. 结构约束比性能趋势更可靠

在现有测试中做静态和可达性断言：

* active contracts/templates 不得引用 `benchmark:harness`；
* `verify-sprint`、`verify-contract` 的调用图不得启动 `claude -p`、benchmark runner、adopt 或实质 install；
* benchmark producer 不得由 verifier 子进程调用；
* benchmark report validation 可以被 verifier 调用；
* `commands_succeed` 出现禁止的 producer 命令时，在真正执行前立即失败。

这比“观察最近几次平均时长”更强，因为它从结构上消除了 40 分钟路径。

## 3. CI 行为测试

必须覆盖：

* 无关 target advance + subject bytes 不变 → acceptance 仍有效；
* rebase 后 commit SHA 全变但 subject 不变 → acceptance 仍有效；
* implementation 内容/path/mode/deletion 变化 → stale；
* target 同路径发生变化 → fail closed 或要求重新验收；
* review/report-only commit → subject 不变；
* canonical acceptance missing/malformed/helper unavailable → fail；
* Human Review Card 写 `pass` 不能挽救 canonical failure；
* report 任意一字节变化 → evidence invalid；
* 3×9 record 缺失、重复或非 authoritative → invalid；
* verifier fake command 睡眠超过预算 → 整个进程组被杀；
* benchmark setup 调用次数必须是 3，而不是 27；
* 每个 arm 的 HOME/workspace 仍然唯一。

## 4. Evidence 去重和并发

按 `benchmark_subject_sha256` 设置 dedicated job 的 concurrency key：

```text
benchmark-authoritative/<subject-sha256>
```

同一 digest：

* 最多存在一个运行中的 producer；
* 最多接受一个成功 authoritative artifact；
* 已有有效 artifact 时 closeout 直接消费；
* 基础设施失败可以重试，但 verifier 永远不会自动触发重试；
* 不允许“latest report”由两个并发会话互相覆盖。

## 5. 磁盘预算

第一次迁移后的成功 run 记录：

* profile base 大小；
* arm overlay peak；
* 总临时空间 peak。

随后 CI 对 peak 设置固定上限，例如首个基线的 1.5 倍，并在每个 arm 后断言临时目录已回收。具体字节值应由首次成功迁移 run 得出，而不是现在凭空指定。

# 成本预算

以下均指**验证与验收开销，不包括实现编码时间**：

| 阶段                                           |        改造后目标 |       硬上限 |                                频率 |
| -------------------------------------------- | -----------: | --------: | --------------------------------: |
| 单次 `verify-contract` / `verify-sprint` 常规验证  |   **3–5 分钟** | **10 分钟** |                           开发中按需重复 |
| 最终 artifact/freshness-only closeout          |  **10–30 秒** |  **1 分钟** |                              最终一次 |
| Authoritative 3×9 matrix                     | **25–40 分钟** | **50 分钟** |       每个最终 benchmark subject 成功一次 |
| External acceptance                          |  **5–10 分钟** |  建议 15 分钟 |         每个实际变化的 review subject 一次 |
| 不涉及 benchmark 的普通 work-package 全生命周期验证       | **10–25 分钟** | **35 分钟** |                          无 matrix |
| 本合同这类 benchmark-bearing work-package 全生命周期验证 | **45–65 分钟** | **75 分钟** | 含一次 matrix、一次 acceptance、2–3 次快验证 |

这里没有强行要求把真实 provider matrix 从 40 分钟优化到几分钟。**25–40 分钟跑一次是合理成本；25–40 分钟嵌入每一轮 verifier 才是过度工程。** 改造后的关键收益不是单次 matrix 加速多少，而是把其生命周期调用次数从“每轮验证一次”降为“每个实际 benchmark subject 一次”，并让 rebase、main 推进和 evidence commit 不再产生虚假的新 subject。

## 2026-07-14 实现收口

本报告的审计结论已进入 `verifier-evidence-lifecycle-cutover` work-package：

- verifier 使用固定 600 秒绝对预算、进程组终止和逐命令 duration/timeout evidence；
- verifier 在执行前拒绝 benchmark/provider、evidence producer、adopt 和 substantive install；
- review freshness 已切到 normalized final-content subject，target revision 仅作为 provenance/overlap evidence；
- canonical `## External Acceptance Advice` 是唯一验收 authority，Human Review Card 和 manual override 不再放行；
- benchmark report schema v2 绑定 input subject、provenance 与 JSON/Markdown bytes，setup 从 27 次降到 3 个 immutable profile bases，仍保留 27 个 writable isolated overlays；
- 首次 post-fix matrix 实跑暴露 producer 仍串行且没有自有 deadline：55 分钟只完成 20/27，当前 arm 已运行 8 分钟。该次运行按 50 分钟 hard limit 终止；producer 随后固定为 two-arm pool、50 分钟绝对 deadline 和 detached process-group termination，成本边界不再只存在于文档；
- bounded producer 的下一次实跑在 12/27 暴露 grader 只看 `git status`：provider 已完成 focused test、提交实现并 fast-forward，但已提交 final content 因工作树干净被误判缺少 expected paths。arm 现在记录 pre-provider baseline revision，grader/report 对 baseline 到最终 `HEAD` 与 working tree 取并集；authoritative 模式首个失败即 fail-fast 并回收并行 sibling，不再继续消耗不可能成功的矩阵；
- 最终 verifier 只消费已存在的 authoritative report，不重新启动 matrix。

上文“本次调研保持只读”描述的是最初审计 pass；实现、确定性验证、最终一次 matrix 与外部验收由其后的 work-package 单独记录。

[1]: https://github.com/Ancienttwo/repo-harness/blame/main/tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md "Blaming repo-harness/tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md at main · Ancienttwo/repo-harness · GitHub"
[2]: https://github.com/Ancienttwo/repo-harness/blame/main/scripts/run-harness-profile-benchmark.ts "Blaming repo-harness/scripts/run-harness-profile-benchmark.ts at main · Ancienttwo/repo-harness · GitHub"
[3]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/.ai/hooks/lib/workflow-state.sh "https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/.ai/hooks/lib/workflow-state.sh"
[4]: https://github.com/Ancienttwo/repo-harness/blame/main/src/cli/hook/diff-fingerprint.ts "Blaming repo-harness/src/cli/hook/diff-fingerprint.ts at main · Ancienttwo/repo-harness · GitHub"
[5]: https://github.com/Ancienttwo/repo-harness/blame/main/CLAUDE.md "Blaming repo-harness/CLAUDE.md at main · Ancienttwo/repo-harness · GitHub"
[6]: https://github.com/Ancienttwo/repo-harness/blame/main/scripts/verify-sprint.sh "Blaming repo-harness/scripts/verify-sprint.sh at main · Ancienttwo/repo-harness · GitHub"
[7]: https://github.com/Ancienttwo/repo-harness/blame/main/scripts/verify-contract.sh "Blaming repo-harness/scripts/verify-contract.sh at main · Ancienttwo/repo-harness · GitHub"

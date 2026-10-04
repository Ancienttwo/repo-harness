# BRC15a 原始 metadata 离线复放与 Acceptance 映射

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## 结论

**10/10 预期 slot 标记覆盖，0/10 metadata 合格；本次未获得合格可采纳批次。** 标记的 campaign/group 与原 intent 一致，每个 slot 唯一。此处不是 `complete` slot、`complete` batch、campaign `accepted` 或 active 启动许可。Issue 的真实问题与修复价值未评估，不能从格式拒绝推断为零。

十个原始 body 由当时正式 parser 逐个离线读取，均返回 `null`。共同的首个拒绝条件是字符串 `priority`（P1/P2/P3），不满足 0–100 整数；另有八个 `suspected_paths` 数组未按字典序排列。所有 body 都恰好有一个可解析 JSON fence、字段集合正确、protocol/kind/issue_kind 合格、depends_on_slots 有序且唯一。没有发现本批次因重复 JSON fence、额外字段或 depends_on_slots 排序被拒绝。

所有十个 capability 名称均不在 frozen target 的 56 个 capability ID 中。**这是下游采纳阶段的另一项 membership 缺口，不是 parser 的实际拒绝条件**：当时 parser 对 capability 只检查非空字符串，已在 priority 处返回。

## 输入与版本

- 目标：`Ancienttwo/repo-harness-brc15a-canary-20260907`，`refs/heads/main@33d692aaa0ab593df0c160082b18fdac02c82e9c`，shadow，Profile 13。
- 原始结果：`/tmp/brc15a-pro-slider-author-result.json`；intent `sha256:f4aa3b1df08285847fa6bc808a69a7dea669d3be6b1c1319c8eeeeccfa23c540`。
- 实际发送的渲染 prompt：[sent-prompt.md](20260908-brc15a-offline-evidence/sent-prompt.md)，2304 bytes，SHA256 `7ecb12802941f3da67b82a80470e92a513a04b93e1b02d1d0203bd4b2231cc50`。与原 browser result 的发送前 secret-scan payload hash 完全相同。intent 中 `fdc74952…` 是渲染前 authoring prompt 的 hash，两者不能混称。
- 原始 Issue body 与身份：[issue-bodies.json](20260908-brc15a-offline-evidence/issue-bodies.json)。正文逐字节保留；从原 API JSON 投影身份、正文、时间及状态，不把这份文档投影称作 provider receipt。原 API 文件 `/tmp/brc15a-github-issues.json` SHA256 `d08da4b4960fef72dc738e7629de4719fb7a26a4fee554a319e4096952a10bb8`。
- 当时验证脚本 `/tmp/brc15a-validate-readback.ts` 直接 import 旧 canary worktree 的正式 `parseIssueBatchMetadata`。该 worktree 当前 `f8a9dea9e157e2494472c9c223d5662cd521bfe3` 干净；parser blob `cbeedc8b8345966f010bb205d4b6cd9de90cf86b` 在 `33c5012e`、`fcaaa898`、`f8a9dea9`、远端已读基线 `38c26b2a` 完全相同。后三次 canary commit 是文档记录，未替换当时 parser。
- [replay.json](20260908-brc15a-offline-evidence/replay.json) 保存每个 body 完整 hash、原 metadata、逐条件诊断和正式 parser 返回值。诊断只解释拒绝条件，不构成第二个可采纳性判断器。

## 逐 Issue 结果

| Slot | Issue / provider ID | Body SHA256 前缀 | priority | suspected_paths | 正式 parser |
|---|---|---|---|---|---|
| 01 | #1 / 5377449374 | `006391579c88` | P1 | 未排序 | `null` |
| 02 | #2 / 5377450204 | `f973736cd1ff` | P1 | 合格 | `null` |
| 03 | #3 / 5377451057 | `bcc1018e070b` | P1 | 未排序 | `null` |
| 04 | #4 / 5377451749 | `4debf8faf400` | P1 | 未排序 | `null` |
| 05 | #5 / 5377452446 | `62497b3b8e88` | P1 | 未排序 | `null` |
| 06 | #6 / 5377453439 | `2264e391625c` | P1 | 未排序 | `null` |
| 07 | #7 / 5377454169 | `cdbb54a13bf2` | P2 | 未排序 | `null` |
| 08 | #8 / 5377454999 | `ae7adbf94689` | P2 | 合格 | `null` |
| 09 | #9 / 5377455939 | `9343f0c8242a` | P2 | 未排序 | `null` |
| 10 | #10 / 5377456737 | `797292ebf859` | P3 | 未排序 | `null` |

## 对照实际 prompt：共同原因与证据边界

| 条件 | 实际发送 prompt 是否说明 | 实际结果 | 分类 |
|---|---|---|---|
| 一个 JSON fence、指定 protocol/kind、字段名 | 是 | 十个均满足 | 未观察到这类输出偏离 |
| priority 为 0–100 整数 | 否，只列出 `priority` 字段名 | 十个均为字符串 | 已证明输出与消费者协议不一致；模板漏写约束是共同缺口 |
| 两个数组有序、唯一 | 否，只列出字段名 | depends 全合格；paths 八个未排序 | 同一模板说明缺口；parser 拒绝符合原协议 |
| primary_capability 必须来自 frozen registry | 否，未给 ID vocabulary | 十个均非 registry ID | 下游 authority vocabulary 未提供；不是本轮 parser 首个拒绝原因 |

能确认的是本批次的确定性拒绝机制与实际 prompt 的遗漏。不能据此证明 prompt 是模型选择字符串的唯一心理原因，也不能声称修好模板后真实模型一定合格。原 parser 在相关历史版本字节相同，未发现本批次由 parser 版本漂移或 parser 缺陷造成的证据。

已有 `1f9be5cb` alignment 包给 initial/fill/edit 共用的 authoring schema 加入 integer bounds、exact fields、排序/唯一要求和 frozen capability vocabulary。这里把它作为后续修复单独引用，绝不把它倒推成旧实验已经使用。严格 parser 不放宽，不修补原 Issue，不重新生成十个 Issue。

## Observer、未执行阶段与正式状态

原 canonical observer 返回 `issue_provider_snapshot_incomplete`，receipt `sha256:889165a16785023c4441d89c9407637d35113ddfe6e43d843bfc7e221323cd8b`，`outcome=incomplete`、`pages_fetched=0`。原因是 canary 配置使用 issue-number selection；它未取得 canonical complete snapshot，**不是 metadata 负向安全测试通过**。

独立 budgeted all-state readback 的 HTTP 200 response 保存十个 open、非 PR records；不能替代上述 canonical snapshot。正式 reconciler 的完整快照前提未满足，本次不补造 receipt、不写入或重算 campaign slot state。若对具备有效完整快照的相同 body 执行原规则，metadata 无效分支应为 `slot_invalid`；这是源码条件说明，不冒充原 run 已持久化的状态。

Adoption dry-run 实际以 `issue_authoring_session_unverified` 拒绝，未到达 metadata adoption validation。因此没有证明 metadata 的预期拒绝端到端成立。Task、Claim、PR、repair、merge、Issue closure、cleanup、fresh audit 均未由该 run 执行。

Missing-slot follow-up 未触发：预期 marker 无缺失且 replacement grant 只剩一个 authoring round。`fill_missing` 服从性、指定 edit 修复、修复价值均未覆盖；不能写成通过。旧 grant 保持 stopped，不补预算。

## Acceptance 映射

| 要求 | 原始证据与结果 | 覆盖判定 |
|---|---|---|
| 具体目标、版本、profile、shadow | 原 grant/intent 指向上述 private disposable target、33d692aa、Profile 13；原冻结 policy 为 shadow | 已取得原始记录，不使用后续 policy 追认 |
| 事前 provider admission | 两次 Oracle 与一次独立 GitHub read 均有原始 reservation；详见下表及 budget-records.json | 三次 harness invocation 预算记录齐备 |
| 调用结算/未知结果对账 | 首次失败按 reserved 上限结算；replacement Oracle 与 GitHub read 有 observed usage；canonical reader 重放两 run 均 open=[] | 已核验持久化账本；不宣称 GPT 内部 tool-call 数受单独硬限额 |
| 实际 authoring / prompt / Issue 原文 | replacement Oracle 完成；prompt hash 对上原扫描记录；HTTP 正文与十个原 Issue JSON 一致 | 已执行；metadata 结果为 0/10，不是合格 batch |
| 完整读回 | 独立 all-state page 1，per_page=20，HTTP 200，十个非 PR records，无 Link header | 独立读回已取得；canonical snapshot 未取得 |
| canonical observer | 实际调用在 issue-number selection 检查失败，pages_fetched=0 | 已执行的配置失败，不是 metadata 拒绝验收 |
| adoption dry-run | 实际 `issue_authoring_session_unverified` | 已执行的上游拒绝；metadata adoption validation 未到达 |
| 补缺/指定 edit | 无缺失 marker；replacement 唯一 authoring round 已用尽，没有授权继续调用 | 未触发/未覆盖，服从率无分母；不计为通过 |
| 数量、分母、重复、未判定 | marker 10/10、重复 0、metadata 0/10、修复价值未判断 | 已记录；未人为凑合格候选 |
| 轮数、时间、人工介入 | 两次 Oracle invocation（首次未提交）；replacement 日志记录 21m58s，一次人工导航回所属 conversation | 已记录；导航不是追加 authoring |
| 后续投入决定 | Owner 原话“继续推进，直到所有BRC完成”，随后明确“后续投入先收窄到 metadata 定因，以及既有安全前置条件的解决” | Owner 继续投入的范围已明确；不是执行端自行决定，也不是 active 授权 |
| active / campaign accepted / exact-SHA | 旧 run stopped、未产生 Task/Claim/PR/merge/closeout；旧 exact-SHA 无可信 receipt | 未执行/未验收；BRC6a 的 Owner 关闭状态保持不变 |

### 原始 provider admission 时间线

所有时间为 2026-09-07 UTC。原记录的完整内容、原文件 hash 与相对路径保存在 [budget-records.json](20260908-brc15a-offline-evidence/budget-records.json)。它只是审阅副本，本次没有向任何原账本写入事件。

| Invocation | 原 run / reservation | 事前 reservation | provider 记录 | 原结算 |
|---|---|---|---|---|
| 首次 Oracle selector 失败 | run `92a3e227…` / `5b4e317b…` | 13:09:37.381 | Oracle `you-are-the-gpt-pro` created 13:09:41.362、started 13:09:41.763、completed 13:10:27.137；promptSubmitted=false | 13:41:32.837 `reconciled_reserved/provider_failure`，消耗 1 turn、1 invocation、1 failure |
| replacement Oracle authoring | run `c42ce4db…` / `cc81de59…` | 17:08:51.707 | Oracle `you-are-the-gpt-pro-2` created 17:08:55.072、started 17:08:55.351、completed 17:30:59.629 | 17:31:00.860 `observed/progress`，1 turn、1 invocation、0 failure |
| 独立 GitHub read | run `c42ce4db…` / `cfe637c2…` | step admission 17:32:38.565；reservation 17:32:38.592 | 同 reservation 的 provider outcome 为 returned，result `b4beacc3…`，receipt `d8718074…` | 17:32:40.130 provider usage 为 `observed/no_progress`；17:32:40.214 controller step completion 为 `progress`，两者不混写 |

GitHub 没有独立 network-start timestamp；reservation 与 same-reservation outcome 的绑定及原脚本 `/tmp/brc15a-independent-readback.ts` 的 reserve-before-runner 调用顺序支持事前 admission，不能再声称另有未取得的 network timing receipt。原 HTTP SHA256 `9a75bf04f14cd87cf706ca92d32193ba4f22bc8387b8456518e46166d9953d7e`，正文解析与已保存的原 Issue JSON 完全相同。

canonical `readAutomationBudgetStatus` / `readCampaignBudgetLedger` 只读重放原数据：首 run provider_calls=1、controller_steps=0；replacement provider_calls=2、controller_steps=2；两者 open reservations 均为空。首 run 后来补的是**明确的未知结果结算**，其 reservation 原本已存在，并非事后补造事前 admission。

### 完成判定与限制

BRC15a 作为允许负面结果的观察任务收口：记录了真实 authoring、实际失败的 observer/adoption、独立读回、未覆盖项及 Owner 的限范围继续投入决定。**实验链路没有验收通过，canonical batch 不完整，active 没有获准或启动。** 不用后来的 alignment 代码追认旧调用，不把未触发补缺或被上游阻断的阶段记为通过。

本次能绑定原始 prompt bytes、Issue bodies、parser blob 和原账本；原 receipt 没有记录执行时 CLI/source commit，worktree reflog 也不能补成 executed-binary provenance。这项限制保留。BRC6a 依 Owner 实测保持关闭，不追加探针。

## 本次验证与后续修复边界

旧正式 parser 与已合入整合分支的 alignment parser 对十个**未改动** body 都返回 null。当前 alignment 的正式 parser/authoring 两个 focused suite 为 28/28 pass，包含整数 priority 拒绝与 initial/fill/edit schema 注入验证；这些是后续实现证据，绝不写成旧真实实验通过。此研究不新增 model run、Issue 修改或 parser 宽松兼容。


文档收口的六项 repository-integrity checks 与 `git diff --check` 全部通过。main 的七项既存 WIP hash 未变，十个正文的审阅副本与原始 JSON 字符串完全一致。本分支没有 production source 变更。

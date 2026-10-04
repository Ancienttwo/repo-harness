> Historical snapshot preserved on 2026-09-10 from `2cccfe43d498fb42c5cfff34ed647bf8a10f9783`. Status and observations below describe that original investigation; they grant no current execution authority. Consult [20260907-brc6a-admission.md](20260907-brc6a-admission.md) for the later implementation boundary and [consolidation provenance](20260910-inactive-branch-consolidation.md) for disposition.

# BRC6a：可信版本读回的证据边界与最小验证方案

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

> Status: Research complete; producer capability unproven; BRC6a remains pending.
> Subject: repo-harness `33c5012e1185a695fdaf54a7bb84fc613cfb653b`.
> Scope: source/docs investigation, existing focused tests and disposable Git experiments. No GPT invocation, Issue mutation, runtime change, new receipt schema or activation.

## 结论

当前没有已证实可直接接入的 exact-revision producer。`requireCampaignActiveAdmission()` 的拒绝应保留。BRC10 正在修复 authoring metadata、模型验证投影与完整快照配置；这些修复解决可采纳性，不解决本报告的版本来源证明。

下一刀应是**生产者能力探针**，先证明现有 Connector 能输出什么，再决定 verifier 实现。优先尝试原始 Git 对象读回，而非继续增加内容抽样、先建新服务或先定义无人能生产的 receipt。探针需要另行批准的一次只读 provider 调用；本轮没有执行它。其成功也不得自动打开 active admission。

## P1 — 当前权威和可观察事实

| 层次 | 当前来源 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 本地目标 | `issue-batch-adoption.ts#challengeAt` 在 `intent.base_main_sha` 上调用 Git | 本地期望来自指定 commit | Connector 读取的 revision |
| 模型与会话 | Oracle `BrowserRunResult` 的 modelSelection、conversationId、promptSubmitted；repo-harness browser session | 对应宿主观察，取决于正确投影和绑定 | GitHub 实际读取的对象或整个审计范围 |
| 内容回答 | `connector-challenge.ts#verifyConnectorChallenge` | 三项答案匹配、响应 digest、echo SHA 匹配 | SHA 是观察所得而非 prompt 回显；答案来自哪个工具 |
| 原始传输结果 | `oracle-provider.ts#OracleProviderResult` 与 Oracle `src/browser/types.ts#BrowserRunResult` | 答案、artifact、会话和模型等当前暴露字段 | 当前类型中没有 typed Connector call→resolved commit→returned bytes 的完整读回记录 |
| 活动准入 | `campaign-revision-admission.ts` | 没有可信 producer 时拒绝新 active 工作 | 不是已经交付 producer 的证明 |

Oracle 检查对象为本机隔离候选 `26e12021f9593d7ac4ede7b252099653f1b4aca8`。未读取浏览器 cookie、未控制 BRC10 的标签页、未将其运行中对话当本轮证据。

`oracle-provider.ts#stageScanBoundOracleFiles` 已校验扫描后 staging bytes，但 campaign authoring 的 `browserInput` 当前没有输入文件。这只能支持未来 snapshot delivery 的部分本地链；不能把本地 staging digest 说成模型已收到或已经读完文件。

## P2 — 反例与可证性

1. 现有单测 `unchanged old answers with a new echoed SHA prove content only` 已证明：更换 expected SHA，复用旧答案并回显新 SHA，仍能得到 `challenge_verified`。它明确不产生 `observed_main_sha`。
2. 本轮创建 disposable Git repo，两个不同 commit 指向同一个 tree。即使比对整个工作树内容，也不能区分这两个 commit。metadata-only commit、revert、未改采样路径均不能靠扩大样本彻底排除。
3. 对原始 commit bytes 使用 Git framing `commit <byte-length>\0<bytes>` 重算 object ID：旧对象匹配旧 SHA，但不匹配新 SHA；新对象匹配新 SHA。**这说明对象验证可以修补内容等价无法识别 commit 的缺陷，不说明现有 Connector 可以生产这些 bytes。**
4. 只返回 commit 对象仍不够：必须从其 tree 逐层绑定 path、mode、blob，再绑定返回的文件 bytes。拿到新 commit 元数据后读取旧的不同文件 bytes，应被链验证拒绝。旧文件 bytes 若在新 commit 中确实相同，则并非内容陈旧错误，但读取渠道仍未被证明。
5. 模型是否“认真阅读并理解所有代码”不是 Git、签名或 tool log 能机械证明的属性。验收必须明确测量输入来源、交付和覆盖范围，不能把可观察输入证据升级成理解保证。当前 exact-SHA/Connector 要求不在本轮改写。

本轮对象实验结果：

- old commit: `bc40850ac863b690209d61033065cd87057d74ef`
- new commit: `8dd6f56c51f8ef49cb0ac69cfd6620648a46f599`
- shared tree: `bfa746742dd9c99f309f8a2ebcbb09a7154d68b4`
- different commits / same content / old raw object rejected for new commit / new raw object accepted：全部断言通过。

可复现方法：在临时目录 `git init`，用 `hash-object -w --stdin` 写一个 blob，再用 `mktree` 建 tree；以该 tree 调两次 `commit-tree`，第二次以第一次为 parent。用 `cat-file commit <sha>` 取得原始 bytes（不可 trim 或 Unicode 归一化），按上述 framing 计算当前仓库对象格式的 digest。固定 SHA 是本次实验身份，不要求重跑因时间戳变化仍生成相同 SHA。

## P3 — 方案比较与决定

| 方向 | 价值 | 未闭环点 / 决定 |
| --- | --- | --- |
| 多抽文件、diff 选档、fresh chat、SHA echo | 可提高部分错误检出率 | same-tree different-commit 反例仍存在；不作为 producer |
| 原始 commit→tree→blob 对象读回 | 验证内容与 exact commit 的对象链；可经现有回答通道传输，理论上无需新签名服务 | Connector 是否能取得并无损输出原始对象未知；不能独立证明 Connector 调用来源。优先能力探针，暂不建设产品 verifier |
| Oracle 捕获 provider-origin 工具调用记录 | 可把当前会话的 request/ref、resolved commit、返回 bytes 关联起来 | 当前暴露类型不提供该链；工具名截图、模型文本或调用参数中的 SHA 不够。需要真实 request/result 及会话绑定样本，不能靠推测解析 UI 文本 |
| 本地 pinned snapshot 经已有 Oracle 文件通道交付 | Git 来源和扫描后 staging 有既存基础 | 改变“通过 Connector 读 exact main”的读取方式；还缺会话内交付确认、完整性/截断及覆盖证明。必须经产品合同变更，不能静默替代 |
| Responses API + 可审计 read tool | 官方有包含 arguments/output 的 `mcp_call` 记录，可以观察工具结果进入模型上下文 | 是不同传输、模型/成本/权限与 Issue 写入口边界，不等同当前 ChatGPT Pro/Oracle。需要独立授权和设计，不作自动 fallback |

信任模型必须写清：本地 Git snapshot 和受管 host 是当前可信计算基；模型文本不可信。如果要求抵抗控制 host 的恶意操作者，仅添加 host 自签 receipt 没有增益，必须另有认证来源。Git 对象 digest 验证使用仓库实际 object format；不把 commit 签名状态当成 provider 阅读证明。

十倍规模首先受限于原始对象/文件传输量和模型上下文。不能把一个文件的 Merkle proof 推广为整个 audit scope；不能以截断后的成功回答声称覆盖完整。审计范围内有 LFS、submodule、binary 或超限文件时，须明确受支持的交付规则或保持 incomplete，不追踪本地 worktree 路径悄悄补数据。

## 最小下一刀：一次只读生产者能力探针

这是后续提案，不是本轮执行授权；不新增 service、MCP tool、持久化 schema 或运行开关。

1. 用获准的 disposable repo 固定两份 same-tree/different-commit 和一份 changed-blob fixture。锁定新会话、目标 repo、expected SHA、预算和只读权限。prompt 只给目标，不附所需原始对象或预期答案；若禁止预先写入 fixture，先复用已有可验证对象对。
2. 要求现有 Connector 返回原始 commit bytes 及一个指定文件的完整 tree/blob 路径证据，以可无损编码传输；缺字段、截断、未知 object format 或工具不支持均记录 unavailable，不让模型补造 JSON metadata。
3. 由本地 Git 验证 bytes 和引用链；分别记录 source-object verification 与工具调用/会话 provenance。并行保留宿主实际暴露的调用记录；没有 provider-origin trace 时如实记录缺口。
4. 若只能证明对象链，提交 Owner 决定是否将“版本绑定内容已取得”作为明确的可观察验收边界；**当前 BRC6a 不自动完成，原 Connector/exact-SHA 要求不降标**。若现有传输不产对象且不产调用证据，就停止此路线，选择合同修订或新传输，不增加抽样轮数来冒充证明。
5. 仅在真实 producer 及语义决策冻结后实施：owning evidence type/validator、persisted intent/session/result 绑定、active admission 消费者、BRC14 fresh-session/final-main/coverage 消费者。优先复用现有 intent/store 和预算；共享 authoring/adoption 文件先与 BRC10 协调。旧 challenge 保持内容观察含义，不能在旧记录上补标新证据。

### 未来实现必须拒绝的反例

- 新 expected SHA 配旧 commit raw bytes；wrong repository、wrong path、changed mode、缺 tree/blob、bytes 被裁剪或重编码。
- 正确新 commit 对象拼接错误旧 blob；仅正确 commit header 而覆盖范围缺文件。
- 正确对象来自另一会话、另一 intent、历史 receipt replay；audit 复用 authoring session。
- prompt 内 echo SHA、模型自述 Connector 调用、通知 receipt、GitHub commit signature 或本地 fetch 被当作远端阅读证据。
- provider timeout/unknown、工具 response 分页或 artifact 不完整、final main 在验收前移动。

正向验收也必须包含真实支持的 producer → durable raw evidence → verifier → consumer，不以 fake receipt unit test 代替。新外部调用须走现有 reserve/settle/reconciliation；producer 失败不影响历史 settlement/cleanup 权限。

## 本轮验证与完成边界

现有 `tests/unit/connector-challenge.test.ts` 与 `tests/effects/brc6a-admission.test.ts` 在独立 worktree 执行：11 pass、0 fail、26 assertions。未修改源码和测试，没有 full-suite、GPT、Issue 或授权写入。报告是可复核方案，BRC6a/BRC14/BRC15 状态不变。

## 官方资料核对（2026-09-08）

- [OpenAI GitHub app](https://help.openai.com/en/articles/11145903-connecting-github-t-chatgpt-deep-research)：当前说明为按需读取，不建立 ChatGPT 同步索引；GitHub 自身搜索索引是另一回事。因此历史“stale Connector/index”只保留为旧探针及陈旧读取威胁，不宣称当前产品必有 Connector index。本文未发现该页承诺可导出的 exact-commit 工具回执；文档未承诺不等于技术上绝不可能。该页描述的 GitHub app 也不能用来否定本机 canary 已观察到的具体写入通道，两者产品表面未证明相同。
- [GitHub Git commits](https://docs.github.com/en/rest/git/commits)：commit 绑定 tree，签名 verification 是 commit 签名校验。JSON 响应、字段 `sha` 或签名布尔值不能直接当 raw object 字节；不能假定 API 总提供可无损重建的 raw object。
- [OpenAI MCP/Connectors API](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)：Responses 的 `mcp_call` 包含调用参数和工具结果，官方说明结果进入模型 context。这支持新传输的可观察性方向，不证明当前 Oracle browser 已有同等证据，也不证明本仓库的目标模型和 app 权限已兼容。


## 2026-09-08：获批真实只读探针结果

用户批准一次只读能力探针后，首次调用错误地沿用旧 `--model GPT-5.5 Pro --thinking pro` 参数。用户明确纠正为 Latest Pro/GPT6 Pro，随后确定偏好为“用户配置一次，之后使用默认”，不由 agent 自动选模型。旧调用的 Oracle 元数据报 GPT-5.5，界面却显示 6 Pro；不能据此确定其实际模型身份。已在自己绑定的 conversation 点击 Stop answering，并终止、确认退出该调用的自有 controller/Chrome。旧结果不纳入验收；其 Oracle 原生 metadata 残留 running，不能据此重派或当仍有活进程，原记录未伪改为成功。

替换调用不传 `--model` 或 `--thinking`，Oracle strategy 为 `current`，没有进行模型切换。只读 DOM 观察到 composer 显示 **6 Pro**；Oracle 的 requestedModel/default log 仍带 GPT-5.5 字样且 canonical `model.verified=false`。这是显示观察与旧默认元数据不一致，不能补写成 provider-verified 模型。此偏好已通知 BRC10，后续 campaign 的默认配置与实际模型验证需由其 owning boundary 处理，不在本探针绕过原准入要求。

### 输入和边界

- 目标复用已授权的私有 canary repository，固定 `33d692aaa0ab593df0c160082b18fdac02c82e9c` 和 `README.md`，未新建/推送 fixture。
- Prompt 仅给目标身份、返回格式与只读约束；没有提供 commit/tree/blob bytes 或预期答案。要求无法取得原始对象即停止，不从 JSON metadata 合成。
- 独立诊断最多一次替换调用、600 秒、无补问；没有复用已停止 campaign 的预算或创建新的 campaign grant。累计实际 Oracle wrapper 调用 **2 次**，含作废的首次调用；不能把纠错成本隐去。模型内部工具调用次数没有独立可验证计量。
- 替换会话 `chgpt_20260908_020457_brc6a-default-model-raw-object-probe`；conversation `6a9efc70-b370-83ea-84cc-d97b3c8c95f2`；约 1 分 38 秒后正常返回。启动时要求 exact prompt Gitleaks scan。

### 观察和判定

最终 JSON 为 `status=unavailable`；commit、root tree、README blob 三个 base64 字段全部为 null。本地严格 JSON 读取与三字段空值断言通过，故本次**没有可校验的 Git 对象产物**。

回答称检查了 48 个 GitHub 工具 schema，未发现无损原始 commit 输出方法，并称未读取仓库内容。这些是模型自述；本轮没有 provider-origin tool trace 验证其调用数、工具全集或无内容读取，不能把它们升级为独立能力清单。结果证明本次路径未产出，不证明所有 Connector、API 或未来版本永久不支持。

独立预期对象在本地由 Git 读出并验证：commit 217 bytes，root tree 1307 bytes，README blob 27700 bytes；这些 bytes 未进入 prompt。因远端三个对象均缺失，没有执行一个冒充成功的对象链校验。替换调用的自有 controller 与 Chrome PID 在返回后均已退出。

- Response SHA-256: `9fbae2749fa62c5ad2d18c5b41ed99f2cf027aa343e3b04dfdfe9516ad80ea58`。
- 原始响应、intent、UI model observation 和本地 validation：本 worktree 的 `.ai/harness/evidence/brc6a-producer-probe-default/`；完整 browser session 位于 `.ai/harness/chatgpt/sessions/<session-id>/`。这两处是 ignored evidence，不是新权威 store。
- 结论：**BRC6a pending，active admission 不变**。不再自动重跑同类模型探针。若继续，应先选择可独立观察 tool response 的传输或经 Owner 明确修改读取方式的合同；不先实现没有已证实 producer 的新 receipt/verifier。

## 2026-09-08：显式 GitHub 激活后的纠正探针

用户指出须从 composer「+」选择 GitHub，或用 `@github` 激活。此前默认模型探针没有记录 app 显式激活，且 prompt 要求原始 commit 对象不可得即提前停止，因此不能用它判断已激活 Connector 的文件读取能力。上节“先选择其他传输”的建议暂缓；先修正调用入口。

在独立的 Profile 13 临时副本打开新会话，通过「+」搜索 GitHub 并选择。提交前 DOM 已确认 `data-inline-selection-pill`、`data-keyword="GitHub"`、`data-id="plugin:connector_76869538009648d5b282a4bb21c3d157"`，不是普通文本提及。界面保持默认 **6 Pro**，未选择模型或 thinking。当前 Oracle 候选没有 app 选择参数，所以本次用其既有 profile-copy/Chrome-launch helper 启动，再通过 CDP 操作 composer；不是 Oracle 已支持自动 app 激活的验收。

Prompt 经 Gitleaks 扫描通过，只给同一 canary、固定 commit 和 README 路径，要求真实读取首 8 行、末 4 行及工具返回的标识；未给预期内容或 blob SHA。没有要求原始对象，不因该额外条件提前停止。一次发送、没有补问；这是用户纠正后新增的第三次实际模型请求，前两次成本仍保留。会话 `6a9f0045-c728-83ea-a489-27796265282a`，页面显示 Worked for 1m 59s 后完成。

结果：README 首 8 行、末 4 行与本地固定 commit 的 `git show <sha>:README.md` 相符（逐行 LF 拼接比较，不把 DOM 末尾换行当原始文件字节证据）；回答中的 blob SHA `4779ce156e273311fa013c0bd7f71b9c9048129d` 与本地 Git 一致。页面显示 README 读取进度及 Talked to App。展开后实际可见 `api_tool` / `Find in resource` 请求，参数是 `uri: /response/turn0` 与 `query: ## License`。本次已验证激活后的实际内容读回，不能再笼统报告 Connector 不工作。

回答称 `GitHub.fetch_file` 返回 content、encoding、sha、display_url、display_title，且没有单独 resolved-commit 字段。该字段清单和 fetch_file 细节目前仍来自回答；当前展开的 UI 未给出完整 GitHub 原始 response，不能升级为 provider-origin receipt。blob 一致及 URL 中带 requested SHA 也不独立解决 same-tree/different-commit 反例。因此 **Connector 内容读回通过；BRC6a exact-revision admission 仍 pending**。下一步在已工作的 app 激活入口上保留实际 request/result 证据，先确认是否足够满足现有合同，不先建设 raw-object verifier 或更换传输。

本次 ignored evidence 位于 `.ai/harness/evidence/brc6a-github-activated/`，包含扫描过的 prompt、提交前 activation、最终结果、可见工具请求和本地 validation。没有改生产源码、放宽 admission 或提交 GitHub 写请求。


## 2026-09-08：本会话原生 GitHub Connector 原始返回补证

父会话的 callable GitHub Connector 已可用。一次直接、只读的 `github_fetch_file` 请求读取 `Ancienttwo/repo-harness` 的 `README.md`，显式 `ref=33c5012e1185a695fdaf54a7bb84fc613cfb653b`、`start_line=1`、`end_line=8`。这不是 canary 仓库，也不是上述 ChatGPT conversation 的工具调用，没有新增 GPT 请求或 GitHub 写入。

这次直接观察的 structuredContent 字段为 `content`、`encoding`、`sha`、`display_url`、`display_title`；`encoding=utf-8`，`sha=4779ce156e273311fa013c0bd7f71b9c9048129d`，`display_url=https://github.com/Ancienttwo/repo-harness/blob/33c5012e1185a695fdaf54a7bb84fc613cfb653b/README.md`，`display_title=README.md`，`isError=false`。没有单独 `resolved_commit` 字段。这是该直接请求实际收到的字段，不再依赖模型对 schema 的自述；不能据此推断所有 GitHub 工具的字段全集。

直接 Connector 调用的已知 request ref 与 provider 返回现在可以一起观察，但它属于本会话这一独立调用。它没有补出 `6a9f0045-c728-83ea-a489-27796265282a` 的原始 response，也没有证明 Oracle authoring/fresh-audit 实际消费了同一调用。保持 BRC6a pending；后续接线应取得目标 Oracle 会话自身的 request/result provenance，再判定其固定 ref 合同是否满足 exact-version 要求，不把缺少某个字段名本身当作永久不可能的证明。

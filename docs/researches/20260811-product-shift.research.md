# Product Shift：Evidence-backed Delivery 与 Research Contribution

> **Status**: Draft — direction synthesized; implementation unapproved
> **Decision date**: 2026-08-11
> **Product thesis**: 帮助 1–3 人团队获得成熟工程组织的产品理解与交付可信度
> **Core wedge**: Evidence-backed User Story + Intent-aware Review
> **Research flywheel**: explicit opt-in `private` / `public` work-package contributions
> **Source discussion**: [ChatGPT session](https://chatgpt.com/c/6a7aa709-abfc-83ee-a713-0d634a1440ec)

## Thesis

代码生成正在快速商品化。对使用 AI 开发的 1–3 人团队而言，更稀缺的能力
不是继续提高代码产量，而是：

1. 判断 Agent 是否理解了真正要解决的用户问题；
2. 在代码生成速度超过人工阅读速度后，仍能可信地决定这次修改是否应该合并。

`repo-harness` 应把成熟工程组织的产品理解与交付纪律压缩成小团队用得起的
工作流：从现实证据出发，形成可被反驳且经 Owner 确认的 User Story，再让
实现、检查和 review 同时对产品意图、架构约束与高风险路径负责。

这不是让 `repo-harness` 替开发者经营业务，也不是要求它接入下游产品的
CRM、埋点、收入、support 或用户访谈平台。下游产品仍由开发者建设和商业化；
`repo-harness` 提供的是提高 AI 开发转换保真度的 developer workflow。

为了让这套能力不只依赖设计者直觉，`repo-harness` 可以增加一个独立、可选的
Research Contribution Channel：用户在明确知情和最终预览后，自愿把一个真实
work package 的计划、人工修正、实现、review 与反馈贡献为 `private` 或
`public` 研究样本。

核心工作流不依赖数据库；研究数据库也不参与目标项目的 authority、执行 gate
或状态解析。

## Confidence

- **Confidence level**: medium
- **Why not certain**: 当前已有真实痛点表达和失败机制证据，但还没有一条完整、
  经 Owner 确认并可用于分析的 `evidence → plan → implementation → review →
  feedback` 贡献样本，也没有验证开发者是否愿意承担贡献前的预览和脱敏成本。

## 市场判断与目标用户

用户提供的 V2EX 吐槽揭示了一个具体压力点：Agent 生成速度可以很快，但人工
理解、review 和纠错的吞吐没有同步增长。对 side project，结果可用往往足够；
对生产项目，测试样本上的正确不等于真实世界中的可信交付。异常路径、并发、
性能、安全、长期维护和审计中的任何盲区都可能成为事故来源。

用户提供的投资人观点进一步给出一个方向性假设 `[UNVERIFIED]`：当代码与基础
研发能力被 LLM 大幅普及，单纯的软件表现层和机制更难形成壁垒，真实世界的
产品判断与可靠交付能力更稀缺；与此同时，1–3 人团队可能服务大量高价值 niche。

`repo-harness` 不需要因此进入重产业交付。更适合它的机会是：

> 让小团队能够用 Agent 建设生产软件，同时保留过去只有成熟工程组织才具备的
> 产品意图确认、架构约束、风险 review 和可回溯交付能力。

### Primary users

- 使用 Claude、Codex 或其他 Agent 开发真实产品的独立开发者；
- 无法配置完整产品、架构、QA 和 security 团队的 1–3 人团队；
- 需要 review 大量 Agent-authored changes 的 maintainer；
- 对错误成本、安全、资金、权限、数据或长期维护有实际责任的生产项目团队。

### Job to be done

> 当我让 Agent 修改生产项目时，我希望它先证明自己理解了我要解决的用户问题，
> 并在完成后优先暴露与产品意图、架构约束和高风险路径冲突的改动，让我不必逐行
> 阅读全部生成代码，也能判断这次修改是否值得合并。

## 产品模型：两个闭环、一条边界

### 闭环 A：可信交付

```text
用户原话 / issue / 吐槽 / 访谈
        ↓
Agent 区分观察、推断与未知
        ↓
形成可被反驳的 User Story
        ↓
Owner 确认产品意图与 non-goal
        ↓
现有 PRD → Plan → Contract → Code
        ↓
Intent-aware Review：
产品意图漂移 + 架构腐化 + 高风险路径
```

这个闭环直接服务每个下游项目，并保持 file-backed、local-first。没有 Research
Contribution Channel 时，它仍应完整可用。

显式 tradeoff：repo-harness 不接下游产品的 analytics、support 或 incident
数据，因此 `Story ⊨ Reality` 在单个项目内只能靠 Owner 的人工反馈闭环，
工具本体不承担这个证明责任。后续任何「加个 analytics connector 很容易」
的提议都必须先显式推翻这条边界，默认答案为否。

### 闭环 B：研究学习

```text
真实 work package 完成
        ↓
生成本地 contribution preview
        ↓
用户删减、脱敏并最终确认
        ↓
private research contribution
        ↓ 可选、再次明确授权
public redacted projection
        ↓
发现重复误读、返工来源与有效 review 约束
        ↓
改进下一版 repo-harness workflow
```

这个闭环服务 `repo-harness` 的产品研究。它收集的是开发转换过程，不接管下游
产品的客户数据与商业 authority。

### 不可跨越的边界

- 目标项目的 repo 文件是该项目的 source of truth；
- Research database 只保存经授权的时间点快照，不是 authoring surface；
- 上传状态不得影响 `state next`、plan approval、checks、review 或 closeout；
- 无网络、未登录或拒绝贡献时，核心功能不得降级；
- hooks 和 Agent 不得静默上传；
- research data 不得被反向解释成目标项目的新产品事实。

## Evidence-backed User Story

Agent 不可能仅靠“更聪明地思考”保证理解正确。PRD 之前需要的是一次轻量
证据审问，而不是另一套语义 schema 或 deterministic validator。

对每段原始证据，Agent 在现有 PRD 或对话中内联区分：

- **观察事实**：证据明确发生或明确表达了什么；
- **用户成本**：行为给用户造成了什么返工、风险或运营成本；
- **现有替代方案**：用户现在如何补救或绕过；
- **产品假设**：我们认为哪种能力可能改善这一事件；
- **关键未知**：什么答案会实质改变 scope、actor、规则、安全或验收；
- **反证问题**：什么事实会证明当前 User Story 抓错了问题。

以用户提供的 V2EX 吐槽为例：

- **观察事实**：有人认为使用 grill-with-docs 后代码变成了屎山；
- **用户成本**：生成速度超过人工理解和 review 速度；
- **现有替代方案**：人工反复反馈、补测试、补文档；
- **产品假设**：开发者愿意增加少量前后约束，换取生产级可信度；
- **关键未知**：问题主要来自生成质量、review 吞吐、产品意图误读，还是过多
  ceremony；
- **反证问题**：如果 review 足够快，这些代码是否仍会持续腐化？

由此形成的 User Story 仍然只是假设：

> 当我使用 Agent 修改生产项目时，我希望 review 能优先指出与产品意图、架构
> 约束和高风险路径冲突的改动，让我不必逐行阅读所有生成代码，也能判断这次
> 修改是否值得合并。

### 最小交互规则

1. 接受用户提供的原始证据或证据引用；
2. 在当前 PRD 中内联标出观察、推断与未知，不创建平行 authority；
3. 只提出会实质改变产品范围的 1–3 个问题；
4. Owner 修改、确认或否定 User Story；
5. 冻结 approved intent、non-goals 和 falsifier 后，才进入现有执行链。

Agent 不得把自己的推断标记成用户事实，也不得用新增未请求功能“解决”未知。

### 提问顺序

1–3 个反证问题从下面的优先序高端选取，锚定最近一次真实事件，按信息增益
递减排列：

1. 最近一次遇到这个问题是什么时候，当时具体发生了什么；
2. 什么触发了当时的处理动作；
3. 当时逐步做了什么，用了哪些工具；
4. 哪一步最慢、最危险或最烦躁；
5. 现在怎么绕过，为什么仍在用这个绕法；
6. 多久发生一次，一次损失多少时间、金钱或风险敞口；
7. 谁实际使用、谁承担风险、谁付钱、谁审批；
8. 出现什么证据会证明这个功能根本不该做。

两条硬规则：

- 能从代码、工单、运行日志、分析数据或历史事故中查到的，不得反问用户；
- 「分页还是无限滚动」这类 solution question 不属于证据审问，留给
  design brief 阶段。

## Intent-aware Review

现有 BDD、checks 和 architecture discipline 主要回答：

```text
Implementation ⊨ Story
```

它们不能单独证明：

```text
Story ⊨ Reality
```

因此 review 需要同时回答三类问题：

1. **Intent drift**：实现是否改变了 Owner 已批准的用户故事、non-goal、默认
   行为、failure semantics 或 acceptance scenario？
2. **Architecture decay**：实现是否制造重复 authority、跨越 ownership 边界、
   引入 fallback 或把局部语义扩散到不相关模块？
3. **Risk paths**：测试是否遗漏与当前任务相关的权限、数据损失、异常、并发、
   安全、性能或回滚路径？

review 的目标不是对所有代码做无限审计，而是根据 approved intent 和实际
风险面缩小人工阅读范围。测试通过仍是必要条件，但不是“值得合并”的充分条件。

### Intent Diff

review 的第一呈现面是三栏对照：

```text
Approved intent:      Owner 冻结的行为、non-goals 与 failure semantics
Implemented behavior: 实现实际做了什么
Unapproved extras:    实现自行新增的行为、fallback 或默认值
```

第三栏是 EXECUTION_BOUNDARY anti-extras 条款在 review 侧的投影：未请求的
行为默认按缺陷处理。Intent Diff 只是 rendering：它缩小人工阅读范围，不
自动裁决合并，也不构成新的 hard gate。

review 所依据的 approved intent 从 trusted base revision 的仓库文件读取
（approved commit 里的 PRD 与 contract 就是冻结意图）；被审变更自身不得
同时修改 review 所依据的规则或意图文本。

## Research Contribution Channel

### 贡献时机

不应在每份文档后反复询问。一次 work package 只经过两个明确边界：

1. **计划形成后登记意愿**：当 PRD 或 work-package Plan 产出时，询问是否把
   本工作包登记为 research contribution；此时只记录本地 consent，不上传
   尚未产生的 implementation 或 feedback。
2. **工作包结束时最终提交**：实现与 review 完成后，生成完整 preview；用户
   可以删除内容、脱敏、排除 code diff，并再次确认后才上传。

非交互环境只能留下待确认提示或显式命令，不得把缺少回答解释为同意。

### 用户选择

用户表面上有三个选择，贡献系统内部只有两种数据层级：

1. **不贡献**：不创建远端记录；
2. **Private contribution**：上传供授权的 repo-harness 研究使用；
3. **Public contribution**：在 private 原始记录基础上，发布用户确认过的脱敏
   projection。

建议提示语：

> 是否贡献这个工作包，帮助 repo-harness 改进 Agent 的产品理解与代码 review？
>
> - Private：仅供授权的 repo-harness 研究使用；
> - Public：经你预览和脱敏后公开为研究样本；
> - 不贡献：所有资料保留在本地。
>
> 代码 diff 默认不包含，可单独授权；上传前可以查看和删除准确内容。

### Contribution bundle

一条有价值的样本必须关联同一个 work package 的变化，而不是收集三个孤立的
最终文档：

- 原始用户证据或明确的证据引用，可排除；
- Agent 初始生成的 User Story、PRD 或 Plan；
- Owner 的修改、否定和 material correction；
- 最终 approved intent、non-goals 与 falsifier；
- 对应 contract 和 implementation diff，代码默认排除、单独授权；
- checks 与 review 发现；
- Owner 最终反馈：哪里理解错、哪里返工、是否解决问题；
- 必要的工具版本和时间信息，不包含机器凭证或无关环境数据。

最重要的数据不是最终文档，而是 Agent 草稿到 Owner-approved version 的语义
变化，以及这些变化是否在实现和 review 中保持。

### Private layer

Private contribution：

- 不公开展示或进入公开 benchmark；
- 不作为可识别案例引用；
- 只允许披露范围内的研究用途；
- 提供 deletion receipt，允许贡献者删除；
- retention、操作者权限、加密和 incident response 必须在上传前说明；
- “允许内部研究”不自动等于“允许第三方模型处理或模型训练”。

第三方模型处理、训练用途和跨境存储是独立的高影响 consent 项，当前均为
`[UNKNOWN]`，不得从 `private` 自动推导授权。

### Public layer

Public 不是另一份可独立编辑的原始数据。它是从 private contribution 生成、
经人工选择与脱敏、由用户最终批准的 publication artifact：

```text
Private contribution
├── Evidence
├── Plan revisions
├── Implementation
├── Review
└── Feedback
        │
        └── select + redact + explicit approval
                    ↓
             Public projection
```

Public publication 必须额外确认：

- 完整发布预览；
- 署名或匿名；
- 明确的公开许可证 `[UNKNOWN]`；
- 哪些代码和文本允许发布；
- 公开后可能已被第三方复制，无法保证完全撤回。

Private 永远不能被系统自动升级成 Public。仓库本身是 open source，也不等于
这个 work package 自动获得 Public contribution 授权。

## P1：架构边界

现有 authority chain 保持不变：

```text
docs/spec.md
→ plans/prds/*.prd.md
→ plans/sprints / plans/plan-*.md
→ tasks/contracts/*.contract.md
→ implementation
→ checks / tasks/reviews
```

- `docs/spec.md` 持有稳定产品意图与安全边界；
- PRD 持有上层产品方向、non-goals 与 acceptance scenarios；
- Contract 缩小执行范围，不创造新的产品语义；
- BDD、checks 和 review 是证据与投影，不是竞争 authority；
- Research contribution 是用户批准的历史快照，不回写项目 authority。

当前 [`docs/spec.md`](../spec.md) 明确把 hosted product runtime 和 database
service 列为 non-goal。即使 research database 不进入核心工作流，建设远端
ingestion/storage 仍与这条边界存在产品层冲突。实现前必须由 human Owner
明确批准一种干净边界：修改该 non-goal，使其只禁止 hosted workflow authority，
或把 research corpus 作为独立、可选服务定义。不得通过改名规避冲突。

## P2：真实路径

### 当前交付路径

```text
downstream evidence
→ repo-harness-product / PRD conversation
→ Owner-approved PRD
→ Plan / Contract
→ Agent implementation
→ checks / Human Review Card
→ Owner acceptance
```

当前压力点在路径两端：上游可能把现实证据误读成错误 User Story；下游 review
可能证明实现符合错误故事，或只证明测试样本正确，却没有聚焦真实风险。

### 目标贡献路径

```text
approved PRD or Plan produced
→ ask once to enroll this work package locally
→ normal implementation and review; no remote dependency
→ assemble local preview at closeout
→ user removes/redacts/selects code diff
→ explicit final consent
→ upload immutable private snapshot
→ optional separate approval creates public projection
```

任一授权、预览、网络、认证或上传步骤失败，都只终止 contribution；不得改变
原 work package 的交付结果。

## P3：设计决策

选择 **local-first core + optional research flywheel**，不选择 hosted-first 产品，
也不继续被动等待。

理由：

1. Evidence-backed User Story 与 Intent-aware Review 直接解决已观察到的开发者
   痛点，不要求先建设商业闭环；
2. 本地工作流可以立即 dogfood，并保持当前 source-of-truth 不变；
3. Research Contribution Channel 提供持续学习所需的真实轨迹，而不是依赖
   synthetic benchmark 或最终文档猜测；
4. Private/Public 分层允许闭源项目贡献高保真样本，也允许社区建立可复现案例；
5. 数据库失效时核心产品无损，避免把网络服务变成新的 workflow authority。

在 10× 使用量下，最先失败的不是 Markdown 表达力，而是 consent fatigue、
敏感信息泄露、低质量孤立样本和 researcher review 吞吐。因此第一版必须按
work package 询问一次、默认不含代码，并优先保证 contribution 的关联性与
可解释性，而不是追求上传数量。

## 已有反证及其正确含义

[`evals/bdd2/reports/phase-e3-gate.md`](../../evals/bdd2/reports/phase-e3-gate.md)
否定了 inline Shape、Browser Evidence Adapter 和 ImageGen Prototype Adapter；
inline Shape 虽减少部分 expansion/omission，却引入四个 paired P0/P1
protected-concern regressions。

[`20260714-bdd3-ea1-typed-evidence-authority-outcome.md`](20260714-bdd3-ea1-typed-evidence-authority-outcome.md)
测试 typed evidence packet + deterministic validator，结果为 `unsafe_reject / unsupported`，
并出现 authority violation 与新的 P0/P1 omission。

[`20260714-bdd3-ps1-protected-shape-outcome.md`](20260714-bdd3-ps1-protected-shape-outcome.md)
测试 per-concern ledger、structural HOLD 和 validator，同样为
`unsafe_reject / unsupported`；control arm 已经安全，新增 ledger 未证明增量价值。

这些结果否定的是把产品理解压缩成新 schema、ledger、validator 或 hard gate
的具体机制，不是否定 Evidence-backed User Story、Intent-aware Review 或用户
自愿贡献真实开发轨迹的方向。

Contribution bundle 描述历史事实，不判定 User Story 的语义正确性；Research
database 保存样本，不成为 evidence authority。这样可以吸收已有反证，而不是
以“轻量版”重新引入被否定的控制机制。

## 分阶段执行建议

### Phase 1：本地可信交付闭环

- 强化现有 `repo-harness-product` / PRD 对话，使其接受真实用户证据；
- 内联区分观察、推断和未知；
- 只提出 1–3 个会改变 scope 或风险面的反证问题，按「提问顺序」从高信息
  增益端选取；
- Owner 冻结 User Story、non-goals 与 falsifier；
- review 增加 intent drift、architecture decay 与 relevant risk paths 视角，
  以 Intent Diff 为第一呈现面；
- 继续使用现有 Markdown authority chain，不新增数据库依赖。

### Phase 2：Local contribution preview

- 在一个真实 work package 上生成本地 contribution bundle；
- 展示将要贡献的准确内容；
- 支持删除证据、实现 diff 和无关上下文；
- 记录 `不贡献 / private / public` 意愿，但不进行远端上传；
- 验证 bundle 是否足以回答“Agent 哪里理解错、Owner 改了什么、review 抓到什么”。

### Phase 3：Private ingestion

只有在 Phase 2 证明样本有研究价值，且 Owner 批准 `docs/spec.md` 边界变化后：

- 建立显式调用的上传入口；
- 先支持 Private contribution；
- 提供 preview hash、consent version、访问控制和 deletion receipt；
- 定义 retention、第三方处理、安全响应和操作者边界；
- 上传失败不影响任何本地 workflow 状态。

### Phase 4：Public projection

Private 路径稳定后再增加：

- select/redact preview；
- attribution 选择；
- 明确公开许可证；
- 不可完全撤回警告；
- 可供社区复现的案例与 benchmark 阅读面。

Phase 4 不应阻塞 Phase 1，也不能为了快速获得公开数据而跳过 Private 的 consent
和删除边界。

## First Proof Point

第一证明点不是数据库上线，也不是累计任意数量的上传记录，而是一条真实、
完整、经 Owner 确认的工作包轨迹：

```text
real user evidence
→ Agent draft story
→ Owner correction or confirmation
→ approved plan
→ implementation
→ intent-aware review
→ final owner feedback
→ local contribution preview
```

这条样本必须让 reviewer 在不读取聊天历史的情况下回答：

1. 原始证据是什么；
2. Agent 做了哪些推断；
3. Owner 改变了哪些产品语义；
4. 实现是否保持 approved intent；
5. review 捕获了什么；
6. 最终结果是否解决了原问题。

若无法回答，继续建数据库只会规模化收集无用或危险的数据。

Demand-characteristic 防护：设计者同时是 Owner，容易下意识配合工具产生
correction。跑轨迹之前先书面记录「预计 Agent 会在哪里误读」，跑完对照；
预测全部落空且未出现任何 Owner correction 时，按 Falsifier 处理，不得
计为成功样本。

## Falsifier

以下任一结果都要求停止或重新设计相应部分：

- 真实任务中，Evidence-backed User Story 没有产生任何 Owner-confirmed semantic
  correction，也没有提高后续 review 的判断质量；
- Intent-aware Review 只重复现有 tests/checks，不能发现产品意图、架构或风险
  路径上的增量问题；
- contribution preview 无法解释 Agent 草稿、人工修正、实现和反馈之间的因果
  关系；
- 开发者因为敏感性或 ceremony 持续拒绝贡献，Private 层也无法获得高保真样本；
- Research channel 反过来成为工作流 gate、远端 authority 或核心功能依赖；
- 任何默认上传、授权混淆、敏感信息泄露或 private-to-public 自动升级发生；
- 市场层：在设计者本人之外找不到愿意承担这套流程成本的 1–3 人团队试用者
  （当前直接证据 N≈1 `[UNVERIFIED]`；Phase 2 结束前须定义验证方式）。

## Non-goals / Kill List

当前不建设或不允许：

- 替下游产品接 CRM、analytics、收入、support、incident 或客户数据；
- 把 `repo-harness` 变成 hosted agent gateway 或下游产品 control plane；
- 用 Research database 决定目标项目的产品事实、approval 或 workflow state；
- 每份文档都弹出一次贡献询问；
- hooks、Agent 或非交互 CLI 静默上传；
- 默认包含 code diff、整个仓库、环境变量、凭证或 `_ops/`；
- 把 open-source repo 等同于 Public contribution consent；
- 把 Private consent 等同于模型训练、第三方处理或公开授权；
- Private 自动升级 Public；
- 为判断 User Story 正确性重新引入 `StoryEvidenceV1`、ledger、semantic classifier、
  validator、hard gate 或平行 authority；
- 用任意上传数量或虚构百分比代替真实样本质量和 Owner-confirmed correction。

## Open Decisions Before Remote Implementation

以下问题会改变法律、安全、数据权属或 scope tier，在远端实现前必须由 human
Owner 明确决定：

- Research service 的 operator、部署位置与预算 `[UNKNOWN]`；
- Private 数据 retention、删除 SLA、访问角色和 incident response `[UNKNOWN]`；
- 是否允许任何第三方模型处理，以及是否允许训练 `[UNKNOWN]`；
- Public contribution 的许可证和署名规则 `[UNKNOWN]`；
- 身份认证、滥用防护和 deletion receipt 恢复方式 `[UNKNOWN]`；
- `docs/spec.md` 的 database-service non-goal 如何做明确、单一 authority 的变更。

## 最终状态

```text
Product position:
  trustworthy AI delivery workflow for 1–3 person teams

Core product:
  Evidence-backed User Story + Intent-aware Review

Core authority:
  local repo files; existing PRD → Plan → Contract → Code → Review chain

Research flywheel:
  explicit opt-in work-package contribution
  private source record → optional approved public projection

Current action:
  active real-product dogfood and local contribution preview

Remote database:
  proposed, optional, non-authoritative, requires separate spec/privacy approval

Heavy semantic machinery:
  rejected by existing evidence; not reintroduced
```

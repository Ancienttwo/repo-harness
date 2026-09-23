> **Archived**: 2026-09-22 00:59
> **Related Plan**: plans/archive/plan-20260921-1946-akn00-native-execution-admission.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260922-0059
> **Archive Projection V1**: `plans/plan-20260921-1946-akn00-native-execution-admission.md` => `plans/archive/plan-20260921-1946-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/notes/20260921-1946-akn00-native-execution-admission.notes.md` => `tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/contracts/20260921-1946-akn00-native-execution-admission.contract.md` => `tasks/archive/contract-20260922-0059-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/reviews/20260921-1946-akn00-native-execution-admission.review.md` => `tasks/archive/review-20260922-0059-akn00-native-execution-admission.md`

# Plan: AKN-00：固定原生执行路径准入与故障证据

> **Status**: Archived
> **Created**: 20260921-1946
> **Slug**: akn00-native-execution-admission
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Task Profile**: eval-only
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: 固定拓扑Host能力准入与model-free故障oracle；不含Campaign native集成或产品启用
> **Rollback Surface**: 局部报告脚本、typed probe discovery、测试与文档；不迁移生产状态
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260922-0059-akn00-native-execution-admission.md`
> **Task Review**: `tasks/archive/review-20260922-0059-akn00-native-execution-admission.md`
> **Implementation Notes**: `tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md`

## Workflow Inventory

- 本文件获用户“开始”授权后进入隔离contract worktree；头部所列contract/review/notes已由原流程生成，当前契约仅覆盖AKN-00。
- 拟用Task Profile为`eval-only`，具体allowed_paths仅限下文6项与本切片workflow artifacts；Task Contract JSON Verification Plan在投影后成为唯一可执行验证权威。
- 实施隔离：批准本切片执行后，经原contract-worktree流在`codex/akn00-native-execution-admission`工作；若已有同名owner先核对，不复用其他任务WIP。当前实施在隔离worktree进行，原仓库研究输入保持不变。
- `tasks/todos.md`仅作原deferred ledger引用，不承接本清单；证据缓存为`.ai/harness/checks/latest.json`与`.ai/harness/runs/`，durable结论进入本切片review和研究文档。
- 只有此计划的执行权威进入对应contract；上层路线的AKN-01—07路径不得并入allowed_paths。切换计划走原active owner检查，不据文件mtime激活任务。

## Goal

只交付 AKN-00：为一条固定的非容器执行路径建立可核验的 Host 能力准入报告和 model-free 故障 oracle。结果可为 `admitted` 或 `runtime_not_admitted`；负向裁决也是本切片的有效交付，但不代表 Kanban 自动化目标完成，不授权 Campaign native cutover。

产品与跨切片契约见 `docs/researches/20260921-agent-first-kanban-implementation-roadmap.md`。AKN-01—07不进入本计划的执行权限或检查清单。

## P1 — 当前证据与所有权

- 源码基线 `0d4371c3f95e63851f4e083718f3337bf9646345`。本轮只规划，尚未执行准入 canary。
- 本机只读探测：Darwin arm64、`codex-cli 0.154.0`；`codex sandbox --help`可读。版本和help只能证明命令入口存在。
- `scripts/me2b-runtime-admission-canary.ts`当前仅注册 `codex-cli 0.149.0` / `codex-cli-0.149.0-launch-only/v1`，其他版本在 discovery 拒绝。旧报告见 `docs/researches/20260826-me2b-managed-parent-sandbox-canary.md`，不能覆盖当前0.154.0。
- `classifyMe2bRuntimeObservation`拥有 delegated writer 的动态Parent限制、保留控制能力及effect-time principal判据；新的聚合报告引用该结果，不复制一套较宽松判据。
- `campaign-runtime.ts`拥有 invocation/terminal容器合同；本包只将它列为后续consumer，**不修改该生产合同**。`campaign-worker.ts`、`contract-run.ts`、policy/grant/Lease均不在写范围。

## P2 — 冻结唯一候选路径

选择 `parent + delegated writer + 独立read-only verifier`，与现有Campaign worker/verifier角色对应。拒绝在本包同时比较直接Parent写、多Provider、远程Host或新runtime。若所选路径不具备能力，输出拒绝；更换拓扑必须重新定义准入对象，不能由adapter静默选择。

| 准入对象 | 本包冻结值与证明要求 |
|---|---|
| Parent | 已授权有界Codex Parent；delegated writer生效前失去对该worktree的写能力，同时保留读取/观察/取消控制。采用此拓扑因此适用原ME-2B条件 |
| Worker | 单个独立Codex writer；权限来自Host认证principal与grant epoch，限获批worktree/paths，不能写grant、receipt、审计和verifier结论 |
| Verifier | 与worker分开的只读执行身份，绑定exact candidate/contract；不得修改candidate，也不得由worker自签验收 |
| 实际入口 | 待集成路径为现有Campaign acquisition handoff → `scripts/contract-run.ts --campaign-handoff` → Campaign worker/runtime owner。本包仅做Host probe，不调用这条生产路径、不新增执行adapter |
| 受信任边界 | Host提供的principal、效果身份、权限替换/撤销及停止观测；repo-harness只验证/引用。digest、PID、caller JSON和提示词不构成身份或权限根 |
| 文件权限 | model-free探针仅操作全新临时HOME和临时repo中的sentinel；测试权威记录也只在fixture。用户worktree及真实HOME不得成为写探针目标 |
| 外部副作用 | 本包允许只读CLI身份/help及无模型本地sandbox探针；不允许模型请求、网络provider调用、GitHub写入、grant mint、Campaign启动、容器或Host安装/升级 |
| 撤销与停止 | 验证Host是否能拒绝新写效果、保持Parent控制，并按原effect身份给出相关执行inactive；无法证明则unknown，不能用父PID退出替代 |
| 恢复 | Host应允许原effect身份查询。缺此能力记录 `probe_unavailable`；不得新ID重启，不要求实现一个恢复daemon |
| 支持范围 | 首个候选固定Darwin arm64、Codex CLI 0.154.0；报告冻结OS版本、executable解析链/摘要、help摘要、Host API/adapter版本、实际permission profile摘要。任一变化须重新准入 |
| 明确不支持 | CLI 0.149历史报告外推、其他版本/平台/拓扑、Codex App能力外推、Claude/Herdr替换、容器、并行writer、直接Parent写 |

当前没有0.154.0的已注册Host probe adapter，也没有本轮正向Host证据。因此实施者首先能交付的是准确的 `runtime_not_admitted`，不能仅更新版本常量便认定能力存在。若未来出现真实Host API，本包的同一证据合同可供一个显式、版本固定的probe引用；新增Host API适配或安装成本须另列具名差异，不能藏在本包内。

```text
固定候选身份 + 原Host probe注册信息
                 |
      版本/拓扑/permission profile核验
                 |
       原ME-2B观测 + 原生效果/停止证据引用
                 |
       AKN-00只读准入报告与缺失项
                 |
      admitted / runtime_not_admitted
                 |
   AKN-01另行验证所有Campaign消费者与cutover
```

## P3 — 最小实现与接口

最小方案是复用现有ME-2B探针和纯判定器，补一个**只出报告、无生产启用效果**的AKN-00组合入口。相比直接给Campaign增加native adapter，它先隔离证据不全的风险，负向报告本身即可独立合并/回滚。

新增操作入口仅 `bun scripts/akn00-native-execution-admission.ts --repo <repo>`，不注册公共CLI/MCP命令，不增加env开关、依赖、服务或持久化任务状态。默认只做身份与能力inventory；只有匹配受支持probe的情况才可运行该probe的已声明model-free动作。当前0.154.0没有probe时，在创建执行子任务前结束并报告缺失。

### 报告合同

版本为独立 `repo-harness.akn00-native-execution-admission/v1`，不是改写ME-2B历史结果或Campaign receipt。

- `subject`：repo baseline、拓扑ID、OS/arch、executable解析链及hash、CLI version、help/profile摘要、probe adapter ID或明确缺失。
- `evidence_kind`：`live_host`或`injected_test`；真实CLI入口禁止caller注入观测。测试依赖注入只在测试导入路径，不经参数、环境变量或用户JSON启用。
- `capabilities`：Parent revocation/control、effect principal/epoch、worker路径隔离、authority store保护、verifier只读、terminal/inactive和原effect查询。每项保存`observed | not_observed | probe_unavailable`、原生证据引用或缺失原因；没有API就不生成假的receipt。
- `me2b_ref`：原ME-2B完整结果及其digest；原判定器继续决定其专属不变量。报告不能把`runtime_not_admitted`覆盖为通过。
- `decision`：仅所有适用项有真实正向证据且版本/profile一致才`admitted`，其余`runtime_not_admitted`并列typed原因。`injected_test`永不作为发布Host准入凭据。
- `campaign_integration`：固定`not_evaluated`；AKN-00没有证明生产invocation、worker、terminal、settlement和全部consumer可接受新合同。
- stdout单一JSON；exit 0=真实准入成立，exit 2=完整拒绝报告，exit 1=输入/IO/报告失败且不能形成有效裁决。不要将非零命令失败当作隔离拒绝证据。

运行结果进入原忽略的`.ai/harness/runs/`，durable研究结论只记录摘要、精确subject、缺失能力与报告路径/hash。没有机器自动安装/启用的admission registry；报告不成为新的grant权威。

### 文件与范围

| 文件 | 变更 |
|---|---|
| `scripts/me2b-runtime-admission-canary.ts` | 导出/复用当前身份发现与版本支持结果，给unsupported adapter提供typed结果供组合入口读取；保持ME-2B既有oracle与历史报告语义。不解析stderr推导Host能力，不增加0.154假adapter |
| `tests/me2b-runtime-admission-canary.test.ts` | 在已有文件覆盖typed discovery、版本错配及原ME-2B拒绝逻辑，保留静态checkpoint不等于revocation的测试 |
| `scripts/akn00-native-execution-admission.ts`（新增） | 单次只读报告入口及其纯组合判定，复用ME-2B结果，明确Campaign未评估；文件独立理由是Campaign所需证据范围大于ME-2B，不能污染原准入权威 |
| `tests/akn00-native-execution-admission.test.ts`（新增） | 独立组合边界的故障oracle，不再建一个通用Host测试框架 |
| `docs/researches/20260921-akn00-native-execution-admission.md`（新增） | 固定拓扑/subject、实际输出、拒绝原因和重开条件；没有正向证据时明确负向裁决 |
| `docs/researches/20260921-agent-first-kanban-implementation-roadmap.md` | 仅回填AKN-00结果/证据链接，不改其他AKN的状态为完成 |

共6个实现/验证/结论文档路径，其中3个新增文件有独立证据边界理由。同步本计划所属workflow artifacts按原流程进行；不改`tasks/todos.md`的BRC/ME-2B收口，不改历史批准文件。写scope不含`src/`、policy、生产状态、安装目录或其他计划；若需要第二个额外边界改动即停下报告。

## Verification Plan（设计，投影后以contract JSON为唯一执行权威）

### 必须覆盖的oracle

| ID | 输入/故障 | 可验收结果 |
|---|---|---|
| H0-01 | 0.154身份存在、没有匹配probe | `runtime_not_admitted` + typed adapter缺失；无模型、容器、生产状态写入 |
| H0-02 | 版本/hash/profile/拓扑与证据不同 | 拒绝复用；旧0.149报告不能覆盖新subject |
| H0-03 | 静态sandbox读写控制通过，动态权限/身份未知 | ME-2B保持拒绝，聚合报告不能升级admitted |
| H0-04 | 子执行仍可能活着、输出缺失或停止结果未知 | terminal/query能力不通过；PID exit和超时不算inactive |
| H0-05 | worker可写authority store或verifier可写candidate | 准入拒绝，原始证据保留 |
| H0-06 | 全部注入测试观测通过 | 仅证明判定器正向分支；`injected_test`不能充当live admission |
| H0-07 | report-only运行完成/中断 | 用户repo/HOME、policy/Lease/grant未改变；临时fixture由现有owner清理；未知运行不伪造清理完成 |
| H0-08 | H0真实通过（仅当已有受支持probe能证明） | `campaign_integration=not_evaluated`仍保留，不能自动cutover或启用policy |

聚焦命令：

```bash
bun test tests/me2b-runtime-admission-canary.test.ts tests/akn00-native-execution-admission.test.ts --timeout 60000
bun run check:type
bun scripts/akn00-native-execution-admission.ts --repo .
```

最后一条运行前固定隔离HOME、候选binary及版本；先确认只读/已声明的model-free probe，无provider账户或模型token需求。exit 2只有JSON完整、原因正确且无禁用效果才算**拒绝路径测试通过**，不能写Host准入通过。单次probe沿现有5秒过程限制，整体硬上限60秒；无probe即提前返回。超过10分钟的验证先说明成本和必要性，不扩成真实模型canary。

实现改变scripts/helpers时保留根AGENTS必需的hooks、helpers、reference-configs、SQL、architecture/task sync、strict workflow、project-state与init dry-run检查；每条在contract JSON绑定冻结subject后执行一次。无新增全面suite。外部CI/release要求不因该局部验证取消。

## Exit criteria

- 一个精确拓扑/subject，原ME-2B oracle继续唯一拥有其判定；生产路径没有被新增报告授予权限。
- typed拒绝、缺失/矛盾/过期证据、注入观测不得冒充live的测试通过；真实本机报告给出可复核的结果。
- `Host capability admission`与`Campaign native integration`两项分列，后一项本包始终未评估。
- 研究结论完整记录已测/未测边界；AKN-01仍要求合法Campaign入口与单独native集成证明。
- 用户文件、真实状态和原始研究未被探针改变；没有模型开销、容器或额外安装。

## Evidence Contract

- State/progress path: 本计划唯一Task Breakdown；实施后同stem task contract控制写scope，不由上层路线生成宽权限合同。
- Verification evidence: 冻结subject的聚焦结果及`.ai/harness/runs/`原始报告，在同stem review记录hash和结论，研究文档保留可复用裁决。
- Evaluator rubric: H0-01—08与Exit criteria；拒绝路径通过和Host admitted严格分开，AKN-01未评估。
- Stop condition: 未注册probe或证据不足正常输出runtime_not_admitted；实施需要新Host/runtime、生产effects或额外权限则停止，不自行扩大scope。
- Rollback surface: 回滚报告入口、typed discovery扩展、测试与文档；不迁移任何生产数据/receipt，无policy启用需撤销。

## Promotion Gate

- Merge/PR unit: 固定native执行路径的准入报告及故障oracle，一个独立可合并切片。
- Rollback surface: 本包6个限定路径与自身workflow artifacts，可整体撤回；原生产Campaign不变。
- Verification boundary: ME-2B复用、native证据组合和实际版本拒绝三层证据，H0-01—08。
- Review/acceptance boundary: 判定报告是否准确，不能把测试注入或命令存在提升为Host权限证明。
- High-risk surface: admission语义与效果身份；本包只评估、不授权，不触发生产执行。
- Why not checklist row: 具有独立安全证据和回滚边界；总路线包含多个权限面，不可共享一个allowed_paths合同。

## Risks and rollback

最脆弱前提是所选Host暴露可认证的动态控制、效果身份和终止查询；当前未获证明。前提失败时交付准确拒绝报告而不增加模拟权威，方案仍有独立用途。10倍任务数不扩大本包范围：一次只评估一个固定路径，不扫描Fleet；未来并发writer必须新准入。

只读版本/help与model-free控制不能证明真实Agent决策质量。所有正向注入仅为oracle测试。回滚不修改生产状态；原始测量留作历史且绑定旧subject，不能当作新版本证据。

## Task Breakdown

- [x] AKN00-1：固定拓扑与subject，复用ME-2B身份/版本支持的typed结果，保持原oracle。
- [x] AKN00-2：实现无启用副作用的组合报告入口，拒绝缺失/错配/测试注入证据。
- [x] AKN00-3：完成H0-01—08适用的故障测试与本机model-free读回，明确未具备的Host能力。
- [x] AKN00-4：冻结结论与证据，完成必要检查；回填路线的AKN-00引用，不推进AKN-01。

本地实现与验证完成，独立AcceptanceReceipt仍待取得，计划保持Executing。收口预检确认自动architecture projection仅更新`docs/architecture/.projection-manifest.json`，无affected node或refresh signal；将这一生成元数据路径纳入同包，未扩大Host/API或Campaign范围。

2026-09-22用户批准“提交与独立验收”：允许一次原codex-plugin流程的独立只读评审；这是收口评审的具名例外，Host inventory和故障测试仍不调用模型，其他AKN、Campaign执行、安装升级与发布仍不在本包。

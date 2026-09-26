# AKN-00：固定原生执行路径准入

> Date: 2026-09-21; read-only recheck: 2026-09-24
> Host capability admission: `runtime_not_admitted`
> Campaign native integration: `not_evaluated`
> Scope: Darwin arm64 / Codex CLI 0.156.1 current inventory; 0.154.0 historical evidence / Parent + delegated writer + independent read-only verifier

## 2026-09-24：Codex CLI 0.156.1 只读能力复核

当前观察对象为 Darwin arm64 / Codex CLI 0.156.1，仓库基线 `80fb3339fc2c96355d9696663d528e3485b91a97`。下文 2026-09-21 的 0.154.0 报告是历史证据，不能用于此对象。当前 H0 仍未成立；Campaign native integration 仍为 `not_evaluated`。

本轮选择 handoff 路线 (a) 的前置能力调查，结论是**不编写完整 0.156.1 准入 probe**：已暴露的静态 sandbox API 值得独立测试，但无法填补所选 Parent + delegated writer + independent read-only verifier 拓扑的身份、动态撤销、完整停止和原 effect 查询证据。没有把路线改成长期仅监察，也没有通过删减准入条件重定义拓扑。

### 本机 schema 能力表

通过该版本的 `codex app-server generate-json-schema --out <temporary-directory>`，另加 `--experimental` 生成对照；只读 inventory 使用隔离 HOME/CODEX_HOME。以下路径均相对生成目录，描述 API 契约，不代表实际隔离或终止 canary 已通过。

| H0 对象 | 0.156.1 暴露面 | 能证明的边界与缺口 |
|---|---|---|
| Worker 路径隔离、只读 verifier | `v2/CommandExecParams.json` 的 `sandboxPolicy` 支持 `readOnly`、`workspaceWrite`、`writableRoots` | 有静态权限控制接口；未执行 allow/deny probe，不能证明 authority store 保护、Parent 动态失写或 verifier 独立性 |
| Effect-time principal / grant epoch | 同文件的 `processId` 是 client-supplied、connection-scoped | 不是 Host 认证 actor/epoch；未找到 effect 发生时绑定 Claim/Binding/grant 的公开契约 |
| Parent 撤销及控制 | thread/turn 权限设置、`permissionProfile/list` | profile 列表只有 id、allowed、description；未找到当前 Parent 即时失写且保持只读控制的确认契约，也无 effective permission closure 摘要。`sandboxPolicy` 描述提到 `permissionProfile`，不能据此认定该参数在 stable schema 可用 |
| 完整停止 | `v2/CommandExecTerminateParams.json` 接收 processId；`CommandExecTerminateResponse.json` 是 empty success | 证明接口可请求终止，不提供所有相关子进程/外部 effects 已 inactive 的终态证据；exitCode 不能替代这一证据 |
| 原 effect 查询、断线恢复 | `command/exec`、write、resize、terminate；`CommandExecOutputDeltaNotification.json` 明示连接关闭时终止进程 | 未找到按原 command effect ID durable query/status/reconnect 的契约；thread/read 与 turn history 不等价于该查询；不能据 missing 结果重发 |
| 实验接口 | experimental `process/spawn` 明示 unsandboxed | 不能用于补静态 sandbox 或上述动态身份缺口 |

本结论限定于本机 0.156.1 help 和生成的 stable/experimental API surface；没有声称所有内部实现或未来版本均无此能力。schema 出现字段只建立可测试入口，不建立运行准入。

### 当前拒绝报告与复核入口

原 `scripts/akn00-native-execution-admission.ts --repo <repo>` 在该基线运行后 exit 2，stderr 为空，结果为 `runtime_not_admitted`；subject 为 `sha256:d96c291adfc075f3ad11d406e0387d6ca80c3f7f9cd174ea81e09262cee6d2ba`，报告字节 SHA256 为 `56ddf0c7b52774e2c18748e29bd0d7b16816b3baae680544337ed3091b03dffa`。

必须区分两个版本门槛：AKN-00 evaluator 仍固定候选 0.154.0，因此当前报告包含 `candidate_version_mismatch`；ME-2B 仍只注册 0.149.0，因此同时有 `host_probe_not_registered`。这是一份当前 inventory 的准确拒绝，不是已为 0.156.1 实装新 probe。九项 capability 均为 `probe_unavailable`，permission profile 与 Host API revision 保持 null，不能把缺证据写成已测失败或已测通过。

原始 inventory、help 和生成 schema 保留于 ignored evidence cache `.ai/harness/runs/akn00-01561/`。复核时使用上述 schema 命令及既有 AKN-00 inventory，保留 exact executable/version、仓库 revision、subject 和输出摘要。没有启动 app-server 服务、模型、worker、sandbox workload、Campaign，未 mint grant、执行 waiver 或修改 policy。现有 `development_campaign.mode=off` 保持。

AKN-01/02/07 与 AKN-03 的真实 Host 场景继续受 H0 阻塞；03c 源码协议与恢复验证可独立完成。重新打开完整 probe 的触发条件是具体 Host API 能提供缺失的认证身份/撤销、inactive 和原 effect 查询证据；若改选拓扑，先重冻路线 §4.1 与 AKN-00 对象表，不能用改版本常量或本地合成字段代替。

## 2026-09-21 历史结论（仅 0.154.0）

当前候选路径没有注册的Host probe，也没有权限替换、effect-time principal/epoch、工作文件/权威记录隔离、只读verifier、完整执行终止或原effect查询证据。AKN-00提供准确的拒绝报告与故障oracle，未开放native写执行；它不完成AKN-01或BRC14/BRC15。

实际版本/help探测只证明CLI可调用。ME-2B当前唯一probe固定0.149.0，旧结果不能覆盖0.154.0；报告复用原判定器，不更改版本常量冒充支持。缺权限profile与Host API时保留null和缺失原因，不读取用户配置拼凑“有效权限”。

## 实际读回

- 原repo baseline：`0d4371c3f95e63851f4e083718f3337bf9646345`。
- 平台：Darwin arm64，OS release `25.5.0`。
- CLI：`codex-cli 0.154.0`。
- 选中入口通过symlink解析为npm package的`@openai/codex/bin/codex.js`；其SHA256为`61b0194f3bb6534439c8d26a3ed57d0805f84b884588b761795323eeb92fcf70`。
- sandbox help SHA256：`6f07d12fb0614fbca21988b0e2a9165f33d341dbd0899728fcd3b67e19ac7660`。
- launcher摘要不是完整native执行闭包；`executable_closure`保持`probe_unavailable`，不根据npm路径猜实际Host二进制。
- CLI exit `2`，stdout为单一JSON拒绝报告，stderr为空；`me2b_ref=null`，`campaign_integration=not_evaluated`。
- 原始证据：`.ai/harness/runs/akn00/host-report.json`，文件SHA256 `2767040f7727481ae085bb22013e196cfe48169ceba47655dd19bab817686b66`；同目录记录stderr和exit。

报告中的绝对路径仅留在忽略的本地证据中；可复用结论引用repo baseline、候选版本和摘要，不将本机安装路径变成所有用户的配置。

## 实现边界

`discoverCodexRuntime`现在返回身份与typed probe support；原`runMe2bRuntimeCanary`仍要求精确已注册版本。unsupported discovery与失败命令分开：无probe可以形成有效拒绝报告，失败的version/help/IO不能构造permission-denied或admitted证据。

新增入口：

```bash
bun scripts/akn00-native-execution-admission.ts --repo <repo>
```

入口只接受repo，不接受观察JSON、测试模式、provider或模型选项；实际路径只读取Git HEAD并调用CLI `--version`和`sandbox --help`。子命令使用临时HOME/CODEX_HOME/cwd和最小env，不继承provider key、Git环境或预加载选项，单命令5秒上限。无可用probe时不调用sandbox执行、Codex exec、worker或Campaign。exit 0保留给真正准入成功的协议结果；当前版本没有能产生该结果的live probe。

测试组合入口的provenance固定`injected_test`，即使所有注入观测为正向也只能得到`runtime_not_admitted`。原ME-2B条件由原oracle重算，供应者自报的decision不能覆盖它。subject摘要绑定repo baseline、版本、入口摘要、平台、拓扑及profile；换其中任一项，旧证据无效。

运行脚本本身的Bun loader会在脚本执行前初始化transpiler cache；可复核CLI测试显式禁用该缓存，现场读回使用外层临时HOME。这个启动层行为不同于脚本的Host探针，不能将“脚本内部隔离”声称为任意启动方式都不写调用者缓存。

## 验证范围与限制

- 故障oracle覆盖版本/二进制/help/profile/拓扑错配、ME-2B负向观测、终止/查询未知、越界worker/非只读verifier、测试注入不能准入。
- CLI fixture记录真实argv，证明只有两次inventory调用、拒绝伪造evidence flag、无用户文件变化、正常与throw路径清理临时probe HOME。
- 没有运行真实Host权限probe、强制终止进程实验、模型请求、容器、provider写入、grant mint或Campaign执行。强制杀死宿主进程后的完整inactive/cleanup仍属未证明能力，不能用异常路径清理测试冒充。
- 上述能力不足不是AKN-00实现失败；本切片产物是可审计的拒绝。后续正向准入需要具体Host API与版本固定probe，不由policy开关或fixture产生。

## 后续边界

只有所选拓扑的真实Host能力获得正向证据，才有H0 admitted。AKN-01还必须独立验证合法Campaign前置记录、native invocation/terminal及全部consumer；H0不会自动执行cutover，也不会修改policy、Lease、grant或其他slot/group状态。

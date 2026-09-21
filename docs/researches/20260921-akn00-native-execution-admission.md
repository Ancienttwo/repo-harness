# AKN-00：固定原生执行路径准入

> Date: 2026-09-21
> Host capability admission: `runtime_not_admitted`
> Campaign native integration: `not_evaluated`
> Scope: Darwin arm64 / Codex CLI 0.154.0 / Parent + delegated writer + independent read-only verifier

## 结论

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

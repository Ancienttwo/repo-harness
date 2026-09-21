# AKN-00 implementation decisions

- 原ME-2B oracle不变；仅分离typed inventory与require-registered执行边界。0.154无probe准确拒绝，不修改0.149版本pin。
- 候选CLI是npm JS launcher；摘要只覆盖已解析入口，native closure与有效profile未证明，因此报告显式缺失。
- live入口没有测试注入参数；可导入的测试报告构造器固定injected_test并拒绝准入。
- Bun loader会在脚本之前写transpiler cache；CLI fixture禁用缓存，真实读回在外层临时HOME运行；子probe另行隔离HOME/CODEX_HOME/env。
- 初轮保持model-free，没有调用模型/provider评审；2026-09-22用户批准独立验收后，允许原codex-plugin只读评审。Campaign policy保持off。

> **Substantive Change SHA256**: `sha256:019ea1fd01794ad979635d77c2dbe4fc00329e56fdf5d7f6a98f76c1709f8f3a`

- 首轮22项测试、type与仓库检查已通过，task-sync要求补上述diff绑定。复验只修改本切片workflow文档；以冻结Git tree逐文件/权限校验和当前task检查作为delta，保留原始执行证据。

- 收口的architecture projection plan（`akn00/projection-plan.json`）仅计划更新`docs/architecture/.projection-manifest.json`，affectedNodeIds/refreshSignals均为空。按原流程增加这一生成文件到同包allowed_paths；architecture-sync改为当前执行，其余非workflow源文件必须匹配首轮冻结tree。

- 2026-09-22独立codex-plugin评审approve、findings=[]，exact subject `sha256:b10fd83bac79e83fae1b8f70272ec313e0a6a8866539601c0043c17bfb0846df`；AcceptanceReceipt为external_pass，最终verify-sprint通过。原文见`.ai/harness/runs/akn00/cross-review-20260922.json`。
- 归档未完成：installed helper会重写Verification Plan中workflow-delta命令的路径，导致归档后plan hash失配；对照临时归档commit `3bac0fa9`与冻结candidate `7a866b11`，只有该check.command变化。repo内scripts和assets helper已有跳过Verification Plan的修复，但源CLI收口被merge-gate的installed-runtime规则拒绝。两次finish均自动回滚，未合并；日志为`akn00/finish-20260922.*`与`akn00/finish-source-20260922.*`。需另行授权更新本机安装后继续；不改准入代码、不重做语义评审、不绕过gate。

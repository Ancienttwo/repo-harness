# Operator Planning 与三视图的权威边界

AKN-05e 补齐 Planning、Delivery、Organization / Attention。默认进入组织监察；三个视图共用仓库选择和 Task 详情。视图导航只改变本地显示，不获取全部 Task 详情，也不执行领取、审批、消息投递或调度。

## 读取链路

`GET /api/v1/collaboration/:repository_id/snapshot` 的 protocol4 在已有 exchange、organization、decisions 之外增加独立的 planning source。服务器、worker 和浏览器共同切换；旧协议和缺少 source 的响应拒绝解码。

Planning 从 strict registry 解析仓库，调用现有 Board / TaskOffer reader。`projectOperatorTaskContext` 与 Task context GET 共用原始需求、准备状态、blocker owner 和 plan proof 投影。canonical Sprint 取 Board 的精确 commit；plan proof 仍来自注册工作区，明确保留 `registered_worktree` basis。Task context GET 保留原有 revision、大小和错误码检查。

Work Graph 通过 `readTrackedWorkGraphProjectionAt` 绑定同一 commit。只展开声明引用的注册仓库，并由现有 topology validator 与 `resolveDependencyObservation` 判定关系。四种依赖状态和 acceptance subject 均沿用原协议；只读仓库不被变换成可写授权，原 resolver 返回 `authority_unavailable`。同一 commit 中的策略与 rollback 引用由既有 reader 验证；浏览器只收到引用、digest、Task / Work Package 身份、capability 和原判定，不收到本地仓库路径或 provider session。

一次完整观测最多含 200 个 Task，graph closure 最多 8 个仓库、每仓库 200 个 package、总计 1000 条边，Planning payload 最多 2 MiB。现有 worker 超时约束同步 Git / 文件读取。达到限制或数据失效时拒绝受影响来源，没有截断成完整列表。两次读取比较完整投影，最后再次核对 registry 授权及路径；变化时拒绝混合结果。

图失败与需求读取独立。没有 canonical carrier 时保留 `unclassified` 和未知依赖覆盖；仅存在且已校验的 package 的空依赖数组可显示“未声明依赖”。因此不可用状态不会被解释成 ready、已批准或无依赖。扩大十倍首先触发既定大小、数量或 worker 时间边界。

## 界面和共享身份

Planning 显示原始需求、准备阻塞及 owner、已验证的 plan proof、声明依赖、验收策略和可展开引用。只有 repository ID、Task ID、Task revision 同时匹配当前 Fleet card 时才能打开共享详情；旧版本和缺失卡片明确提示刷新。

Delivery 使用原有五列 placement，另外显示 preparation、alternate workflow、unclassified、isolated 分组。它不把准备工作转换为运行状态。窄屏将阶段纵向排列；较宽布局保持五列。

导航采用三个带关联 panel 的 tabs，支持方向键、Home、End 和 roving focus。Organization 内容保持挂载以避免重读和重置，共享详情位于视图条件之外，保留 Composer 节点、草稿、IME 和 Task / Claim fences。仓库切换和显式刷新仍由原 scope cancellation 负责。

## 验证和未闭环边界

现有 Task context suite 增加真实临时 Git 仓库与 canonical Work Graph：验证准备 owner、精确 commit、脏工作区、只读依赖、缺失外部图、期间 plan / registry 变化、数量限制和真实 HTTP worker。UI / transport suite 验证协议拒绝、旧版本详情禁用、键盘导航、阶段计数守恒和切换后草稿及请求次数不变。现有 scheduling schema / dependency authority suite 保持回归覆盖。

生产构建的 GET-only fixture 验证英文宽屏和中文窄屏、长引用换行、44px 控件以及仓库切换清除旧 Planning。该 fixture 不代表真实执行或安装验证。

本地证据归档于 `.ai/harness/runs/akn05-planning/`。当前 CodeGraph proof、确定性 reconcile、规范验证、独立语义验收及阶段 PR 是后续验收步骤。AKN-00 最近 Host probe 对 Codex CLI 0.155.1 仍为 `runtime_not_admitted`；本包不改变该结论，不安装 runtime、不合并 main。

# Operator service epoch 与重启恢复

AKN-06c 基于 ea13a5a8，修正同一页面跨 HTTP 服务重启时的观察身份。候选验证完成后仍需当前 worktree CodeGraph proof、规范验收和阶段 PR。

## P1 / P2 / P3

P1：`src/effects/operator/server.ts` 为服务生成唯一 UUID，维护每轮 Fleet sequence。此前 Repository envelope 带 epoch，但主 Fleet DTO 将它丢弃；Composer、TaskDiff 和关联读取只看到序号或 Task/Claim fence。

P2：草稿发送被 canonical_source_stale 拒绝后，Composer 要求下一快照 sequence 大于失败序号。服务重启把 sequence 重置为1，稳定的新服务快照仍无法启用显式 Rebind。修改生产代码前，原始回归失败记录在 `tasks/reviews/20260922-0948-akn06-epoch.review.md`：期待按钮可用，实际仍 disabled。

P3：Operator Fleet protocol7 必须携带 service_epoch；Repository protocol3 的外层 epoch 从内层快照派生，并校验相等。浏览器严格拒绝旧协议、缺失/无效 epoch。共享纯 UUID validator 只验证服务权威，不产生身份。服务端、投影、浏览器同时切换，不保留兼容读取。

## 浏览器行为

- 同 epoch 的 sequence 倒退保留前次数据并标为 stale；不同 epoch 允许从1开始。
- 接受新 epoch 后更新关联观察 generation，取消旧 Collaboration、Automation、Task context/activity 生命周期；旧 promise 即使忽略 AbortSignal 也不能发布结果。
- TaskDiff 在 epoch 变化时重新挂载，终止旧手工读取并移除旧 diff；需要再次手工读取。
- Composer 保持原节点、原文本、message identity 和 Task/Claim fence。失败记录及发送状态绑定 epoch+sequence；只有显式 Rebind 可以重新绑定。自动刷新保持 Decision 查询页。
- 没有新增轮询器或写接口。10倍流量时瓶颈仍是既有观察队列与 provider limiter；检测到重启只额外触发一轮关联刷新。

## 边界

现有 Fleet observation round 串行化，`src/effects/fleet/board.ts` 将一个 per-round provider limiter 传给各仓库读取；Collaboration 读取已存 projection。此切片没有新增 scheduler。

H0 仍无已认证的当前版本 Host probe，原生执行、真实 feedback/steer 及 AKN-07 installed journey 没有获得证明。旧 URL 的正式历史 Task 引用和 head/base/contract 证据失效是后续 roadmap 项；本切片仅解决服务 epoch 边界。不合并 main，不安装运行时。

## 验证

七个契约指定 suite 共316项通过；类型检查及生产构建通过。修复前 guard 已证明旧实现失败。真实服务重启测试确认 scoped/global Fleet 共用同一 epoch，而新服务产生不同 epoch。生产浏览器 GET fixture 的序号19跨 epoch 重置为1、再增至2，第二页 Decision 保留；无消息写入。原始日志留在忽略的 `.ai/harness/runs/akn06-epoch/`，耐久结论与修复前失败摘录位于本切片 review。

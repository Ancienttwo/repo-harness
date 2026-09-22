# AKN-06d：有界 canonical Task 历史来源

## 定位与权威

旧链接不能把标题、归档文件名或残留 Lease 当成任务身份。`coordination-identity.ts` 的 schema2 ID 单元格拥有 Task ID，revision 由既有 Task/Mode/Acceptance 字节规则产生。当前 context 只读取活动 Sprint；历史 activity 拥有消息事实，不拥有原任务定义。现有 archive workflow 保留 Source Ref，但没有直接提供完整 Task/commit/path 元组的 typed reader。

本切片新增 `readOperatorTaskHistory` 与严格 DTO，作为旧链接恢复的后台前置。没有新增 HTTP 路由或浏览器入口；接入现有 context 的显式历史读取及 URL 状态是下一切片。没有第二任务数据库、归档索引、provider 调用、执行效果或持久化写入。

## P1 / P2 / P3

P1：复用 strict repository registry、server-owned canonical target、schema2 parser 和 Sprint directory policy。`canonicalSprintsDirectory` 增加可注入的文件 reader，既有消费者保持原 reader，历史消费者使用有界 Git 读取；没有复制 policy parser。

P2：固定 canonical target commit，按 first-parent 从新到旧最多检查64个 commit；每个 commit 从自己的已提交 policy 确定 Sprint 目录，读取该目录直属的正式 `.sprint.md` carrier。必须检查完整 carrier 集合及重复 ID，才能选择该 commit 的 exact ID/revision。找不到时检查上一 canonical commit。不扫描工作区脏文件或按 archive filename 关联，也不把 side-branch 任意尝试称为 canonical 历史。

P3：返回的 `source` 明确绑定 target ref、target commit、匹配 commit、Sprint path、完整 UTF-8 blob SHA256；保留 BOM 字节。返回 Task 原定义及原 Status 单元格，但不返回当前 Lease、可写权限、ready 或自动完成结论。历史状态只有该 commit 时的含义。

返回前重读 registry authorization、physical root、canonical target 配置和 target commit；变化即 stale。Git 禁止 fsmonitor、交互、lazy fetch 与 replace objects。每条命令只使用剩余 deadline。限制为3秒、2MiB累计 Git 输出、256KiB单 blob、256个不同 Git blob（含 policy）、每 commit128个 carrier、64个 commit。10倍历史规模触及上限即拒绝；不输出扫描未覆盖范围的断言。

`history_unavailable` 表示在声明的范围内未取得对应 schema2 证据，不代表任务从未存在。歧义是 `history_ambiguous`，资源和来源故障分别为 `too_large` / `timeout` / `unavailable`。客户端请求只有 repository ID、Task ID、可选 expected revision；额外 path/ref 字段被拒绝。

## 验证与边界

现有三套定向 suite 共45项、195断言通过；包括实际 Git carrier rename/archive、同 ID 标题变更与指定旧 revision、未提交 lookalike、schema1、跨 carrier 重复 ID、超大 blob、历史 policy 目录、64 commit 边界、registry/target 变化和 BOM 字节绑定。历史正常读取前后 fixture 文件树保持不变。类型检查通过；仓库九项完整性检查记录于本切片 review。

已有 merge-readiness/readiness projection 的39项只读审计用例通过，源码仍由原 publication receipt 与 effective-state freshness 判定 head/base/checks；这不等于本切片完成 OB-06 全部契约/浏览器证据。原生执行 H0、纵向反馈/steer、安装包验收也仍未成立。

候选未做 HTTP/browser 集成，不代表 old URL 端到端已完成。后续沿现有受限 context GET 区分当前与历史，只把已证明的历史 source 提供给只读详情；不得为归档任务构造当前 card 或 Composer fence。

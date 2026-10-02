# OAR SessionOptions 只读权限提案（A；本地草案，不对外提交）

## 状态与依据

Aimpact 17:35 当前实施方向是B。本提案只准备A，不修改 `/Users/chris/Projects/oar`，不发issue/PR、不运行模型/provider。快照 `ef893acc0d341b4fa7a1ce41d2be7cafed3c63a2` / @botiverse/oar 0.10.2。所有行号相对OAR根；工期/API形状是建议，不是已实现能力。

当前SessionOptions没有权限字段（`packages/oar/src/contracts/session.ts:99-131`）；默认YOLO及sandbox关闭写在契约（`82-92`）。Claude硬带dangerously-skip（`runtimes/claude/session.ts:83-100`）；Codex依赖宿主global env sandbox override（`codex/session.ts:64-72`）；Grokalways-approve/yolo，ACP统一allow（`grok/session.ts:129-151`、`shared/acp/client-app.ts:38-44,81-87`）。

## 目标与非目标

目标：host通过一个**逐Session、typed、不可静默忽略**的只读请求，得到支持或显式unsupported，不在application拼vendor flags。权限值不依赖是否Herdr pane/headless。默认旧session行为和发布兼容策略由OAR维护者决定。

非目标：不是又一个adapter/registry，不在此提案重写stdout/projection；不让prompt自称只读；不解决全部OS/网络隔离；不加入Receipt launcher字段；不重置应用三轮预算或重试未知投递；不扩大真实model验证额度。

## 候选API

```ts
interface SessionOptions {
  // existing cwd/model/effort/resume/env/systemPrompt/appendSystemPrompt remain
  permissions?: { mode: 'read-only' };
}
```

- 请求read-only而不能落实，启动应拒绝`unsupported`/明确Error，不能忽略字段或转YOLO。这个选项表达对被审阅workspace的写禁止；native缓存/session存储位置需明确，不能称全机器零写入。
- **第一版不加通用命令allowlist、任意argv或writablePaths**。应用B中由SDK host出版结果。若以后要求native工具写精确Result文件，单独设计只读加通信例外，不能暗中把mode改成workspace-write。
- 不新增model/role语义字段；模型/effort仍走现有SessionOptions。readonly支持与验证必须分开：宣告支持不等于跨版本OS拒写已经认证。
- 所有其它runtimes/第三方driver对该字段如何拒绝，需要发布时统一约定；不要在三个driver落实但让其余driver静默忽略。此稿没有审阅那些driver，标unverified。

Pi 1.0参照：本地公开SDK已有noTools/tools/excludeTools与resourceLoader（`/Users/chris/Projects/byok-sdk/packages/client/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts:26-49`）；给出显式tools时只有列出的工具被启用。借鉴typed policy，而非复制vendor adapter。OAR此快照Pi依赖仍^0.99.1（`packages/oar/package.json:57-58`）；Pi1.0兼容需另验证，本文不宣称完成。

## 精确上游改动点 / runtime mapping

| path:line | change proposal | 保留/拒绝语义 |
|---|---|---|
| `packages/oar/src/contracts/session.ts:82-92,99-131` | 添加typed逐sessionpermissions选项；契约区分YOLO默认与显式readonly；说明工具限制/OS层/缓存/未知runtime | unsupported不能返回一个实际YOLO session |
| `packages/oar/src/runtimes/claude/session.ts:75-100` | readonly分支不传dangerously-skip；上游拥有原生tools/permission args，保守只允许Read/Grep/Glob，不给Bash/Write/Edit；严格MCP边界也由上游处理 | 不清空setting-sources丢网关env；不假称tool allowlist是OS隔离；hooks能否绕出工具边界仍需证据 |
| `packages/oar/src/runtimes/codex/session.ts:64-72` | typedpermissions先于全局env选launch sandbox_mode=read-only；每Session作用域，不能被inherit/danger降级 | OAR_CODEX_SANDBOX是现有host knob；用typedAPI替代并发串扰，不让SessionOptions.env假装能改变当前mode读取 |
| `packages/oar/src/runtimes/codex/app-server-client.ts:58-72` | 复用configOverrides与既有app-server启动；不写第二launcher | 真实exec使用launch -c，不复制thread sandbox shadow field |
| `packages/oar/src/runtimes/codex/open.ts:34-64` | 新建/恢复thread保持readonly请求，不让resume重建配置放松 | approvalPolicy不是OS权限；sandbox/exec/apply_patch须独立证明 |
| `packages/oar/src/runtimes/grok/session.ts:129-151` | readonly时不always-approve、不yoloMode:true；用已有profile.args(options)、sessionMeta(options) seam | 原生Grokreadonly mode/flag未读到，不编造参数；若native能绕过ACP门，拒绝支持声明 |
| `packages/oar/src/shared/acp/profile.ts:15-16,40-60` | 将typedreadonly选择沿已存在profile配置传递 | 不建Grok第二adapter |
| `packages/oar/src/shared/acp/session.ts:46-75` | 逐Session权限送到client/terminal host，保持原record provenance | 不是只改native flag |
| `packages/oar/src/shared/acp/client-app.ts:38-44,60-87` | readonly时不复用allowPermission的广泛allow；未知请求分类明确拒绝 | 无自动应答allow；请求/拒绝保持匹配records，不藏事实 |
| `packages/oar/src/shared/acp/terminal.ts:127-146` | readonly阻止任意terminal执行，或只委托独立已证外层隔离 | 不用字符串regex猜“git命令只读”；直接cwd/command自由执行不能绕过policy |

Grok若没有足够native控制，最小正确结果是readonly unsupported，不是在上游用更复杂的应用输出parser补救。

## 相邻但必须明确的actual-model缺口

现有Claudeprojection的assistant分支仅转content（`packages/oar/src/runtimes/claude/projection.ts:74-109,203-205`），model event来自system/init.model（`235-237`）。在网关alias≠后端model的环境，OAR Session.model能否作为actual_model仍未证。

候选相邻小修由OAR维护：若原生assistant报告实际model，应在既有projection中规范输出root-attributed model event，再由既有modelOf/Session.model消费（`observe/usage.ts:34-46`；`contracts/session.ts:232-235`）。不在repo-harness读取assistant native结构或扫JSONL，也不把requested alias写成实际Opus。该变化不是本地app adapter，不在本step实施；源码是否足以给actual-backend语义仍要核对。

## 测试（建议，当前未运行）

- 在已有 `tests/claude/claude-session-*.test.ts`、`tests/codex/codex-session-*.test.ts`、`tests/acp/acp-session.test.ts` / `acp-terminal.test.ts` / `acp-grok-wire-shapes.test.ts` 加readonly/default对照；这些文件只定位，未全部读完。
- fake native protocol fixtures检查readonly不产生bypass/always-allow；未知permission/method拒绝；resume不降级；同process并发不同Session不受globalenv串扰。
- 单独验证模型event归属与actual-vs-alias；root模型不被子agent或请求echo覆盖。
- native拒写探测与OS enforcement属于另行授权验证，不以mock参数值宣布已读。覆盖exec、apply_patch、ACPterminal/native写、hook/MCP及保护路径；未知标unsupported。
- 所有测试保留frameworkrecord/turnend语义，不用应用self-written sentinel/TUI/native-log parser。任何真实模型须额外额度/GO，现有17/17不重置。

## 成本粗估

按一名熟悉代码的工程师：共用契约/拒绝路径1–2人日；Claude1–2；Codex0.5–1；Grok2–4；fixture/docs1–2，合计 **5.5–11人日**（1+1+0.5+2+1=5.5；2+2+1+4+2=11）。重复的ACP共享改动计入共用/Grok，不重复加总。

actual-model相邻projection与测试另估0.5–1人日；仅在维护者接受该语义时做。Grok native能力可能不存在，调查结果可停在unsupported，不能用工作量承诺可实现。范围不含真实认证、多平台probe、Herdrhost与remote提交。

## 发布/rollback与本地状态

上游若接受，permission contract/driver/fixtures同一版本发布；只读请求不能在旧driver被静默吞掉。应用必须 pin/检查已支持版本，不造compat parser。

readonly失败保留拒绝/unsupported；不降级YOLO。B的外层保护不会因为A存在就自动撤销。Receipt schema和验证始终launcher-independent。

本文件只是本地草案，不是已提交issue/PR。当前没有修改OAR repo，没有创建provider/session，没有外部提交。

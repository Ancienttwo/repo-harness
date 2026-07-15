## 结论

**你的方向大约七成对，但“框架和协议定好后，能力转往 Skill 层扩展”这句话不对。**

更准确的表达应该是：

> **框架和协议稳定后，确定性能力继续沉到 Core/Application；CLI 和 MCP 只是不同适配器；Skill 扩展工作流、领域知识和业务策略。**

对于 `repo-harness`，我建议把分层重新表述为：

> **Core 管能力，CLI/MCP 管暴露，Skill 管编排，Hook 管触发与约束，Repo Contract 管状态。**

而不是：

> CLI 管能力，Skill 管工作流，MCP 管连接。

两者看起来只差一点，实际会决定项目以后会不会出现三套重复实现。

---

## 一、你引用的观点，哪里对

### 1. “一个 API 一个 Skill”基本是反模式

这一点我赞成。

例如：

* `get_record`
* `create_record`
* `update_record`
* `delete_record`

这些应该是 CLI 子命令或 MCP tools，而不是四个 Skill。

Skill 更适合描述：

* 根据 Sprint 文档准备执行任务
* 根据当前仓库状态选择验证路径
* 完成变更后生成 review 和 handoff
* 根据风险决定 lite、standard 或 strict 流程

也就是说：

```text
原子操作 → Capability / Tool
多个操作 + 业务判断 + 领域约定 → Skill
```

`repo-harness` 现在其实已经部分遵循了这个方向：根 `SKILL.md` 只暴露 `setup / plan / execute / verify / handoff` 五类工作流入口，并要求先通过 `repo-harness state resolve --json` 获取权威状态。这个设计明显比“一条 CLI 命令一个完整 Skill”更合理。([GitHub][1])

### 2. Skill 应以任务为中心，而不是端点为中心

也基本正确。

不过，“Skill 就只能是工作流”说得过窄。官方定义中，Skill 是带有 `SKILL.md` 的版本化文件包，可以封装流程、约定、专业知识、参考材料和可执行脚本；多步骤工作流只是其中一种主要形态。([OpenAI Developers][2])

所以正确的判断标准不是：

> 这个 Skill 是不是调用了多个 API？

而是：

> 它有没有提供超出底层工具本身的任务语义、领域知识、判断规则或可复用流程？

一个只执行一条命令的 Skill，也可能合理，例如它负责解释复杂参数、风险边界和证据要求；但一个只是把 `foo update-record` 改名成 `update-record-skill` 的 Skill，确实没有价值。

### 3. 有 Shell 时，CLI 经常比 MCP 简单

这也成立，但只是经验判断，不是架构定律。

CLI 的优势通常是：

* 容易人工调试
* 管道和组合自然
* 安装模型简单
* 本地执行开销低
* 日志和退出码容易观察
* Agent 已经有 Shell 时，不需要额外连接层

所以 `repo-harness` 以 CLI 作为主要本地执行面是合理的。

---

## 二、这套观点里我最想批判的地方

## 1. CLI 不是“能力层”，CLI 是适配器层

这是最重要的修正。

假设有一个能力：

```text
根据当前任务、路径风险、合约状态计算有效 workflow profile
```

它真正的实现不应该属于：

```text
src/cli/commands/state.ts
```

而应该属于类似：

```text
src/application/resolve-effective-state.ts
```

然后：

```text
CLI  → 调用 resolveEffectiveState()
MCP  → 调用 resolveEffectiveState()
Hook → 调用 resolveEffectiveState()
```

否则很容易出现：

```text
CLI 有一套状态判断
MCP 又实现一套
Hook shell 里还有一套
Skill 文本里再描述一套
```

最后四者逐渐漂移。

所以更准确的架构是：

```text
             Skill / Agent / Human
                      │
                编排和决策指导
                      │
              Application / Core
           确定性能力、状态机、校验
             ╱          │          ╲
           CLI         MCP        Hooks
        Shell 适配    协议适配    事件适配
             ╲          │          ╱
             Repo Contract / Artifacts
                 持久状态与证据
```

CLI 可以是**主要能力入口**，但不能成为**能力所有者**。

---

## 2. “Skill 三到五个足够”不能当成硬规则

对于顶层认知入口，三到五个非常好。

`repo-harness` 当前这五个入口：

```text
setup
plan
execute
verify
handoff
```

我认为是很好的顶层模型。([GitHub][1])

但不能进一步推导出：

> 整个项目最多只能有五个 Skill。

更合理的是：

```text
5 个 canonical workflow skills
N 个按需加载的领域 skill/reference package
M 个兼容旧宿主的 command aliases
```

真正应该控制的是：

* Skill 之间是否触发范围重叠
* 是否复制底层业务逻辑
* 是否只是给命令换名字
* 是否把大量无关说明注入上下文
* 是否让 Agent 不知道该选择哪个
* 是否存在多个相互冲突的 source of truth

所以问题不在绝对数量，而在于**命名空间、触发语义和职责重叠**。

---

## 3. “MCP 只适合没有 Shell 的环境”也太窄

MCP 不只是“给没有 Shell 的 Agent 接个线”。

MCP 官方架构不仅包括 transport，还包括：

* 生命周期和能力协商
* tools、resources、prompts
* 结构化输入输出
* 动态发现
* 通知
* 本地 STDIO 和远程 HTTP
* 授权和连接管理

因此，“MCP 管连接”可以作为一句方便记忆的口号，但不是完整定义。([Model Context Protocol][3])

即使已有 Shell，以下情况仍然适合 MCP：

* 需要 JSON Schema 级参数约束
* 需要宿主统一授权
* 需要远程访问
* 需要乐观并发控制
* 需要审计日志
* 需要稳定 snapshot
* 需要资源发现而不允许任意 Shell
* 需要明确限制哪些写操作可用

`repo-harness` 自己的 MCP 就是反例：它不是简单地把 CLI 搬到 MCP，而是提供 repo whitelist、`read_write` 授权、`expected_sha256`、`REVISION_CONFLICT`、atomic rename、mutation audit、snapshot consistency 等安全和一致性语义。([GitHub][4])

所以我会这样说：

> 有 Shell 时，CLI 通常是默认适配器；但当结构化契约、授权、并发、一致性或远程访问成为核心需求时，MCP 仍然有独立价值。

---

## 4. “完整的 `--help` 足够 Agent 探索”也有点乐观

`--help` 很重要，但不足以成为稳定的 Agent contract。

一个真正 Agent-friendly 的 CLI，至少还需要：

```text
--json
稳定的字段 schema
明确的 exit code
机器可识别的 error code
幂等语义
dry-run
写操作 precondition
超时和取消语义
版本信息
能力发现接口
副作用声明
```

否则 Agent 虽然能“看到命令”，却不知道：

* 这个命令会不会写文件
* 能否安全重试
* 输出是否稳定
* 失败后是否已产生部分副作用
* 两次调用之间状态是否已经过期
* 哪些错误应重试，哪些应停止

因此我赞成 CLI-first，但不赞成 help-first。应该是：

> **Schema-first，CLI-default。**

---

# 三、repo-harness 目前其实已经站在正确方向上

README 已经明确把公开的 `assets/skill-commands/` 称为 **command facades**，并说明它们主要保留宿主的 Skill discovery 兼容性，真正执行仍由 CLI 和 hooks 负责。也就是说，至少设计意图上，这些并不是十九套独立业务实现。([GitHub][5])

项目的核心状态观也比较正确：

* 持久事实放在仓库文件中
* plan、contract、review、checks、handoff 是 authority
* hooks 是加速器和 guardrail
* host adapter 负责把宿主事件路由进来

这些原则比单纯争论 CLI、Skill、MCP 谁“更高级”重要得多。([GitHub][5])

因此我认为，`repo-harness` 现在的问题不是“要不要开始向 Skill 层迁移能力”，而是：

> **如何把已经形成的正确设计意图，变成不可绕过的代码结构和扩展协议。**

---

# 四、我对当前项目的主要批评

这里只根据公开目录和接口判断，不等同于逐行代码审计。

## 1. 当前 Core 看起来太薄，CLI/MCP 看起来太厚

公开目录中，`src/core` 目前主要只有 `adoption/` 和 `source-projection.ts`；与此同时，`src/cli/commands` 和 `src/cli/mcp` 已经包含大量状态、策略、授权、reader、workspace、audit、process-session 等实现。([GitHub][6])

更值得警惕的是，`interfaces/types.ts` 目前仍然只是一个占位文件，注释说未来放 shared API schemas、event schemas、DTO 和 boundary types，但实际还是 `export {}`。([GitHub][7])

这说明项目虽然在产品概念上已经有“协议”，但在代码结构上，统一的能力边界还没有完全结晶。

风险是：

```text
CLI 命令实现业务规则
MCP tools 实现另一部分业务规则
hooks 再维护自己的决策表
Skill 文本描述第四份规则
```

你们最近已经把 prompt intent 和 workflow state 的判断，从散落的 shell 分支收回 TypeScript decision engine；这是正确方向。([GitHub][5])

下一步应该继续做相同的事情：**把适配器里的确定性业务能力逐渐抽到 application/core。**

---

## 2. `skill-commands` 的数量不是直接问题，但命名会制造误解

当前公开面包含 planning、review、PRD、sprint、goal、ship、init、migrate、upgrade、capability、architecture、handoff、deploy、repair、check、scaffold 等多个 command facades。([GitHub][5])

从实现角度，它们可能只是薄 facade，没有严重问题。

但从用户认知角度，所有东西都叫 Skill，就容易产生你引用的那种混乱：

```text
到底哪些是工作流？
哪些只是 slash command alias？
哪些有独立领域知识？
哪些只是执行一条 CLI？
```

我建议在文档和目录语义上正式区分：

```text
Canonical Skills
  setup
  plan
  execute
  verify
  handoff

Agent Command Facades / Aliases
  repo-harness-prd
  repo-harness-sprint
  repo-harness-check
  ...

Domain Skill Packages
  architecture-review
  product-planning
  merge-gate
  ...
```

可以保留宿主要求的 `SKILL.md` 文件格式，但不要在架构文档中把三者都称为同一种 Skill。

---

## 3. 现在适合“冻结不变量”，不适合宣布框架已经完成

截至 **2026 年 7 月 14 日**，项目版本线是 `0.10.0`，这一版本刚引入 risk-aware harness kernel、统一 effective-state resolver、circuit breakers 和新的 install profiles。([GitHub][8])

这意味着框架正在收敛，但仍处在重要边界调整期。

因此建议冻结的是：

### 可以冻结

* Repo artifacts 的 authority 和优先级
* `state resolve` 的核心语义
* 五个顶层 action
* capability 的输入、输出和错误模型
* mutation、idempotency、precondition 语义
* risk 和 authorization metadata
* CLI/MCP/Hook 必须复用同一能力实现
* schema versioning 和 migration 规则

### 暂时不要冻结

* Skill 的具体总数
* 所有 CLI 命令名称
* command facade 的组织方式
* MCP tool 的最终数量
* workflow recipe 的具体步骤
* lite/standard/strict 的全部细节
* 宿主相关的兼容 alias

一句话：

> **冻结协议，不冻结产品表面；冻结不变量，不冻结工作流演进。**

---

# 五、我建议采用的扩展判定规则

以后每加一个需求，按下面判断它应该进入哪层。

## 进入 Core/Application

只要它具有以下任一特征：

* 确定性状态转换
* 文件或仓库副作用
* 鉴权和权限判断
* ID、路径、版本解析
* 风险计算
* 输入校验
* 幂等和重试语义
* 并发冲突处理
* 需要 CLI 和 MCP 共同使用
* 需要精确单元测试

例如：

```text
resolve effective state
capture approved plan
validate contract
compute risk profile
apply guarded patch
create handoff artifact
run required checks
```

## 进入 CLI Adapter

当能力需要：

* 本地 Shell 调用
* 人工调试
* 脚本组合
* stdin/stdout
* exit code
* 本地文件系统访问

CLI 只负责：

```text
参数解析
输出格式
终端交互
退出码
调用 application service
```

不应该拥有核心状态机。

## 进入 MCP Adapter

当同一能力需要：

* 无 Shell 宿主
* 结构化工具发现
* JSON Schema
* 远程调用
* 授权边界
* snapshot
* audit
* optimistic concurrency
* 限制任意进程执行

MCP 也不应该重新实现能力，只负责协议映射。

## 进入 Skill

当需求是：

* 编排多个能力
* 提供领域判断
* 描述任务完成标准
* 选择何时调用什么工具
* 注入团队约定
* 引用模板和参考资料
* 处理不完全确定、需要模型判断的步骤

例如：

```text
根据 PRD 生成 Sprint
根据风险状态决定执行和验证路径
完成实现后组织 review、check 和 handoff
根据架构规则判断需要更新哪些设计文档
```

## 进入 Hook

当需求是：

* 在特定生命周期自动触发
* 进行确定性检查
* 阻止危险操作
* 自动记录观察结果
* 注入或恢复必要上下文

Hooks 本来就适合生命周期自动化与确定性约束，而不适合承载完整业务工作流。([Claude Platform Docs][9])

---

# 六、最值得做的下一步：统一 Capability Registry

我认为 `repo-harness` 下一阶段最关键的不是继续写更多 Skill，而是形成一个版本化的能力注册表。

概念上可以类似：

```ts
interface CapabilitySpec<I, O> {
  id: string
  version: string

  inputSchema: JsonSchema
  outputSchema: JsonSchema
  errorCodes: string[]

  mutatesRepo: boolean
  idempotency: "safe" | "conditional" | "unsafe"
  riskFloor: "lite" | "standard" | "strict"

  requiresExpectedRevision: boolean
  requiredAuthority: string[]

  adapters: {
    cli?: CliBinding
    mcp?: McpBinding
    hook?: HookBinding
  }

  execute(input: I, context: ExecutionContext): Promise<O>
}
```

然后从同一个 registry 派生：

```text
CLI 命令和 --help
CLI --json-schema
MCP tool schema
MCP authorization policy
Skill 可引用的能力清单
Hook route binding
文档
测试 fixture
```

这样才能真正做到：

```text
一个能力，一份实现
多个适配器，多种调用方式
多个 Skill，多种任务编排
```

而不是：

```text
CLI 一份实现
MCP 一份实现
Hook 一份实现
Skill 再写一份自然语言实现
```

---

# 七、给 repo-harness 的具体架构建议

我会采用下面的目标结构，不一定要立即物理搬目录，但依赖方向必须如此：

```text
src/
  contracts/
    workflow/
    capability/
    state/
    errors/

  application/
    resolve-state/
    planning/
    verification/
    handoff/
    repo-mutation/

  adapters/
    cli/
    mcp/
    hooks/

skills/
  setup/
  plan/
  execute/
  verify/
  handoff/

agent-command-facades/
  repo-harness-prd/
  repo-harness-sprint/
  repo-harness-check/
  ...
```

同时建立一条硬规则：

> `adapters/cli`、`adapters/mcp` 和 hooks 不允许相互调用，也不允许各自实现相同的状态转换；它们只能依赖 application contracts。

例如，不建议：

```text
MCP → spawn repo-harness CLI → CLI 实现业务
```

这可以作为早期复用手段，但长期会产生：

* 多余序列化
* 错误码丢失
* 取消和超时难处理
* CLI 文本输出变更破坏 MCP
* 测试层级混乱

长期目标应该是：

```text
CLI ─┐
MCP ─┼→ Application Service → Repo State
Hook ─┘
```

最后再加一组 adapter parity tests：

```text
同一 capability 经 CLI 和 MCP 调用：
- 产生相同状态转换
- 返回相同 error code
- 遵守相同 risk floor
- 遵守相同 authorization
- 遵守相同 revision precondition
```

---

## 最终判断

你的核心直觉是对的：

> 不要把底层端点机械包装成大量 Skill；Skill 应该提供任务级价值。

但对于 `repo-harness`，正确的落点不是：

> 框架定好以后，把能力转到 Skill 扩展。

而是：

> **框架收敛以后，把确定性能力统一沉入 Application Core；把 CLI、MCP 和 Hook 变成薄适配器；把需要模型判断、领域约定和跨能力编排的部分放进 Skill。**

我建议直接把下面这句话写成项目 ADR 的第一条架构原则：

> **A capability is implemented once in the application core. CLI and MCP expose it, hooks trigger or guard it, and Skills orchestrate it. Repository artifacts and the effective-state resolver remain the source of truth.**

中文版本：

> **能力只在应用内核实现一次；CLI 与 MCP 负责暴露，Hook 负责触发和约束，Skill 负责编排；仓库工件与有效状态解析器是最终事实来源。**

[1]: https://github.com/Ancienttwo/repo-harness/blob/main/SKILL.md "repo-harness/SKILL.md at main · Ancienttwo/repo-harness · GitHub"
[2]: https://developers.openai.com/api/docs/guides/tools-skills "
  Skills | OpenAI API
"
[3]: https://modelcontextprotocol.io/docs/learn/architecture "Architecture overview - Model Context Protocol"
[4]: https://github.com/Ancienttwo/repo-harness "GitHub - Ancienttwo/repo-harness: File-backed workflow harness for reliable Claude Code and Codex sessions. · GitHub"
[5]: https://github.com/Ancienttwo/repo-harness/blob/main/README.zh-CN.md "repo-harness/README.zh-CN.md at main · Ancienttwo/repo-harness · GitHub"
[6]: https://github.com/Ancienttwo/repo-harness/tree/main/src/core "repo-harness/src/core at main · Ancienttwo/repo-harness · GitHub"
[7]: https://github.com/Ancienttwo/repo-harness/blob/main/interfaces/types.ts "repo-harness/interfaces/types.ts at main · Ancienttwo/repo-harness · GitHub"
[8]: https://github.com/Ancienttwo/repo-harness/blob/main/docs/CHANGELOG.md "repo-harness/docs/CHANGELOG.md at main · Ancienttwo/repo-harness · GitHub"
[9]: https://docs.anthropic.com/en/docs/claude-code/hooks-guide "Automate actions with hooks - Claude Code Docs"

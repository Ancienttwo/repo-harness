# Recommended Claude Code Plugins

Plugin sources, descriptions, and installation guide for project initialization.

---

## Essential Plugins (Must-Have)

These plugins are critical for professional development workflows:

| Plugin | Source | Repository | Description |
|--------|--------|------------|-------------|
| `feature-dev` | Official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev) | Guided feature development with codebase understanding and architecture focus |
| `frontend-design` | Official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) | Create distinctive, production-grade frontend interfaces with high design quality |
| `code-simplifier` | Official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier) | Simplifies and refines code for clarity, consistency, and maintainability |
| `code-review` | Official | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review) | Reviews code for bugs, logic errors, security vulnerabilities, and quality issues |
| `superpowers@superpowers-marketplace` | Marketplace | [obra/superpowers](https://github.com/obra/superpowers) | Default workflow booster: planning/execution skills and command bundles for agentic coding loops |
| `ast-grep` | Community | [ast-grep/claude-skill](https://github.com/ast-grep/claude-skill) | AST-based code search - "Find all async functions without error handling" |

---

## Official Anthropic Plugins

From [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins):

### Development Tools

| Plugin | Description |
|--------|-------------|
| `agent-sdk-dev` | Development tools for the Agent SDK |
| `plugin-dev` | Plugin development tools |
| `commit-commands` | Git commit command utilities |
| `pr-review-toolkit` | Pull request review toolkit |
| `security-guidance` | Security best practices guidance |
| `hookify` | **⭐推荐** 自动创建hooks，无需手动编辑JSON |

### Automation & Style Plugins

| Plugin | Description |
|--------|-------------|
| `ralph-loop` | Iterative auto-loop until task complete - TDD workflow automation |
| `explanatory-output-style` | 让 Claude 在写代码时提供教育性解释 |
| `learning-output-style` | 学习模式输出风格 |

### hookify - 智能 Hook 管理器 ⭐

**Repository:** [anthropics/claude-plugins-official/plugins/hookify](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify)

自动化创建 hooks 的神器，无需手动编辑 JSON 配置：

**核心功能:**
- 分析对话自动发现不良行为并生成规则
- 简单的 markdown 配置格式 (YAML frontmatter)
- 支持 `warn` (警告) / `block` (阻止) 两种模式
- 即时生效，无需重启

**使用示例:**
```bash
/hookify "阻止rm -rf命令"           # 从描述创建规则
/hookify                            # 分析最近对话，自动发现问题行为
/hookify:list                       # 查看所有规则
/hookify:configure                  # 启用/禁用规则
```

**规则示例 (.claude/block-dangerous-rm.local.md):**
```yaml
---
name: block-dangerous-rm
enabled: true
event: bash
pattern: rm\s+-rf
action: block
---

⚠️ **Dangerous rm command detected!**
This command could delete important files.
```

**支持的事件类型:**
- `bash` - Bash 命令触发
- `file` - Edit/Write 文件操作触发
- `stop` - Claude 想要停止时触发
- `prompt` - 用户提交 prompt 时触发
- `all` - 所有事件

**典型用例:**
- 阻止危险命令 (`rm -rf`, `DROP TABLE`)
- 强制测试 (停止前必须运行测试)
- 保护敏感文件 (`.env`, credentials)
- 代码质量检查 (警告 `console.log`, hardcoded secrets)

**ralph-loop** implements an iterative, self-referential AI loop. It automatically re-feeds prompts until a completion promise is detected.

**Usage:**
```bash
/ralph-loop "Build a REST API for todos. Requirements: CRUD, validation, tests. Output <promise>COMPLETE</promise> when done." --completion-promise "COMPLETE" --max-iterations 50
```

**Best for:**
- Well-defined tasks with clear success criteria
- TDD workflows (write tests → implement → run tests → fix → repeat)
- Greenfield projects with automatic verification
- Tasks you can walk away from

**Not good for:**
- Tasks requiring human judgment
- Unclear success criteria
- Production debugging

### Language Server Plugins

Choose based on your tech stack:

| Plugin | Language | Use When |
|--------|----------|----------|
| `typescript-lsp` | TypeScript/JavaScript | React, Node.js, Vite projects |
| `pyright-lsp` | Python | FastAPI, Django, ML projects |
| `rust-analyzer-lsp` | Rust | Rust backend, WASM projects |
| `gopls-lsp` | Go | Go microservices |
| `clangd-lsp` | C/C++ | Native applications |
| `jdtls-lsp` | Java | Enterprise Java, Spring |
| `kotlin-lsp` | Kotlin | Android, JVM projects |
| `swift-lsp` | Swift | iOS/macOS development |
| `php-lsp` | PHP | Laravel, WordPress |
| `lua-lsp` | Lua | Game development, Neovim |
| `csharp-lsp` | C# | .NET, Unity |

#### LSP Auto-Selection by Project Type

When using `/project-init`, LSP plugins are automatically selected based on project type:

| Project Type | Plan | Auto-Selected LSP |
|--------------|------|-------------------|
| C-Side with SEO (Remix) | Plan A | `typescript-lsp` |
| Traditional Enterprise | Plan B | `jdtls-lsp` |
| B2B SaaS / Internal Tools | Plan C | `typescript-lsp` |
| Monorepo | Plan D | `typescript-lsp` |
| Landing Page / Marketing | Plan E | `typescript-lsp` |
| Mobile App (Expo) | Plan F | `typescript-lsp` |
| AI Quantitative Trading | Plan G | `pyright-lsp` |
| Financial Trading (FIX/Rust) | Plan H | `rust-analyzer-lsp` |
| Web3 DApp (EVM) | Plan I | `typescript-lsp` |
| AI Coding Agent / TUI | Plan J | `typescript-lsp` |
| Custom Configuration | Plan K | `typescript-lsp` |

---

## External Plugins (第三方集成)

From [claude-plugins-official/external_plugins](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins):

### 项目管理 & 协作

| Plugin | Description |
|--------|-------------|
| `linear` | Linear 项目管理集成 - 查看/创建 issues, 管理 sprints |
| `asana` | Asana 任务管理集成 |
| `github` | GitHub API 深度集成 - Issues, PRs, Actions |
| `gitlab` | GitLab API 集成 - MRs, Pipelines |
| `slack` | Slack 消息/通知集成 |

### 代码审查 & 质量

| Plugin | Description |
|--------|-------------|
| `greptile` | **⭐推荐** AI 代码审查 - 自动审PR，解析评论 |

**greptile** 是一个 AI 代码审查 Agent，自动审查 GitHub/GitLab PR：

```bash
# 查看 Greptile 在当前 PR 上的评论
"Show me Greptile's comments on my current PR"

# 触发新的代码审查
"Trigger a Greptile review on this branch"
```

设置: 在 [greptile.com](https://greptile.com) 注册，设置 `GREPTILE_API_KEY` 环境变量。

### 后端服务集成

| Plugin | Description |
|--------|-------------|
| `supabase` | Supabase 数据库/Auth/Storage 集成 |
| `firebase` | Firebase 服务集成 - Firestore, Auth, Functions |
| `stripe` | Stripe 支付集成 - 订阅, 账单, Webhooks |

### 测试 & 自动化

| Plugin | Description |
|--------|-------------|
| `playwright` | Playwright 浏览器自动化测试 |

### 其他工具

| Plugin | Description |
|--------|-------------|
| `context7` | 获取最新库文档 (已集成为 MCP Server) |
| `laravel-boost` | Laravel PHP 框架增强 |
| `serena` | 代码质量分析 |

---

## Knowledge Work Plugins (Agent Role Plugins)

From [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) — Anthropic 官方知识工作插件，将 Claude 变成特定角色的专家 Agent。

**Install:**
```bash
# Add the marketplace
claude plugin marketplace add anthropics/knowledge-work-plugins

# Install specific plugin
claude plugin install <plugin-name>@knowledge-work-plugins
```

### Plugin Catalog

| Plugin | Description | Connectors | Commands | Skills |
|--------|-------------|------------|----------|--------|
| **productivity** | 任务管理、日历、日常工作流、个人上下文记忆 | Slack, Notion, Asana, Linear, Jira, Monday, ClickUp, Microsoft 365 | `start`, `update` | task-management, memory-management |
| **sales** | 客户研究、通话准备、pipeline管理、外联邮件 | Slack, HubSpot, Close, Clay, ZoomInfo, Notion, Jira, Fireflies, Microsoft 365 | `call-summary`, `forecast`, `pipeline-review` | account-research, call-prep, competitive-intelligence, draft-outreach, daily-briefing |
| **customer-support** | 工单分流、回复起草、升级管理、知识库 | Slack, Intercom, HubSpot, Guru, Jira, Notion, Microsoft 365 | `draft-response`, `escalate`, `kb-article`, `research`, `triage` | ticket-triage, response-drafting, escalation, knowledge-management, customer-research |
| **product-management** | 写 spec、规划路线图、综合用户研究 | Slack, Linear, Asana, Monday, ClickUp, Jira, Notion, Figma, Amplitude, Pendo, Intercom, Fireflies | `write-spec`, `roadmap-update`, `synthesize-research`, `competitive-brief`, `metrics-review`, `stakeholder-update` | feature-spec, roadmap-management, user-research-synthesis, competitive-analysis, metrics-tracking, stakeholder-comms |
| **marketing** | 内容创作、活动策划、品牌声音、竞品分析 | Slack, Canva, Figma, HubSpot, Amplitude, Notion, Ahrefs, SimilarWeb, Klaviyo | `draft-content`, `campaign-plan`, `brand-review`, `competitive-brief`, `email-sequence`, `performance-report`, `seo-audit` | content-creation, campaign-planning, brand-voice, competitive-analysis, performance-analytics |
| **legal** | 合同审查、NDA 分流、合规、风险评估 | Slack, Box, Egnyte, Jira, Microsoft 365 | `review-contract`, `triage-nda`, `brief`, `respond`, `vendor-check` | contract-review, nda-triage, compliance, legal-risk-assessment, meeting-briefing, canned-responses |
| **finance** | 日记账、对账、财务报表、差异分析、审计 | Snowflake, Databricks, BigQuery, Slack, Microsoft 365 | `journal-entry`, `reconciliation`, `income-statement`, `variance-analysis`, `sox-testing` | journal-entry-prep, reconciliation, financial-statements, variance-analysis, close-management, audit-support |
| **data** | SQL查询、数据探索、可视化、仪表板 | Snowflake, Databricks, BigQuery, Hex, Amplitude, Jira | `write-query`, `explore-data`, `analyze`, `create-viz`, `build-dashboard`, `validate` | sql-queries, data-exploration, data-visualization, statistical-analysis, data-validation, interactive-dashboard-builder, data-context-extractor |
| **enterprise-search** | 跨工具搜索 — email、chat、docs、wikis | Slack, Notion, Guru, Jira, Asana, Microsoft 365 | `search`, `digest` | search-strategy, knowledge-synthesis, source-management |
| **bio-research** | 生命科学 R&D — 文献搜索、基因组分析 | PubMed, BioRender, bioRxiv, ClinicalTrials.gov, ChEMBL, Synapse, Wiley, Owkin, Open Targets, Benchling | `start` | scientific-problem-selection, single-cell-rna-qc, scvi-tools, nextflow-development, instrument-data-to-allotrope |
| **cowork-plugin-management** | 创建和自定义新插件 | — | — | cowork-plugin-customizer |

### Agent 场景推荐

根据你正在构建的 Agent 类型，推荐安装对应的知识工作插件：

| Agent 场景 | 推荐 Plugins | 理由 |
|-----------|-------------|------|
| **客服 Agent** | `customer-support`, `enterprise-search` | 工单自动分流 + 跨知识库搜索 |
| **销售 Agent** | `sales`, `productivity` | 客户研究 + 日常工作流管理 |
| **PM Agent** | `product-management`, `data` | 写 spec + 数据分析 |
| **营销 Agent** | `marketing`, `data` | 内容创作 + 效果分析 |
| **法务 Agent** | `legal`, `enterprise-search` | 合同审查 + 内部搜索 |
| **财务 Agent** | `finance`, `data` | 对账报表 + SQL 查询 |
| **数据分析 Agent** | `data`, `enterprise-search` | 全栈数据分析 |
| **科研 Agent** | `bio-research` | 生命科学研发 |
| **全能助手 Agent** | `productivity`, `enterprise-search` | 基础生产力 + 搜索 |

### Plugin 结构说明

每个 plugin 遵循统一结构：
```
plugin-name/
├── .claude-plugin/plugin.json   # 清单文件
├── .mcp.json                    # MCP 工具连接配置
├── commands/                    # 用户显式触发的斜杠命令
└── skills/                      # Claude 自动调用的领域知识
```

- **Skills**: 编码领域专业知识，Claude 在相关场景自动调用
- **Commands**: 显式操作（如 `/finance:reconciliation`, `/data:write-query`）
- **Connectors**: 通过 MCP 连接外部工具（CRM、项目管理、数据仓库等）

所有组件都是纯文件 — markdown + JSON，无需代码、无需基础设施。

---

## Community Plugins

### ast-grep Skill

**Repository:** [ast-grep/claude-skill](https://github.com/ast-grep/claude-skill)

**Capabilities:**

- Structure-aware code searching across JS, Python, Rust, Go, Java, C/C++, Ruby, PHP
- Pattern matching with metavariables (`$VAR`)
- Contextual queries (e.g., find setState inside useEffect)
- Code quality checks (unused vars, missing null checks)

**Prerequisites:** Install ast-grep CLI first:

```bash
# macOS
brew install ast-grep

# npm
npm install -g @ast-grep/cli

# cargo
cargo install ast-grep
```

### Obsidian Skills

From [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills):

| Plugin | Description |
|--------|-------------|
| `obsidian-markdown` | Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts |
| `obsidian-bases` | Support for Obsidian Bases syntax for structured data |
| `json-canvas` | Work with JSON Canvas format for visual note organization |

---

## Hook Configuration Templates

### Standard Hooks (Recommended)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '\u001b[1;33m🛡️ Quality guard active...\u001b[0m'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo '\u001b[0;34m📝 Code modification detected\u001b[0m'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash\\(.*test.*\\)",
        "hooks": [
          {
            "type": "command",
            "command": "echo '\u001b[0;32m✅ Tests completed\u001b[0m'"
          }
        ]
      }
    ]
  }
}
```

### Minimal Hooks

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '\u001b[1;33m🛡️ Quality guard active...\u001b[0m'"
          }
        ]
      }
    ]
  }
}
```

### Custom Hook Examples

**Anti-simplification guard:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT=\"$repo\" bash \"$repo/.ai/hooks/run-hook.sh\" anti-simplification.sh"
          }
        ]
      }
    ]
  }
}
```

**Build validation:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write\\(.*\\.tsx?\\)",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsc --noEmit 2>&1 | head -20"
          }
        ]
      }
    ]
  }
}
```

**Biome lint/format on save (推荐):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write\\(.*\\.(ts|tsx|js|jsx|json)\\)",
        "hooks": [
          {
            "type": "command",
            "command": "bunx biome check --write \"$CLAUDE_FILE_PATH\" 2>&1 | head -10"
          }
        ]
      }
    ]
  }
}
```

**Biome CI check (严格模式):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write\\(.*\\.(ts|tsx|js|jsx)\\)",
        "hooks": [
          {
            "type": "command",
            "command": "bunx biome ci \"$CLAUDE_FILE_PATH\" 2>&1 | head -20"
          }
        ]
      }
    ]
  }
}
```

---

## Installation Commands

### Quick Install (Essential Plugins)

```bash
# Run the setup script
AGENTIC_DEV_ROOT="${AGENTIC_DEV_ROOT:-$HOME/Projects/agentic-dev}"
bash "$AGENTIC_DEV_ROOT/scripts/setup-plugins.sh"
```

This default flow also adds marketplace `obra/superpowers-marketplace` and enables `superpowers@superpowers-marketplace`.

### Manual Installation

```bash
CLAUDE_DIR="$HOME/.claude"
SKILLS_DIR="$CLAUDE_DIR/skills"

# Clone official plugins
git clone https://github.com/anthropics/claude-plugins-official.git "$CLAUDE_DIR/plugins-official"

# Install essential plugins
cp -r "$CLAUDE_DIR/plugins-official/plugins/feature-dev" "$SKILLS_DIR/"
cp -r "$CLAUDE_DIR/plugins-official/plugins/frontend-design" "$SKILLS_DIR/"
cp -r "$CLAUDE_DIR/plugins-official/plugins/code-simplifier" "$SKILLS_DIR/"
cp -r "$CLAUDE_DIR/plugins-official/plugins/code-review" "$SKILLS_DIR/"

# Install ast-grep skill
git clone https://github.com/ast-grep/claude-skill.git "$CLAUDE_DIR/ast-grep-skill"
cp -r "$CLAUDE_DIR/ast-grep-skill"/*.md "$SKILLS_DIR/ast-grep/" 2>/dev/null || \
  mkdir -p "$SKILLS_DIR/ast-grep" && cp "$CLAUDE_DIR/ast-grep-skill"/*.md "$SKILLS_DIR/ast-grep/"

# Install Superpowers marketplace plugin (default)
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace
```

---

## Plugin Categories by Project Type

### B2B SaaS / Internal Tools (Plan C)

**Essential:**
- `feature-dev` - Feature development workflow
- `frontend-design` - UI/UX implementation
- `code-simplifier` - Code maintainability
- `code-review` - Quality assurance

**Recommended:**
- `typescript-lsp` - TypeScript support
- `commit-commands` - Git workflow

### AI/ML Projects (Plan G)

**Essential:**
- `feature-dev`
- `code-review`
- `ast-grep` - Complex pattern matching

**Recommended:**
- `pyright-lsp` - Python support
- `security-guidance` - API security

### Mobile Development (Plan F)

**Essential:**
- `feature-dev`
- `frontend-design`
- `code-simplifier`

**Recommended:**
- `typescript-lsp` - React Native/Expo
- `kotlin-lsp` - Android Native/KMP
- `swift-lsp` - iOS Native/SwiftUI

### TUI Terminal / AI Coding Agent (Plan J)

**Essential:**
- `feature-dev`
- `code-simplifier`
- `agent-sdk-dev` - Claude Agent SDK 集成

**Recommended:**
- `typescript-lsp` - OpenTUI/Ink项目
- `rust-analyzer-lsp` - Ratatui/Tauri项目

### Documentation-Heavy Projects

**Essential:**
- `code-simplifier`

**Recommended:**
- `obsidian-markdown`
- `obsidian-bases`
- `json-canvas`

### Agent Projects (构建 AI Agent)

When the project involves building an AI Agent for a specific domain, recommend the corresponding knowledge-work plugin:

| Agent Domain | Recommended Plugin | Install Command |
|-------------|-------------------|-----------------|
| Customer Support Agent | `customer-support` + `enterprise-search` | `claude plugin install customer-support@knowledge-work-plugins` |
| Sales Agent | `sales` + `productivity` | `claude plugin install sales@knowledge-work-plugins` |
| PM Agent | `product-management` + `data` | `claude plugin install product-management@knowledge-work-plugins` |
| Marketing Agent | `marketing` + `data` | `claude plugin install marketing@knowledge-work-plugins` |
| Legal Agent | `legal` + `enterprise-search` | `claude plugin install legal@knowledge-work-plugins` |
| Finance Agent | `finance` + `data` | `claude plugin install finance@knowledge-work-plugins` |
| Data Analysis Agent | `data` + `enterprise-search` | `claude plugin install data@knowledge-work-plugins` |
| Bio Research Agent | `bio-research` | `claude plugin install bio-research@knowledge-work-plugins` |
| General Productivity Agent | `productivity` + `enterprise-search` | `claude plugin install productivity@knowledge-work-plugins` |

**Why use these for Agent development:**
- Each plugin contains production-ready **skills** (domain workflows) and **commands** (explicit actions) that serve as reference implementations
- The `.mcp.json` configs show how to wire external tools (CRM, project trackers, data warehouses) via MCP
- Skill files encode domain best practices that can be adapted for your Agent's behavior
- Pure markdown + JSON, no code — easy to read, customize, and integrate

---

## Permissions Configuration

Default execution model in this skill is **Plan-only (recommended)**.

Optional runtime profiles:
- **Plan-only (recommended)**:
  - Codex: `sandbox_mode=platform-default, approval_policy=on-failure`
  - Claude: default permissions
- **Plan + Permissionless**:
  - Codex: `sandbox_mode=danger-full-access, approval_policy=never`
  - Claude: `--dangerously-skip-permissions`
- **Standard (ask before each action)**:
  - Codex: `sandbox_mode=platform-default, approval_policy=always`
  - Claude: default permissions

Safety baseline remains `git worktree` isolation + atomic checkpoint commits.

For compatibility with plugin gating, keep an allow-list in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Skill(feature-dev)",
      "Skill(feature-dev:*)",
      "Skill(frontend-design)",
      "Skill(frontend-design:*)",
      "Skill(code-simplifier)",
      "Skill(code-simplifier:*)",
      "Skill(code-review)",
      "Skill(code-review:*)",
      "Skill(ast-grep)",
      "Skill(ast-grep:*)"
    ]
  }
}
```

### Worktree + Atomic Commit Hooks (Recommended)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT=\"$repo\" bash \"$repo/.ai/hooks/run-hook.sh\" worktree-guard.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT=\"$repo\" bash \"$repo/.ai/hooks/run-hook.sh\" atomic-pending.sh"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT=\"$repo\" bash \"$repo/.ai/hooks/run-hook.sh\" atomic-commit.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Usage After Installation

```
/feature-dev      - Start guided feature development
/frontend-design  - Create production-grade UI
/code-simplifier  - Simplify and refine code
/code-review      - Review code for issues
/ast-grep         - AST-based code search (prefix with "Use ast-grep to...")
```

---

## Hookify Advanced: 在 Hooks 中激活 Skills ⭐

Hookify 不仅可以发出警告或阻止操作，还可以通过 hooks 自动调用其他 skills，实现智能化的开发工作流。

### 工作原理

当 hook 触发时，你可以在规则消息中引导 Claude 调用特定 skill：

```markdown
---
name: auto-review-on-commit
enabled: true
event: bash
pattern: git\s+commit
action: warn
---

📋 **即将提交代码**

在提交前，请先运行代码审查确保质量：

**建议执行：** `/code-review` 检查当前更改
```

### 实际场景示例

#### 1. 写完代码自动触发代码简化

`.claude/hookify.auto-simplify.local.md`:
```markdown
---
name: auto-simplify-on-write
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.(ts|tsx)$
action: warn
---

✨ **TypeScript 文件已修改**

为确保代码质量，建议执行代码简化：

**执行命令：** `/code-simplifier`

这将：
- 检查函数复杂度
- 优化代码可读性
- 移除重复代码
```

#### 2. 创建新组件时自动调用设计 skill

`.claude/hookify.component-design.local.md`:
```markdown
---
name: auto-design-component
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: /components/.*\.(tsx|jsx)$
  - field: new_text
    operator: contains
    pattern: export function
action: warn
---

🎨 **新组件创建中**

检测到新 React 组件，建议使用前端设计技能确保 UI 质量：

**执行命令：** `/frontend-design`

这将确保：
- 遵循设计系统规范
- 使用正确的 shadcn/ui 组件
- 实现高质量的交互效果
```

#### 3. 修改敏感文件时自动安全审查

`.claude/hookify.security-review.local.md`:
```markdown
---
name: auto-security-review
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: (auth|security|password|token|credential)
action: warn
---

🔐 **敏感文件修改检测**

此文件涉及安全相关功能，建议执行安全审查：

**执行命令：** `/code-review --focus security`

检查项：
- 是否有硬编码的密钥/令牌
- 输入验证是否完善
- 权限检查是否正确
```

#### 4. 完成任务前强制代码审查

`.claude/hookify.require-review.local.md`:
```markdown
---
name: require-review-before-stop
enabled: true
event: stop
action: block
conditions:
  - field: transcript
    operator: not_contains
    pattern: /code-review
---

⚠️ **停止前需要代码审查**

在完成任务前，请先运行代码审查：

**必须执行：** `/code-review`

这是项目规范的强制要求，确保所有代码更改都经过质量检查。
```

#### 5. AST 模式检测触发重构建议

`.claude/hookify.ast-refactor.local.md`:
```markdown
---
name: detect-complex-patterns
enabled: true
event: file
conditions:
  - field: new_text
    operator: regex_match
    pattern: (if.*if.*if|\.then\(.*\.then\(.*\.then\()
action: warn
---

🔍 **检测到复杂代码模式**

发现深层嵌套或过长的 Promise 链，建议使用 AST 工具分析：

**执行命令：** "Use ast-grep to find all nested conditionals in this file"

然后运行 `/code-simplifier` 进行重构
```

### 组合工作流示例

创建一个完整的质量保证工作流：

#### 开发时 Hook 链

```
┌─────────────────────────────────────────────────────────────┐
│  1. 写代码 (Edit/Write)                                      │
│     ↓ hookify.auto-simplify.local.md 触发                   │
│  2. 建议运行 /code-simplifier                                │
│     ↓                                                        │
│  3. 提交前 (git commit)                                      │
│     ↓ hookify.auto-review.local.md 触发                     │
│  4. 建议运行 /code-review                                    │
│     ↓                                                        │
│  5. 完成任务 (Stop)                                          │
│     ↓ hookify.require-tests.local.md 触发                   │
│  6. 强制检查测试是否运行                                      │
└─────────────────────────────────────────────────────────────┘
```

### 最佳实践

| 策略 | 说明 |
|------|------|
| **警告优先** | 大多数场景使用 `action: warn`，让开发者决定是否执行 |
| **精准触发** | 使用多条件 `conditions` 减少误触发 |
| **清晰指令** | 在消息中明确写出要执行的 skill 命令 |
| **按需启用** | 生产紧急修复时可临时 `enabled: false` |
| **组合使用** | 不同事件触发不同 skills，形成完整工作流 |

### 快速开始

```bash
# 创建一个简单的自动审查规则
cat << 'EOF' > .claude/hookify.auto-review.local.md
---
name: auto-review-reminder
enabled: true
event: bash
pattern: git\s+(commit|push)
action: warn
---

📋 **提交前提醒**

建议先运行：`/code-review`
EOF
```

规则立即生效，无需重启！

---

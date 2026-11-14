<div align="center">

# repo-harness

### 把 GitHub issue 交给 AI agent，拿回一个真正能 review 的 PR

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**把 GitHub issue 和验收条件交给 agent。把变更和验证结果记录在 PR 中。**

</div>

`repo-harness` 是一套 CLI、hooks 和 skills，包在现有仓库外面，让 Claude、Codex 和 Pi
能跨会话、跨机器、跨 worktree 做长时间的工程任务，并留下人能在几分钟内 review 的证据。
GitHub issue 和 PR 管理任务身份、范围和状态；人只负责决定是否接受变更。

## 安装

前置条件：一个 Git working tree、`bun` 和可用的 `herdr`。完整的前置条件见
[README.md](README.md#get-started)。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/aimpact-inc/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/aimpact-inc/repo-harness/main/install.ps1 | iex
```

如果 Bun 已经在 PATH 上，也可以直接运行：

```bash
bunx -p repo-harness@latest rh install     # Bun one-shot bootstrap
npx -y -p repo-harness@latest rh install   # npx fallback; the CLI still runs on Bun
```

## 第一条命令

在目标仓库根目录先预览，再应用：

```bash
rh init --dry-run
rh init
```

`--dry-run` 只报告将要创建或刷新的文件，不写入任何文件。

## 完整文档

本页只是入口页。英文 [README.md](README.md) 是完整且最新的入口，讲清工作原理、
设计原则和命令速查；安装细节、升级清理、review、hooks、MCP 和 maintainer 参考见
[使用指南](docs/usage.md)。

## 许可证

MIT

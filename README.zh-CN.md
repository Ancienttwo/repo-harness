<div align="center">

# repo-harness

### 面向 Claude 与 Codex 的 file-backed workflow，也是构建在它之上的各类 program 的授权 runtime

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**把完整的 PRD 或 Sprint 交给 agent；之后你的循环只剩 review 和 `next`，或者启动 `/goal` 然后 AFK。**

</div>

`repo-harness` 提供一套 CLI 加 skill/runtime hooks，把 context、plan、handoff、
checks 和 review evidence 写回项目文件，让下一个 agent 会话从文件而不是聊天
记忆里继续。它用 tasks-first agent contract 接入已有仓库，让 Claude 和 Codex
保持一致。

## 安装

前置条件：一个 Git working tree、`bun` 和可用的 `herdr`。完整的前置条件见
[README.md](README.md#get-started)。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

如果 Bun 已经在 PATH 上，也可以直接运行：

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

## 第一条命令

在目标仓库根目录先预览，再应用：

```bash
repo-harness init --dry-run
repo-harness init
```

`--dry-run` 只报告将要创建或刷新的文件，不写入任何文件。

## 完整文档

本页只是入口页。英文 [README.md](README.md) 是唯一完整且最新的文档，包括
workflow、hooks、MCP connector、review 和 maintainer 参考。

## 许可证

MIT

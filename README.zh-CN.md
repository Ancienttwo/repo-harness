<div align="center">

# repo-harness

### 为 Claude 与 Codex 提供共享上下文、hooks 和 review 证据

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**把 GitHub issue 和验收条件交给 agent。把变更和验证结果记录在 PR 中。**

</div>

`repo-harness` 提供 CLI、skills 和 hooks，用于上下文、review 证据和 handoff。
GitHub issue 和 PR 管理任务身份、范围和状态。
仓库文件帮助 Claude 与 Codex 跨会话继续工作。

## Pi

Pi 是默认 `--target both` 下的可选 host。`pi` 在 PATH 上时，install 和
update 用 `pi install <package-directory>` 注册已安装的 repo-harness 目录。
已有用户 package entry 会保留，不会重复添加。缺少 Pi 时跳过此步骤。
用 `repo-harness install --dry-run --json` 预览。
最低 Pi 版本由 [MIN_PI_VERSION](src/pi/compat.ts) 定义，不设上限。
`repo-harness setup check` 和 `repo-harness update --check` 报告版本、
path resolver capability、package entry 和 skill projection。

Catalog skills 投影到 `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills`，
使用相同的 profile 选择和 ownership 规则。uninstall 只删除本工具拥有的
package entry 和未被修改的 owned skills。package 操作通过 Pi CLI 执行；
repo-harness 不写 Pi settings、credentials 或 trust 文件。
Pi 覆盖 session context、agent notices、edit/write、bash 和 Stop hooks。
Pi 不提供 fleet roles 或 subagent hooks。PowerShell、`!`/`!!` 用户 shell、
其他 extension 的文件写入和第三方 MCP 写入不在此覆盖范围内。


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

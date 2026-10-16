<div align="center">

# repo-harness

### Claude と Codex のためのファイルに基づく workflow、そしてその上に構築される program のための authorized runtime

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**Agent に完全な PRD または Sprint を渡せば、その後のループはただ review して `next` を実行するだけ、もしくは `/goal` を起動して AFK するだけです。**

</div>

`repo-harness` は、context、plans、handoffs、checks、review evidence をプロジェクトへ
書き戻す CLI と skill/runtime hooks を提供し、次の agent session が chat memory では
なくファイルから続きに入れるようにします。既存のリポジトリに、Claude と Codex を
揃える tasks-first な agent contract を導入します。

## インストール

前提条件は Git working tree、`bun`、利用可能な `herdr` です。前提条件の全体は
[README.md](README.md#get-started) を参照してください。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

Bun がすでに PATH にある場合は、次のコマンドも使えます。

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

## 最初のコマンド

対象リポジトリのルートで、まずプレビューし、次に適用します。

```bash
repo-harness init --dry-run
repo-harness init
```

`--dry-run` は作成または更新するファイルを報告するだけで、ファイルを書き込みません。

## 完全なドキュメント

このページは入口ページです。英語の [README.md](README.md) が唯一の完全で最新の
ドキュメントです。workflow、hooks、MCP connector、review、maintainer 向け情報を含みます。

## ライセンス

MIT

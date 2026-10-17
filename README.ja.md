<div align="center">

# repo-harness

### Claude と Codex のための共有コンテキスト、hooks、レビュー証跡

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**GitHub issue と受け入れ条件を agent に渡します。変更内容と検証結果を PR に記録します。**

</div>

`repo-harness` は、コンテキスト、レビュー証跡、handoff のための CLI、skills、
hooks を提供します。GitHub issue と PR がタスクの内容、範囲、状態を管理します。
リポジトリ内のファイルを使い、次のセッションで作業を再開できます。

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

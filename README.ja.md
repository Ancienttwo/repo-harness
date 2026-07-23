# repo-harness

`repo-harness` は、Claude/Codex のコーディング session を、繰り返し使える
repo-local workflow に変えます。CLI と skill/runtime hooks によって、context、plan、
handoff、check、review evidence をプロジェクト内のファイルへ書き戻し、次の agent session が
chat memory ではなくファイルから続きに入れるようにします。

主な用途:

- 既存リポジトリへ tasks-first agent contract を導入する
- Claude と Codex を同じ plan、check、handoff、context boundary に揃える
- CodeGraph と段階的な context loading により、構造を再発見するための token 消費を減らす

Agent に完全な PRD または Sprint を渡せば、あとは review and `next` だけで進めるか、
`/goal` を開始して AFK できます。

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

リポジトリ：`https://github.com/Ancienttwo/repo-harness`

## なぜ repo-harness を使うのか

- **セッションの状態はファイルに残り、チャット履歴には残らない。** 別々の agent
  セッション（Claude、Codex、今のものも後のものも）は、チャットスレッドではなくリポジトリを通じて
  同期を保ちます。新しいセッションが始まると in-process の session-context builder（`src/cli/hook/session-context.ts`）が前回セッションの
  resume packet（`.ai/harness/handoff/resume.md`、`tasks/current.md`）を注入し、セッション終了時と
  各編集後には `session-context`、`stop`、`mutation-observed` の typed handler が次の handoff を書き戻します。タスクは
  途中で中断でき、次のセッションは正確な次の一手・ブロッカー・変更ファイルをそのまま引き継ぐので、
  状況を推測し直す必要がありません。
- **設計上 token を節約する。** セッションごとにリポジトリを grep+read で再スキャンするループに頼る
  代わりに、harness は事前構築された CodeGraph index を使って構造的なクエリ（誰が呼ぶ・何を呼ぶ・
  どこで定義されているか）を行い、さらに `.ai/context/context-map.json` と `capabilities.json` を使って
  段階的な context 読み込みを行います。小さく安定した root context（約 12KB）に、対応するファイルを
  触ったときだけ読み込まれる capability ブロックが加わる構成です。agent は構造を把握し直すために数千
  token を費やすのではなく、1KB の capability contract を読むか index に問い合わせます。

導入後のリポジトリで意識する surface は小さく保たれます。

| Surface | 目的 |
| --- | --- |
| `docs/spec.md` と `docs/reference-configs/` | すべての agent session が読める共有標準と安定した product intent。 |
| `plans/`, `plans/prds/`, `plans/sprints/` | 実装前に固める decision-complete work packages。 |
| `tasks/contracts/`, `tasks/reviews/`, `.ai/harness/checks/` | 作業完了を証明する scope、verification、review evidence。 |
| `.ai/harness/handoff/` と `tasks/current.md` | chat memory ではなく workflow artifacts から派生する session journal と resumable status。 |

## Human Review Path

まず `tasks/reviews/<task>.review.md` を読みます。`## Human Review Card` は
1 画面の意思決定面で、verdict、change type、想定/実際の変更ファイル、通過した
コマンド、external acceptance、残余リスク、reviewer action、rollback を載せます。
続いて active contract、`.ai/harness/checks/latest.json` の latest trace、変更
ファイルを確認します。review が pass を推奨し、card の verdict が pass で、
external acceptance が pass・`not_required`・明示的な manual override のいずれ
かのときだけ accept します。

## Agent Tracking Path

Agent は派生サマリーより先に source artifacts を読みます。

| Agent reads first | Human reviews first |
| --- | --- |
| 現在のユーザー prompt と参照ファイル | `tasks/reviews/<task>.review.md` の Human Review Card |
| `AGENTS.md` / `CLAUDE.md` | 変更ファイルと diff |
| `.ai/harness/active-plan` の active plan | active contract の allowed paths と exit criteria |
| `tasks/contracts/` の active contract | `.ai/harness/checks/latest.json` と run trace |
| `.ai/harness/handoff/` の latest handoff | 残余リスクと rollback |

`tasks/current.md` は orientation snapshot にすぎません。active plan、contract、
review、checks、handoff と食い違う場合は、source artifacts を優先します。

## What's New

リリースノートは [`docs/CHANGELOG.md`](docs/CHANGELOG.md) にあります。現在の
ラインは `0.10.1` です。

## 仕組み

設計は 3 層に分かれます。host event は 1 本の typed runtime を通ります。

1. **ソースパッケージ層**：本リポジトリが CLI、CLI-backed command facades、templates、hook assets、
   workflow contract、tests、release gate を所有します。
2. **対象リポジトリ contract 層**：`repo-harness adopt` または migration が、`docs/spec.md`、
   `plans/`、`tasks/`、`.ai/context/`、`.ai/harness/`、helper scripts を書き込みます。
   `.ai/hooks/lib/workflow-state.sh` は operator helper projection だけです。
3. **Host adapter 層**：user-level の `~/.claude/settings.json` と `~/.codex/hooks.json` が
   Claude/Codex の events を `repo-harness-hook` へ route します。opt-in 契約を確認した後、
   route registry が `event + routeId + matcher` に対応する exactly one typed handler を呼びます。

すべての event は `host adapter -> repo-harness-hook -> route registry -> typed handler` を通ります。
`UserPromptSubmit.default` は `prompt` handler、edit/bash/stop はそれぞれ `mutation-observed`、
`command-observed`、`stop` が担当します。shell dispatcher や provider ごとの別 runtime はありません。

中核となる不変条件は、持続的な真実がチャットスレッドではなくリポジトリに存在することです。Hooks は
あくまで加速装置と guardrail であり、authority は plan、contract、review、checks、handoff といった
ファイルベースの成果物にあります。

## 任務 Workflow：Plan から Closeout まで

下の図は、対象リポジトリに harness がすでにインストールされている前提です。単一タスクの通常の閉ループ
を示しています。まず plan を形成し、sprint contract へ投射し、必要なら隔離された worktree を checkout し、
hooks の保護下で実装し、検証・review・external acceptance を経て、最後に closeout します。

```mermaid
flowchart TD
  UserTask["ユーザータスクまたは planning prompt"] --> Discovery["前置調査<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Plan は実行可能か?"}
  PlanReview -->|いいえ| Refine["scope と evidence contract を収束させる"]
  Refine --> PlanDraft
  PlanReview -->|はい| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["実行面へ投射<br/>capture-plan.sh --execute<br/>または plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> WorktreePolicy{"contract worktree が必要か?"}
  WorktreePolicy -->|はい| Checkout["隔離 worktree を checkout<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|いいえ| CurrentTree["現在の worktree を使う<br/>小タスクまたは明示的に許可された slice"]
  Checkout --> Implement
  CurrentTree --> Implement

  Implement["編集とコマンド実行"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["plan、contract、worktree、scope を修正"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["コード、ドキュメント、テスト、設定の変更"]
  Changes --> PostHooks["Post-edit / post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> Verify["検証を実行<br/>tests plus repo workflow checks"]

  Verify --> Checks["構造化された evidence<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>または明示的な manual override"]
  External --> DoneGate{"Contract、checks、review、acceptance は通ったか?"}
  DoneGate -->|いいえ| Repair["失敗した evidence または実装を修復"]
  Repair --> Implement
  DoneGate -->|はい| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]

  Closeout --> Commit["contract branch を commit"]
  Commit --> Merge["target branch を fast-forward"]
  Merge --> Archive["plan/todo を archive し handoff をリフレッシュ"]
  Archive --> Cleanup["merge 済み worktree を cleanup<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["レビュー可能な完了タスク"]
```

## 長期プロダクト Loop

Greenfield と Brownfield の作業では、Codex に実行 loop を任せる前に、
discovery と engineering-plan judgment を parent agent 側で前倒しします。

1. contract を作る前に parent agent が `geju` で視野を広げ、その後、自身の
   repo/runtime 能力で P1/P2/P3 を完了します。合意した product intent、
   architecture、risks、falsifier、evidence contract を development documents
   に固定します。
2. それらの documents を `plans/prds/` 配下の PRD Sprint に変換し、
   各 execution slice に ordered backlog と detailed sub-plans を持たせます。
3. Codex Goal を作成し、その sprint file を指します。repo-harness はその後、
   各 sprint item を通常の plan -> contract -> worktree -> verification flow
   へ投射できます。

この handoff により、長期 loop は精密になります。parent agent が広い前置判断を担い、
PRD Sprint が durable source of truth となり、Codex Goal mode は元の chat を再解釈する
のではなく、具体的な sprint に対して resume します。

## 最初の 5 分

実際のリポジトリがこの workflow を導入するのに適しているかを評価する、最速の経路です。

前提条件：Git working tree、`bash`、`bun`（後続の検証と template assembly に使用）。
`jq` は任意。`--dry-run` のときは導入を推奨し、settings merge を適用するときにより有用です。

### CLI をインストールする

既定の経路では Node.js は不要です。installer は Bun >= 1.1.35 を runtime として使います。
Bun が見つからない場合や古い場合は、先に Bun をインストールまたは更新してから `repo-harness` CLI をインストールします。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

<details>
<summary>Bun >= 1.1.35 がすでにある場合は Bun を優先し、npx を fallback として使えます</summary>

```bash
# Bun（推奨）
bun add -g repo-harness
repo-harness install

# npx fallback。CLI runtime は Bun なので、Bun が PATH 上に必要です。
npx -y repo-harness@latest install
```

</details>

### host runtime を bootstrap する

```bash
repo-harness install
```

`repo-harness install` は global bootstrap、`repo-harness update` は
user-level refresh、`repo-harness adopt` は repo-local refresh です。`repo-harness install` は CLI、user-level hook adapters、Waza、Mermaid、
brain root、CodeGraph MCP を設定し、退役した `scripts/setup-plugins.sh` の Claude plugin path は使いません。

package 本体を編集する maintainer はソースの checkout が必要です
—— [Maintainer Reference](#maintainer-reference) を参照してください。

### ここから始める

既存リポジトリでは repo root から実行します。

```bash
repo-harness adopt --dry-run
```

dry-run のレポートが正しいことを確認してから適用します。

```bash
repo-harness adopt
```

新しいプロジェクトやモジュールには `repo-harness-setup` の scaffold mode を使います。既存リポジトリには
`repo-harness adopt` を使います。これは harness をインストールまたはリフレッシュするもので、アプリケーション
スタックは作成しません。

### 成功した状態

コマンドの最後には `=== Migration Report ===` が出力され、次の内容を含むはずです。

- `Project hooks synced from:`：生成された hook 行動がどこ由来かを示す
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json`：adapter 層がどこにあるか
- `Host hook adapters are user-level:`：global adapters のインストールを促し、`~/.codex/hooks.json` を信頼するよう注意する
- `Workflow migration:`：repo-local harness surfaces の作成またはリフレッシュ計画
- `Helper runtime:`：適用後に得られる操作ツールチェーン
- `--- External Tooling ---`：parent/Geju planning の指針、Waza と CodeGraph の readiness、advisory なインストール/更新のヒント

### 続けて実行する 2 つのコマンド

```bash
bash scripts/check-task-workflow.sh --strict
bun test
```

dry-run の出力がおかしい場合は、ここで一旦止め、
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md) を読んでください。

## MCP Connector Quickstart

オプションの sidecar として、`repo-harness mcp` は workflow artifacts だけを MCP
クライアントへ公開します。ChatGPT は状態を読み、アイデアを PRD、checklist Sprint、
Codex goal handoff へと進める planner/reviewer として働きます。source-code への
書き込み権限、任意の shell 実行、デフォルトの Codex runner はありません。Codex が
実行者のままです。

この sidecar は、上記「最初の 5 分」で CLI が既にインストール済みであることを
前提とします。ChatGPT に実際のリポジトリ状態へ対してプランニングさせ、生成された
file-backed Sprint を Codex に実行させたいときに使います。

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

このローカル server を HTTPS tunnel 経由で公開し、`/mcp` URL で ChatGPT
Connector を作成します。生成されるガイドの書き出し先は次のとおりです。

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

human workflow は次のとおりです。

1. ChatGPT が MCP 経由で repo-harness の workflow ファイルを読む。
2. ChatGPT が `write_prd_from_idea` で PRD を書く。
3. ChatGPT が `write_checklist_sprint` で checklist Sprint を書く。
4. ChatGPT が `prepare_codex_goal_from_sprint` で `.ai/harness/handoff/codex-goal.md` を準備する。
5. Codex が host-native `/goal` prompt を実行し、完了した Sprint phase を順に stage する。

最後の handoff ステップのローカルなフォールバック：

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md
```

agent 向けの Skill のインストール先は次のとおりです。

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

この Skill は、ChatGPT に source-code への書き込みや shell 実行を与えることなく、
ChatGPT が生成した PRD/Sprint/Goal artifacts を Codex がどう消費するかを伝えます。

Dev Mode は MCP 経由でローカル agent 実行を opt-in できます。デフォルトでは
無効です。ユーザーが `orchestrator` profile と dev runner 設定を有効にすると、
ChatGPT は `run_agent_goal` を呼べます。これは `.ai/harness/handoff/codex-goal.md`
だけを読み、`codex exec` や `claude -p` などの許可されたローカル CLI を通じて
固定された handoff を実行します。

```bash
repo-harness mcp serve --repo . --transport http --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

この設定はローカルの Developer Mode 専用です。タイムアウト上限があり、監査され、
任意の shell ではありません。

## Hook Authority Map

`repo-harness-hook` が唯一の host-event runtime です。user-level adapter は event を渡すだけで、
route registry が安定した `event + routeId + matcher` tuple に対して exactly one typed handler を
呼びます。`assets/hooks/lib/workflow-state.sh` と `.ai/hooks/lib/workflow-state.sh` は workflow state
を調べる operator helper projection であり、dispatcher ではありません。

- `~/.claude/settings.json`：user-level Claude adapter。
- `~/.codex/hooks.json`：user-level Codex adapter。Codex Settings で信頼が必要です。
- Repo-local `.claude/settings.json` / `.codex/hooks.json`：migration 時に退役する legacy 入力。
- handler の変更は `src/cli/hook/` で行い、asset projection は `bun run sync:hooks` で同期します。

The installed adapter owns the managed hook routes. Each route invokes one typed
handler; 2 本目の shell runtime や provider-specific runtime はありません。

| Route | Matcher | Typed handler | Function |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `src/cli/hook/session-context.ts` (in-process builder) | Injects prior handoff, sprint status, and read-only config-security findings before work starts. |
| `PreToolUse.edit` | `Edit|Write` | `src/cli/hook/mutation-guard.ts` (in-process handler) | Enforces worktree policy and plan/contract readiness before implementation edits. |
| `PreToolUse.subagent` | `Task|Agent|SendUserMessage` | `subagent` | Keeps delegated work returning through the parent session instead of leaking completion claims. |
| `PostToolUse.edit` | `Edit|Write` | `mutation-observed` | Records the edit journal and controlled-file observations. |
| `PostToolUse.bash` | `Bash` | `command-observed` | Observes command results and captures verification evidence without replacing the command runner. |
| `PostToolUse.always` | all tools | `trace-observer` | Provides low-noise always-on trace and runtime observation. |
| `UserPromptSubmit.default` | all prompts | `prompt` | Classifies prompt intent, routes planning/check/hunt hints, and renders host-safe workflow guidance. |
| `Stop.default` | session stop | `src/cli/hook/stop-handler.ts` (in-process handler) | Finalizes handoff and guards against ending with unresolved draft-plan or completion evidence gaps. |

`SessionStart` は作業開始前に in-process の session-context builder を実行し、コンテキストを組み立てます。

```mermaid
flowchart LR
  SessionStart["Claude/Codex SessionStart"] --> Ctx["session-context.ts<br/>in-process builder"]
  Ctx --> Resume["resume + handoff context"]
  Ctx --> Sec["security scan<br/>read-only config scan, fingerprint-gated"]
  Resume --> SSOut["SessionStart additionalContext<br/>prior-session state + SecurityConfig findings"]
  Sec --> SSOut
```

Prompt guard には内部ステップが 1 つ増えます。

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Handler["prompt handler<br/>typed decision table"]
  Handler --> RouteHint["Waza route hint<br/>explicit think/planning matched first → /think"]
  Handler --> HostOutput["host-safe allow, advice, block, or done gate output"]
```

Typed handler が route の入力解析、ファイル状態、宣言された副作用を所有し、runtime は host 出力を
統一して整形します。AcceptanceReceipt が closeout authority で、review Markdown は投影です。

## Hook Failure Playbook

hook がブロックしたときは、まず terminal の構造化された出力を見ます。中核となるフィールドは
`guard`、`reason`、`fix`、`failure_class`、`run_id` です。

- Failure log：`.ai/harness/failures/latest.jsonl`
- Trace log：`.claude/.trace.jsonl`
- 詳細ガイド：[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

よくある guards：

- `PlanStatusGuard`：active plan がない、または plan がまだ実行できない
- `ContractGuard`：approved execution がまだ contract/review/notes scaffold を生成していない
- `ContractGuard`：タスクが contract verification を通る前に完了を主張した
- `WorktreeGuard`：linked worktree を強制するポリシー下で、primary worktree から書き込もうとした

## Repo Workflow

- Root routing docs：`CLAUDE.md`、`AGENTS.md`
- Typed hook runtime：`src/cli/hook/`（`repo-harness-hook` 経由）
- Operator helper projection：`.ai/hooks/lib/workflow-state.sh`
- User-level adapter layer：`~/.claude/settings.json`、`~/.codex/hooks.json`
- Active execution surface：`tasks/`
- Plan source of truth：`plans/`
- Durable progress：`tasks/workstreams/`
- Release history：`docs/CHANGELOG.md`

## 現在の Release

- npm package：`repo-harness@0.10.1`
- Generated workflow stamp：`repo-harness@0.10.1+template@0.10.1`
- GitHub repository：`Ancienttwo/repo-harness`
- Release history：[`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## 謝辞

[Hylarucoder](https://x.com/hylarucoder) の方法論への貢献に感謝します。
`repo-harness` の P1/P2/P3 due-diligence メソッドと、planning、trace、
decision rationale を重視する Geju の実践は、彼の貢献と示唆に基づいています。

[TW93](https://x.com/HiTw93) による Waza にも感謝します。`think`、`hunt`、
`check`、`health` という中核 skill は、`repo-harness` の日々の planning、
bug hunt、verification のリズムを形作っています。

[Peter Steinberger](https://x.com/steipete) による Oracle（`@steipete/oracle`、MIT）にも
感謝します。これは `chatgpt-browser` の既定の GPT Pro / ChatGPT Web ブラウザ consult
エンジンで、Oracle provider が外部の oracle バイナリを spawn して `gptpro` consult を
実行します（自動ダウンロードはせず、見つからなければ hard failure）。


### GitHub contributor attribution

Codex が commit に実質的に貢献した場合は、GitHub 標準の co-author trailer を commit message の末尾に入れます。

```text
Co-authored-by: codex <codex@openai.com>
```

この署名は commit ごとに opt-in で明示します。対象 repo が同じ policy を明示的に採用しない限り、downstream の repo-harness commit scripts や hooks へ組み込まないでください。

## Action Command Skills

canonical rule-owner package は `assets/skills/`（activate 済みの canonical
package）と `assets/skill-commands/`（その場で進化する survivor）にあります。
host skill discovery の範囲を保ちつつ、実行は CLI と hooks が担います。

- Router：`repo-harness`（root Skill。すべての profile に無条件で同期される）
- Setup layer：`repo-harness-setup`（adopt/init、migrate、upgrade、repair、
  scaffold、capability-configuration の各 mode。router-only で、どの profile
  からも自動発見されない）
- Planning：`repo-harness-plan`（decision-complete plan を作成、または既存
  plan を review する）
- Product planning layer：`repo-harness-product`（PRD / Sprint / Goal の
  3 mode。PRD mode はまず `$geju` を有効化し、Claude-first の `claude -p
  --model opus` で PRD を起草する。Codex は fallback のみ。Sprint mode は PRD
  を `plans/sprints/` の順序付き backlog に分解し、各行を `$think` で展開して
  から contract flow へ進む。Goal mode は詳細な PRD または Sprint artifact か
  ら Codex/Claude の `/goal` prompt を準備し、文書がなければ先に要求する）
- Verification：`repo-harness-check`（workflow/release チェックと
  deploy-readiness reference）
- Release：`repo-harness-ship`
- Architecture：`repo-harness-architecture`
- Cross-model review：`repo-harness-cross-review`（host-aware。strict profile
  では両方の host にインストールされる）
- ChatGPT 連携：`repo-harness-chatgpt`（Oracle browser / GPT Pro consult と
  continuation、MCP Connector setup、bridge handoff、read-back evidence。
  explicit setup 限定で、product planning から暗黙にインストールされることは
  ない）

planning chain は意図的に層を分けています。

```text
idea -> repo-harness-product（PRD mode） -> repo-harness-product（Sprint mode、from-prd） -> repo-harness-product（Goal mode）
```

入力がまだプロダクトアイデアなら `repo-harness-product` の PRD mode を使います。
まず `$geju` の direction pass を行い、その後 Claude に `claude -p --model
opus` で PRD を起草させます。Codex は Claude が使えない、または失敗した場合だ
け fallback です。承認済み PRD を machine-checkable acceptance line 付きの順
序付き Sprint backlog にするには、その Sprint mode（`from-prd
<plans/prds/*.prd.md>`）を使います。Goal mode は詳細な PRD または Sprint
artifact がある場合だけ使い、Codex/Claude 向けの bounded `/goal` prompt を準
備し、PRD/Sprint を source of truth として維持します。その文書がない場合、
Goal mode はチャット文脈から実装を始めず、先に文書を要求しなければなりません。

`repo-harness adopt` は既存リポジトリ向け、`repo-harness-setup` の scaffold
mode は新しいプロジェクトやモジュールを作成します。
`hooks-init`、`docs-init`、`create-project-dirs` は内部ステップであり、公開 commands ではありません。

## Maintainer Reference

package 本体を編集する maintainer はソースの checkout が必要です：

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts update
```

`~/Projects/repo-harness` が唯一の編集可能な source of truth です。ローカルの
Claude/Codex パス（`~/.claude/skills/repo-harness`、`~/.codex/skills/repo-harness`）
は symlink に裏打ちされた runtime entrypoint です。`SKILL.md` と
`assets/skill-commands/` を公開するのは `~/.codex/skills/repo-harness` だけで、
`scripts/sync-codex-installed-copies.sh` がこれらの alias を再構築し、退役した
`repo-harness-skill` / `project-initializer` ディレクトリを削除します。スクリプトは
既定で runtime パスをソースリポジトリにリンクします。`AGENTIC_DEV_LINK_INSTALLED_COPIES=0`
で copy-based staging、`CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT` で別の root を指定できます。

### 本リポジトリの workflow contract をセルフチェックする

下の Verification にある完全な gate を実行します。`bun run check:ci` が単一の
CI-equivalent コマンドです。

### Runtime reference docs

Generic repo-harness runtime/reference docs live in the installed package under
`assets/reference-configs/` and are resolved through the CLI:

```bash
repo-harness docs list
repo-harness docs path harness-overview
repo-harness docs show harness-overview
```

Initializer と runtime のデフォルト（question flow、plan menu、template vars、
external-tooling routing）は `harness-overview.md` の **Initializer and Runtime
Model** に記載されています。Generated and migrated repos still keep
`docs/reference-configs/*.md`, but those files are deterministic pointer stubs.
Repo-local workflow state, policy, checks, runs, handoff packets, context maps,
and helper snapshots stay under `.ai/`.

### Template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Verification

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```


### Local benchmark skeleton

```bash
bun run benchmark:skills --eval route-workflow-check
```

Eval output is the release/readiness evidence path; dry-run benchmark wiring is only a smoke and is not skill-effectiveness evidence.


### Run one eval across both Claude and Codex

```bash
bun run benchmark:skills --eval repair-agents-task-sync
```

## Key Files

- Skill spec：`SKILL.md`
- Root routing docs：`CLAUDE.md`、`AGENTS.md`
- Plan mapping：`assets/plan-map.json`
- Question-pack：`assets/initializer-question-pack.v4.json`
- Shared hooks：`assets/hooks/`
- Runtime reference docs: `assets/reference-configs/` via `repo-harness docs`
- Workflow contract：`assets/workflow-contract.v1.json`
- Hook operations reference：`docs/reference-configs/hook-operations.md`
- Template assembler：`scripts/assemble-template.ts`
- State inspector：`scripts/inspect-project-state.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`
- Canonical adoption planner: `src/core/adoption/standard-plan.ts`

## Generated vs Self-Hosted Hook Projection

- Downstream hook behavior は `assets/hooks/` と `assets/reference-configs/` から生成される出力で定義されます。
- この repo は同じ contract を dogfood しますが、self-host behavior は generated repos と自動同期されません。変更は両方の surface を明示的に更新する必要があります。
- すべての hook 変更は、影響範囲が `self-host`、`generated`、または `both` のどれかを明記します。

## Package Manager Defaults

- 一般的な既定優先度：`bun > pnpm > npm`
- **Plan G/H**（Python-centric）は **`uv`** を primary package manager として既定にします。

## Runtime Profiles

- `Plan-only (recommended)`（default）
- `Plan + Permissionless`
- `Standard (ask before each action)`

これは `assets/initializer-question-pack.v4.json` で設定され、`scripts/initializer-question-pack.ts` が消費します。

## Verification

release review では単一の CI-equivalent gate を使います。

```bash
bun run check:ci
```

この gate は以下の repo-owned checks に展開されます。`bun run check:release` は npm unpublished-version preflight を追加してから同じ gate に委譲します。

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```

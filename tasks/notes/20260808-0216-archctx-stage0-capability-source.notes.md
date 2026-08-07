# Implementation Notes: archctx-stage0-capability-source

> **Status**: Active
> **Plan**: plans/plan-20260808-0216-archctx-stage0-capability-source.md
> **Contract**: tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md
> **Review**: tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md
> **Last Updated**: 2026-08-08
> **Lifecycle**: notes

## Design Decisions

- **N1-N13 编号补全**:plan 只点名了 N3/N4b/N5b/N6/N7/N8/N9/N11/N12/N13,设计稿未进仓,N1/N2/N4/N5/N10 没有文字定义。按 plan 的映射表逐字段补齐,得到一个自洽的 13 码矩阵:N1 节点非 mapping、N2 schemaVersion 非 `archcontext.node/v1`、N3 id 形状、N4 `kind` 缺失/非字符串、N5 `status` 缺失/非字符串、N6 `source.include` 缺失/空/非字符串项、N7 `source.exclude` 非空、N8 include 文法不支持、N9 目录形字面量、N10 `extensions` 缺失、N11 `lspProfile`、N12 `verification`、N13 `contractFiles`。N4/N5 是「字段本身不合法」,N4b/N5b 是「合法但不属于本 repo」→ 跳过且不占前缀。
- **检查顺序**:N1 → N2 → N4 → N5 → 跳过判定 → N3 → include → extensions。先校验 `kind`/`status` 的类型再决定跳过,才能让 `kind: module` 的节点被安静跳过而不被要求满足 capability 的 id 形状——model 目录里本来就会有 module/component 节点。
- **`malformedRegistryError` 增加 authority 参数**:原实现把 `.ai/context/capabilities.json` 硬编码进错误文案。archcontext mode 下这句话是假的,会把排查引到错误的文件。改为按 mode 取 `capabilityAuthorityPath()`。这是 plan 未点名但 mode 分派直接逼出来的最小修正。
- **`loadRegistry(repo, mode)` 显式传参**:mode 由调用点(`readRegistry`、`main`)算一次,避免为了拼错误文案重复读 policy.json,也让「一次调用只认一个 authority」在类型上可见。
- **孪生 fixture 的 key 顺序即契约**:`list --format json` 直接 `JSON.stringify` capability 对象,byte-equality parity 因此隐式约束了映射器输出对象的字段顺序必须等于 `.ai/context/capabilities.json` 的写法(id, domain, name, prefixes, contract_files, architecture_module, workstream_dir, lsp_profile, verification_hints)。改映射器里 object literal 的字段顺序会直接打爆 parity 测试。
- **`bunYamlParser` 用 `parse.call(yaml, source)`**:保留 `Bun.YAML` 作为 receiver,避免 detached method 在未来实现里踩 `this`。
- **投影安全的命名约束**:`sync-helper-sources.ts` 把 `registry.ts` 全文与 resolver 适配层拼成一个文件,两边的顶层符号名不能撞。resolver 里的 `plainRecord` 就是为了避开 registry.ts 私有的 `isRecord`;文件名排序用内联 `Buffer.compare` 而不是再声明一个 `byteCompare`。

## Deviations From Plan Or Spec

- plan 写 `"capability_source_rule": "single authority; …no dual-read and no fallback"`(带省略号)。补成完整句:`single authority selected by capability_source; registry reads .ai/context/capabilities.json, archcontext reads .archcontext/model/nodes/*.yaml; no dual-read and no fallback`,四处播种逐字一致并有断言守。
- `archcontextIncludeToPrefix` 的语法表与派生 registry 的 `validateCapabilityRegistryValue`/DUPLICATE_ID 用例按 plan 放在 `tests/capabilities/registry.test.ts`,没有在新测试文件里重复;新文件只留 source 层(parity / S / N / bunYamlParser / 乱序确定性)。

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `CapabilitySourceError` 带结构化 `code` 字段 | 不加 | plan 只要求 `exitCode=2`;S1-S6 的消息各不相同已足够断言,加 code 是 plan 外的接口面 |
| N 矩阵只做进程内单测 / 只走 CLI | 两条都做 | 进程内断言精确到 diagnostic code,CLI 断言证明整条链 fail-closed(exit 1 + 空 stdout) |
| 顺带修 `scripts/ensure-task-workflow.sh` 的 policy 播种 | 本轮修了 | 初判「不在 allowed_paths」而搁置;R2 执行中确认它是 policy `context` 块的第四个播种点且既有漂移(缺 `capability_config`),R3 经 contract 扩权(d88220bb)把它纳入 allowed_paths,并补齐 `capability_config` + `capability_source` + `capability_source_rule`(c7876126) |

## Open Questions

- (已闭环)`scripts/ensure-task-workflow.sh:1059` 的第四个 policy `context` 播种点,R3 已随 contract 扩权(d88220bb)补齐 `capability_config` + `capability_source` + `capability_source_rule`(c7876126)。四个独立硬编码播种点——`scripts/lib/project-init-lib.sh`、`src/core/adoption/standard-plan.ts` 的 `tsDefaultPolicy`、`scripts/ensure-task-workflow.sh` 的 POLICY_EOF 兜底、本仓自身 `.ai/harness/policy.json`——由 `tests/create-project-dirs.runtime.test.ts:456` 的一致性断言守住。后续 slice 无需再处理此项。

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

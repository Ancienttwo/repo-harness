# GPT-5.6 Prompt Guidance × repo-harness Audit

> **Captured**: 2026-07-16 (Asia/Taipei)
>
> **Official source**: [Prompting guidance for GPT-5.6 Sol](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
>
> **Repo baseline**: `be3e93ce72c812a33045a15c4d97452c59fa3fbb` (`main == origin/main` before this research file)
>
> **Status**: canonical research/audit artifact candidate for `main`; a separately approved remediation slice is verified in an isolated worktree, while this file itself does not mutate product code or host configuration

## Conclusion

repo-harness is already aligned with the guide on its most important architectural choice: natural-language prompting is advisory, while scope, permission, workflow state, and completion evidence belong to deterministic contracts and guards. The explicit-first prompt router, allowed-path enforcement, evidence freshness checks, and 1,500-token SessionStart budget should be preserved.

The main gap is not missing instructions. It is that the complete runtime prompt stack has no single owner or budget. The same rule can be projected through global instructions, the root contract, a persona, delegation advice, SubagentStart context, and a contract worker prompt. A representative contract child carries about **8.7k static tokens before system instructions, tool schemas, user input, or conversation history**. The canonical `EXECUTION_BOUNDARY` alone is 841 bytes (about 211 tokens) and can appear twice in a managed child, or three times if contract-bound parent context is inherited.

There are also two correctness issues that must outrank prompt slimming:

1. `contract-run` parses token, wall-time, network, and writable-path constraints but does not enforce most of them; its `tool_calls` counter counts worker/verifier process launches rather than model tool calls.
2. Unknown plan status is allowed by the prompt decision table and is not blocked by the edit guard, so malformed authority can fail open.

The recommended direction is therefore **not a prompt rewrite**. Keep the deterministic kernel, establish a rendered prompt-stack baseline, make declared authority enforceable and fail closed, then remove one duplicated prompt group at a time under representative evals. This follows the official [simplify-first](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#simplify-prompts-first) and [migration](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#prompt-migration-workflow) guidance while respecting the existing `ESA → LSC → HRD → EPC → SSD` program order.

## What the OpenAI guide says

This document stores a distilled interpretation, not a mirror of the source article.

| Principle | Operational meaning for this repo | Important boundary |
|---|---|---|
| Start with a lean prompt | Keep outcome, success bar, evidence, permissions, stop conditions, and tool routing; remove repeated process narration and irrelevant context. | OpenAI's internal coding-agent gains are directional workload-specific evidence, not a repo-harness target or guarantee. |
| Outcome first | State the result and completion bar; use absolute language only for true invariants and use decision rules for judgment calls. | Do not replace deterministic permission or safety guards with model judgment. |
| One autonomy/approval contract | Distinguish answer/review/diagnose from change/build/fix, and require confirmation for destructive or external side effects. | Repository artifacts constrain scope but do not create user authority. |
| Sparse collaboration | Give a short preamble before tool-heavy work and update only at meaningful phase outcomes, blockers, or scope changes. | Do not narrate routine tool calls. |
| Explicit tool routing | Describe prerequisites, parallelizable reads, sequential dependencies, tool errors, and fallback limits. | Retrieval fallback is not permission for semantic compatibility or invented authority. |
| Ground claims in evidence | Define what counts as support; cite retrieved material; label inference, conflict, and missing evidence. | Absence of retrieved evidence is not proof that something does not exist. |
| Budget long workflows | Compact at meaningful milestones, preserve stable objectives, and keep cacheable prefixes stable. | Persisted reasoning and assistant-phase wire formats remain provider/API concerns unless a host contract exposes them. |
| Calibrate reasoning effort | Compare the current setting with the same task at one lower setting; reserve `max` for measured quality-first workloads. | Higher effort does not repair missing success criteria, tool access, or verification. |
| Verify before finishing | Run the relevant targeted checks and report actual evidence. | Do not optimize loops or verbosity at the expense of correctness. |
| Migrate surgically | Change the model first, then remove one prompt group at a time and re-evaluate. | Do not rewrite every prompt surface in one package. |

Official anchors: [outcomes and stop conditions](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#outcome-first-prompts-and-stopping-conditions), [autonomy](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#define-autonomy-and-approval-boundaries), [tool routing](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#tool-routing), [grounding](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#grounding-citations-and-retrieval-budgets), [long-running workflows](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#long-running-workflows-and-state), [reasoning effort](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#reasoning-effort), and [verification](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6#check-work-before-finishing).

## P1: Current authority map

| Layer | Current owner | What it controls | Audit judgment |
|---|---|---|---|
| User-level behavior | `assets/reference-configs/global-working-rules.md`; installed `~/.codex/AGENTS.md` | Language, reasoning, P1/P2/P3, compatibility, reporting | Intended authority exists, but installed legacy content is not a managed projection. |
| Repo-specific behavior | root `AGENTS.md` / `CLAUDE.md` | Canonical workflow files, contract gates, deployment and architecture rules | Correct repo-local boundary; too large to treat as an unmeasured free prefix. |
| Prompt routing | `src/cli/hook/prompt-router.ts`, `assets/hooks/prompt-guard.sh` | Explicit workflow actions and bounded active-task continuation | Strong: ordinary/advisory prompts bypass the old semantic classifier. |
| Edit authority | `assets/hooks/pre-edit-guard.sh`, active plan/contract/allowed paths | Whether an implementation path may be edited | Correct layer, but unknown plan status currently fails open. |
| Delegation | `.ai/harness/policy.json`, delegation advisor, SubagentStart context | Agent count, depth, write ownership, role packet, fallback runner | Strong policy shape; composed prompt path duplicates and sometimes contradicts itself. |
| Contract runner | `scripts/contract-run.ts` and contract template | Worker/verifier packet, claimed budget and permission scope | Outcome/evidence are present; budget/permission enforcement is incomplete. |
| Completion | contract/review/check evidence and Stop orchestration | Verification, freshness, external acceptance, archive readiness | Evidence-driven and strong; Codex Stop output is intentionally suppressed, so it cannot be described as a Codex veto surface. |
| Context budget | `src/cli/hook/session-context-budget.ts` | SessionStart context only | Good local mechanism; no budget covers global + root + persona + task + hooks as a composed stack. |
| Fleet | `agents/fleet/*`, `scripts/install-agent-fleet.sh`, generated `~/.codex/agents/*.toml` | Role prompt, model family, reasoning effort, sandbox mode | Install projection is tested, but role quality/effort and actual child selection are not. |
| Evaluation | `evals/harness/reports/profile-comparison.*`, hook diet reports | Profile quality, cost, duration, hook behavior | Useful outcome baseline; insufficient attribution because model, applied effort, and prompt components are absent. |

## P2: Concrete traces

### Trace A — ordinary user request

1. `UserPromptSubmit.default` reaches `prompt-guard.sh`.
2. `routePromptExplicitFirst` accepts only slash actions or a short allowlisted continuation while a task is active (`src/cli/hook/prompt-router.ts:54-74`).
3. Other text exits without entering historical semantic intent logic (`assets/hooks/prompt-guard.sh:1124-1145`).
4. If tools later edit files, `pre-edit-guard.sh` performs the deterministic plan/contract/path decision.

This is aligned with the guide: intent prose does not become a second permission authority. Expanding the multilingual regex or adding an LLM classifier would be a regression.

### Trace B — contract-backed child

1. The parent already receives global instructions and root `AGENTS.md`.
2. The delegation advisor adds role limits, fork guidance, permission language, and the four-paragraph execution boundary (`assets/hooks/codex-delegation-advisor.sh:331-380`).
3. A generated Codex persona contains the same execution boundary in `developer_instructions` (`docs/reference-configs/external-tooling.md:548-552`).
4. SubagentStart adds role/reporting instructions and the execution boundary again (`assets/hooks/subagent-start-context.sh:509-542`).
5. The standalone contract worker prompt adds metadata, `Why`, mandatory verification, mandatory notes, stop conditions, the execution boundary, and then the complete contract (`scripts/contract-run.ts:629-665`).

The static estimate for `global + root + fast-worker persona + SubagentStart + representative worker prompt` is about **8,692–8,751 tokens**. The representative prompt is the 9,532-byte dry-run output for `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md`; the estimate uses the repository's `ceil(UTF-8 bytes / 4)` method. This composition applies only when the persona profile is actually loaded—native child identity is not proof of that. It excludes provider system instructions, tool schemas, the user's request, and history. The 1,500-token SessionStart budget does not constrain any of these other layers.

There is also a composed-path contradiction: permission-only delegation correctly states that no active contract was resolved and omits the boundary, while SubagentStart unconditionally tells every role to read the active contract and injects an implementation-oriented boundary. Read-only explorer/reviewer roles receive “implement exactly” language even when they should not implement anything.

### Trace C — declared runner constraints

1. The contract template exposes `tokens`, `tool_calls`, `wall_time_minutes`, `writable_paths`, and `network` (`assets/templates/contract.template.md:74-105`).
2. `parseDelegation` reads those values (`scripts/contract-run.ts:327-358`).
3. The child runs through `spawnSync(..., shell: true)` with the inherited process environment (`scripts/contract-run.ts:542-569`).
4. Only `tool_calls` affects execution, and it increments once per worker/verifier launch (`scripts/contract-run.ts:610-618,685-719`).

Therefore non-null token, wall-time, network, and writable-path constraints are not enforcement truth. Prompt wording cannot repair this; unsupported hard constraints must fail preflight or be enforced by a runner capability.

## Audit findings

### What already aligns

- **Explicit-first routing** keeps free-form language out of permission authority.
- **Contract and allowed-path enforcement** put scope in machine-readable artifacts rather than relying on model obedience.
- **Evidence before completion** checks contract results, review recommendation/freshness, external acceptance, structured checks, and unfinished tasks before archive (`assets/hooks/prompt-guard.sh:1221-1365`).
- **SessionStart hygiene** applies a 1,500-token limit, dedupes per session, compacts by priority, and fails closed on mandatory overflow (`src/cli/hook/session-context-budget.ts:5,159-225,350-396`).
- **Delegation limits** cap agents/depth and forbid overlapping writers (`.ai/harness/policy.json:191-203`).
- **Runner degradation** is allowed only on the same task contract and is explicitly not a product-semantics compatibility fallback.
- **Migration order** is already serial and evidence-first: LSC characterization precedes semantic changes, followed by HRD, EPC, and SSD (`plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md:96-150`).

### Gaps ranked by impact

#### P0 — permission and enforcement truth

1. **Unsupported runner constraints appear enforceable.** Add a runner capability matrix. A non-null budget or permission dimension must either bind to a real runner control or fail preflight with a typed `unsupported_*_dimension` result. Rename the current `tool_calls` field to `runner_invocations` unless real model tool usage is available.
2. **Unknown plan status fails open.** `src/cli/hook/prompt-guard-decision.ts:208-213` returns `allow`, while `assets/hooks/pre-edit-guard.sh:236-251` only blocks `Draft|Annotating`. Establish one closed status parser: only explicitly authorized implementation states may edit; malformed, unknown, and terminal states must fail closed with a repair action.
3. **The public helper runner has a budget contradiction.** `repo-harness run` calls `runHelper({ helper, args })` without a helper-specific timeout (`src/cli/commands/run.ts:29`), so the process runner applies its global 120-second default (`src/effects/process-runner.ts:29,62`). The contract verifier itself declares a 600-second budget (`scripts/verify-contract.sh:5`). In the verified remediation slice, `repo-harness run verify-sprint` killed a healthy helper at 120 seconds, while direct execution completed with contract duration 531,312 ms and wrote a passing receipt. Define typed per-helper budgets in the workflow contract or make the wrapper consume the helper's declared bound; an operational entrypoint must not be shorter than the verification contract it launches.

These are correctness fixes, not prompt optimization. They must be characterized and resolved before claiming that a leaner prompt preserves safety.

#### P1 — duplicate and contradictory runtime context

1. **No full-stack budget.** User global rules are 8,916 bytes, self-host root instructions are 11,821 bytes, the installed fast-worker persona is 3,148 bytes, and the `20260715-0401-self-host-adopt-boundary` dry-run worker prompt is 9,532 bytes. SessionStart's separate cap does not cover the sum.
2. **`EXECUTION_BOUNDARY` has multiple active owners.** Its canonical text is 841 bytes/about 211 tokens. A managed persona plus SubagentStart repeats about 422 tokens; inheriting contract-bound advisor context can raise that to about 633 tokens. Static source projection is not itself the problem; repeated text in one rendered child stack is.
3. **SubagentStart is not role/state aware enough.** It should emit contract implementation boundaries only when a valid active contract exists and the child has a writable implementation role. A no-contract or read-only child needs a different, smaller scope/reporting packet.
4. **Contract worker is process-first and duplicates authority.** It repeats `Why`, adds about 851 tokens of preamble in a representative case, then appends the full contract. The Notes instruction is unconditional, while root rules say task notes exist only for non-obvious decisions. The full contract should appear once; the worker prefix should contain only role-specific deltas and exact evidence/stop requirements.
5. **Static minimal-change guidance can displace live state.** `minimal-change-context` restates first principles, smallest change, single authority, no compatibility, and abstraction thresholds already present globally/root-locally. Dynamic risk, state, permission, and verification facts deserve the runtime budget first.

#### P1 — prompt authority drift

The canonical global template is 7,037 bytes and matches its docs mirror, while the live `~/.codex/AGENTS.md` is 8,916 bytes with no managed markers. `mergeManagedBlock` deliberately reports such files as `skipped-legacy` (`src/cli/commands/init.ts:273-301`), and setup checks only test that Global Working Rules are present (`src/cli/commands/init-hook.ts:384-438`). The live file contains useful additional stop/cost/evidence rules, but the harness cannot identify which content is canonical, stale, or user-owned.

Do not overwrite this user file. Add a read-only semantic/hash status first, then design an explicit one-shot managed-block migration that preserves unambiguous user-owned sections outside the block and fails closed on ambiguous content. After cutover, retire the legacy authoring path rather than maintaining dual authorities.

The current opening rule also says not to send optional progress commentary, whereas the OpenAI guide recommends one short preamble and sparse phase updates for tool-heavy work. Replace neither policy silently. Evaluate an event-triggered contract—first tool preamble, >10-minute cost notice, blocker/scope-change, and major checkpoint only—as a separate user-level decision.

#### P1 — effort and evaluation attribution

The fleet currently uses no `medium` or `low` setting: fast-worker is `max`; deep-reasoner and gatekeeper are `xhigh`; the remaining roles are `high`. There is no same-task, same-grader current-versus-one-lower effort A/B. Moreover, native child model/effort inheritance must be observed at runtime; installed TOML mapping is not proof that the intended role setting was applied.

The latest authoritative profile report shows equal coarse pass counts but materially different cost:

| Profile | Pass | Known tokens | Relative tokens | Average duration | Relative duration |
|---|---:|---:|---:|---:|---:|
| no-harness | 9/9 | 618,250 | 1.00× | 46,576 ms | 1.00× |
| adaptive-lite | 9/9 | 1,851,145 | 2.99× | 89,544 ms | 1.92× |
| strict-harness | 9/9 | 1,974,046 | 3.19× | 105,048 ms | 2.26× |

Source: `evals/harness/reports/profile-comparison.md:1-18`. The record schema does not include model or reasoning effort, so these results prove that the profiles are more expensive under this corpus, but cannot attribute the difference to a prompt component or effort tier.

Start effort calibration with fast-worker `max → high`, then explorer `high → medium`; keep judgment roles at their current baseline until data exists. Change one role at a time and require actual applied model/effort evidence.

#### P1 — adapter status used the wrong profile authority

The source registry defines 11 managed Codex routes. The operator machine still
records a protocol-1 `standard` install with 7 routes; this research slice did
not mutate that user-level state. Current protocol-2 source exposes only
`minimal` (7 routes) and `full` (11, default). Normal readers reject the legacy
record instead of reinterpreting it, and status reports it as invalid against
the full fallback baseline until an explicit migration selects a new profile.
The omitted subagent guard, delegation advisor, SubagentStart context, and
SubagentStop quality routes are full-only lifecycle surface.

Do not repair user-level host configuration merely to reach 11/11. The
operator must explicitly run protocol migration and choose the target:
`minimal` must then read back 7/7, while `full` must read back 11/11 and rerun
the composed-path canary. Until that action, source capability and live host
behavior remain separate claims.

The same setup check also reports Waza missing and only 1/3 required Codex automation skills. Those are environment readiness gaps, not evidence that prompt guidance is wrong, and they remain outside this research change.

#### P2 — performance and documentation drift

- A 10-iteration hook-diet probe passed the prompt-decision baseline (`p95=32.76 ms`) but failed the 250 ms phase baseline because `state-snapshot p95=771.02 ms`. The report is in the ignored runtime cache at `.ai/harness/runs/20260716-gpt56-prompt-audit-hook-diet-10.json`. This reinforces the existing HRD goal of one state collection per event.
- `docs/reference-configs/external-tooling.md:435-445` does not list the supported `fable → gpt-5.6-sol` mapping and documents stale assignments for deep-reasoner and gatekeeper. Current sources are `deep-reasoner=opus/xhigh` and `gatekeeper=fable/xhigh`; the installer supports `fable` at `scripts/install-agent-fleet.sh:124-127`. Documentation parity must be restored before effort experiments are interpreted.
- Codex Stop success output is deliberately suppressed because the host rejects it (`src/cli/hook/runtime.ts:349-374`; `docs/architecture/modules/runtime-harness/hook-adapters.md:76-89`). Codex persistence must live in state/resumption/completion verification; Stop is not a Codex veto gate.

## P3: Optimization plan

### Decision

Preserve the **deterministic kernel + advisory language layer**. Do not add a broader semantic prompt classifier. Do not adopt programmatic tool calling merely to shorten prompts: the guide reserves it for bounded deterministic reductions with explicit schemas/retry/stop rules, and no current repo-harness pressure point requires it.

Use the existing program rather than creating a parallel rewrite:

| Order | Bounded slice | Change | Acceptance |
|---:|---|---|---|
| 0 | LSC-01 characterization input | Add a read-only rendered prompt ledger: source hash, bytes/tokens, active owner, duplicate-clause count, applied model/effort, pass/block/repair, latency. Characterize malformed/unknown plan status and unsupported runner dimensions without production edits. | Fixed corpus and current behavior are reproducible; no prompt or runtime behavior changes. |
| 1 | LSC decision/amendment | Make plan status closed and runner constraint claims truthful, including helper-aware CLI timeouts whose outer bound is at least the launched verifier's declared budget. This is new implementation authority and must be explicitly added to an approved work package; this research file does not amend the sprint. | Unknown/malformed status blocks; every non-null runner constraint is enforced or rejected; `repo-harness run verify-sprint` can complete a valid 600-second verifier without an outer 120-second kill; safety tests remain green. |
| 2 | HRD-04 / HRD-08 | Render one role/state-aware Context Packet per event, budget the composed dynamic context, dedupe the boundary in the final child stack, and measure state collection. | Contract-bound writable child has exactly one boundary; read-only/no-contract child has zero implementation boundary; state-snapshot p95 ≤250 ms on the same probe. |
| 3 | Contract prompt migration | Make the contract the single execution brief; keep a short role/evidence/stop delta, make Notes conditional, and pass the worker report path to the verifier. Change only this prompt group. | Representative worker prefix shrinks materially; real worker→verifier handoff passes with unchanged safety/quality. |
| 4 | EPC-08 | Make SessionStart consume the canonical recovery Context Packet rather than parallel projections. | SessionStart stays ≤1,500 estimated tokens and only actionable state is injected. |
| 5 | SSD | Project only task-relevant skills and expand bilingual positive/negative activation evals. | Exact per-profile skill set and false-activation corpus pass; no keyword authority is added. |
| 6 | Post-baseline prompt/effort migration | One-shot global managed-block decision, role-by-role effort A/B, and separate event-triggered commentary experiment. | One authority per rule, live adapter matches the explicitly selected protocol-2 profile after any authorized migration (`minimal` = 7/7; `full` = 11/11), actual model/effort recorded, quality non-regression with measured token/latency change. |

The first three observable savings are bounded and independently testable:

- remove the duplicate child boundary: about 422 tokens on persona + SubagentStart paths;
- remove static minimal-change repetition from dynamic SessionStart context: up to about 306 tokens when active;
- shrink the representative worker preamble from about 3.4 KB toward 1.5 KB without dropping outcome, permissions, evidence, or stop rules.

Do not use OpenAI's internal 10–15% quality, 41–66% token, or 33–67% cost changes as acceptance thresholds. They only justify testing the direction on this repo's own task distribution.

## Acceptance matrix for any implementation

| Invariant | Required evidence |
|---|---|
| Permission remains deterministic | Unknown/malformed state and unsupported non-null constraints fail closed in positive/negative tests. |
| No rule is lost during slimming | Outcome, success bar, allowed paths, approval boundary, evidence, and stop conditions each have one rendered owner. |
| No active-stack duplication | Contract-bound writable child: one `EXECUTION_BOUNDARY`; read-only/no-contract child: zero implementation boundary. |
| Context is measured | Every run records component hashes, bytes/tokens, applied model/effort, cache usage, duration, block/repair, and quality verdict. |
| Effort change is attributable | Same task, same grader, same prompt group, current effort versus one lower setting; one role per package. |
| Host truth is explicit | Registry coverage, recorded install profile, and live adapter are reported separately; lifecycle claims require protocol-2 profile-relative readback and a live canary (`minimal` = 7/7; `full` = 11/11). |
| Migration is surgical | One prompt group per independently reviewable package; no steady-state compatibility or dual authority. |
| Quality is not traded away | Existing routing, context-budget, contract, workflow, security, and representative task evals remain green. |

## Deferred or rejected actions

- No wholesale rewrite into the article's suggested prompt outline.
- No new semantic fallback, multilingual keyword expansion, or shadow parser.
- No programmatic tool-calling adoption without a bounded deterministic reduction that needs it.
- No change to `text.verbosity`, persisted reasoning, or assistant-phase wire state from this repo; those are provider/host-owned unless an explicit API contract is added.
- No automatic edit to `~/.codex/AGENTS.md`, `~/.codex/hooks.json`, Waza, or automation skills in this research task.
- No early SSD implementation before LSC, HRD, and EPC gates complete.

## Reproducible evidence

Read-only or runtime-cache commands used for this audit:

```bash
repo-harness state resolve --json
codegraph explore "repo-harness prompt routing, hook runtime, context budget, delegation and contract worker call paths"
repo-harness setup check --target codex --json
bun test tests/prompt-routing-explicit-first.test.ts tests/harness-context-budget.test.ts tests/cli/prompt-guard-decision.test.ts tests/contract-run.test.ts
bun scripts/hook-dispatch-diet-report.ts --repo . --iterations 10 --out .ai/harness/runs/20260716-gpt56-prompt-audit-hook-diet-10.json
out="$(mktemp -d)"
bun scripts/contract-run.ts dry-run --repo . --contract tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md --out "$out"
wc -c tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md "$out/worker-prompt.md"
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
```

Observed results:

- Focused tests: **57 passed, 0 failed**.
- Project-state inspection: no drift signals or required decisions.
- Adoption dry-run: zero operations.
- Representative contract / worker prompt: 6,127 / 9,532 bytes; 66 tracked contracts were in the scan surface.
- Hook registry target: 11 routes / 15 script invocations.
- Prompt decision p95: 32.76 ms, within 250 ms.
- State snapshot p95: 771.02 ms, outside 250 ms.
- Synthetic idle SessionStart: 0 tokens, within the 1,500-token cap; this does not prove an active-session bound.
- Live Codex adapter: 7 managed routes under an unmigrated protocol-1
  `standard` record. Current source intentionally reports that state invalid
  until explicit migration; no protocol-2 host readback is claimed here.
- Isolated remediation closeout: final full suite **1599 pass / 1 skip / 0 fail** with 14,333 assertions; Claude returned no P1/P2 findings; direct source `verify-sprint` passed with benchmark status `not_applicable` and empty hashes.
- CLI/runtime budget falsifier: `repo-harness run verify-sprint` timed out at the global 120-second wrapper limit, while the same source helper completed successfully and its nested contract verifier recorded 531,312 ms. This is the concrete acceptance fixture for the helper-aware budget proposal above.

## Related repo evidence

- `docs/researches/20260712-harness-kernel-reduction.md`
- `docs/researches/20260715-skill-surface-discovery-audit.md`
- `docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`
- `docs/researches/20260714-bdd3-ps1-protected-shape-outcome.md`
- `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
- `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- `evals/harness/reports/profile-comparison.md`

The BDD3 prompt-shape experiments ended `unsafe_reject`/unsupported. They are a local reminder that generic prompt advice is not product authority: any prompt reduction here must pass representative repo-harness evals before it can replace a current rule.

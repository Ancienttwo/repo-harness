# Harness Overview

This repo uses a shared long-running harness. The durable workflow lives in repo-local artifacts, not in chat memory.

## Adoption Model

Use this file as the first onboarding map after `repo-harness init` adopts
or refreshes a repo. The harness gives agents three durable surfaces:

- **Shared standards**: `docs/spec.md`, `docs/reference-configs/`, root
  `AGENTS.md`, and root `CLAUDE.md` explain stable product intent, coding
  rules, and local workflow boundaries.
- **Work ownership**: the GitHub issue and PR hold task identity, claim,
  dependencies, scope, checks, review and rollback. Ordinary tasks need no
  separate local artifact.
- **Product intent**: `docs/prds/*.prd.md` holds product intent. A design brief
  is optional at `docs/prds/DESIGN-*.md`.
- **Session journal**: `.ai/harness/handoff/` and `.ai/harness/events.jsonl`
  let a new agent session resume from repo state without treating chat history
  as authority.

The install is not an app scaffold or an agent gateway. It adds a reviewable
workflow contract around an existing repo, then leaves product code ownership
with the project.

Use `repo-harness catch-up` for a read-only text brief across registered repositories.
It uses the existing dev-activity collector and snapshot, with no new state.
Repeat `--repo <path>` to show selected registered roots after collection.
Collection and JSON `status` still cover all registered roots.
Use `--max-items N` to cap text items per repository; the default is 10.
Attention stays complete. A non-ok Git or GitHub source replaces item lines with its status.
This also applies to repositories without a GitHub remote.
Use `--json` for the full selected snapshot on one line; the text cap does not apply.
This pattern is adapted from pstack (cursor/plugins, MIT, Lauren Tan).

## Roles

Work follows the GitHub issue and PR. The `repo-harness-issue-flow` skill
splits an issue into ordered issues and runs dispatch.

- **Issue owner and implementer** writes the goal, scope, acceptance checks and
  dependencies in the issue. The PR holds the changes, checks and rollback.
- **Reviewer** starts from the PR description and CI. The independent review
  level follows the diff risk.
- **Product planner** writes product intent to `docs/prds/*.prd.md`. Product
  intent does not start work.
- **Architecture owner** updates `.archcontext/model/` and `docs/architecture/`
  only for a real responsibility change.

## State Flow

1. `docs/spec.md` captures stable product intent.
2. The GitHub issue captures task identity, claim, dependencies and acceptance.
3. The PR captures the implementation, checks and review.
4. `docs/prds/*.prd.md` captures product intent. `docs/prds/DESIGN-*.md` holds
   an optional design brief.
5. `.ai/harness/policy.json` holds machine-readable settings.
6. `information_lifecycle` separates evidence, reusable assets, advisory
   memory and external knowledge.
7. `agentic_development` keeps product, engineering and design planning
   parent-owned, with `geju` framing and Waza routes.
8. `external_tooling` captures host install and update defaults.
9. The capability authority declares prefixes, contract files, architecture
   modules and verification hints.
10. `.ai/context/context-map.json` indexes stable root context and discoverable
    capability context.
11. `documentation` keeps generated docs minimal.
12. `lsp_profiles` selects tooling hints per capability.
13. `worktree_strategy` isolates task work in `codex/<slug>` worktrees. Start
    it with `repo-harness run contract-worktree start --issue <number>`.
14. `.ai/harness/handoff/` preserves resumable state.
15. `.ai/harness/events.jsonl` and `.ai/harness/runs/*.json` retain execution
    traces.

## Session Boundaries

- Exploration is allowed before an issue exists. No plan file is needed.
- Implementation follows the scope in the issue and PR. Widen scope only when
  the issue or PR records it.
- Completion records the commands and results in the PR. CI is the authority.
- Stop refreshes `.ai/harness/handoff/current.md` for resume.
- Do not create or read plan, sprint, contract, notes, review, todo, workstream
  or current-status files.
- Use `docs/reference-configs/agentic-development-flow.md` for skill routing and
  `docs/reference-configs/external-tooling.md` for install and update commands.
- Use `docs/reference-configs/global-working-rules.md` as the user-level
  Claude/Codex rule template; keep repo-local rules in repo files.
- Externalized reference docs may be indexed by
  `.ai/harness/brain-manifest.json`. Drift checks and export through
  `repo-harness brain check` / `repo-harness brain sync` are explicit operator
  actions and never part of hook or workflow correctness.
- Run task work in an isolated `codex/<task-slug>` worktree. Merge through the
  PR flow.
- Adoption retires legacy hook/runtime assets only inside the canonical
  `FsTransaction`: declared paths require an exact SHA-256 match, while
  mismatches, ambiguous app-owned files, and custom adapter siblings are
  preserved and reported.

## Documentation Profile

- Default profile: `minimal-agentic`.
- Required docs: `docs/spec.md` and `docs/architecture/index.md`.
- Optional docs such as `docs/brief.md`, `docs/tech-stack.md`, `docs/decisions.md`, `docs/architecture.md`, and `docs/packages.md` are created only when the agent has concrete repo evidence or the user asks.
- Root `specs/` is a legacy scaffold surface; use `docs/spec.md`, `interfaces/`, and tests instead.
- Use `docs/reference-configs/document-generation.md` for the creation rules.

## Information Lifecycle

- Notes: the PR description is task-local and auditable. It is not durable
  knowledge by default.
- Evidence: native execution supplies current check facts. `.ai/harness/runs/*.json`
  keeps ignored local verification snapshots. Promote durable conclusions into
  `docs/researches/`, lessons, ADRs or architecture.
- Human reading surface: `docs/spec.md`, `docs/architecture/` and durable
  `docs/researches/` conclusions. The issue and PR describe active work.
- Local retention: `repo-harness retention` moves ignored artifacts to a
  gitignored local archive root after 30 days. It scans three classes: check
  logs (`.ai/harness/checks/*.log`), run records that no code reads back, and
  fs-transaction backups (`.ai/harness/backups/fs-transaction/`). An archived
  backup no longer serves a rollback by manifest; restore it by hand. The
  command is a dry run by default. Add `--apply` to move the entries. It skips
  entries in the `keep` list, entries newer than the window, tracked files,
  modified files and entries whose destination exists. An archived entry is
  deleted once its newest write is older than `archive_days` (default: `days`
  plus 60). Retention deletes nothing outside the archive root. `--json` also
  lists every harness storage root and its rule. Configure it in
  `.ai/harness/policy.json`:

  ```json
  "information_lifecycle": {
    "retention": { "days": 30, "archive_days": 90, "archive_root": ".ai/harness/archive/retention", "keep": [] }
  }
  ```

  All fields are optional. A malformed or non-canonical field fails the
  command. The archive root and every destination must be gitignored. A scanned
  or archive path through a symlink fails the command. The default root is under
  `.ai/harness/archive/`, which the generated `.gitignore` block already
  ignores.
- Local-only process artifacts: a repository that does not commit runtime
  evidence can add these patterns below the generated `.gitignore` block. Keep
  the negation so `tasks/lessons.md` stays tracked. Leave out `*.jsonl` if the
  repository tracks JSONL data.

  ```gitignore
  tasks/*
  !tasks/lessons.md
  .ai/harness/architecture/archive/
  .artifacts/
  **/evidence/
  *.jsonl
  ```

  The generated block already ignores `.ai/harness/runs/`,
  `.ai/harness/checks/`, `.ai/harness/archive/` and `_ops/`. Ignoring a path
  does not remove blobs that Git already tracks; untrack them with
  `git rm --cached` in a separate change.
- Memory: `docs/researches/` and `tasks/lessons.md` are advisory. Current repo
  state and evidence override summaries.
- External knowledge: `brain/<project>/*` is an optional operator-managed
  export surface for long-form explanations, runbooks, decisions, and patterns.
  Hooks and workflow checks never read, write, or gate on its state.
- Assets: policies, hooks, scripts, templates, and reference configs only change
  when a pattern has evidence across tasks or fixtures.

## Trace Evidence

`repo-harness run verify-sprint` runs local checks. It writes no verification report. The trusted control Bot first supplies an approved admission through `repo-harness review admit --request <request.json> --repo .`. The Bot withdraws it through `repo-harness review revoke --request <revocation.json> --repo .`. The revocation request names the campaign (`repository_id`, `issue_id`, `campaign_id`), `expectedGrantSha256` and `expectedRevision`. The command revokes only that exact active grant. The admission must include the approved positive safe-integer `issue_number`, distinct from the provider global `issue_id`. Its digest binds this lookup locator; changing it requires new approval and does not change the campaign key. The admission must explicitly select `execution_mode: "contract"` or `execution_mode: "inline"`; no mode is inferred from a task or local file. Changing mode requires new upstream approval. Verification and assessment consume that admission, not a contract path. Pass `--repository-id`, `--issue-id`, `--campaign-id`, `--grant-sha256`, `--policy-sha256` and `--actor` from the active admission to `repo-harness run verification-plan execute --repo . --report-file .ai/harness/runs/<run-id>.report.json` and `repo-harness run change-assessment prepare`. The latter writes the independent assessment. These selectors bind an existing approval; they do not grant permission. If a packet has a reviewer-disagreement overlay, pass its path with `--packet` when you prepare it again. Acceptance uses that explicit native report and its immutable backing events and runs. Missing or empty verification evidence cannot pass.

`repo-harness run harness-trace-grade --run <trace> --strict` applies the local
graders used for workflow regression checks: command evidence exists, the
acceptance evidence is current, and changed files stay inside the issue or PR
scope.

## Harness Cost Evidence and SLOs

Harness cost reports separate measured values from unavailable telemetry. A
metric is authoritative only when its named source exposes that value directly;
missing or incomplete event metrics remain unavailable.
Reports must not derive model calls from turns, subagents from tool-name text,
billing tokens from byte counts, or hidden legacy-script I/O from local
heuristics.

The current evidence sources and their reader are:

- `.ai/harness/runs/hook-events.jsonl` is the sole hook runtime telemetry
  authority. `src/cli/hook/runtime.ts` appends exactly one
  `loop-engine-hook-event/v2` record per eligible handled host event. The
  record carries the payload identity (`session_id`, `run_id`, `turn_id`), the
  exit code, `blocked`, `reason`, `elapsed_ms` and a semantic fingerprint. It
  has no step or metric fields. `reason` separates a policy block (`blocked`)
  from a thrown handler (`handler-failed`). The telemetry append is
  non-authoritative: append failure never changes hook safety.
- `readHookMetrics` in `scripts/run-harness-profile-benchmark.ts` reads the
  active log and its owned archives. It rejects malformed records and records
  from another protocol. The HRD-08 measurement script is retired. Its removal
  does not change runtime telemetry.
- `scripts/run-skill-evals.ts` for end-to-end benchmark duration, changed-file
  evidence, graders, and provider-structured usage. Claude single-result JSON
  and Codex JSONL are parsed independently. Raw output remains an artifact, and
  absent or malformed usage makes only the usage fields unavailable; it does
  not rewrite agent exit or grader status.

Historical HRD-08 report targets:

The retired diet reporter measured these targets. No current report owns their
SLO measurements. Existing runtime tests still check their named invariants.
These targets are not a standing gate.

- Runtime entry: exactly one per eligible host event.
- Direct runtime-dispatch child processes: at most one per event. This does not
  claim to count internal `git`/`bun` plumbing or OS process syscalls.
- Effective State resolution: exactly one for the measured PreEdit and Stop
  target routes.
- PreEdit event p95: target at most 150 ms, initial hard budget 250 ms.
- PostEdit: zero full recovery-projection writes and at most one journal event
  write.
- Stop: at most one recovery-projection write transaction.
- Synthetic hook phase p95: at most 250 ms per probe.
- Estimated actionable SessionStart context: at most 1,500 tokens using the
  explicitly labeled byte heuristic.
- Inert SessionStart: zero additional context bytes.
- Full, non-dry-run benchmark on a supported structured CLI: token usage should
  have `structured_cli` authority. A CLI that does not expose structured usage
  is reported as unavailable rather than silently passing with zero tokens.

The SessionStart budget is global across the aggregated context payload, not a
per-hook allowance. Duplicate sections are identified from both content and
behavioral metadata (`priority`, `mandatory`, `actionable`, and `reference`).
When the budget is pressured, structured harness-state fields are compacted in
a deterministic priority order while preserving the critical workflow state.
If all mandatory critical state cannot fit, aggregation returns a structured
fail-closed overflow result naming every affected section instead of silently
discarding an earlier mandatory section.

Claude cache reads and cache creation tokens remain separate provider fields;
neither is folded into input tokens. Codex cached input remains its own field,
while cache creation stays `null` because the Codex JSONL contract does not
expose it.

`scripts/run-skill-evals.ts` owns the isolated 3-by-9 matrix: **No Harness**,
**Adaptive Lite**, and **Strict**, each across nine scenarios and three runs.
No Harness uses a disposable host home with repo-harness adapters and managed
Skills absent; the harness profiles install into separate disposable homes.
Every authoritative run binds the report to the tested source commit, requires
structured provider usage, records actual hook invocation count and cumulative
hook wall time from hot-path spans, and grades changed files plus the explicit
workflow-artifact path contract. The checked-in report is
`evals/harness/reports/profile-comparison.{json,md}`; it is replaced only by a
complete authoritative matrix, never by a partial or dry-run result.
The two generated comparison files are verification evidence, so regenerating
them is excluded from implementation review freshness just like checks and run
cache; their own source commit, input hashes, provider authority, graders, and
external acceptance remain the evidence-integrity boundary. `verify-sprint`
also records a separate hash of the actual JSON and Markdown bytes in structured
checks; later report edits stale checks without staling the implementation review.

Provider request/model-call count, native subagent count, and true
time-to-first-edit remain unavailable when the provider CLI does not expose
them as structured fields. Reports retain `null` plus the authority reason
rather than inferring those values from turns, tool names, or timestamps.

## Capability Context

- Do not infer agent context boundaries from physical layout globs such as `apps/*`, `packages/*`, or `services/*`.
- Under `capability_source: registry`, declare capabilities in `.ai/context/capabilities.json`; each capability owns prefixes, paired contract files, an architecture module and local verification hints.
- Under `capability_source: registry`, add selected capabilities with `repo-harness-setup` (capability mode) or `repo-harness run capability-config add --prefix <path>` when the harness already exists and a full init/migrate/upgrade pass would be too broad.
- Under `capability_source: archcontext`, `.archcontext/model/nodes/` declares the capabilities. Change them only through an archctx ChangeSet, as `repo-harness-architecture` describes. To move a registry repository to ArchContext, follow "Adopt ArchContext in a repository" in that skill's worker reference. `repo-harness architecture-projection status --json` names that step in `next`.
- Resolve edited paths through `repo-harness run capability-resolver match --path <path>`; longest prefix wins and equal-length ambiguity fails.
- Treat `.ai/context/agent-context-blocks.txt`,
  `REPO_HARNESS_CONTEXT_BLOCKS`, and existing nested `CLAUDE.md`/`AGENTS.md`
  files as migration inputs only; the capability registry is runtime authority.
- Selected capabilities receive paired `CLAUDE.md` and `AGENTS.md` files so Claude Code and Codex share the same local contract.
- Use `repo-harness capability-context status|sync` to keep paired local context files aligned with the registry. The command writes only the controlled `CAPABILITY CONTEXT` block and preserves hand-authored content plus the separate architecture contract block.
- `.ai/context/capability-source-map.json` is the optional human-edited source-map manifest for capability positioning and source pointers. Missing entries fall back to registry/architecture/workstream metadata; `--auto-fill-positioning` writes deterministic draft entries explicitly, not from hooks.
- Under `capability_source: archcontext`, the sync target is the node's declared `extensions.contractFiles`. The block positioning is the node summary. Sync refuses a contract file that another capability also declares, for example the root `AGENTS.md`. It then writes no file.
- No hook queues capability-context work. Under `capability_source: registry`, the Agent runs `repo-harness capability-context sync --capability <id> --apply` or `--path <path> --apply` when a change needs it.
- Under `capability_source: archcontext`, the Agent fixes debt in the model and human prose. The archctx rolling writer publishes generated output. It runs `capability-context sync --apply` only to write the declared contract files of one capability, as the item above describes. It does not run sync to repair the root contract.

## Initializer and Runtime Model

Maintainer-facing detail on how the initializer and runtime defaults are wired.

- Plan menu is tiered: **Core Plans (A-F)** first, **Custom Presets (G-K)** only when needed.
- Skill routing is inspection-first: `scripts/inspect-project-state.ts`, `src/effects/adoption/standard-plan.ts`, `assets/workflow-contract.v1.json`.
- The workflow is issue/PR-driven: `docs/spec.md -> GitHub issue -> PR/CI -> .ai/context/context-map.json -> .ai/harness/*`. Product intent lives in `docs/prds/`. Ordinary tasks need no local plan, contract or review file.
- Generated and self-hosted repos use `.ai/harness/workflow-contract.json` as the opt-in marker.
- The marker can declare `minimum_harness_version`, a release version such as `0.22.1`. A hook that runs an older repo-harness then reports an upgrade instruction (`repo-harness update`) on SessionStart, UserPromptSubmit and Stop. It exits 1, which does not block, and does not resolve state for these events. PreToolUse skips this check, so every edit guard still runs. `repo-harness doctor` and `repo-harness update --check` report the same instruction. Declare it when a release changes the model shape that older readers cannot parse. Adoption keeps the declared value.
- The package asset `assets/workflow-contract.v1.json` defines the workflow contract.
- `repo-harness init` writes the marker, `.ai/harness/policy.json` and the root `CLAUDE.md` and `AGENTS.md`. `src/effects/adoption/standard-plan.ts` is the only writer of the root context files. Shell scaffold scripts do not write the marker or the root context files.
- Host events use the user-level managed adapter projection, the 11-tuple
  `route-registry.ts`, and exactly one typed in-process handler per tuple.
  Operator helpers run from the installed package through
  `repo-harness run <helper>`. Init preserves legacy repo copies of the retired
  shell library. Doctor reports them with migration steps.
- Generated and migrated repos keep discovery and complex/design planning in the parent agent: `geju` opens the pre-contract frame, then the parent completes P1/P2/P3 and freezes the accepted direction. Daily small/medium work uses Waza with Codex-first runtime copies in `~/.codex/skills`; durable knowledge stays in repo-authored research and lessons.
- `repo-harness install` bootstraps the package-owned Codex/Claude runtime pieces for the default workflow: refreshes `repo-harness` skill aliases, installs global Codex/Claude hook adapters, persists the brain root in `~/.repo-harness/config.json`, and configures CodeGraph MCP for selected host agents. Mutable Waza and Mermaid providers are installed only after explicit selection. `repo-harness init` adopts the repo-local workflow only and installs none of these host runtime pieces.
- The recommended `reverse-skill-router` remains explicit-only through `--with-reverse-skill` because its upstream authorization assumption cannot replace independently verified scope; the pinned selected tree is integrity-checked before host projection.
- Read-only external-tooling audit stays advisory: `repo-harness run check-agent-tooling --host both --check-updates`. The explicit mutating boundary is `repo-harness update`, which reconciles mandatory ArchContext packages and runtime and updates the global CodeGraph CLI/MCP; mutable Waza/Mermaid providers require `--with-external-skills`. It does not initialize or sync a repository CodeGraph index.
- Manual distillation stays repo-local: repeated corrections -> `tasks/lessons.md`; deep findings and hidden contracts -> topic-scoped `docs/researches/*.md`; verification evidence -> PR/CI; release history -> `docs/CHANGELOG.md`.

### Package Manager Defaults

- General default priority: `bun > pnpm > npm`.
- **Plan G/H** (Python-centric) default to **`uv`** as the primary package manager.

### Package Authority Files

Maintainer-facing map of which package file owns which contract:

| File | Owns |
|---|---|
| `SKILL.md` | Root Skill spec |
| `CLAUDE.md`, `AGENTS.md` | Root routing docs |
| `assets/plan-map.json` | Plan catalog mapping |
| `assets/reference-configs/` | Runtime reference docs, resolved through `repo-harness docs` |
| `assets/workflow-contract.v1.json` | Workflow contract manifest |
| `docs/reference-configs/*.md` | Source-repo projection of the runtime reference docs |
| `scripts/inspect-project-state.ts` | State inspector |
| `src/effects/adoption/standard-plan.ts` | Canonical adoption planner |
| `scripts/check-agent-tooling.sh` | External tooling detector |
| `scripts/init-project.sh`, `scripts/create-project-dirs.sh` | Scaffolding steps |

Generic-review writes its Markdown acceptance projection in the ignored review session directory under .ai/harness/runs/. It keeps the verified source tree intact. The host-owned receipt and review result retain acceptance authority. An explicit projection into a tracked review file changes the source tree and requires new execution evidence.

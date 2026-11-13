# repo-harness

## Workflow
- Multi-agent work follows `repo-harness-issue-flow` (`assets/skills/repo-harness-issue-flow/SKILL.md`): roles, claims, handoff, dispatch, acceptance and merge.
- `docs/architecture/archimap.html` is the single architecture entry. It links each module to its archctx-projected capability doc in `docs/architecture/modules/`. Change boundaries only through `repo-harness-architecture`; do not hand-write other architecture docs.
- The owner keeps every security decision (owner, 2026-11-09, #2008): credentials, tokens and secrets, and each change that reads, moves or exposes them; permissions (seat tool grants, network access, sandbox settings, hooks (changes to hook behavior or hook configuration; a change under `src/cli/hook/**` that changes neither takes the High review rule: two PASS rows, one different-family), confirmation bypass); the safety net (branch protection, `publication.acceptance_merge`, force push to main, the `Required / CI` definition); deletion that git cannot restore (unpushed commits, dirty worktrees, owner files outside a repository such as `~/.repo-harness`, `~/.claude` or `~/.codex` without a backup); and production: the owner's word for each release (it starts the host command list that publishes both packages to npm, creates the release tag and the GitHub Release) and each production deployment. A production deployment needs an explicit owner authorization for that deployment; no standing GO and no joint decision covers it. The life cycle goes as far as the release PR (prep, version and CHANGELOG commits, push, checks, merge by rule 2). A staging or test deployment (scratch-HOME tarball install, release dry run, prerelease environment, Windows test box) is a joint decision.
- Main publication is allowed only when `publication.acceptance_merge` is `on` in the policy on the PR base, and the current task explicitly authorizes main publication, or rule 2 or rule 3 applies; the skill defines who merges. Push needs task authorization. An explicit no-merge instruction that reaches a seat locally (task or pane) always wins; a no-merge comment is a reference under rule (8). Life-cycle rules (owner, 2026-11-09, #2008): (1) A fix loop continues after round 3 without the owner while each round has fewer blocking findings (P0-P2) than the round before and the scope does not grow. A grown scope is a joint decision. A new P0 finding, or a new P1 finding about security, secrets, data or authentication, stops the loop at the owner; any other new P1 finding does not stop it. Round 5 is the hard stop. (2) In an owner-approved batch, a Medium or High PR merges when its acceptance record is PASS for the head, `Required / CI` passed and each review-bot comment has a response; a High PR also needs its cross-model review PASS; a Low PR that meets the Low accept-seat skip merges on `Required / CI` and its verification evidence, with no acceptance record; each PR body keeps its rollback line (a `git revert` of the squash commit unless it states another). (3) The rolling projection PR (`archctx/projection`) merges on green CI; its merge is its acceptance. (4) An owner decision that the receiving seat posts on the issue or PR authorizes the other seats, with no second confirmation in another pane. A comment is a record: a local seat writes it, and a locally run command may read it as data; it never starts an action. (5) After the owner approves a batch parent and its plan comment, the plan's issues dispatch in plan order; a new issue or a changed order goes to the owner or to rule 7. (6) The GitHub setting "Automatically delete head branches" deletes merged head branches only. (7) The orchestrator and the advisor make a decision that otherwise goes to the owner when both agree, unless it touches security; before the action they post it on the owning issue or PR as `Joint decision (orchestrator + advisor)` with the reason. Both seats run the same model family, so a joint decision never replaces the High-tier cross-model review. (8) Any participant, the owner account included, may post "stop" or "no" on the issue or PR. It is a reference: the orchestrator and the advisor weigh it, decide locally by joint decision and record the decision. The owner's own authorization reaches a seat locally.
- The diff's [Review by risk](docs/reference-configs/agentic-development-flow.md#review-by-risk) tier selects independent review; the skill defines the reviewers and their model families. Changing implementation and test assertions together does not raise the tier.
- Create task worktrees only at `/tmp/<repo>-wt-<slug>` (Windows: `os.tmpdir()`) with `repo-harness run contract-worktree start --issue <number>`, or `git worktree add` with that path. Never create one beside the main checkout (`../`). Commit or push before a reboot or a tmp cleanup. Closeout and sweep remove only merged, clean and unowned worktrees; to keep one, give it an unmerged commit, keep it dirty, or mark or lock it.
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome. Finish the main task first. Fix a small problem found on the way directly; for a large problem, open a GitHub issue before you work on it.
- Read `tasks/lessons.md` at session start and apply its active lessons. Current repo state and evidence override a lesson.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No plan, contract, review, notes or approval artifact is mandatory. Record a one-time decision in the issue.
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates`. `.ai/harness/workflow-contract.json` is the opt-in marker. `assets/workflow-contract.v1.json` is the contract. `_ops/` is ignored private operations state: never commit or agent-edit it, except directories listed in `operations.agent_writable_private_dirs`, which only Edit, Write and apply_patch may write; Bash stays denied under `_ops/`. `_ref/` is an ignored reference cache; cite influential revisions. Follow deploy SQL policy, otherwise use ascending 4-digit files under `deploy/sql/`.

## Code Optimization Principles
- Identify observable conditions, controllable inputs, the invariant and the actual pressure point before changing structure.
- Keep one source of truth for each datum; other representations are deterministic projections with drift checks.
- Do not add steady-state compatibility code, dual authority, semantic fallbacks, aliases or shadow parsers; one-shot migrations fail closed and remove the retired path.
- Share components only for observed reuse or a cross-module invariant. Use an existing workspace only for independently meaningful consumers; do not convert this single-package repo without that boundary.
- Prefer platform/standard-library features, then installed dependencies, and the smallest direct implementation; shrink obsolete code before adding layers. The repository is yours by default: refactor duplication, blocking structure and older model-written code instead of adding to it; keep behavior unless the task changes it, state the refactor in the PR, and route a refactor into another seat's files through the orchestrator.
- Never satisfy a requirement with a substitute that only looks compliant (mocks, hard-coded values, images posing as the real thing); say what cannot be done and flag the deviation in the PR.
- Self-review before committing: remove dead code, empty branches and debug leftovers, and split functions by responsibility instead of one large block.

## Testing
- Run `bun run check:type` for code changes and tests covering the changed behavior once after the implementation is stable. Development-time debugging can run focused checks before that final verification.
- For a bug fix, prefer a focused failing regression before the fix. Run only the reproducer during RED. Record a reproduction gap when the environment cannot produce it; ordinary tasks do not require RED artifacts.
- A diff's size, a new test file, a new agent or a rebase does not by itself require a full run.
- Use `bun run test:files <affected tests> --timeout 60000 --max-concurrency 1`; extend existing coverage before creating a new test file.
- Test budget per PR: added test lines divided by added product lines must not exceed 2:1, and the PR adds at most one test file. A PR that adds no product lines records the exception for any added test. Measure with `git diff --numstat main...HEAD -- tests` and `git diff --numstat main...HEAD -- src scripts`; above either cap, add a `Test budget exception` PR section with the counts and why an existing test cannot cover the behavior.
- Select tests by observable risk and owning runtime boundary, including error/recovery paths when affected.
- Mechanical prose changes need link/scope validation, not new product tests; do not test incidental formatting or that deleted files stay deleted.
- Reviewers consume the recorded command, result, revision and environment; they do not rerun passing checks to claim ownership.
- Changed inputs or a new uncovered failure justify affected delta checks; an old pass is only historical evidence for its old subject.
- Run the full suite daily; a failure opens an automatic repair task and appears in the daily report.
- Isolate mutable HOME, repositories and process state; use real synchronization signals and preserve complete failure output.
- Report failed, timed-out, incomplete or omitted coverage explicitly; do not manufacture receipts, waiver files or pre-fix logs.
- Never modify or delete test assertions just to make tests pass; justify every necessary test change item by item in the PR description. Remove a redundant test only when the PR names the retained test that covers the same behavior.
- Before you write or change tests, load the `repo-harness-test` skill (`assets/skills/repo-harness-test/SKILL.md`).
- When a local check and CI disagree, CI is the authority. Reproduce the failure with `bash scripts/check-ci.sh <lane>` before you change code; a global `repo-harness` or `repo-harness-hook` on `PATH` can hide a missing test setup.

## Writing
- Write output text (docs, PR descriptions, commit messages, reports, research notes) in ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, approved-dictionary words. Write Chinese output the same way.
- Prefer high information density: evidence first, mechanisms and business effect explained, complex reasoning allowed, no explanatory repetition. Lead with the main finding, key number or key mechanism. State known facts and supported conclusions directly, without lead-ins such as "note that", "this shows to some extent" or "it must be stressed". Put the evidence grade in the wording, not in a separate caveat.
- Give time, subject, action, size and source in one sentence. Keep only the qualifiers that change the fact, the statistics or the inference. Keep text that explains a cause or mechanism, separates confounded causes, or builds a new classification.
- Delete: comments on your own process or work; a second explanation of a fact that already states its source, scope and meaning; "do not read this as" warnings; repeated disclaimers; step-by-step tutorials and hypothetical teaching examples; prose that repeats a comparison table; repeated summaries and claims about the importance of the result.
- A conclusion must add a cause, mechanism, constraint, testable prediction or business effect. A restatement of earlier facts is not a conclusion.
- Prefer real companies, products, contracts, prices and user behavior as examples. Use a table for multi-object or multi-metric comparison. Split sections by question; drop introductions, transitions and summaries that exist only for completeness.
- Paragraph deletion test: if removing a paragraph leaves the reader's understanding of facts, numbers, mechanism, cause, conditions and conclusion unchanged, remove it. Check first the paragraphs that start with "this shows", "note that", "therefore", "however" or "it must be stressed".

## UI
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## Claude Code
- Use Claude Code's available tools within granted permissions; changes to tool grants, hooks or confirmation bypass require approval of the exact change.
- User-level `~/.claude/settings.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Operator helpers run from the package through `repo-harness run <helper>`.
- Write comments, commits and PR text from the final diff; comments explain non-obvious reasons, and PRs describe final behavior and material rationale.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.organization.board" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:8e2a2cd2819192bca45158cad077cefa883458e73443e41437d0d5d9887ce08e" -->
# Agent Context: Board

- id: `capability.organization.board`
- kind: `capability`
- summary: Projects the board of one parent issue from GitHub plan data, linked pull requests and hc seat terminals, runs the attention rules on it, and owns the seat launch and quota reads that the board and the claims use.
- source.include: `src/core/board/**`, `src/effects/board/**`, `src/cli/commands/board.ts`, `src/cli/commands/quota.ts`, `src/cli/commands/seats.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/board.test.ts tests/cli/seats-argv.test.ts tests/cli/quota.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:d4acb9f994d54a5c9834e8594c22e1b81358c71a5f25869d6d86436b9b040f98
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.organization.board" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.organization.publication" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:7b0747565f6846654b1a7af9d6d021090f4eb8bd9deba05af14660be0f03dff7" -->
# Agent Context: Publication Observations

- id: `capability.organization.publication`
- kind: `capability`
- summary: Observes explicit canonical provider PR readiness and integration evidence, shares canonical publication digest helpers and stores provider feedback facts and delivery receipts.
- source.include: `src/core/publication/**`, `src/effects/publication/**`, `src/cli/commands/publication.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/unit/merge-readiness-v1.test.ts tests/unit/publication-feedback-effect.test.ts tests/publication-feedback-concurrency.test.ts tests/cli/fleet-feedback.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:16e8eacc3ffcd3c1e416f7edf87767a7a87bf5f86c1b8007a93dcd69a4850a2b
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.organization.publication" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.organization.task-fleet" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:4cde803d6249da6f4558f3adacbbac74ed0d75dc6702644dd875677b8672a088" -->
# Agent Context: Task Fleet

- id: `capability.organization.task-fleet`
- kind: `capability`
- summary: Owns admitted task message storage, records admitted manual provider feedback and registers repositories.
- source.include: `src/core/fleet/**`, `src/effects/fleet/**`, `src/cli/commands/fleet.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/effects/task-inbox.test.ts tests/effects/task-inbox-layout-migration.test.ts tests/cli/fleet-task-inbox.test.ts tests/unit/task-message-v1.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:5d011685fa357a159c4819d848145a8ac2e56d72a5606e54ff17489f6fe306c4
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.organization.task-fleet" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.action-commands" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:5719b741f0aebf9357766291703a326035ac2336062d639575b786e08ba32d78" -->
# Agent Context: Action Commands

- id: `capability.public-surface.action-commands`
- kind: `capability`
- summary: Defines the user-facing action command skill surface, the bundled skill packages and the skill-surface catalog that projects them.
- source.include: `assets/skill-commands/**`, `assets/skills/**`, `assets/skill-version.json`, `.claude/.skill-version`, `src/core/skill-surface/**`, `scripts/skill-surface-select.ts`, `scripts/run-skill-routing-eval.ts`, `scripts/check-skill-version.ts`
- source.exclude: `assets/skills/repo-harness-archimap/**`, `assets/skill-commands/repo-harness-architecture/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/action-command-skills.test.ts`, `bun run benchmark:skills --dry-run`, `bun test tests/skill-surface/catalog.test.ts tests/skill-surface/canonical-packages.test.ts`
- extensions digest: sha256:f93c6ebd108302205e760b7f61c702d0b088b470b8bc2cb601c69e06a9e2a512
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.action-commands" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.adoption" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:4991edf1f5bdb3018f0a5d0095b631d2c311d948f31be042ddc16c1421f390fc" -->
# Agent Context: Adoption

- id: `capability.public-surface.adoption`
- kind: `capability`
- summary: Plans and applies repository adoption through the canonical filesystem transaction boundary.
- source.include: `src/core/adoption/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/cli/adoption-plan.test.ts`, `bun run check:type`
- extensions digest: sha256:e75c66308f219fbd67e4b81601288667bf57f0563d62f4ed6c853b21c7891b0c
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.adoption" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.root-router" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:184866d07736c6bc89c6acf0b9924b8e2e57fe5cac98a8468ca5127192da3868" -->
# Agent Context: Root Router

- id: `capability.public-surface.root-router`
- kind: `capability`
- summary: Routes repository-level product and agent context into capability-specific contracts.
- source.include: `agents/openai.yaml`, `docs/CHANGELOG.md`, `docs/changelog.d/**`, `docs/images/**`, `references/bot-control.md`, `references/handoff.md`, `references/workflow-packaging-rubric.md`, `SKILL.md`, `references/pm-boundary.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/spec.md`, `docs/prds/**`, `README.es.md`, `README.fr.md`, `README.ja.md`, `README.zh-CN.md`, `src/cli/commands/docs.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`
- extensions digest: sha256:37c98216511fc7691c41eb423b8b26e248508ae86f475f47fedbc52eb35a2272
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.root-router" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.strategy-reflection" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:a2d8533537d76080856b4d8ceffb9548a5c38bbc95ba3ab6ccbf72740f580828" -->
# Agent Context: Strategy Reflection

- id: `capability.public-surface.strategy-reflection`
- kind: `capability`
- summary: Collects a bounded strategy context packet and validates inert strategic proposals on explicit request.
- source.include: `src/core/strategy/**`, `src/effects/strategy/**`, `src/cli/commands/strategy.ts`, `src/cli/commands/strategy-actions.ts`, `docs/strategy/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/strategy.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:cca0d2bbeb91b47a6d8d876fbe2c50b687a067c662f8f311323dd835de82b1f2
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.public-surface.strategy-reflection" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.architecture" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:9f7d2526dc86b685a675e3ab77ca170c2c795bf3b9f26f6d616cc9b266fcec72" -->
# Agent Context: Architecture

- id: `capability.runtime-harness.architecture`
- kind: `capability`
- summary: The Architecture plugin: the package-local archctx closure, the architecture reads, the projection, debt and setup commands, the hook notice, the architecture Checks and the architecture skills.
- source.include: `src/effects/architecture/**`, `src/core/architecture/projection.ts`, `src/core/architecture/module-view.ts`, `src/core/review/module-review-prompt.ts`, `src/cli/commands/module.ts`, `src/cli/hook/agent-notice.ts`, `scripts/axr5-archctx-clean-room.ts`, `scripts/check-state-boundaries.ts`, `scripts/project-test-capabilities.ts`, `scripts/sync-helper-sources.ts`, `assets/skills/repo-harness-archimap/**`, `assets/skill-commands/repo-harness-architecture/**`, `docs/verification/**`
- source.exclude: `src/effects/architecture/capability-resolver.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run check:state-boundaries`, `bun run check:helpers`, `bun run test:files tests/architecture-projection-provider.test.ts tests/architecture-debt.test.ts tests/agent-notice.test.ts tests/capability-archcontext-source.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:19173ce50c8ddb0ec08722ac00659585e1cd1a2c24e8b51ddc315f479fcac245
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.architecture" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.evidence-ledger" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:aa2cf437d471d4e4e62bb1af9a8ac76de71770a7a56ab13977754fd72386b245" -->
# Agent Context: Evidence Ledger

- id: `capability.runtime-harness.evidence-ledger`
- kind: `capability`
- summary: Appends and folds the per-worktree harness evidence event log, stores write-once blobs and checkpoints, and imports attested evidence.
- source.include: `src/core/evidence/**`, `src/effects/evidence/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/evidence-event-store.test.ts tests/evidence-checkpoint.test.ts tests/evidence-blob-store.test.ts tests/evidence-attested-import.test.ts tests/evidence-replay-recovery.test.ts tests/evidence-projection-drift.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:4b5e2d71ddbc27cd797db6fd9010d36218b78f1d3e9f203a0e250db16263a4e4
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.evidence-ledger" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.global-runtime-reconciliation" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:1a14db79143b9a64a005c29522b32e5df4258e60ff593b3c2a6113ac475b1fd1" -->
# Agent Context: Global Runtime Reconciliation

- id: `capability.runtime-harness.global-runtime-reconciliation`
- kind: `capability`
- summary: Reconciles the installed repo-harness runtime and the external tooling that core and the selected plugins own.
- source.include: `package.json`, `bun.lock`, `scripts/check-managed-runtime.ts`, `scripts/sync-codex-installed-copies.sh`, `assets/reference-configs/external-tooling.md`, `docs/reference-configs/external-tooling.md`, `docs/reference-configs/install-profiles.md`, `src/effects/upgrade/**`, `src/effects/runtime/node-candidates.ts`, `src/effects/runtime/protected-helper-platform.ts`, `src/effects/skill-tree-integrity.ts`, `src/effects/host-skill-roots.ts`, `src/effects/configuration/**`, `src/core/release/**`, `src/effects/release/**`, `scripts/check-npm-release.sh`, `scripts/check-release-published.sh`, `scripts/check-tarball-install-smoke.sh`, `scripts/check-pi-package-smoke.ts`, `scripts/runtime-evidence-receipt.ts`, `install.sh`, `install.ps1`, `tsconfig.json`, `src/effects/runtime/node-runtime.ts`
- source.exclude: `src/effects/configuration/agents-configuration.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/cli/global-runtime-init.test.ts tests/cli/global-runtime.test.ts`, `bun run test:files tests/unit/candidate-bound-global-runtime-reconciliation.test.ts tests/unit/global-architecture-projection.test.ts tests/herdr-runtime-pin.test.ts tests/cli/doctor.test.ts tests/cli/init-hook.test.ts tests/cli/upgrade.test.ts tests/runtime-evidence-receipt.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:release`
- extensions digest: sha256:7b20c4af8b7eca39aeb6a16f5df3795b0c39be976198824680aabdd0574359b0
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.global-runtime-reconciliation" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.mcp-sidecar" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:25a3f7fb9a9fbe7f935097ffe3044233598322eeaa7a8836ce5e517805230bec" -->
# Agent Context: MCP Sidecar

- id: `capability.runtime-harness.mcp-sidecar`
- kind: `capability`
- summary: Provides the local MCP sidecar and its repository access policy boundary.
- source.include: `src/cli/mcp/**`
- source.exclude: `src/cli/mcp/general-repo-access.ts`, `src/cli/mcp/general-repo-access/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/cli/mcp*.test.ts`, `bun run check:type`, `repo-harness mcp doctor --repo .`
- extensions digest: sha256:0c264913cd1c78fa660dab3b015d6ab511c495df3d663f2cae9cd292ffc9fc03
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.mcp-sidecar" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.operator" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:6ea9d32f948585d69286d534952ec2e871fc288ba7e07edfb1fb85f2c1e041e4" -->
# Agent Context: Operator Board

- id: `capability.runtime-harness.operator`
- kind: `capability`
- summary: Provides bounded read-only HTTP views of the registered repositories and provider issues.
- source.include: `docs/kanban-runtime-status.md`, `src/effects/operator/**`, `src/operator-web/**`, `packages/operator-web/**`, `src/effects/setup/**`, `src/effects/dev-activity/**`, `vite.operator.config.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run check:type`, `bun run test:files tests/cli/operator-serve.test.ts tests/effects/operator-write-boundary.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:eb3dd69cb9b6a408d4fdcd48c7c3b34d943e37ae7e2c22b00e94dd6dd245fd9d
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.operator" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.refactor-program" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:6985c121708880b42ccd1713702c933023cd302788b2b6b2aa968b8ed4405406" -->
# Agent Context: Refactor Recommendations

- id: `capability.runtime-harness.refactor-program`
- kind: `capability`
- summary: Shows measured ArchContext refactor suggestions with their evidence and records the user decision; it never executes a refactor.
- source.include: `src/effects/refactor/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/unit/refactor-recommendations.test.ts tests/refactor-archctx-provider.test.ts --timeout 60000`, `bun run check:type`
- extensions digest: sha256:c8fe52b63df3e0ac84ad542019d11ea11ee4997b5c43d0148196ad1e9d0635b6
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.refactor-program" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.task-agent-host" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:fb5c2545c0b6cc620c4fbf1999fce35ac4176c56e65df164ec848fd74bc212af" -->
# Agent Context: Task Agent Host

- id: `capability.runtime-harness.task-agent-host`
- kind: `capability`
- summary: Hosts persistent task-agent participants in hc terminals with role profiles, request send, request-bound result collection and OAR runtime observation, and installs the notify relay.
- source.include: `src/effects/terminal/task-session.ts`, `src/effects/terminal/task-runtime-observation.ts`, `assets/herdr/**`, `src/effects/terminal/native-task-session.ts`, `src/effects/review-runner/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/effects/herdr-core-transport.test.ts tests/herdr-task-lifecycle.test.ts tests/effects/native-task-session.test.ts tests/effects/oar-host-node-import.test.ts --timeout 60000 --max-concurrency 1`, `bun run check:type`
- extensions digest: sha256:90340e38b92458638526323aa2eb6174373a92b8d8355fdf2ea20ce0748a71f3
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.task-agent-host" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-mcp.general-repo-access" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:5deaf675c9ead0ab1f66b271e4882080fcb0da3130cd169e66ed3276d6a5701b" -->
# Agent Context: General Repository Access

- id: `capability.runtime-mcp.general-repo-access`
- kind: `capability`
- summary: Exposes bounded repository read tools and, for a read_write grant, write tools through MCP.
- source.include: `src/cli/mcp/general-repo-access.ts`, `src/cli/mcp/general-repo-access/**`, `assets/mcp/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-codegraph-contract.test.ts`, `bun test tests/cli/mcp-policy.test.ts tests/cli/mcp-tools.test.ts`, `bun run check:type`
- extensions digest: sha256:c16869724d69e9a1ee716354be2efe1aab23c6cebc6f7e275b5adc4a4f6394bf
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-mcp.general-repo-access" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.verification.acceptance-review" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:e334eaa991cb947af5738c71a77348cf0271d6a2a50e9b1abbedf3835d76b1c7" -->
# Agent Context: Acceptance Review

- id: `capability.verification.acceptance-review`
- kind: `capability`
- summary: Runs the generic acceptance review through a persistent reviewer task agent and records one structured acceptance receipt.
- source.include: `src/core/review/**`, `src/effects/review/**`, `src/cli/commands/review.ts`, `scripts/acceptance-receipt.ts`, `scripts/change-assessment.ts`, `src/effects/admission/admission-store.ts`, `src/effects/admission/admission-source.ts`, `src/effects/admission/issue-goal.ts`, `src/effects/admission/control-admission.ts`, `src/effects/github/issues.ts`, `src/effects/github/policy.ts`
- source.exclude: `src/core/review/module-review-prompt.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run check:type`, `bun run test:files tests/generic-review.test.ts tests/acceptance-receipt.test.ts tests/change-assessment.test.ts tests/cli/cross-review.test.ts tests/unit/module-review-prompt.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:37b716ad20244a8d2425e0ae28618ec3e75c5cfe02fd024cf12e20b0a656f89a
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.verification.acceptance-review" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.verification.codegraph-readiness" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:27cc25ba16469f0bbf6c7d2ccfaca57b2355a60bd8663619a2562471d5d62055" -->
# Agent Context: CodeGraph Readiness

- id: `capability.verification.codegraph-readiness`
- kind: `capability`
- summary: Resolves and verifies the repository CodeGraph runtime and index readiness.
- source.include: `src/cli/tools/codegraph.ts`, `src/cli/tools/codegraph-reader.ts`, `src/cli/commands/tools.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/check-agent-tooling.test.ts tests/cli/codegraph-resolver.test.ts`, `bash scripts/ensure-codegraph.sh --check --json`
- extensions digest: sha256:998f32d6510c3695b961bf107ee42d1a56d2785dcb8c26795bab80d7d8152964
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.verification.codegraph-readiness" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.verification.evals-checks" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:813832d7561fd56bbc0be00a926b1815ed3d8d97b09e9abfd92bd298fe76d099" -->
# Agent Context: Evals And Checks

- id: `capability.verification.evals-checks`
- kind: `capability`
- summary: Runs repository verification, contract gates, benchmarks, and evaluation suites.
- source.include: `tests/**`, `evals/**`, `scripts/run-skill-evals.ts`, `scripts/run-harness-profile-benchmark.ts`, `scripts/validate-harness-profile-benchmark.ts`, `scripts/verify-sprint.sh`, `scripts/check-agent-tooling.sh`, `bunfig.toml`, `.github/**`, `scripts/verification-plan.ts`, `scripts/check-ci.sh`, `scripts/host-test-queue.ts`, `scripts/check-protected-paths.ts`, `scripts/select-ci-coverage.ts`, `scripts/replay-ci-coverage.ts`, `scripts/report-ci.ts`, `scripts/check-archimap-links.ts`, `scripts/select-test-suite.ts`, `scripts/ci-documentation-consumers.ts`, `scripts/harness-trace-grade.sh`
- source.exclude: `tests/cli/adoption-plan.test.ts`, `tests/fixtures/adoption/**`, `tests/architecture-projection-provider.test.ts`, `tests/cli/global-runtime-init.test.ts`, `tests/cli/global-runtime.test.ts`, `tests/cli/mcp-codegraph-contract.test.ts`, `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-tools.test.ts`, `tests/cli/codegraph-resolver.test.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:core`, `bun run check:type`
- extensions digest: sha256:d292defe8b10b740623a110ff6dd4bb6ef6f1a293824c254ce9e0ed0b7bac4a7
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.verification.evals-checks" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.execution-primitives" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:754a86ec3e06266e88a849f164fcd9bb4316c95a886b0eebbf6cc0747a7a2fb1" -->
# Agent Context: Execution Primitives

- id: `capability.workflow-engine.execution-primitives`
- kind: `capability`
- summary: Runs bounded child processes and provides the canonical directory lock and Git common-dir and worktree topology reads. It also holds the shared repository registry, the account home root, the secret patterns, the task message claim primitives and the immutable session artifact I/O that core and plugins read. It holds no workflow policy.
- source.include: `src/effects/process-runner.ts`, `src/effects/process-supervisor.ts`, `src/effects/process-group-launcher.ts`, `src/effects/process-group-termination.ts`, `src/effects/process-group-registry.ts`, `src/effects/expensive-run-lock.ts`, `src/effects/readonly-observation.ts`, `src/core/shell-quote.ts`, `src/effects/path-containment.ts`, `src/effects/atomic-append.ts`, `src/effects/locking/**`, `src/effects/git/**`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run check:type`, `bun run test:files tests/process-runner.test.ts tests/unit/closeout-runner-guardrails.test.ts tests/state/state-effects.test.ts tests/effects/task-worktree-closeout-notify.test.ts tests/herdr-task-lifecycle.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:5a7ac2d3cd1b73b42efa20cf1f0498cedce0c0ae5a8864ff5b3b3a558cb90c46
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.execution-primitives" -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.workflow-state" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:283af71341931e05d441da796a0357002ac2f75c81a26f661799dcaff2144e21" -->
# Agent Context: Workflow State

- id: `capability.workflow-engine.workflow-state`
- kind: `capability`
- summary: Resolves deterministic Effective State, worktree safety and the continuation ledger.
- source.include: `src/core/state/**`, `src/effects/state/**`, `src/core/workflow/**`, `interfaces/**`, `src/core/worktree-location.mjs`, `src/core/worktree-location.d.mts`, `src/cli/commands/state.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run check:type`, `bun run check:state-boundaries`, `bun run test:files tests/state/cli-state-golden.test.ts tests/state/state-concurrency.test.ts tests/state/state-effects.test.ts tests/state/adapter-parity.test.ts tests/effective-state.test.ts tests/coordination-lease-store.test.ts tests/continuation-envelope.test.ts tests/cli/state-command.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:2fd0ecd40267077f6806e26f34cc6bede9dcd5774aa9a8154d5c51dcf6e871ed
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.workflow-state" -->

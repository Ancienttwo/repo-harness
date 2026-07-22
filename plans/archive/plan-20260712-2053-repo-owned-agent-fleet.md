# Plan: Repo-owned agent fleet authority

> **Status**: Archived
> **Created**: 2026-07-12 20:53 +0800
> **Slug**: repo-owned-agent-fleet
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: packaged and self-host fleet installers must derive both host projections from one tracked repo-owned source and pass focused, full, packaging, architecture, and workflow checks.
> **Rollback Surface**: revert the work-package commit and reinstall the previous three-role fleet; no user data or schema migration is involved.
> **Task Contract**: `tasks/contracts/20260712-2053-repo-owned-agent-fleet.contract.md`
> **Task Review**: `tasks/reviews/20260712-2053-repo-owned-agent-fleet.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md`

## Why

The fleet installer currently claims `Ancienttwo/Fable-agents` as its single source while the accepted local fleet already contains an explorer role and model labels that upstream does not publish. A real temporary-HOME install therefore fails even though local fixture tests pass. The repository must own the source it ships so installation, drift checks, package contents, and committed projections share one deterministic authority.

## Goal

Remove the Fable-agents runtime and policy dependency, establish one packaged repo-owned agent-fleet source, regenerate the Claude and Codex projections for explorer, deep-reasoner, fast-worker, and gatekeeper, and close the existing fleet-related workflow and architecture drift without absorbing unrelated local changes.

## Scope

- In scope:
  - Add one tracked, npm-packaged source directory for the four Claude-format fleet definitions.
  - Make self-host and packaged installers read only that source and fail closed when it is missing or malformed.
  - Rename active policy/tooling ownership from `fable_agents` to `agent_fleet`; remove upstream URLs, curl checks, source overrides, and Fable-specific runtime names.
  - Keep `.claude/agents` and `.codex/agents` as deterministic projections; preserve Sol/Luna family mapping and exact effort pass-through.
  - Keep gatekeeper read-only and remove its impossible commit/push/PR/merge execution mode.
  - Promote explorer into the managed fleet and close the stale drift-test gap, including a zero fetch/source-failure assertion.
  - Sync policy seeds, mirrored helpers, docs, changelog, capability context, architecture requests, workflow artifacts, and package/tarball verification.
  - Delete the untracked model-effort image because it contradicts the accepted no-Terra/no-Ultra mapping and has no durable source contract.
- Out of scope:
  - The unrelated `archctx-contracts` dependency bump currently present in the primary dirty worktree.
  - New root-cause-prover, harness-evaluator, migration-auditor, trust-boundary-auditor, or release-operator personas.
  - Native-agent routing/governance changes owned by the active `native-role-capability-gate` worktree.
  - Compatibility aliases for `fable_agents`, remote-source fallback, alternate source directories, network fetching, or dual authority.
  - Changes under `evals/bdd2/**`.

## Agentic Routing

- Selected route: isolated contract worktree with one read-only explorer pass, sequential implementation, then an independent read-only review.
- Routing reason: source authority, installer generation, policy seeds, and projections form one ordered invariant; parallel writers would overlap the same authority surface.
- P1 map: repo-owned source -> installer validation -> Claude byte projection + generated Codex TOML -> installed user-level fleet; policy and tooling report that same source.
- P2 trace: `repo-harness run install-agent-fleet` resolves the packaged helper -> resolves the packaged fleet source -> validates each role -> writes or reports drift for both host targets -> tooling check compares installed state against the packaged authority.
- P3 decision: use `agents/fleet/` as the only source because `agents/` is already an explicit npm package surface and both source/runtime helper layouts can resolve it without a new package or helper-runner abstraction.

## Detailed Design

1. Create `agents/fleet/{explorer,deep-reasoner,fast-worker,gatekeeper}.md` as the sole authored role definitions.
2. Resolve that directory from the authoritative helper path for the two supported layouts: self-host `scripts/` and packaged `assets/templates/helpers/`; any other or missing layout fails closed.
3. Remove curl and source-directory override behavior. Installer tests build temporary package layouts when they need malformed sources instead of changing runtime authority.
4. Project source Markdown byte-for-byte into `.claude/agents/`; generate `.codex/agents/*.toml` from the same frontmatter/body and canonical execution boundary.
5. Replace `external_tooling.fable_agents` with `external_tooling.agent_fleet` in live policy and deterministic seeds. No compatibility reader remains.
6. Make tooling drift checks compare Claude installed files to the packaged source without network access. Codex keeps its generated-artifact presence contract; installer golden tests prove exact generation.
7. Archive each architecture request with the status and durable architecture module required by the request, after capability context and semantic modules are synchronized.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| npm tarball omits the new authority | Medium | High | Source lives under the explicit `agents/` package surface; add tarball/content verification. |
| source and projections drift | Medium | High | Byte/golden tests and packaged installer smoke. |
| old `fable_agents` policy silently remains authoritative | Low | High | Remove active readers and assert the new policy key; no alias or fallback. |
| dirty primary changes leak into the work-package | Medium | High | Apply only the reviewed fleet path patch to this worktree; leave package/bun lock and unrelated image state behind except the explicit image deletion outcome. |
| gatekeeper remains structurally unable to honor its prompt | Medium | Medium | Remove execution-dispatch semantics from the repo-owned source and regenerate the Codex projection. |

## Promotion Gate

- **Merge/PR unit**: one source-authority cutover plus its deterministic projections and workflow closeout.
- **Rollback surface**: revert one work-package commit and reinstall the prior fleet.
- **Verification boundary**: focused fleet/tooling/bootstrap tests, full suite, helper parity, package tarball contents, temporary-HOME install, architecture/task gates, inspector, and adopt dry-run.
- **Review/acceptance boundary**: review proves no active Fable runtime/policy reference, no remote fallback, exact projection parity, and no unrelated dirty paths.
- **High-risk surface**: global user-level agent installation from an npm-packaged helper.
- **Why not checklist row**: changing the fleet source authority is an independently reversible distribution and trust boundary.

## Evidence Contract

- **State/progress path**: this plan, its contract, notes, review, and `tasks/current.md`.
- **Verification evidence**: focused/full test output, temporary-HOME install output, tarball file listing, helper parity, architecture queue status, strict workflow checks, inspector, and adopt dry-run.
- **Evaluator rubric**: one source exists; all projections are deterministic; package runtime installs without network; missing/malformed source fails closed; unrelated work is absent.
- **Stop condition**: all task rows complete, architecture queue is clear for touched capabilities, review recommends pass, and the diff contains only allowed paths.
- **Rollback surface**: revert the work-package commit; no external data rollback.

## Task Breakdown

- [x] Establish the repo-owned packaged source and migrate the four fleet definitions.
- [x] Cut installer and tooling runtime/policy authority from Fable to repo-owned agent-fleet.
- [x] Regenerate host projections and remove gatekeeper execution-dispatch claims.
- [x] Update deterministic seeds, mirrors, docs, changelog, and focused tests.
- [x] Sync capability/architecture artifacts and archive the three pending requests correctly.
- [x] Run focused, full, packaging, workflow, inspector, and adopt verification.
- [x] Complete independent review and worktree closeout without unrelated primary-worktree changes.

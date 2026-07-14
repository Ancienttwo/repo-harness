# Plan: repo-harness 0.10.0 release-blocker closeout

> **Status**: Executing
> **Created**: 20260714-2318
> **Slug**: repo-harness-0-10-0-release-blockers
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Focused regressions, deep review, frozen-HEAD release gate, CI, npm and installed-runtime readback must agree
> **Rollback Surface**: Revert the release-blocker commit before publish; after npm publish use a patch release
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md`
> **Task Review**: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`
> **Implementation Notes**: `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md`
- Sprint contract: `tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md`
- Sprint review: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`
- Implementation notes: `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md`
- Review file: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`
- Implementation notes file: `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the release-blocker commit before publish; after npm publish use a patch release
- **Verification boundary**: Focused regressions, deep review, frozen-HEAD release gate, CI, npm and installed-runtime readback must agree
- **Review/acceptance boundary**: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md`, `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`, and `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the release-blocker commit before publish; after npm publish use a patch release

## Captured Planning Output

# repo-harness 0.10.0 release-blocker closeout

## Goal

Remove every confirmed P1 release blocker and the bounded safety P2 findings from the `v0.9.2..HEAD` deep review, freeze one coherent `0.10.0` source commit, then publish npm and GitHub release surfaces only after focused regression, full release-gate, CI, package, and installed-runtime evidence agree.

## P1: Architecture Map

- Global runtime update path: `src/cli/index.ts` parses `update`; `src/cli/commands/global-runtime.ts` projects the selected install profile into packaged Skills and host adapters; `src/cli/installer/install-profile.ts` owns recorded profile authority and managed-surface ownership.
- Packaged Skill docs: root `SKILL.md` is shipped, `assets/reference-configs/` is the packaged documentation authority, and `src/cli/commands/docs.ts` is the stable runtime resolver.
- Coding MCP setup: `src/cli/mcp/setup.ts` validates and writes ignored user config; `src/effects/repo-registry.ts` owns persisted repo access mode/revision; general-repo mutation exposure consumes only that registry authority.
- HTTP/OAuth: `src/cli/mcp/transports/http.ts` owns request identity and rate buckets; `src/cli/mcp/oauth.ts` owns dynamic client persistence and token limits.
- Distribution: `docs/CHANGELOG.md`, the dated release filing, `package.json`/lockfile, npm tarball contents, tag, GitHub Release, and the PATH-visible Bun install are distinct release surfaces.

Out of scope: compatibility aliases/fallbacks, dual install-profile authority, heuristic semantic recovery, new proxy configuration knobs, broad MCP redesign, unrelated PR #75, and speculative refactors.

## P2: Concrete Traces

1. A recorded `strict` install runs ordinary `repo-harness update`; the CLI omits `profile`, global runtime defaults to `minimal`, and adapter projection deletes strict-only managed routes. Preserve the recorded profile; use `minimal` only when no recorded state exists.
2. An installed agent reads shipped root `SKILL.md`; its relative `references/...` and `docs/reference-configs/...` targets are absent from the npm archive. Route both references through `repo-harness docs show <id>` and smoke them from the packed install.
3. Coding setup receives a valid read-write grant plus an invalid later option; current code persists `read_write` before endpoint/root/server/config validation fails. Preflight every fallible input/grant first, atomically write inert config, and commit registry access last so failure cannot expose mutation tools.
4. A crafted install-state manifest points a retired owned surface at an arbitrary absolute path with a matching hash/marker; profile switch trusts it and recursively deletes outside the canonical managed allowlist. Strictly validate persisted state against exact canonical managed surfaces and revalidate immediately before removal.
5. HTTP trusts `X-Forwarded-For` unconditionally and retains unbounded IP/path buckets; DCR clients are also unbounded. Use direct socket identity, prune expired buckets, cap bucket/client collections, and fail closed at capacity.
6. The official CLI runs under Bun while `defaultPtyFactory` always rejects Bun before importing optional `node-pty`; the public `tty/rows/columns` fields therefore advertise an unreachable feature. Cut the unshipped PTY contract and dependency rather than add a fallback runtime.

## P3: Design Decision

Preserve the existing authorities and remove the unsafe ordering/invalid surfaces at their narrowest boundaries. Recorded install state remains the sole profile authority; bundled docs remain the sole packaged reference authority; registry mode remains the sole mutation authority; direct socket identity remains the rate-limit identity until an explicit trusted-proxy contract exists. Validation rejects malformed state rather than translating it. The unshipped PTY branch is deleted in the same release package so no compatibility shim survives.

At 10x scale, the first pressure point is HTTP/DCR state cardinality; fixed TTL/caps bound it. Update/profile and setup permissions are correctness/security invariants independent of scale.

## Task Breakdown

- [ ] Capture pre-fix regression evidence for update profile loss, coding setup permission leak, crafted install-state deletion, forwarded-header bucket bypass, packaged Skill references, and Bun PTY unreachability.
- [ ] Preserve the recorded install profile through `update` and add strict/product-planning CLI regressions.
- [ ] Replace root Skill file references with packaged docs resolver commands and extend tarball smoke.
- [ ] Reorder coding setup into full preflight, inert config write, then registry authorization commit; prove every late failure leaves mode/revision unchanged.
- [ ] Strictly validate install-state schema and canonical managed paths before any profile-switch deletion; prove crafted external paths survive and fail closed.
- [ ] Bound HTTP rate buckets and dynamic OAuth clients using direct socket identity, TTL, and caps; prove direct XFF spoofing cannot create identities.
- [ ] Remove the unreachable PTY option/dependency from the unshipped coding MCP surface and keep pipe sessions fail-closed and covered.
- [ ] Refresh `0.10.0` changelog/release filing with coding MCP scope, exact frozen commit, package contents, verification, and residual risk.
- [ ] Run focused tests, `git diff --check`, dependency/package inspection, architecture/task/workflow checks, deep security/architecture re-review, and one final `bun run check:release` after code freeze.
- [ ] Commit and push the reviewed slice; require green GitHub CI; publish npm; read registry tarball back; create annotated `v0.10.0`; create GitHub Release using the prior release format; reinstall from npm under Bun; run published-release/setup/CLI readbacks.

## Verification Boundary

- Focused: global runtime/update, install profiles, MCP setup, MCP HTTP/OAuth/process sessions, CLI docs, package/readme/skill contracts, tarball smoke.
- Full: project Required Checks plus `bun run check:release`, current GitHub CI, `bash scripts/check-release-published.sh 0.10.0`, npm archive readback, and PATH-visible Bun registry install proof.
- Review: fresh `/check` deep review with zero P1/P2 blockers on the frozen diff.

## Rollback Surface

Before publish, revert the single release-blocker commit. After npm publish, npm is immutable: roll back through a new patch release; the Git tag/Release must continue pointing at the exact published source commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Capture pre-fix regression evidence for update profile loss, coding setup permission leak, crafted install-state deletion, forwarded-header bucket bypass, packaged Skill references, and Bun PTY unreachability.
- [ ] Preserve the recorded install profile through `update` and add strict/product-planning CLI regressions.
- [ ] Replace root Skill file references with packaged docs resolver commands and extend tarball smoke.
- [ ] Reorder coding setup into full preflight, inert config write, then registry authorization commit; prove every late failure leaves mode/revision unchanged.
- [ ] Strictly validate install-state schema and canonical managed paths before any profile-switch deletion; prove crafted external paths survive and fail closed.
- [ ] Bound HTTP rate buckets and dynamic OAuth clients using direct socket identity, TTL, and caps; prove direct XFF spoofing cannot create identities.
- [ ] Remove the unreachable PTY option/dependency from the unshipped coding MCP surface and keep pipe sessions fail-closed and covered.
- [ ] Refresh `0.10.0` changelog/release filing with coding MCP scope, exact frozen commit, package contents, verification, and residual risk.
- [ ] Run focused tests, `git diff --check`, dependency/package inspection, architecture/task/workflow checks, deep security/architecture re-review, and one final `bun run check:release` after code freeze.
- [ ] Commit and push the reviewed slice; require green GitHub CI; publish npm; read registry tarball back; create annotated `v0.10.0`; create GitHub Release using the prior release format; reinstall from npm under Bun; run published-release/setup/CLI readbacks.

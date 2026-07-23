# Skill Surface & Discovery Live Audit

> **Captured**: 2026-07-15
> **Discovery Baseline**: `main@af6d5216c2cd5adf2f672636a8308a309f0f5adb`
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **Purpose**: Ground the Skill Surface & Discovery Convergence plan in current source and runtime evidence.
> **Superseded profile note (2026-07-24)**: The profile names and defaults below
> are historical evidence for the captured baseline. Current protocol-2 source
> exposes only `minimal` (7 Codex hooks) and `full` (11, default); protocol-1
> state requires explicit migration and is not accepted as a runtime alias.

## Conclusion

The default package-owned discovery surface is already bounded, but Skill rule ownership and projection authority are not. The safe optimization target is one canonical rule owner plus an exact per-profile host projection, not an arbitrary repository directory count.

## P1: Current authority map

- Root `SKILL.md` owns five semantic actions and is 2,132 bytes, 84 bytes above the documented 2 KiB cap.
- `assets/skill-commands/manifest.json` catalogs 19 hand-written facades but does not drive runtime installation.
- `src/cli/installer/install-profile.ts#PROFILE_COMPONENTS` owns functional install components while the same module separately hard-codes Skill probes and mutation paths.
- `scripts/sync-codex-installed-copies.sh#profile_facades` independently owns profile-to-facade selection.
- `src/cli/commands/init.ts` and `src/cli/commands/global-runtime.ts` independently own cross-review and merge-gate host projections.
- `assets/skills/claude-review` and `assets/skills/codex-review` repeat Git scope, timeout, prompt and result handling.
- ChatGPT rules exist in `.agents/skills/repo-harness-chatgpt-*`, `assets/skill-commands/repo-harness-gptpro*`, and the inline `SKILL_MD` template in `src/cli/mcp/setup.ts`.
- Current Skill-like source inventory is 25: root 1, command facades 19, bundled provider/judge packages 3, and tracked ChatGPT packages 2.

## P2: Concrete install trace

```text
install/update request
  -> explicit or recorded install profile
  -> PROFILE_COMPONENTS and host adapter projection
  -> sync-codex-installed-copies.sh profile_facades()
  -> package-owned copy/link preflight
  -> transaction snapshots and host mutation
  -> component probes
  -> ~/.repo-harness/install-state.json commit
```

`assets/skill-commands/manifest.json` is absent from this runtime path. Static tests read it, but shell selection, installer probes, provider installation, mutation paths, and test inventory each retain separate name lists.

The first 10x failure is transaction coverage: adding or renaming a package outside the fixed mutation-path list can leave a partial host installation that compensation cannot fully restore. Manifest-derived path coverage must precede package convergence.

## Observed drift

1. `product-planning` documentation describes PRD/Sprint/Goal semantics while the current facade sync adds `repo-harness-gptpro` instead.
2. The checked-in ChatGPT bridge and `src/cli/mcp/setup.ts` inline generator differ in length and semantics, including coding-profile and PTY guidance.
3. Existing 30 Skill eval cases are mainly positive root-Skill routes; they do not measure per-profile top-level discovery, bilingual negative cases, double activation, or ordinary-QA false activation.
4. The installed-copy retirement plumbing already proves ownership before deleting a retired facade. That safety mechanism is usable, but only after the complete new path set is transactionally registered.
5. Current `runGlobalRuntimeSetup()` reads the recorded install profile before defaulting to `minimal`; the older deferred-ledger claim that every refresh silently downgrades was stale and is removed by this Program dependency package. SSD must reverify the behavior on the pinned post-EPC baseline rather than revive the claim.

## P3: Decision

- Upgrade the Skill manifest into a typed runtime discovery catalog before deleting or activating any package.
- Keep `PROFILE_COMPONENTS` as functional install-component authority; the Skill catalog owns package discovery and validates component consistency.
- Keep risk/security authority in Effective State and PreToolUse. Do not duplicate `riskFloor` policy in the Skill catalog.
- Converge to ten canonical packages while bounding each host/profile discovery set separately.
- Do not generate compatibility aliases. Retire old names in one next-minor work-package, migrate live references, and remove only pristine package-owned installed copies.
- Move deterministic cross-review and ChatGPT projection mechanics below Skill prose; preserve `merge-gate` as an independent tool-free judge.
- Produce provider routing evidence once after code freeze; use deterministic tests during implementation.

## Baseline evidence

A read-only focused baseline covered six relevant test files and reported 110 passing tests, zero failures, in 25.91 seconds. It covers current prompt routing, install profiles, installed-copy sync, action-command contracts, and ChatGPT browser/MCP setup. It does not prove the proposed discovery design; the new work-package must add a dedicated Skill-routing corpus and exact profile/host projection checks.

## Execution boundary

The approved Program order is `ESA@3b33cea2422b1aa1e5be9080be54f731c4f2015d -> LSC -> HRD -> EPC -> SSD`. Each stage owns an independent work-package, worktree, branch, and PR. SSD starts only after EPC is merged/pushed, the exact post-EPC `origin/main` SHA is pinned, and no upstream writer remains; it must not absorb unrelated dirty or untracked root WIP.

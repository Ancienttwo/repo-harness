# Plan: Collapse install profiles to minimal/full

> **Status**: Review
> **Created**: 20260724-0427
> **Slug**: codex-native-profile-aware-status
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: migration_boundary
> **Verification Boundary**: Fresh and migrated installs expose exactly `minimal` and `full`; minimal projects 7 Codex hooks, full projects 11, and fresh/adapter-only installs default to full.
> **Rollback Surface**: Revert protocol-v2 install state, the explicit protocol-v1 migration command path, profile projections, tests, and current operator documentation as one unit.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260724-0427-codex-native-profile-aware-status.contract.md`
> **Task Review**: `tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md`
> **Implementation Notes**: `tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md`

## Agentic Routing

- Selected route: planning
- Routing reason: The user replaced the prior status-only slice with a two-profile host-runtime migration.
- Due diligence:
  - P1 map: install-state schema, component/skill catalog, hook projection, global runtime, adapter-only install, status, sync script, and operator docs.
  - P2 trace: CLI profile choice -> transaction -> managed skills/hooks -> protocol-v2 state -> status/setup-check readback.
  - P3 decision rationale: two steady-state profiles, explicit one-shot legacy migration, no aliases or implicit fallback.

## Workflow Inventory

- Active plan: `plans/plan-20260724-0427-codex-native-profile-aware-status.md`
- Sprint contract: `tasks/contracts/20260724-0427-codex-native-profile-aware-status.contract.md`
- Sprint review: `tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md`
- Implementation notes: `tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: the contract's `allowed_paths`
- Execution isolation: `/Users/kito/Projects/repo-harness-wt-codex-native-profile-aware-status`

## Why

The installed runtime currently exposes four names even though the actual hook
surface has only three sizes: 5, 7, and 11. The user selected a simpler product
contract: `minimal` means the useful 7-hook runtime, `full` means all 11 hooks,
the 5-hook tier is retired, and fresh installs default to `full`.

Changing `minimal` in place while retaining protocol 1 would make an old
5-hook `minimal` state indistinguishable from the new 7-hook `minimal`.
Therefore this is a state-schema migration, not a string rename. Protocol 2 is
the steady-state authority. Protocol 1 is readable only behind an explicit
operator-invoked migration action and is removed in the same successful host
transaction.

## P1: Architecture Map

- Profile vocabulary: `src/cli/installer/install-profile.ts` and
  `src/core/skill-surface/catalog.ts`.
- Component authority: `src/core/skill-surface/profile-components.ts`.
- Hook projection: `src/cli/installer/managed-entries.ts`; the selected profile
  deterministically yields 7 or 11 Codex entries.
- Skill projection: `assets/skill-commands/manifest.json` plus
  `scripts/skill-surface-select.ts` and
  `scripts/sync-codex-installed-copies.sh`.
- Runtime transaction: `src/cli/index.ts`,
  `src/cli/commands/global-runtime.ts`, and install-profile ownership helpers.
- Readback consumers: `src/cli/commands/status.ts`, `install --state`, and
  `setup check`.
- Current docs: README, install profiles, external tooling, public-surface
  architecture modules, changelog, and the two current discovery/audit notes.
- Out of scope: workflow profiles (`lite|standard|strict`), adoption modes,
  benchmark history, frozen eval reports, archived plans/contracts, ChatGPT
  opt-in setup, and mutation of the operator's actual HOME.

## P2: Concrete Trace

1. A fresh `repo-harness install` resolves the default profile to `full`.
2. The profile selects the union of the former product-planning and strict
   components: planning/product/check/ship facades, agent fleet, verifier,
   cross-review, Waza/Mermaid, CodeGraph, and all 11 managed Codex routes.
3. An explicit `--profile minimal` selects plan/check, conditional CodeGraph,
   and the 7-route adapter; it does not install product/ship, external skills,
   agent fleet, or cross-review.
4. After probes pass, the same transaction writes protocol-2 state. Status
   derives expected hook count from that recorded profile, so healthy states
   read `7/7` or `11/11`.
5. If protocol-1 state exists, ordinary install/state/update and adapter-only
   install fail closed. Status classifies a valid legacy state separately from
   corrupt state, and setup emits the migration action only for the former.
   `install --migrate-profile-state` validates the old state, removes only
   retired transaction-owned surfaces for the selected target, reprojects the
   runtime, writes protocol 2 with no legacy rollback history, and rolls back
   every touched path on failure.

## P3: Design Decision

Steady state has exactly two names:

- `minimal`: the former standard component baseline and 7 managed Codex hooks.
- `full`: the union of former product-planning and strict components and all 11
  managed Codex hooks.

`full` is the default for both global bootstrap and adapter-only installs.
ChatGPT remains explicit setup and is not part of either profile. The workflow
profile vocabulary remains unchanged because it controls per-repository
ceremony, not host installation.

The migration is explicit rather than a compatibility alias. Protocol 2
prevents semantic collision with old `minimal`; ordinary readers reject
protocol 1. The migration reader exists only for the operator-invoked
transaction and is not consulted by normal install/status paths.

At 10x skill or route growth, the first pressure point is projection drift.
The manifest and component map remain the single authorities, with tests
requiring exact profile keys and exact hook/skill projections.

Falsifier: if product and strict surfaces cannot coexist in one profile without
conflicting ownership or runtime semantics, `full` is not coherent. The current
catalog assigns disjoint components/facades and the runtime already installs
their shared external skills identically, so the union is coherent.

## Scope

- Replace the install/skill profile vocabulary with `minimal|full`.
- Set minimal to 7 hooks and full to 11; remove the 5-hook projection.
- Make full the fresh and adapter-only default.
- Bump installed profile state to protocol 2.
- Add an explicit fail-closed protocol-1 -> protocol-2 migration path; retain no
  legacy aliases or steady-state fallback.
- Merge former product-planning and strict skill/component projections into
  full while keeping ChatGPT explicit-only.
- Keep status/profile health derived from the installer projection.
- Update current tests, docs, architecture, and workflow artifacts.

## Non-Goals

- No mutation of `~/.codex`, `~/.claude`, `~/.agents`, or
  `~/.repo-harness` in this worktree.
- No rename of repository workflow profiles or adoption modes.
- No regeneration of frozen provider evals, historical release checklists,
  archived workflow artifacts, or benchmark reports.
- No compatibility aliases for `standard`, `product-planning`, or `strict`.

## Task Breakdown

- [x] Prove the original status bug and make status consume installer projection.
- [x] Map all profile authorities and freeze `minimal=7`, `full=11`, default full.
- [x] Amend contract scope and add red-first profile/schema/migration tests.
- [x] Implement two-profile component, skill, hook, CLI-default, and protocol-2 state projections.
- [x] Implement explicit protocol-1 migration with transaction rollback and no legacy history.
- [x] Update current operator/architecture/audit documentation.
- [x] Run focused tests, typecheck, required repo checks, source workflow check,
      contract verification, and a disposable-HOME migration characterization.
- [x] Record Sol Max review and leave the verified worktree ready for
      user-controlled Git closeout without mutating global host state.

## Promotion Gate

- **Merge/PR unit**: This protocol/profile migration is one atomic work-package.
- **Rollback surface**: Revert protocol 2, the explicit migration path, both
  profile projections, tests, and current documentation together.
- **Verification boundary**: Focused profile tests, typecheck, required root
  checks, strict contract verification, and disposable-HOME characterization.
- **Review/acceptance boundary**: The task review must record a passing
  evidence-backed diff review against the exact frozen subject.
- **High-risk surface**: User-level installed state and owned host runtime
  surfaces; this task uses disposable HOME only.
- **Why not checklist row**: migration_boundary

## Evidence Contract

- **State/progress path**: This plan, contract, notes, review, and
  `tasks/current.md`.
- **Verification evidence**: `.ai/harness/checks/latest.json`,
  `.ai/harness/runs/20260724-0427-codex-native-profile-aware-status/`, focused
  profile tests, typecheck, required root checks, strict contract verification,
  and disposable-HOME characterization.
- **Evaluator rubric**: Exactly two steady-state profile names; exact 7/11 hook
  projection; full default; full union projection; protocol 1 cannot be
  silently accepted; migration is explicit, transactional, ownership-safe,
  and writes no legacy rollback state; operator HOME remains unchanged.
- **Stop condition**: All task breakdown items and required checks are
  complete, the review recommends pass, and no path outside the amended
  contract was modified.
- **Rollback surface**: Revert state protocol/parser/migration, profile maps,
  manifest, runtime defaults/gates, tests, and current docs as one unit.

## Annotations

<!-- [NOTE]: The user changed the approved shape from a narrow status fix to
two install profiles. The retained slug is only the worktree identity; this
amended plan is the execution authority. -->

# Implementation Notes: obsidian-memory-skill-surface

> **Status**: Active
> **Plan**: plans/plan-20260816-0411-obsidian-memory-skill-surface.md
> **Contract**: tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md
> **Review**: tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md
> **Last Updated**: 2026-08-16 04:11
> **Lifecycle**: notes

## Design Decisions

- Falsifier resolved in favour of the plan: after adding only `assets/skills/obsidian-memory/SKILL.md` and the manifest entry, `bun test tests/installed-copy-sync.test.ts tests/skill-surface` failed on exactly three catalog fixture lists and zero installer assertions. `sync_command_facades()` iterates every selected facade, so the new entry is projected to both host roots with no installer change. Zero-installer-code registration confirmed.
- Manifest entry copies `repo-harness-plan`'s selection shape: `profiles: ["minimal","full"]`, `discoverability: "profile-facade"`, `component: "adaptive-workflow"`. `adaptive-workflow` is the only component present in both `PROFILE_COMPONENTS` tiers that does not pull the entry into `probeExpectations().planningCapabilityPaths` (that selector keys on `planning-integrations`), so it registers in both profiles without changing any other selector's output.
- `mutatesRepoByDefault: false`: the skill writes into the external vault, never into the repo it is invoked from.
- Placed after `repo-harness-architecture` in `packages[]` so all facades stay contiguous; `expectedProjections.facadesByProfile` is order-sensitive (`arraysEqual`), so the new name appends to both profile lists.
- The tooling check mirrors `CODEX_AUTOMATION_SKILLS` but reports per host (`obsidian_runtime_skills.hosts.{claude,codex}`) because both official skills are required on both hosts, unlike the Codex-only automation profile. Status stays advisory: it is not added to `strictFailures`, so `--strict-readiness` does not fail on a missing Obsidian skill.
- The contract test pins two literals from the skill body — `repo → brain` (authority direction) and `fail-closed` (vault-resolution failure semantics) — plus a non-vacuity assertion that the `src/cli/hook/` scan actually saw files, so the hooks-never-invoke check cannot pass by scanning an empty tree.

## Deviations From Plan Or Spec

- `docs/reference-configs/external-tooling.md` is a byte-identical projection of `assets/reference-configs/external-tooling.md` (`tests/reference-configs-projection.test.ts`). Editing only the doc, as the contract's `allowed_paths` literally permitted, would have failed that drift check. Edited the asset source and re-ran `bun run sync:reference-configs`; `allowed_paths` was widened to name the source file, per the contract's own "update this contract before widening scope" rule.
- Existing fixture lists updated to include the new entry without weakening any assertion: `tests/skill-surface/catalog.test.ts` (package counts 17→18 and 11→12 repo-owned, both profile facade lists, `mutationPathSkillNames` repo-owned list) and `tests/action-command-skills.test.ts` (`TARGET_FACADE_KIND_PACKAGES`). These are exact-equality inventories, so each is an intentional restatement of the new surface, not a relaxation.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Vendor the official `obsidian-markdown` / `obsidian-cli` skill bodies | Rejected | Repo convention is runtime-referenced for third-party skill bodies (Waza, Mermaid); vendoring takes on upstream sync and licensing burden |
| Register `obsidian-memory` in the `full` profile only | Rejected | Recall/persist judgment is not a full-tier planning integration; the plan pinned `repo-harness-plan`'s profile shape, which is both tiers |
| Hard-fail `check-agent-tooling.sh` when an official Obsidian skill is missing | Rejected | Every existing runtime-referenced dependency reports a gap advisorily; a hard failure would break unrelated environment checks for an optional capability |

## Open Questions

- Local-machine caveat, not a code issue: both hosts currently carry hand-installed, unowned copies of `obsidian-memory` (and the official Obsidian skills on the Claude side). The installer fails closed on unowned destinations by design, so adopting the repo-owned copy after merge requires deleting the hand-installed `~/.claude/skills/obsidian-memory` and `~/.codex/skills/obsidian-memory` directories first and then running the sync. This slice deliberately does not delete them — they are live bootstrap state.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

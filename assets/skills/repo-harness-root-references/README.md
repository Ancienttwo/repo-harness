# Staged Root-Router References (SSD-03)

This directory is staging only. It is not a Skill package: it has no
`SKILL.md`, is not listed in `assets/skill-commands/manifest.json`
`packages[]`, and is not reachable through any current router. Nothing scans
this directory today — the host Skill surface is catalog-driven, not
directory-driven — so its presence here changes no discovered or installed
behavior (see `tests/skill-surface/canonical-packages.test.ts`, "inertness
proof").

SSD-06 links each file below from the (currently untouched, byte-unchanged)
root `SKILL.md` when it performs the atomic public cutover, per
`plans/plan-20260715-1140-skill-surface-discovery-convergence.md`'s "Old
source ownership maps as follows" table.

| File | Future consumer | Source facade |
|---|---|---|
| `handoff.md` | Root `SKILL.md`, `handoff` action | `assets/skill-commands/repo-harness-handoff` |
| `workflow-packaging-rubric.md` | Root `SKILL.md`, `execute` action (reusable-workflow packaging guidance) | `assets/skill-commands/repo-harness-autoplan` ("Reusable Workflow Packaging Rubric" section only; the rest of that facade retires without a new home, per the plan's P3 decision 4) |

# Staged Check-Mode References (SSD-03)

This directory is staging only. It is not a Skill package: it has no
`SKILL.md`, is not listed in `assets/skill-commands/manifest.json`
`packages[]`, and is not reachable through any current router. Nothing scans
this directory today — the host Skill surface is catalog-driven, not
directory-driven — so its presence here changes no discovered or installed
behavior (see `tests/skill-surface/canonical-packages.test.ts`, "inertness
proof").

SSD-06 links the file below from the (currently untouched, byte-unchanged)
`assets/skill-commands/repo-harness-check/SKILL.md` when it performs the
atomic public cutover, per
`plans/plan-20260715-1140-skill-surface-discovery-convergence.md`'s target
canonical package table (`repo-harness-check`: "workflow/release checks plus
deploy-readiness reference").

| File | Future consumer | Source facade |
|---|---|---|
| `deploy-readiness.md` | `repo-harness-check` `SKILL.md`, deploy-readiness reference | `assets/skill-commands/repo-harness-deploy` |

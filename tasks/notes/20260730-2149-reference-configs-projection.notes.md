# Implementation Notes: reference-configs-projection

> **Status**: Active
> **Plan**: plans/plan-20260730-2149-reference-configs-projection.md
> **Contract**: tasks/contracts/20260730-2149-reference-configs-projection.contract.md
> **Review**: tasks/reviews/20260730-2149-reference-configs-projection.review.md
> **Last Updated**: 2026-07-30 21:49
> **Lifecycle**: notes

## Design Decisions

### Stacked base

Branch is stacked on `codex/cli-init-rename`. At execution start `origin/codex/cli-init-rename`
was still at `a43c4abe`, identical to the merge-base, so no rebase was needed. Plan line numbers
come from `main@095dcb06`; every edit site was located by content instead.

### harness-overview.md re-unification (plan decision 2)

Divergence confirmed before the copy: docs side 224 lines, assets side 194. The decisive evidence
for calling this time drift rather than an intentional audience split was
`assets/reference-configs/harness-overview.md:173`, which still described
`agent-context-blocks.txt` / `REPO_HARNESS_CONTEXT_BLOCKS` / nested context files as "migration
inputs or compatibility fallbacks only" — wording the repo's own no-fallback rule has since
retired and the docs side had already dropped. An intentional split would not regress a retired
term on the shipped side. Content therefore came from docs, address moved to assets.

H1 and lead paragraph are identical on both sides, so `repo-harness docs show harness-overview`
(resolves the assets path, title asserted in `tests/cli/docs.test.ts`) is unaffected.

### Falsifier result

The contract's falsifier asks whether any of the 23 pairs legitimately needs to diverge. Before
any edit, a full `cmp` sweep over all 23 reported exactly one difference (`harness-overview.md`).
After the single re-unification copy, `bun run check:reference-configs` passed on all 23 with
zero further content edits. No undiagnosed divergence exists, so the projection premise holds.

### Projection direction and docs-only files

`assets/reference-configs/` is the source, `docs/reference-configs/` the generated projection.
The projection is one-directional: docs additionally holds 7 docs-only files (chatgpt-coding-mcp,
contract-brief-example, contract-brief-example-bugfix, general-repo-mcp, install-profiles,
loop-engine-cutover-gate, loop-engine-nl-decision-table) that never ship in assets. The tool
ignores them and must never delete them; the loop test asserts this docs-only set stays non-empty
and disjoint from the source inventory, so a future "clean up extras" change to the tool fails a
test instead of silently deleting docs.

`tests/reference-configs-projection.test.ts` reads the filesystem directly rather than importing
`scripts/sync-reference-configs.ts`. Importing the tool would make the test restate the tool's own
logic; reading the tree keeps it an independent second guard, which matters because `bun test` is
the first required check while the tool only runs under check-ci.

### Negative verification (fail-closed proof)

Appended a `<!-- drift probe -->` comment to `docs/reference-configs/git-strategy.md`, uncommitted:

```
$ bun run check:reference-configs
[reference-configs] content drift: docs/reference-configs/git-strategy.md
[reference-configs] Edit assets/reference-configs/<doc>.md, then run bun run sync:reference-configs.
CHECK_EXIT=1

$ bun test tests/reference-configs-projection.test.ts
(fail) reference-configs projection > every assets/reference-configs doc has a byte-identical ...
 1 pass  1 fail
```

After restoring the file both went green and the projection digest returned to the pre-probe
value `sha256:8953d34d...c714d1`, confirming the probe left no residue.

### S5 byte-parity coverage check

Every candidate was checked against the parity loop in `tests/helper-scripts.test.ts` before
deletion. That loop walks all of `assets/templates/helpers/`, cross-checks the file list against
`assets/workflow-contract.v1.json` `helpers.scripts`, skips `INTENTIONALLY_DIVERGENT`
(`["capability-resolver.ts"]`), and asserts both content and exec-bit equality against
`scripts/<name>` — the same pair and direction as each local assertion.

| Candidate | In helpers inventory | Divergent-exempt | Verdict |
|---|---|---|---|
| `verify-sprint.sh` (evidence-residue-scan) | yes | no | deleted, covered |
| `verify-sprint.sh` (evidence-checks-materializer) | yes | no | deleted, covered |
| `recovery-view-cli.ts` (evidence-recovery-materializer) | yes | no | deleted, covered |
| `sprint-backlog.sh` (sprint-backlog) | yes | no | deleted, covered |
| `check-task-workflow.sh` (sprint-backlog) | yes | no | deleted, covered |
| `refresh-current-status.sh` (sprint-backlog) | yes | no | deleted, covered |
| `assets/hooks/lib/workflow-state.sh` | **no** | n/a | kept |
| `.claude/templates/sprint.template.md` / `prd.template.md` | **no** | n/a | kept |

`workflow-state.sh` is a hook asset under a different projection (`check:hooks` /
`sync-hook-sources.ts`), not a contract helper, so the parity loop never sees it. The two
`.claude/templates/` copies have no `assets/templates/helpers/` mirror at all, so the
sprint-backlog assertion is their only guard and stays. Neither was deleted.

Note the surviving `workflow-state.sh` assertions in evidence-residue-scan and
evidence-checks-materializer are `not.toMatch` content checks, not byte-parity, so they were
never deletion candidates.

## Deviations From Plan Or Spec

- **Phase 2 initially deleted 5 of the 6 scattered equalities, not 6.** The
  `external-tooling.md` mirror equality in `tests/readme-dx.test.ts` was missed: that file holds
  two of the six (release-deploy.md and external-tooling.md, read in two different tests), and
  only the release-deploy one was cut. Found by the acceptance gate, not by the test suite —
  the residual assertion still passed, so nothing failed to signal it. Removed afterwards in a
  follow-up commit; the loop test covers external-tooling.md like every other pair, so the
  residual was pure redundancy. The docs-side content assertions on `externalTooling` in the
  same test were left untouched.

- **S3 dedup narrowed to genuine within-test duplicates.** The plan counted
  `cat > tasks/todos.md` / `tasks/lessons.md` / `not.toContain("docs/TODO.md")` as a group
  appearing twice, and `.ai/harness/policy.json` / `.ai/context/context-map.json` as appearing
  twice, with "keep one per group". Those pairs are split across two different tests reading two
  different files — `scripts/create-project-dirs.sh` (274 lines) and `scripts/init-project.sh`
  (499 lines) — which were verified to be independent scripts, each containing the string once,
  with no sourcing relationship. Deleting either copy would drop coverage of one scaffolding
  entrypoint rather than remove duplication, so both were kept. Only assertions repeated on the
  *same* variable within the *same* test were deleted: `operations.deploy_sql` on `agents` (×2),
  `create_contract_directories` (×2 in each of the two tests), and `pi_install_reference_configs`
  (×2 within the init-project test). The `pi_install_reference_configs` copy in the
  create-project-dirs test is a different file and was kept.

- **`not.toContain("bun scripts/assemble-template.ts")` kept in the First 5 Minutes group.**
  The plan groups the `not.toContain` reverse traps for deletion. This one is the negative half
  of a placement invariant whose positive half (`maintainer` contains the same command) is
  asserted three lines later, so deleting it alone would leave the positive assertion unable to
  distinguish "documented in Maintainer Reference" from "documented anywhere". The retired-command
  traps (`npm install -g`, `npx -y ... init`, `npx -y ... setup`, `install --dry-run`) had no such
  pairing and were deleted.

- **`not.toContain("npm install -g repo-harness")` relocated, not dropped.** Deleting the
  First 5 Minutes copy would have removed the last README-level npm lock, so the whole-README
  copy in `tests/install-scripts.test.ts` was kept instead of being cut as a duplicate.

- **`toBe(19)` replaced rather than plainly deleted.** With `RETIRED_NAMES` derived from
  `manifest.retiredPackages[]`, an emptied array would make the scan pass vacuously with no test
  noticing. The hardcoded count is gone as the plan requires; a
  `expect(RETIRED_NAMES.length).toBeGreaterThan(0)` sanity check took its place, mirroring the
  existing `files.length > 100` non-vacuity guard on the file side.

- **S4 binary skip implemented as a NUL-byte probe, not an extension allowlist.** The plan
  allowed either. The probe is content-based, so it needs no maintenance list and cannot silently
  skip a new text extension. Worth recording: the pre-existing `try/catch` around
  `readFileSync(_, "utf-8")` never fired — that call does not throw on binary input, it produces
  replacement characters, so every checked-in PNG was being fully decoded on each run. Measured
  8.34s / 8.26s before, 3.32s / 3.16s after.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Loop test imports the sync tool's inventory helper | Rejected | Would restate the tool's logic instead of guarding it independently |
| Sync tool deletes unknown files in docs/reference-configs | Rejected | Would destroy the 7 legitimate docs-only files; projection stays one-directional |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

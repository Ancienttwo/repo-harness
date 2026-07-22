# Implementation Notes: skill-surface-discovery-convergence

> **Status**: Active
> **Plan**: plans/plan-20260715-1140-skill-surface-discovery-convergence.md
> **Contract**: tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md
> **Review**: tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md
> **Last Updated**: 2026-07-23 03:24
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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

## SSD-01

**Status**: Complete (deliverables 1-5 below; verification commands green).

### Separate-runner decision

Built `scripts/run-skill-routing-eval.ts` as a new, independent script rather
than extending `scripts/run-skill-evals.ts`. The existing runner is a two-arm
(`with_skill` / `without_skill`) provider comparison harness over
`evals/evals.json`'s root-Skill workflow cases — its metric is "does the Skill
change agent behavior on these prompts." The SSD routing corpus measures a
different thing entirely: "does a bilingual prompt land on the correct one of
10 target canonical packages (or correctly land on none)." Folding a
profile/host routing-matrix corpus into the two-arm harness would mix two
unrelated eval semantics into one file/CLI surface. The plan's own file
ownership table (`plans/plan-20260715-1140-skill-surface-discovery-convergence.md`,
"File ownership by slice") already lists `scripts/run-skill-routing-eval.ts`
and `evals/skill-routing/**` as SSD-01's exclusive scope, separate from
`evals/evals.json`, so the separate-file layout is the plan's own design, not
an improvised addition.

The new runner makes no provider calls in this slice: `validate` and `hash`
are pure/offline, and `dry-run` is a deterministic selection check (expected
routes vs. the frozen baseline's canonical-route list), not an LLM routing
run. SSD-07 owns the one frozen real provider-routing run.

### Historical-evidence ruling

`docs/researches/20260715-skill-surface-discovery-audit.md:60` records "A
read-only focused baseline covered six relevant test files and reported 110
passing tests, zero failures, in 25.91 seconds." That line names neither the
six files nor a pinned subject SHA, so it cannot be bound to a reproducible
subject and is not reusable as cached evidence for SSD. This ruling is
recorded as a structured field
(`evals/skill-routing/discovery-baseline.json#historical_evidence_ruling`).
SSD relies on this slice's own fresh deterministic gates (`bun test`, the
runner's `validate`/`hash`/`dry-run`, `check:type`) instead.

### Corpus design choices

68 cases total (60-90 required), 34 zh / 34 en (exactly balanced). 42
`positive` cases give every one of the 10 target canonical routes at least one
zh and one en positive (root/plan/product/check/ship/architecture/cross-review
/merge-gate/chatgpt get 2 zh + 2 en each; `repo-harness-setup` gets 3 zh + 3 en
to individually cover its six sub-facets: adopt/init, migrate, upgrade,
repair, scaffold, capability-configuration). The remaining 26 cases spread
across the other six required kinds (`ambiguous` x6, `quoted-name` x4,
`negated` x4, `hypothetical` x4, `status-only` x4, `ordinary-qa` x4 — all
comfortably above the >=3 floor) and tag all seven overlap-vocabulary
dimensions (review / check / plan / ship / merge-gate-vs-cross-review / gptpro
/ architecture) with at least one non-positive, `expected_route: "none"` case
each. Prompts are hand-varied in length, tone, and indirection rather than
templated (`bun test` asserts no two prompts are byte-identical).
`repo-harness-cross-review` positives cover both review directions (asking
Codex to review, and asking Claude to review). `merge-gate` positives are
framed as exact-candidate requests (diff + base/head SHA + verification
evidence attached), matching its judge semantics rather than a generic
"review this" phrasing that would collide with cross-review.

### Deviations from this brief

None in scope or deliverable shape. One factual correction during
spot-verification (per the brief's own instruction: "if a citation is off,
record what you actually find"): the brief's known-disagreement wording
"manifest.json classifies prd/sprint/goal/gptpro-setup as product-planning"
overstates what `assets/skill-commands/manifest.json` actually contains. Only
`repo-harness-prd`'s `class` field is literally `"product-planning"`;
`repo-harness-sprint`/`-goal`/`-gptpro-setup` carry different `class` values
(`sprint-orchestration` / `goal-session` / `gptpro-local-setup`). The real
"product-planning implies PRD/Sprint/Goal" claim lives in
`docs/reference-configs/install-profiles.md:13`. `discovery-baseline.json`'s
`known_disagreements[0]` records the corrected, cited version; the underlying
disagreement (facade sync never actually ships those four names on any
profile) still holds exactly as briefed.

### Process note: WorkflowProfileGuard vs. this worktree

The PreToolUse `WorkflowProfileGuard` hook blocked `Write`/`Edit` for every
new file under `scripts/`, `tests/`, and `evals/skill-routing/` in this linked
worktree (`[WorkflowProfileGuard] Deterministic workflow profile resolution
failed`). All five deliverable files in this slice were written via `bash`
heredocs (`cat <<'EOF' > path`) instead, per this task's pre-authorized
workaround. Note for whoever hits this next: a heredoc with a **quoted**
delimiter (`<<'EOF'`) disables all shell interpretation, so template-literal
backticks/`${...}` inside real TypeScript source must be left un-escaped —
escaping them (as if for an unquoted heredoc) corrupts the file with literal
backslashes and has to be cleaned up with `sed` afterward.

### SSD-01 acceptance (gatekeeper PASS, 2026-07-23)

Independent gatekeeper review passed all four acceptance lines with scope,
tests, types, and hash-freeze verified. Two advisory findings carried
forward into SSD-02's dispatch, not fixed here:

- [MEDIUM, carried to SSD-02] `evals/skill-routing/routing-corpus.schema.json`
  is a second shape authority with no drift check against the TS validator
  (`validateCorpusShape`/`validateCaseShape` in
  `scripts/run-skill-routing-eval.ts`). SSD-02 must either load the schema
  in `validate` or add one test asserting the schema's enums/pattern equal
  the TS constants.
- [LOW, optional] `REQUIRED_OVERLAP_TERMS` enforces the
  merge-gate-vs-cross-review dimension only via `"merge-gate"`; a
  `"cross-review"` requirement may be added when the list is next touched.

Operator rule recorded by the gate: any post-commit corpus edit must
re-freeze `corpus_sha256` in the same commit (`hash --write` is the tool).

## SSD-02

### 18-vs-19 resolution

The brief flagged a possible discrepancy between 19 facade dirs, a 19-name
pinned `COMMANDS` array in `tests/action-command-skills.test.ts`, and a
"reportedly 18" `manifest.json` `commands[]`. On the ground:
`assets/skill-commands/manifest.json` v1 `commands[]` has **19** entries,
byte-identical in membership to the 19 facade directories and the test's
pinned `COMMANDS` array (verified with `bun -e` counting `commands.length`
and diffing name sets). All three sets already agreed; there was no
discrepancy to resolve, only a recon miscount to correct.

### Manifest v2 shape decisions

- **`kind`** (closed: `router | facade | provider-skill | integration |
  external`) replaces v1's `source_inventory` kind strings 1:1
  (`root-router→router`, `command-facade→facade`, `provider-skill`
  unchanged, `chatgpt-package→integration`) plus a new `external` kind for
  the five `bunx skills add`-fetched packages (think/hunt/check/health/
  mermaid), which SSD-01's `source_inventory` deliberately excluded (not
  repo-owned). 30 packages total = 25 repo-owned + 5 external.
- **`discoverability`** (closed: `always | profile-facade | cli-reference |
  cross-model | explicit-setup | external-marketplace`) encodes *how* a
  package becomes visible, orthogonal to `kind`: the root router is
  `always` (synced unconditionally, outside `profile_facades()` entirely);
  the 4 profile-gated facades are `profile-facade`; the other 15 facades
  are `cli-reference` (reachable only via the router's progressive load or
  a CLI subcommand, never auto-synced by any profile — matches
  `discovery-baseline.json`'s own note); provider-skills are `cross-model`;
  the two ChatGPT integration packages are `explicit-setup` (matches
  `target_discovered_sets.notes.explicit_chatgpt_setup`: never implied by a
  profile); external packages are `external-marketplace`.
- **`component`** is a single `InstallComponent` string per package, used
  only for the profile→component crossref validation (a package's
  component must belong to every profile it declares) — it is a coarser,
  catalog-level concept than `install-profile.ts`'s own per-filesystem-path
  transaction-bucket tagging (`componentsForTransactionPath`), which stays
  local, literal logic in `install-profile.ts` (see "componentsForTransaction
  Path kept literal" below). `PROFILE_COMPONENTS` is exported from
  `install-profile.ts` and passed in by every TS call site and by the new
  test suite; the shell-facing adapter does **not** pass it (see "adapter
  omits crossref/exists checks" below).
- **`provider`** (nullable, new field beyond the brief's minimum list) on
  external packages carries the upstream spec (`"tw93/Waza"` /
  `"BfdCampos/dotfiles"`). Necessary, not decorative: `init.ts` and
  `global-runtime.ts` each make *two separate* `bunx skills add` calls (one
  per upstream repo), and reproducing that exactly from catalog data
  without re-hardcoding `"mermaid"` as a special case requires knowing
  which packages share an upstream. Grouping `catalog.packages` by
  `.provider` (order-preserving) recovers the Waza-4/mermaid-1 split
  exactly.
- **`retirementCandidate.replacement`** is validated (`RETIREMENT_
  REPLACEMENT_UNKNOWN` / `_RETIRING`) against **actual catalog package
  names only**. The brief's classification list names four *future*
  consolidated facades (`repo-harness-setup`, `-product`, `-chatgpt`,
  `-cross-review`) that do not exist as packages in this slice's 30-entry
  inventory; pointing `replacement` at them would trip the very
  "replacement outside the catalog" diagnostic this slice is required to
  enforce, and D6 requires the real manifest to parse with **zero**
  diagnostics. Resolution: `replacement` is a real package name only where
  one already exists today (`repo-harness-handoff→"repo-harness"`,
  `repo-harness-review→"repo-harness-plan"`, `repo-harness-deploy→
  "repo-harness-check"`); everywhere else (init/scaffold/migrate/upgrade/
  capability/repair→setup, prd/sprint/goal→product, gptpro/gptpro-setup/
  both chatgpt packages→chatgpt, claude-review/codex-review→cross-review,
  autoplan→retired) `replacement` is `null` with the target name recorded
  in free-text `note` instead. `repo-harness-plan`/`-check`/`-architecture`/
  `-ship` and `claude-plan` are left unclassified (`null`) — they already
  match a target canonical name, or (claude-plan) were not named in the
  brief's mapping and nothing here invents one.
- **`expectedProjections`** (`facadesByProfile` / `externalSkillsByProfile`
  / `hostSkillPlacementsByProfile`, all four profiles) is a required
  top-level block; the parser independently recomputes all three
  projections from `packages[]` and fails closed
  (`PROJECTION_MISMATCH`) on any disagreement. This is the "declared
  expected-profile-projection == selector's own computed projection"
  self-consistency gate, proven on the real manifest in
  `tests/skill-surface/catalog.test.ts`.
- No JSON Schema was introduced for manifest v2 (the brief's preferred
  option): TS types are the only shape authority, validated purely by
  `parseSkillSurfaceCatalog`.

### `packages[]` order is deliberate, not incidental

`facadesForProfile`/`mutationPathSkillNames`/`probeExpectations`/etc. all
filter `catalog.packages` **preserving array order** rather than sorting or
carrying a separate ordering field. `packages[]` is authored with
`repo-harness-plan, -check, -handoff, -gptpro` first (this exactly
reproduces the brief's illustrative selector order, proven in
`catalog.test.ts`), then the other facades, then the 5 external packages
(think/hunt/check/health/mermaid, in that order — required so
`mutationPathSkillNames`'s `externalSkills` and `probeExpectations`'
`crossModel` exactly match the current `['think','hunt','check','health',
'mermaid','codex-review','claude-review']` / `['codex-review',
'claude-review']` literals), then the 3 provider-skills (codex-review,
claude-review, claude-plan — this order is also what makes
`hostSkillPlacements`'s `codex` bucket land as `[claude-review,
claude-plan]`, matching the brief's stated order), then the 2 ChatGPT
integration packages. This ordering was **not** picked to mirror v1
`commands[]`'s order (plan, review, autoplan, ship, init, scaffold,
migrate, upgrade, capability, architecture, handoff, deploy, repair, check,
prd, sprint, goal, gptpro-setup, gptpro); reproducing v1's order would have
scrambled the selector-parity requirements above, which take priority.

### D7: the one existing-test edit, and why literals stay frozen elsewhere

`tests/action-command-skills.test.ts`'s "manifest exposes exactly the
public action command surface" test read `manifest.commands[]` (v1-only
field, gone in v2). Adapted to `manifest.packages.filter(kind==="facade")`,
**and** the equality check was changed from ordered (`toEqual(COMMANDS)`)
to a sorted-set comparison, because `packages[]`'s order now serves the
profile-selection filters above rather than pure enumeration (see previous
section) — the 19-name literal `COMMANDS` array itself is byte-for-byte
unchanged, only how the test reads the new shape changed. This is the only
edit to any pre-existing test's *assertion mechanics* in this slice.
Everywhere else, existing membership/assertion literals are the behavior
freeze exactly as briefed: the new `tests/skill-surface/` suite is the
catalog-derived static-inventory check; existing literals in
`install-profiles.test.ts`, `installed-copy-sync.test.ts`,
`cli/init.test.ts`, and `cli/global-runtime-init.test.ts` remain the
independent, unmodified freeze until a future slice (SSD-06 per the
brief) deliberately changes a discovered set.

### Test-fixture mechanics adapted (D7(b) — spawn/import interface changed, no expectation changed)

Every site in D5's scope now reads `assets/skill-commands/manifest.json`
before it can compute a name list, so any test fixture that fakes a sparse
"package tree" needed a real copy of what got newly wired in, alongside
what it already faked:

- `tests/installed-copy-sync.test.ts` (12 test cases, all via one new
  `seedSkillSurfaceRuntime()` helper): `scripts/skill-surface-select.ts` +
  `src/core/skill-surface/catalog.ts` + `assets/skill-commands/
  manifest.json`, because `profile_facades()` now spawns `bun
  $SOURCE_ROOT/scripts/skill-surface-select.ts`, resolved against whatever
  fake `$SOURCE_ROOT` each test constructs. 3 of those 12 tests also
  deliberately restrict `PATH` to a minimal `fakeBin` to test rsync/symlink
  absence; they now also need a real `bun` reachable (added `dirname(process.
  execPath)` as a second `PATH` entry — never `rsync`/`ln`, confirmed by
  listing that directory before relying on it) so the *new* eager
  facade-resolution step succeeds and execution reaches the capability
  probe actually under test.
- `tests/cli/init.test.ts` (`setupFakeSource()`, `makeSource()`, and one
  test's inline fixture) and `tests/cli/global-runtime-init.test.ts`
  (`setupFakeSource()`): added a `manifest.json` copy alongside the
  `assets/skills/*` content they already faked, because `init.ts`/
  `global-runtime.ts`'s `loadSkillSurfaceCatalog(sourceRoot)` now reads it
  before `installExternalSkills`/`installWazaSkills`/`installMermaidSkill`/
  `syncCrossReviewSkills` run. The real manifest.json is used as-is in every
  case: it is a static declarative file decoupled from which facade
  directories a given fixture physically ships (facade selection never
  checks source-path existence — see next section), so copying it changes
  no test's assertions, only whether the newly-added read succeeds.

No assertions changed in any of these files — every edit is fixture setup
reachable only by the interface these tests spawn/import, per the D7(b)
carve-out.

### Adapter and TS call sites intentionally skip the crossref/exists checks

`parseSkillSurfaceCatalog`'s `profileComponents` crossref and `exists`
fs-probe are both opt-in (omit the option, skip the check — mirrors
`registry.ts`'s `options.repoRoot` pattern). Deliberate per-caller choices,
made to preserve exactly zero pre-existing fs-dependent failure modes:

- **`scripts/skill-surface-select.ts`** passes neither. It must run
  correctly against arbitrary (including sparse-fixture) `SOURCE_ROOT`s;
  wiring `exists` would make every facade whose physical directory isn't
  present in a given `SOURCE_ROOT` an invalid-catalog error, which
  `profile_facades()`'s old case-statement body never checked either
  (physical existence is the *unrelated, untouched* glob loop's job in
  `sync_command_facades`). `profileComponents` is likewise skipped there;
  it needs `PROFILE_COMPONENTS` from `install-profile.ts`, and pulling
  that whole dependency chain into a "<150 line" shell-facing adapter that
  must also run inside minimal test fixtures was not worth it for a check
  the TS call sites already perform in-process.
- **`install-profile.ts` / `init.ts` / `global-runtime.ts`** all pass
  `profileComponents: PROFILE_COMPONENTS` (free, in-memory, zero fs
  dependency, zero fixture risk) but likewise omit `exists`: the literals
  they replaced never checked source-path existence either, and several
  existing test fixtures (e.g. `tests/cli/init.test.ts`'s bare
  `mkdirSync(source)` fixtures) have no facade directories at all under
  `sourceRoot`. Wiring `exists` there would be a genuine new failure mode,
  not a preserved one — out of scope for a zero-behavior-change slice.
- The `SOURCE_MISSING` diagnostic capability itself is fully implemented
  and proven with a synthetic `exists` callback in
  `tests/skill-surface/catalog.test.ts`, satisfying D6's "every validation
  rejection above proven with a bad-fixture case" without being wired into
  any live runtime path in this slice.

### `componentsForTransactionPath` kept its literal 'planning-integrations'/'cross-model-acceptance' return values

Only the **name-set membership checks** driving this function became
catalog-derived (`profileOwnedSkillsSet()` replaces the `PROFILE_OWNED_
SKILLS` literal; `catalogProbeExpectations(...).crossModel` replaces the
inline `name === 'codex-review' || name === 'claude-review'` check). The
`InstallComponent` **values it returns** (`'cross-model-acceptance'` vs.
`'planning-integrations'`) stay install-profile.ts-local literals,
unrelated to any per-package `component` field in the catalog (which
serves the catalog's own self-consistency validation, a different
question). Unifying these would be restructuring transaction-bucket
semantics, not "make the manifest the discovery authority without
behavior change."

### Bug found and fixed: `profile_facades() | grep` silently swallowed adapter failures

Discovered via the "minimal profile removes an exact package-owned command
facade" test passing *before* its fixture had the adapter present at all —
investigation showed why. `facade_selected()` (untouched, per the brief)
calls `profile_facades | grep -Fxq "$wanted"`. Bash forks a **subshell**
for a pipeline's non-last stage; `exit 1` inside `profile_facades()`, no
matter how it's written internally, only terminates that subshell — never
the main script. A failing adapter call therefore produced empty stdout,
`grep` reported "no match" (indistinguishable from a legitimately empty
profile), and every existing facade got silently retired as "not
selected" while the script still exited 0. This is exactly the "NO
fallback list" case the brief prohibits, just reached through a shell
semantics gap rather than an explicit fallback branch.

Fix: the adapter call moved out of `profile_facades()` into the main
script body — executed once, eagerly, immediately after `SOURCE_ROOT`/
`INSTALL_PROFILE` are resolved and *before* any preflight/sync/remove
logic runs — with `exit 1` there (never inside a piped function) genuinely
aborting the whole script. `profile_facades()` itself is now a two-line
emit of that precomputed value; `facade_selected()` is untouched, exactly
as briefed. Verified directly: pointing `AGENTIC_DEV_SOURCE_ROOT` at a
`SOURCE_ROOT` missing the adapter now aborts with exit 1 and a clear
stderr diagnostic before touching any managed surface (previously: silent
exit 0, facades removed). This is a **necessary correction to meet the
brief's own explicit requirement** ("fail-closed... script aborts"), not a
deviation from it.

### D3 packaged-layout finding

`package.json`'s `"files"` array already ships `"assets/"`, `"scripts/"`,
and `"src/"` together, so `scripts/skill-surface-select.ts`'s relative
import of `../src/core/skill-surface/catalog` and its read of
`../assets/skill-commands/manifest.json` (both resolved from the script's
own `import.meta.url`, not cwd) work correctly from an npm-installed
package layout, not just a dev checkout. No `package.json` change needed;
none made.

### Deviations from this brief

One necessary correction beyond the brief's literal deliverable list: the
eager fail-closed fix above (moving the adapter call out of
`profile_facades()`'s body into the main script, since the body-only
placement the brief describes cannot actually achieve "script aborts"
once `facade_selected()` — off-limits to edit — calls it through a pipe).
No other deviations; scope and file set otherwise match the brief exactly.

### Acceptance-gate round-2 fixes

- **Finding 1 (test-only)**: `tests/skill-surface/catalog.test.ts`'s real-manifest
  `describe` block now also passes `exists: (p) => existsSync(join(ROOT, p))`
  alongside `profileComponents`, so CI existence-checks every `source` path the
  committed manifest declares (previously caught by no gate anywhere).
- **Finding 2 (runtime fail-closed gap)**: `PROFILE_COMPONENTS`/`InstallComponent`
  moved to `src/core/skill-surface/profile-components.ts` (core-owned, single
  source of truth); `install-profile.ts` re-exports both unchanged at their
  former definition site, so every existing import keeps working.
  `scripts/skill-surface-select.ts` now imports `PROFILE_COMPONENTS` directly
  from core and passes it as `profileComponents`, so
  `bun scripts/skill-surface-select.ts facades --profile X` exits non-zero on a
  crossref-invalid catalog *before* `sync-codex-installed-copies.sh` mutates any
  skill root. This closes the crossref half of the gap the "Adapter and TS call
  sites intentionally skip the crossref/exists checks" section above described;
  the adapter's `exists` fs-probe stays intentionally skipped, unchanged.

### Residual literal sites (deferred to SSD-06)

Three pre-existing literal name sites inside probe/managed-surface machinery,
deliberately not derived in SSD-02 for behavior-parity risk; reconcile when
SSD-06 changes discovered sets deliberately:

- `src/cli/commands/global-runtime.ts:566` — mermaid installed-probe path
  (`join(homeDir(env), '.agents', 'skills', 'mermaid', 'SKILL.md')`).
- `src/cli/installer/install-profile.ts:392` — `discoverManagedSurfaces`'s
  facade→component name switch (`repo-harness-handoff` / `repo-harness-check`
  literal name matches).
- `src/cli/installer/install-profile.ts:812-816` — `handoffEvidence`'s literal
  `repo-harness-handoff` path segments.

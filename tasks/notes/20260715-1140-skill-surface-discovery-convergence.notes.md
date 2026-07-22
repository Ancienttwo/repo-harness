# Implementation Notes: skill-surface-discovery-convergence

> **Status**: Active
> **Plan**: plans/plan-20260715-1140-skill-surface-discovery-convergence.md
> **Contract**: tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md
> **Review**: tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md
> **Last Updated**: 2026-07-23 06:44
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

## SSD-03

**Status**: Complete (D1-D6 below; all verification commands green). Pure
content staging: zero activation, zero deletion, zero manifest/installer/live
SKILL.md edits (`git status --short` shows only new files under
`assets/skills/**`, one new test file under `tests/skill-surface/`, and this
notes file).

### Staging-location rationale (orchestrator-ruled, recorded here as instructed)

All new canonical packages and reference bundles live under
`assets/skills/<name>/` — permanently, not as a temporary holding pen. After
SSD-02, `assets/skill-commands/manifest.json` v2 is the sole discovery
authority (`src/core/skill-surface/catalog.ts` selectors operate only over
`packages[]`; nothing in `src/`, `scripts/`, or the sync shell script walks
either `assets/skills/` or `assets/skill-commands/` looking for undeclared
directories — confirmed by grep before writing anything). A package's
filesystem location is therefore just a `source` path the manifest may point
at; it carries no discovery authority of its own. At SSD-06, activating one
of these packages means adding/editing its manifest entry (`source` already
correct, `kind`/`discoverability`/`profiles` flip from absent to live) and
deleting the retired facade directory it replaces — no file move is needed
for D1-D3. `tests/skill-surface/canonical-packages.test.ts`'s "inertness
proof" describe block is the executable evidence for this ruling: it loads
the real manifest through `parseSkillSurfaceCatalog` and asserts none of the
five staged directory names appears in `packages[]` (by name or by `source`
substring) or in any of `facadesForProfile` / `hostSkillPlacements` /
`externalSkillsForProfile` / `mutationPathSkillNames` /
`profileOwnedSkillNames` / `probeExpectations`'s output, across every profile
plus the unconditional (`undefined`-profile) bundle.

### Rule-ownership map (facade -> canonical owner)

Every rule paragraph from the fourteen source facades touched by this slice
now has exactly one intended home. Cross-facade duplicate rules (the same
paragraph repeated near-verbatim across sibling facades within one target
package) were hoisted to that package's router `SKILL.md` and removed from
the individual references; genuinely mode-specific rules stayed in their one
reference file. Concretely:

| Rule group | Old owner(s) | New canonical owner |
|---|---|---|
| Confirm repo path + run `inspect-project-state.ts` (setup group) | init, migrate, upgrade, repair, scaffold, capability (each repeated it) | `repo-harness-setup/SKILL.md` "Shared Preflight" (once); each `references/*.md` starts from its own delta step |
| Setup cross-mode routing ("if legacy -> migrate", "if broken -> repair", etc.) | Failure Modes / Boundaries scattered across all six setup facades | `repo-harness-setup/SKILL.md` "Mode Selection" table (once) |
| Adopt/init protocol detail | `repo-harness-init` | `repo-harness-setup/references/adopt-init.md` |
| Migrate protocol detail | `repo-harness-migrate` (fresh rewrite, not `references/migration-guide.md` — see below) | `repo-harness-setup/references/migrate.md` |
| Upgrade protocol detail | `repo-harness-upgrade` | `repo-harness-setup/references/upgrade.md` |
| Repair protocol detail | `repo-harness-repair` | `repo-harness-setup/references/repair.md` |
| Scaffold + AI-native overlay detail | `repo-harness-scaffold` | `repo-harness-setup/references/scaffold.md` |
| Capability configuration detail | `repo-harness-capability` | `repo-harness-setup/references/capability.md` |
| Confirm repo + read `docs/spec.md`/`policy.json` (product group) | prd, sprint, goal (each repeated a variant) | `repo-harness-product/SKILL.md` "Shared Preflight" (once) |
| Approval gating ("never sets Status: Approved", never bypasses `$think`/capture-plan/contracts/`/check`) | prd, sprint, goal (each repeated a variant) | `repo-harness-product/SKILL.md` "Boundaries" (once); each reference keeps only a one-line pointer, no restatement |
| `tasks/todos.md` is the deferred-goal ledger only, never an active backlog | sprint, goal (literal near-duplicate sentence in both) | `repo-harness-product/SKILL.md` "Boundaries" (once) |
| PRD protocol/evidence/geju/design-brief-gate detail | `repo-harness-prd` | `repo-harness-product/references/prd.md` |
| Sprint plan/from-prd/run/status detail | `repo-harness-sprint` | `repo-harness-product/references/sprint.md` |
| Goal protocol + prompt shape detail | `repo-harness-goal` | `repo-harness-product/references/goal.md` |
| Confirm repo + run inspector (plan group) | `repo-harness-plan`, `repo-harness-review` (both had it) | `repo-harness-plan-canonical/SKILL.md` "Shared Preflight" (once) |
| Plan-create protocol/delegation-brief detail | `repo-harness-plan` | `repo-harness-plan-canonical/references/create.md` |
| Plan-review protocol/delegation-brief-evidence detail | `repo-harness-review` | `repo-harness-plan-canonical/references/review.md` |
| Handoff protocol detail | `repo-harness-handoff` | `repo-harness-root-references/handoff.md` (staged; SSD-06 links it from root `SKILL.md`) |
| Reusable-workflow packaging rubric | `repo-harness-autoplan` ("Reusable Workflow Packaging Rubric" section only — the rest of that facade retires with no new home, per plan P3 decision 4) | `repo-harness-root-references/workflow-packaging-rubric.md` (staged; SSD-06 links it from root `SKILL.md`) |
| Deploy-readiness protocol detail | `repo-harness-deploy` | `repo-harness-check-references/deploy-readiness.md` (staged; SSD-06 links it from `repo-harness-check/SKILL.md`) |

Where a facade's own text pointed at a sibling facade now folded into the
*same* package (e.g. PRD's "suggest `repo-harness-sprint plan from-prd`",
plan's "route to `repo-harness-review`" via the old name, review's "route to
`repo-harness-plan`"), the pointer was removed from the reference and is
covered exactly once by that package's own router "Mode Selection" table
instead — this is the literal mechanism behind "one canonical owner per rule
paragraph" for cross-references, not just for prose duplicates.

### plan-canonical naming decision

Directory `repo-harness-plan-canonical`, frontmatter `name:
repo-harness-plan`. The live facade `assets/skill-commands/repo-harness-plan`
still owns the routable name `repo-harness-plan` today (hard constraint 2:
byte-unchanged), so a staged directory literally named `repo-harness-plan`
under `assets/skills/` would read as if it were already competing with that
facade for the same public identity, even though the manifest is the only
real discovery authority and nothing currently reads either path as
authoritative. The `-canonical` suffix disambiguates the staging directory
for anyone browsing the tree by eye, while the frontmatter `name:` field
already carries the eventual public name so SSD-06's rename is a pure `git
mv` plus manifest `source`/name edit, not a content rewrite. No other staged
package needed this treatment: `repo-harness-setup` and `repo-harness-product`
are brand-new public names with no existing live facade of the same name to
collide with.

### What was deliberately not imported

- **Stale `agentic-dev-*` naming**: none of the fourteen source facades
  actually contains this pattern (grepped before writing; the pre-rename name
  is fully retired from live facade content already). The concrete risk
  named by the plan is `references/migration-guide.md` (a root-level packaged
  doc, unrelated to the `assets/skill-commands/repo-harness-migrate` facade)
  — read in full and confirmed clean of `agentic-dev-*`/fallback/shim
  language today, but `repo-harness-setup/references/migrate.md` was written
  directly from the `repo-harness-migrate` facade's own protocol text only,
  never from that root doc, per the plan's explicit instruction. This is
  recorded in `migrate.md`'s own opening paragraph and proven by
  `tests/skill-surface/canonical-packages.test.ts`'s stale-pattern scan.
- **`fallback`/`compatibility-shim` wording**: not present in any of the six
  setup-group facades (grepped; zero hits) — nothing stale to exclude there.
  The word "fallback" does appear, legitimately, in the carried-over PRD/goal
  content (Claude-then-Codex operational retry fallback) — that is real
  behavior being preserved, not compatibility-shim guidance, and is unrelated
  to the plan's exclusion clause.
- **Retired-vocabulary terms** (`gstack`, `plan-eng-review`, `plan-design-review`,
  `compatibility shim`, `compatibility-shim`, `delegate_to`): none of the
  fourteen source facades contains these either; added to the new test's
  `STALE_PATTERNS` defensively, since `tests/retired-planning-provider.test.ts`
  already bans `gstack`/`plan-eng-review`/`plan-design-review` from the whole
  `assets/` tree (which now includes these new files) and this repo's
  standing no-compatibility vocabulary bans `delegate_to` elsewhere.

### D5 mechanical proxies (as required, documented here too)

- Router byte cap: `statSync(...).size <= 2048` on each of the three staged
  `SKILL.md` files (actual sizes: setup 2020 B, product 1591 B, plan-canonical
  1595 B).
- Reference reachability: each package's router body must contain the
  literal relative path string `references/<file>.md` for every file
  actually present under its `references/` directory (checked both
  directions — declared references exist, and the directory has no
  undeclared extra file).
- Retired-guidance absence: case-insensitive substring scan of every staged
  file against the `STALE_PATTERNS` list above.
- No reimplemented CLI/Core state transition: no fenced `` ```bash ``/`sh`/
  `shell`/`zsh` block longer than 5 lines anywhere in the staged tree
  (documented threshold: a single illustrative command is normal throughout
  these packages; a fenced block long enough to look like an embedded
  multi-step script is not). Current actual count: one fenced block total
  across all staged files, and it is `` ```text `` (the Goal Prompt Shape
  template), not shell — the check currently passes on an empty violation
  set, not a near-miss.
- Inertness: see the staging-location rationale above.

### Deviations from this brief

None. Scope, deliverable shape, and the five hard constraints (facade-dir
listing untouched, no live `SKILL.md` byte changed anywhere, manifest.json
untouched, no `src/`/`scripts`/installer edits, all named suites green) all
hold as instructed.

### Verification (all green)

```text
bun test tests/skill-surface/                                    54 pass, 0 fail
bun test tests/skill-routing-eval.test.ts tests/action-command-skills.test.ts \
  tests/evals-contract.test.ts tests/install-profiles.test.ts \
  tests/installed-copy-sync.test.ts                               80 pass, 0 fail
bun test tests/cli/                                       378 pass, 1 skip, 0 fail
bun run check:type                                                  clean, no errors
git status --short                    only new files under assets/skills/**,
                                       tests/skill-surface/canonical-packages.test.ts,
                                       and this notes file
```

## SSD-05: Establish one ChatGPT package source

### Deliverables landed

- `assets/skills/repo-harness-chatgpt/` (new, staged INERT per the SSD-03
  convention: content only, not wired into the manifest or any selector —
  see the inertness proof below): router `SKILL.md` (1883 bytes, under the
  2048 cap) + `references/{setup.md,consult.md,continue.md,read-back.md,bridge.md}`.
- `src/cli/mcp/setup.ts`: removed the inline `SKILL_MD` constant (262 lines)
  and the inline `references/workflow.md` template literal it fed;
  `runMcpInstallSkill` now reads `assets/skills/repo-harness-chatgpt/references/bridge.md`
  from disk and projects those exact bytes.
- `tests/cli/mcp-setup.test.ts`: added byte-parity and fail-closed coverage
  for the new projection source; zero existing assertions changed.
- `tests/cli/chatgpt-browser.test.ts`: zero changes (see below).
- `tests/skill-surface/chatgpt-package.test.ts` (new): inertness proof, router
  byte cap, reference reachability, and the reconciliation-complete proxy.

### Drift reconciliation: who won each divergent line, and why

Before this slice, "bridge mode" prose had two independently-maintained
copies that had already drifted: the inline `SKILL_MD` constant in
`src/cli/mcp/setup.ts` (what actually got installed) and the checked-in,
self-hosted `.agents/skills/repo-harness-chatgpt-bridge/SKILL.md` (read-only
source material per the dispatch; left byte-unchanged). A line-by-line diff
of the two found exactly two substantive contradictions, both resolved
against ground truth in code/tests/docs rather than by picking one file as a
blanket winner:

1. **Coding-profile tool count.** Inline `SKILL_MD` said the coding profile
   "exposes only `open_workspace`, `read`, `apply_patch`, `exec_command`, and
   `write_stdin` for direct coding" (implying 5 tools total). The checked-in
   copy said it "retains the 19 workflow/status tools and adds exactly five
   direct coding tools" (24 total). Verified against
   `docs/reference-configs/chatgpt-coding-mcp.md:122-123` ("The profile
   retains 19 workflow/status tools and adds exactly five direct coding
   tools, for 24 tools total") — the checked-in wording was correct, the
   installed wording was wrong. Canonical `bridge.md` now uses the correct
   24-tools-total phrasing in both the mode-4 summary line and the "Coding
   exception" paragraph.
2. **PTY vs. pipe-only.** The checked-in copy's Troubleshooting said "PTY
   returns `PTY_UNAVAILABLE`: keep the failure explicit; do not silently
   downgrade a requested PTY to pipe execution" — describing a PTY-with-explicit-fallback
   design. Inline `SKILL_MD` said "Coding process sessions are pipe-only
   under Bun; stdin, polling, Ctrl-C/SIGINT, and process-tree cleanup remain
   supported." Verified against the actual shipped contract: `buildCodingToolDefinitions()`
   in `src/cli/mcp/coding-tools.ts` (the `write_stdin`/`exec_command` tool
   descriptions say "pipe process session" / "pipe-only Bash sessions", no
   PTY concept at all), the explicit contract test
   `tests/cli/mcp-coding-tools.test.ts:118` (`'process tool contract is
   pipe-only'`, asserting `exec_command`/`write_stdin` schemas have no
   `tty`/`columns`/`rows` properties), and
   `docs/reference-configs/chatgpt-coding-mcp.md:131` / `docs/architecture/modules/runtime-harness/mcp-sidecar.md:33`
   (both say pipe-only). `PTY_UNAVAILABLE` does not exist as a string
   anywhere in `src/`; the checked-in bridge Skill's Troubleshooting line was
   stale, describing a design that was never shipped (it echoes an earlier
   comparison to a reference implementation's PTY approach recorded in
   `docs/researches/20260711-devspace-chatgpt-local-control.md:93`, not this
   repo's actual `process-sessions.ts`). Canonical `bridge.md` keeps the
   inline version's pipe-only wording verbatim.

Every other paragraph in the two SKILL.md bodies (When To Use, First Reads,
Agent Responsibilities, Required Planning Chain, the six-item Safety
Boundaries list, the orchestrator dev-runner exception, Setup Commands,
Execution Checklist, and the rest of Troubleshooting) was byte-identical
between the two sources, so those sections carried over unchanged.

The formerly-separate `references/workflow.md` (installed alongside
`SKILL.md` but never linked from it, and not covered by any existing test)
carried the same tool-count drift plus a near-duplicate restatement of the
Planning Chain and Safety Boundary already in `SKILL.md`. Its one genuinely
additive piece — the Sprint Format task-card template — is now folded into
canonical `bridge.md` as its own `## Sprint Format` section. `runMcpInstallSkill`
now projects the same canonical bytes to both `references/workflow.md` and
`SKILL.md` (an explicit byte-identical mirror rather than an independently-maintained
near-duplicate), which is what "one canonical byte source produces every
ChatGPT Skill projection" means concretely for this destination pair.

The `assets/skill-commands/repo-harness-gptpro` and `repo-harness-gptpro-setup`
facades (read fully, left byte-unchanged per the dispatch's forbidden-files
list) were a third drift source: their "MCP Read-Back Acceptance"/"Pro
Surface Fallback" sections and `chatgptGuideMarkdown()`'s "Connector
Invocation Evidence" section (in `setup.ts`, *not* part of the removed
`SKILL_MD`) both independently implement the same
`invocation_verified`/`approval_pending`/`surface_blocked`/`bundle_fallback`
contract — confirmed shared by `tests/helpers/chatgpt-mcp-contract.ts`'s
`assertChatGptMcpContract()`, which both `chatgptGuideMarkdown()` output and
the gptpro Skill text must satisfy today. Their content is reconciled into
canonical `references/read-back.md` (all four outcome labels, the four
readiness checks, the Pro-sandbox process-pane guidance, and the fallback
bundle provenance header). The gptpro facades' browser/setup protocol content
is likewise reconciled into `references/consult.md` and `references/setup.md`,
and the checked-in `repo-harness-chatgpt-browser` Skill's session/continuation
rules into `references/continue.md`. `chatgptGuideMarkdown()` itself was
deliberately left unmodified in `setup.ts` (see Deviations below) — it is
parameterized (runtime `endpoint` substitution), used at three call sites
with different behavior, and is operational HOWTO documentation
(`docs/repo-harness-chatgpt-mcp-setup.md`), not Skill-prose in the sense the
plan's "no inline Skill prose" targets (the plan names `setup.ts#SKILL_MD`
specifically as the current owner to remove).

### Projection-source resolution mechanics

Followed the existing repo convention rather than inventing a new one:
`src/cli/commands/docs.ts` and `src/cli/runtime/helper-runner.ts` both
resolve `PACKAGE_ROOT`/`SOURCE_ROOT` as
`resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')`
(`src/cli/mcp/setup.ts` sits at the same depth, so the same relative walk
lands on the repo root). `chatgptCanonicalSkillRoot()` reuses that pattern
and additionally honors `REPO_HARNESS_SOURCE_ROOT` (the same override
`helper-runner.ts#resolveHelperRuntime` already supports for pointing at a
dev source checkout), rejecting a non-absolute value. This gave a real,
precedented test-injection point for the fail-closed tests (point
`REPO_HARNESS_SOURCE_ROOT` at a temp directory that omits or malforms
`assets/skills/repo-harness-chatgpt/references/bridge.md`) without ever
touching the real canonical file on disk. `readCanonicalChatgptBridgeSkill()`
fails closed on: missing file (`existsSync` check with a named remediation
path in the error), unreadable file (try/catch around `readFileSync`), and
malformed frontmatter (regex-extracted frontmatter block must contain an
exact `name: repo-harness-chatgpt-bridge` line and a non-empty
`description:` line). All three failure modes are checked *before* the
dry-run branch too, so a broken canonical source never reports a false
"would install" — this was a deliberate, in-scope strengthening (impossible
to observe before this slice, since the old `SKILL_MD` constant could never
be "missing"), not a change to any previously-reachable behavior.

### Every existing-test assertion changed, with justification

- `tests/cli/mcp-setup.test.ts`: **zero existing assertions changed.** The
  pre-existing "installs bridge skill template with overwrite protection"
  test passes unmodified against the new canonical-read implementation
  (verified: `bun test tests/cli/mcp-setup.test.ts` — 30 pass including the
  4 new tests added, 0 fail). Four new tests were *added*, not adjusted:
  byte-parity between the installed `SKILL.md`/`references/workflow.md` and
  the real canonical `bridge.md`; missing-canonical fails closed (install and
  dry-run) with nothing written; malformed-canonical fails closed with
  nothing written; non-absolute `REPO_HARNESS_SOURCE_ROOT` is rejected.
- `tests/cli/chatgpt-browser.test.ts`: **zero changes, in code or
  assertions.** This file only reads the checked-in
  `.agents/skills/repo-harness-chatgpt-browser/SKILL.md` and the untouched
  `assets/skill-commands/repo-harness-gptpro/SKILL.md` directly off disk;
  neither file was touched by this slice, and neither is produced by any
  function in `setup.ts`. Confirmed by running the file unmodified against
  the refactor before writing any new tests (49 pass, 0 fail) and again after
  (still 49 pass, 0 fail, unchanged file).

### Deviations from this brief

None against the deliverables or acceptance criteria. One scope clarification
worth recording explicitly: `chatgptGuideMarkdown()` in `setup.ts` (the
`docs/repo-harness-chatgpt-mcp-setup.md` / `references/chatgpt-connector-manual.md`
generator) was intentionally left in place and still called by
`runMcpInstallSkill` for the third projected file. D2 names the inline
`SKILL_MD` prose owner specifically for removal; `chatgptGuideMarkdown()` is a
different, already-parameterized, already-tested function that also serves
two non-Skill call sites (`runMcpSetupChatgpt`'s repo-scope guide doc and
`runMcpPrintGuide`), and folding its runtime `endpoint` substitution into a
static canonical byte file was not asked for and would have risked the
heavily-asserted dynamic-endpoint behavior in `chatgptGuideMarkdown()`'s own
existing test. Its "Connector Invocation Evidence" content was still
reconciled *into* `references/read-back.md` at the content level (per the
task's instruction to reconcile gptpro's overlapping prose into the canonical
package even though gptpro's own files stay untouched); only the runtime call
site in `setup.ts` was left pointed at the existing function.

### Verification (tails)

```text
bun test tests/cli/mcp-setup.test.ts tests/cli/chatgpt-browser.test.ts
  -> 62 pass, 0 fail, 563 expect() calls (21.46s)

bun test tests/skill-surface/
  -> 63 pass, 0 fail, 181 expect() calls (108ms)
  (includes SSD-04's tests/skill-surface/cross-review-inertness.test.ts,
  untouched, concurrently added by the other worker in this worktree)

bun run check:type
  -> clean, no errors

git status --short --branch -uall
  -> mine: M src/cli/mcp/setup.ts; M tests/cli/mcp-setup.test.ts;
     ?? assets/skills/repo-harness-chatgpt/** (6 files);
     ?? tests/skill-surface/chatgpt-package.test.ts
  -> SSD-04's (untouched by this slice): ?? assets/skills/repo-harness-cross-review/**;
     ?? src/cli/commands/cross-review.ts; ?? src/core/review/cross-review.ts;
     ?? src/effects/review/cross-review-runner.ts; ?? tests/cli/cross-review.test.ts;
     ?? tests/skill-surface/cross-review-inertness.test.ts
```

## SSD-04 -- Extract deterministic cross-review and preserve merge-gate isolation

### Scope delivered

- `src/core/review/cross-review.ts` (D1, pure): provider-mode/error-code
  vocabularies, scope/result/finding types, `classifyCrossReviewOutcome`
  (the single decision table for all six error codes + success), finding
  parsing, recommendation building, auth-signal detection, and the pure
  JSONL-assistant-line parser + transcript-candidate selector used by claude
  mode's recovery path. No fs, no process execution, no throw-on-data-problem
  -- matches `src/core/capabilities/registry.ts`'s house style.
- `src/effects/review/cross-review-runner.ts` (D2): scope capture
  (`captureCrossReviewScope`), default-base resolution, diff-text fetch for
  the claude-mode prompt, jsonl transcript recovery (fs reads), and
  `runCrossReview` -- the full orchestration entry point.
- `src/cli/commands/cross-review.ts` (D3): `runCrossReviewCommand` +
  `formatCrossReviewResult`, unregistered (see below).
- `assets/skills/repo-harness-cross-review/` (D4): router `SKILL.md` (1955
  bytes) + `references/claude-mode.md` + `references/codex-mode.md`.
- `tests/cli/cross-review.test.ts` (D5): 30 tests -- scope capture (clean,
  staged, unstaged, untracked, degraded, exact-base-binding), full-runner
  outcomes via a fixture provider script (empty_output, timeout, auth_failure,
  provider_nonzero, success, success-p1 with CLI exit code, json output),
  claude-mode transcript recovery (malformed_transcript, empty_output with no
  session file, a populated-scope success smoke), pure classification-table
  unit tests for all six codes plus success, and the no-merge-gate
  reachability static-import-scan assertion.
- `tests/skill-surface/cross-review-inertness.test.ts`: sibling to
  `canonical-packages.test.ts` (out of this slice's scope, so a dedicated
  file instead of an edit there), scoped to just this one package --
  frontmatter/router-size, reference reachability, no-undeclared-reference,
  no-stale-pattern, shell-block-line-limit, and manifest/selector inertness.

### Reuse vs. new (the plan's core requirement)

- **Scope capture: reused, not re-derived.** `captureCrossReviewScope` calls
  `buildReviewSubject` from `diff-fingerprint.ts` directly (zero edits to that
  file) for the branch+staged+unstaged+untracked path union and the
  base/head SHA resolution. This is the plan's explicit requirement ("Reuse/
  extract normalized review-subject and diff-fingerprint logic instead of
  adding a third Git scope parser") and is why "exact-base binding" holds for
  free: `buildReviewSubject` already resolves `targetRef` to a concrete SHA
  once per call.
- **Provider process invocation: reused, not a fourth wrapper.** Both claude
  and codex modes go through `runProcess` from `src/effects/process-runner.ts`
  unmodified -- same bounded timeout, output capping, and redaction any other
  effect gets. `runProcess` has no stdin-content parameter, so both providers'
  prompts are delivered via argv rather than claude-review's original
  stdin-pipe convention (see Deviations).
- **Diff-text fetch and jsonl recovery: new, but not scope re-derivation.**
  `fetchScopeDiffText` and `recoverClaudeTranscript` do their own small git/fs
  calls (git diff text for prompt embedding; jsonl session-file reads), but
  always operate on the path list `buildReviewSubject` already produced --
  they format/recover text for an already-determined scope, they never decide
  which paths are in scope.

### Error-code vocabulary (closed union, six codes)

`timeout | empty_output | malformed_transcript | auth_failure |
provider_nonzero | degraded_scope` -- exhaustively defined in
`classifyCrossReviewOutcome` (src/core/review/cross-review.ts):

1. `degraded_scope` -- checked before any provider is spawned; fires when
   `buildReviewSubject` returns `status: 'unknown'` (unresolvable base/HEAD,
   or any git observation failure). Proven in tests by pointing
   `providerCommand` at a nonexistent path alongside a bad base revision --
   if the runner ever tried to invoke the provider, that would surface as a
   different code, so `degraded_scope` also proves the short-circuit.
2. `timeout` -- `runProcess`'s own `timedOut` flag. Always wins over any
   recovered transcript (see Deviations: this is deliberately stricter than
   the source shell).
3. `auth_failure` vs. `provider_nonzero` -- both are a nonzero, non-timeout
   exit; the split is a documented, mechanical substring match
   (`matchesAuthFailureSignal`) against combined stdout+stderr+error text
   (patterns: not authenticated, unauthorized, 401, please log/sign in, run
   claude/codex login, invalid api key, authentication failed, no
   credentials found). A CLI-binary-not-found spawn error (ENOENT) also
   lands in `provider_nonzero` by this same path -- the closed union has no
   seventh "not installed" code, and this is a deliberate, documented fold.
4. `empty_output` -- clean exit (`ok: true`), empty stdout, and either no
   recovery was attempted (codex mode, always) or recovery was attempted
   (claude mode) and found nothing at all.
5. `malformed_transcript` -- claude-mode-only: clean exit, empty stdout,
   recovery attempted, found candidate `.jsonl` file(s), but extracted no
   usable assistant text from any of them (JSON parse failure or no
   `type: "assistant"` entries). Distinct from `empty_output`'s "found
   nothing" case by construction in `selectRecoveredTranscript`.

### Deliberate deviations from the two source shell skills

- **Prompt delivery: argv, not stdin.** claude-review's original shell piped
  the prompt via stdin; `runProcess` has no stdin-content option and adding
  one would mean editing `src/effects/process-runner.ts`, which is outside
  this slice's declared write scope. Both provider modes now pass the prompt
  as a positional argv element instead (codex already worked this way).
  Known limitation, not covered by the required test matrix: a very large
  diff could theoretically hit an OS argv-length limit; that surfaces as an
  explicit spawn failure (`provider_nonzero`), not a silent truncation or a
  hang.
- **Codex-mode prompt pins the resolved SHA, not a floating ref name.** The
  original codex-review skill told Codex to `git diff $BASE...HEAD` where
  `$BASE` was a branch/remote-tracking name that could move between prompt
  construction and Codex's own (later) `git diff` invocation. The new prompt
  substitutes `scope.baseRev` (the concrete SHA `buildReviewSubject` already
  resolved), which strengthens "exact-base binding" for codex mode instead of
  just preserving it.
- **A recovered transcript never promotes a failed run to a pass.** The
  original claude-review shell would `cat` a recovered transcript and
  annotate it with a caveat regardless of whether the run had timed out or
  exited nonzero -- reasonable for an interactive, human-facing shell
  script. The new deterministic layer is stricter: `timeout` and
  nonzero-exit failures stay failures (`status: 'failed'`) even when
  `recoveredTranscript` is populated for human inspection; recovery can only
  turn a *clean exit with empty stdout* into a success. This directly serves
  the acceptance criterion "provider failure is explicit and never falls
  back semantically" and is covered by a dedicated unit test
  (`classifyCrossReviewOutcome: timeout wins even if a transcript was
  recoverable`).
- **SKILL.md description is one line, not the two old skills' YAML `>-`
  folded block.** Matches the SSD-03 canonical packages' established
  convention (`repo-harness-setup/SKILL.md` etc.) rather than literally
  copying claude-review/codex-review's frontmatter shape; also what
  `canonical-packages.test.ts`'s regex-based description-length check
  assumes, which this slice's own sibling test mirrors.

### Staging rationale (D4)

`assets/skills/repo-harness-cross-review/` is staged directly under that
final name (no disambiguating suffix like SSD-03's
`repo-harness-plan-canonical` needed) -- the manifest has no existing
`repo-harness-cross-review` entry to collide with, only a `note` on both
`codex-review` and `claude-review` naming it as a "planned facade, not yet
created in this slice" consolidation target. This slice's own inertness
test asserts that note's `replacement` field stays `null` (i.e. SSD-06, not
this slice, repoints it).

### No-registration decision

`src/cli/commands/cross-review.ts` exports `runCrossReviewCommand` and
`formatCrossReviewResult` following the existing `migrate.ts`/`install.ts`
convention (a pure `run<X>(opts)` over already-resolved options, argv
parsing left to `index.ts`/commander) but is **not** imported by
`src/cli/index.ts`. Per the plan's "File ownership by slice" table, SSD-06
is the sole integration writer that performs the atomic public cutover
registration; this slice proves the command works via direct import in
tests only.

### Acceptance reading recorded per the dispatch

"Provider Skills no longer contain large executable shell workflows" is read,
for this slice, as: the replacement code (D1/D2/D3) and package (D4) exist
and are proven by the test suite above; the two *live* `claude-review`/
`codex-review` skills are confirmed byte-unchanged (`git status --short
assets/skills/claude-review assets/skills/codex-review` -> empty) and their
own shell-embedded mechanics are deleted only at SSD-06, alongside the
manifest repoint and old-source removal. "Cross-review cannot produce or
verify a merge-gate receipt" is proven mechanically: a static scan of all
three new module files' import lines rejects any reference to
`merge-gate`, `acceptance-receipt`, `helper-runner`, or the
`evidence/{verify-producer,checks-materializer,attested-import}` surfaces,
plus a belt-and-suspenders check that none of the three files contain the
literal word "receipt" at all.

### Deviations from the task dispatch itself

None. Hard constraints 1-5 all hold: `diff-fingerprint.ts` has zero edits
(git diff confirms); `cross-review.ts` (D3) is exported but unregistered;
no import of merge-gate/receipt surfaces (test-enforced); the two live
skills are byte-unchanged; the new package is absent from the manifest and
every selector output (test-enforced).

### Verification (tails)

```text
bun test tests/cli/cross-review.test.ts
  -> 30 pass, 0 fail, 69 expect() calls (8.00s)

bun test tests/skill-surface/
  -> 72 pass, 0 fail, 201 expect() calls (112ms)
  (includes this slice's cross-review-inertness.test.ts plus
  canonical-packages.test.ts, catalog.test.ts, mutation-path-coverage.test.ts,
  and the other worker's chatgpt-package.test.ts, all green together)

bun run check:type
  -> clean, exit 0, no errors

git status --short (assets/skills/claude-review assets/skills/codex-review)
  -> empty (byte-unchanged, hard constraint 5 confirmed)

git status --short (full)
  -> mine: ?? assets/skills/repo-harness-cross-review/;
     ?? src/cli/commands/cross-review.ts; ?? src/core/review/ ;
     ?? src/effects/review/cross-review-runner.ts;
     ?? tests/cli/cross-review.test.ts;
     ?? tests/skill-surface/cross-review-inertness.test.ts
  -> SSD-05's (untouched by this slice): M src/cli/mcp/setup.ts;
     M tests/cli/mcp-setup.test.ts; ?? assets/skills/repo-harness-chatgpt/;
     ?? tests/skill-surface/chatgpt-package.test.ts
```

### SSD-04/05 wave acceptance (gatekeeper PASS x2, wave CLEAN, 2026-07-23)

Combined wave review passed both slices; disjoint ownership held exactly;
diff-fingerprint.ts, src/cli/index.ts, manifest, installer files, and all
frozen oracles untouched. Full suite 1973 pass / 1 skip / 0 fail.

SSD-06 intake (carried findings, not fixed in the wave):

- [MEDIUM, safe_auto] `assets/skills/repo-harness-chatgpt/references/read-back.md`
  is the declared single source of the Connector Invocation Evidence
  contract but is not bound to `assertChatGptMcpContract`; add one binding
  assertion (natural home: tests/skill-surface/chatgpt-package.test.ts)
  so the canonical owner cannot silently drift from the code/test
  contract after gptpro retires.
- [MEDIUM, manual] `src/cli/mcp/setup.ts:908` still copies an
  inline-generated `references/chatgpt-connector-manual.md` into the
  installed Skill tree (pre-existing, unlinked from the canonical
  package) — dispose at SSD-06: drop it from install-skill (duplicates
  `docs/repo-harness-chatgpt-mcp-setup.md`, already pointed to by
  canonical bridge.md) or source it canonically with an endpoint
  placeholder. Left as-is it reads as a Trace D violation at the final
  gate.
- [LOW, post-package] claude-mode argv prompt delivery can hit OS argv
  limits on very large diffs (fails explicit `provider_nonzero`);
  consider stdin support in process-runner only if observed in practice.
- Gatekeeper ruling of record (wave review, adjudication f): the
  parameterized `chatgptGuideMarkdown()` is operator setup documentation,
  not Skill prose under Trace D; its two non-Skill call sites stay.

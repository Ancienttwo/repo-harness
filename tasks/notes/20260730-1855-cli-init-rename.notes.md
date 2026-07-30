# Implementation Notes: cli-init-rename

> **Status**: Active
> **Plan**: plans/plan-20260730-1855-cli-init-rename.md
> **Contract**: tasks/contracts/20260730-1855-cli-init-rename.contract.md
> **Review**: tasks/reviews/20260730-1855-cli-init-rename.review.md
> **Last Updated**: 2026-07-30 18:55
> **Lifecycle**: notes

## Design Decisions

- `fs-transaction.ts` (`:72,467,825`) and `repo-registry.ts` (`:6,88`) keep the
  literal `"adopt"` per the plan's at-rest/legacy-enum freeze.
  `repo-registry.ts`'s legacy-source annotation is an inline trailing comment
  on the same two lines (not new standalone comment lines) so the final
  residual `rg -w adopt` sweep still shows exactly 2 hits there, matching the
  plan's own verification expectation instead of inflating it to 4.
- `scripts/verify-contract.sh`'s new `init` evidence-producer guard reuses the
  `install` check's `--dry-run` exemption shape, per the plan's explicit
  "並沿用 `--dry-run` 豁免" instruction (the old bare-word `adopt` check had no
  such exemption).
- Generic-English "adopt" (README.md:14,239; docs/spec.md:96;
  tests/run-bdd2-evals.test.ts:230; prd.md's "adopt/port/wrap-vs-build") is not
  the CLI verb and was left alone. `docs/spec.md:98`'s "downstream adopt or
  migration" *is* the CLI-operation sense (parallels the identical phrase
  fixed in `plan.ts`'s self-host warning) and was changed to "downstream
  init".
- `assets/skill-version.json`'s two historical release descriptions
  (`:161,181`) are frozen release history, same category as
  `docs/CHANGELOG.md`'s released sections — not touched.
- `evals/evals.json`'s `repo-harness adopt.*--apply` anti-grader pattern
  (`:699,740`, pitfall #8) was mechanically renamed to `init.*--apply` per the
  brief's explicit one-shot exception. `--apply` was never a real CLI flag on
  either verb; left the pattern's shape alone rather than redesigning it,
  since the brief authorized only the verb fix.
- `tests/cli/mcp-tools.test.ts`'s `registerRepoHarnessRepo(repoRoot, 'adopt')`
  fixture call was changed to `'init'` (the new live write value) rather than
  left as a legacy-read exercise, since a dedicated legacy-read test already
  exists (`tests/cli/registry.test.ts`, new).

## Deviations From Plan Or Spec

- **`tasks/archive/notes/` does not exist as a subdirectory.** The plan and
  the contract's `allowed_paths` both say `tasks/archive/notes/`, but the
  repo's real archive convention is flat:
  `tasks/archive/notes-<timestamp>-<slug>.md` (verified against 50+ existing
  archived notes files and precedent contract
  `tasks/archive/contract-20260712-0546-adoption-apply-cutover-v1.md`, which
  grants bare `tasks/archive/`). Archived the stale file as
  `tasks/archive/notes-20260602-0421-init-update-cli-semantics.md`, using the
  file's earliest git commit as the timestamp (the source file had none in
  its name), and corrected the contract's `allowed_paths` entry from
  `tasks/archive/notes/` to `tasks/archive/` to match.
- **`scripts/verify-contract.sh`'s suggested anchor regex doesn't match this
  repo's own invocation form.** The plan's example pattern
  `(^|[[:space:]])(repo-harness|index\.ts)[[:space:]]+init(...)` requires
  whitespace immediately before `index.ts`, but every real invocation in this
  repo is `bun src/cli/index.ts init ...` — `index.ts` is preceded by `/`, not
  whitespace, so the suggested pattern would never fire on our own dev-mode
  command. Used
  `(^|[[:space:]])(repo-harness|([^[:space:]]*/)?index\.ts)[[:space:]]+init([[:space:]]|$)`
  instead (optional path-prefix-then-slash before `index.ts`) and verified it
  against `bun src/cli/index.ts init`, `repo-harness init`, `git init`, `npm
  init`, `codegraph init -i .`, and `repo-harness init-hook` before
  committing.
- **Unplanned but necessary: `scripts/setup-plugins.sh` was silently broken
  by the Phase 1 rewiring.** It execs `repo-harness init "$@"` / `bun
  .../index.ts init "$@"` to delegate its translated flags (e.g. `--hooks
  none` -> `--no-hooks`). Pre-rename that meant the *global* `init` (an alias
  of today's `install`); post-rename `init` is repo-local adoption with a
  completely different flag surface (no `--no-hooks` at all), so the old shim
  would now hand `--no-hooks` to a command that rejects it as unknown. Not in
  the plan's file list — found via full-file reads while fixing
  `references/plugins-core.md` (next item). Repointed both exec branches to
  `install`; updated the two tests that assert this delegation target
  (`tests/setup-plugins-structure.test.ts`, `tests/bootstrap-files.test.ts`).
- **`references/plugins-core.md` needed a double-swap, not a single word
  substitution.** It already used `repo-harness init` to mean the pre-rename
  *global* bootstrap (`npx -y repo-harness init` / "delegates to
  `repo-harness init`") and `repo-harness adopt` to mean repo-local. A naive
  `adopt`->`init` sweep would have left both example commands saying `init`,
  one now wrong. Swapped independently: the global-bootstrap examples now say
  `install`; the existing-repo example now says `init`.
- **`README.zh-CN.md` carried one sentence with no English or other-locale
  equivalent**: "`repo-harness init` 保留为兼容 alias,给已有脚本用。" (a claim
  that the old global `init` stays as a compat alias). That claim is now
  false — the old global `init` block is deleted with no alias — so the
  sentence was removed rather than translated.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `tests/readme-dx.test.ts:74`'s flipped assertion vs. merging it into the mechanically-renamed line 65 (both become `toContain("repo-harness init --dry-run")`) | Kept both, did not merge | The plan explicitly named line 74's flip as a required, separate edit and only grouped lines 68/70/72 for cross-checking (which resolved a real duplicate at 70/72). Line 65+74 duplication looked intentional/accepted by the plan's own scoping, not mine to redesign. |
| `tasks/archive/` contract fix: correct only the one path entry vs. leaving it and hoping `verify-contract.sh`'s prefix match tolerates it | Corrected `tasks/archive/notes/` -> `tasks/archive/` in the contract | `contractAllowsPath()` in `src/cli/hook/mutation-guard.ts` does a literal `string.startsWith()` on trailing-slash patterns; `tasks/archive/notes-...` does not start with `tasks/archive/notes/`, so the archive move would fail a strict allowed_paths check without this fix. |

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

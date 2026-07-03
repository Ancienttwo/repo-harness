# No-Fallback Rule Distribution Hardening

Implemented the plan at `plans/plan-20260703-1405-no-fallback-distribution.md`:
single authoritative "No Compatibility Fallbacks in Product Code" section in
`assets/reference-configs/global-working-rules.md` (mirrored byte-for-byte to
`docs/reference-configs/`), three distribution channels (existing-repo hook
context, new-repo root template heredoc, global managed-block sync), a
hardened managed-block merge with a marker-pairing gate and visible
legacy-skip status, and an advisory `root-agent-context-divergent` drift
signal.

## Non-obvious decisions and deviations

- **Global refresh report-language instruction (deviation from the plan's
  literal "pass the code default" instruction).** The plan told the executor
  to call `writeGlobalContextFiles(..., { reportLanguageInstruction:
  <code default> })` for the Step 4 refresh. Since `mergeManagedBlock` fully
  replaces the managed block on every sync, using the generic code default
  ("Use the user's language for reports; keep technical terms in English.")
  would have silently regressed the already-deployed, user-customized bullet
  ("Use Chinese by default for this user; keep technical terms in English. If
  the user writes in another language, mirror that language.") that was
  present in both `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` before this
  task ran. That line is not part of this task's scope, so the one-off refresh
  script reused the currently-deployed instruction text verbatim instead of
  the generic default, keeping the refresh limited to the No-Fallback section,
  the self-note, and the dedup.
- **`~/.codex/AGENTS.md` already had a hand-written in-block copy.** Readback
  before the refresh showed the user had already hand-pasted the identical
  "No Compatibility Fallbacks" body text inside the managed block (lines
  177-183, `## ` heading) as a stopgap, alongside the original hand-written
  copy outside the block (lines 70-76, bare heading, no `##`) that the plan's
  draft wording was checked against. Both copies are byte-identical in body
  text; only the outside-block copy lacks the `##` markdown prefix, consistent
  with that file's own heading style outside the managed block. The refresh
  replaces the in-block hand-written copy with the templated version (now
  authoritative), leaving the outside-block copy untouched per the hard
  constraint against touching content outside the BEGIN/END markers.
- **`check-task-workflow.sh --strict` gate closed for the captured plan.**
  `scripts/capture-plan.sh --status Approved` (Step 0) leaves `Promotion
  Reason` at the placeholder `(required before projection)` and does not
  create a task contract file. Since the plan is Approved and became the
  active plan, `--strict` requires both. Filled `Promotion Reason` with a
  concrete work-package justification and created
  `tasks/contracts/20260703-1405-no-fallback-distribution.contract.md`
  (modeled on `tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md`).
  Remaining `--strict` failures (BrainSync drift on 3 unrelated
  `docs/reference-configs/*.md` entries, and `.ai/harness/handoff/resume.md`
  being older than `current.md`/`tasks/current.md`) are pre-existing repo
  staleness confirmed via `git status` (clean, untouched by this task) and
  mtimes predating this session; left unfixed as out of scope.
- **`tests/create-project-dirs.runtime.test.ts` gets one appended assertion,
  not two.** The file has two test blocks that both read the generated
  `AGENTS.md`. The plan's own line anchor (`:80-82`) points at the first
  block's CLAUDE.md/AGENTS.md byte-parity assertion; treated "各追加一条" as
  one assertion per *file*, so only the first block got the new
  `toContain("re-derives an authority's semantics")` line. The second block
  (~line 566) was left untouched.
- **`assets/templates/CLAUDE.md` / `assets/templates/AGENTS.md` removed.**
  Guard grep (`templates/CLAUDE.md|templates/AGENTS.md` across
  scripts/src/tests/assets/docs) returned no hits before deletion, confirming
  no script referenced them; deleted via `git rm` (staged delete only, not
  committed).

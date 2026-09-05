## Quality & Safety

### Verification Gate
- Select verification from the complete diff and risk; do not run the full suite for every small change. Never mark work done without output: state scope, reason, commands/results, and unrun checks; do not repeat a passed suite solely for docs/ledger closeout against unchanged executable source.
- Docs-only or ledger-closeout changes with no executable impact need diff/link/path and affected workflow checks, not full tests or typecheck. Isolated code changes need the regression and affected suites plus relevant type/lint/build checks; generator changes need a generated fixture and mirror checks.
- High-risk, cross-module, shared-contract, hooks/runtime, auth, publication, migration, or release changes need explicit impact assessment; preserve stronger contract and CI requirements.
- Require a full suite only for an explicit acceptance/release requirement or an observed integration risk that focused checks cannot cover; a code/test edit or changed hash alone is insufficient.
- After a full pass, bounded follow-up edits use the recorded baseline plus focused delta checks. The parent revises final criteria when no full-suite trigger remains; never relabel the old full pass as evidence for the new subject.
- Run `repo-harness run check-task-workflow --strict` before claiming the workflow is clean.
- Prepare contract evidence once with `repo-harness run verify-sprint --prepare-acceptance`; declare eligible deterministic criteria in `criterion_reuse` before execution. Consume current subject-bound evidence for review and use `repo-harness run verify-sprint` to finalize; do not independently rerun the contract before each response.
- Require the matching `tasks/reviews/<plan-stem>.review.md` to recommend pass before claiming completion.
- Require the matching `tasks/notes/<plan-stem>.notes.md` to capture material implementation decisions before review.

### Safety Rules
- Do not silently expand scope beyond approved plan.
- If unexpected repo changes appear, stop and ask.
- Prefer modifying existing files over unnecessary file creation.
- Write comments, commit messages, and PR text from the final diff only: comments state only the non-obvious reason at the owning boundary; PR text states final behavior plus only rationale a reviewer cannot recover from the diff; never mention discarded attempts, reverted work, or never-merged states.

### Final Response Contract
1. What changed — list modified files with one-line summary each
2. Verification evidence — paste tool output: test results, build logs, or `git diff --stat`
3. Which workflow artifacts were updated — list `tasks/*.md`, `docs/spec.md`, or `.ai/harness/*` files and what changed in each
4. Known risks/gaps — bullet list with severity tag: `[HIGH]`, `[MEDIUM]`, `[LOW]`
5. Optional next steps — actionable items the next session or user should address

---

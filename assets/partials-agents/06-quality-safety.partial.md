## Quality & Safety

### Verification Gate
- Never mark work done without verification output.
- Run impact-based checks: typecheck, tests, lint/build.
- Run `repo-harness run check-task-workflow --strict` before claiming the workflow is clean.
- Run `repo-harness run verify-contract --contract <active-plan-contract> --strict` before any done/completed response when the active plan has a contract.
- Require the matching `tasks/reviews/<plan-stem>.review.md` to recommend pass before claiming completion.
- Require the matching `tasks/notes/<plan-stem>.notes.md` to capture material implementation decisions before review.

### Safety Rules
- Do not silently expand scope beyond approved plan.
- If unexpected repo changes appear, stop and ask.
- Prefer modifying existing files over unnecessary file creation.

### Final Response Contract
1. What changed — list modified files with one-line summary each
2. Verification evidence — paste tool output: test results, build logs, or `git diff --stat`
3. Which workflow artifacts were updated — list `tasks/*.md`, `docs/spec.md`, or `.ai/harness/*` files and what changed in each
4. Known risks/gaps — bullet list with severity tag: `[HIGH]`, `[MEDIUM]`, `[LOW]`
5. Optional next steps — actionable items the next session or user should address

---

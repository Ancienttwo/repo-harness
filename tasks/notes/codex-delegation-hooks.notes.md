# Codex Delegation Hooks Notes

- `2026-06-19`: Keep `.ai/harness/delegation/` as ignored runtime state without a tracked `.gitkeep`. The hook scripts create the directory when needed, and `tests/workflow-contract.test.ts` enforces that runtime harness artifacts are not tracked deliverables.

> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Codex Delegation Hooks Notes

- `2026-06-19`: Keep `.ai/harness/delegation/` as ignored runtime state without a tracked `.gitkeep`. The hook scripts create the directory when needed, and `tests/workflow-contract.test.ts` enforces that runtime harness artifacts are not tracked deliverables.
- `2026-06-19`: `check-task-workflow.sh` also materializes `.ai/harness/delegation/` before required-directory validation so clean checkouts can pass strict workflow checks without tracking runtime payloads.
- `2026-06-19`: Treat mechanism/design questions that merely mention `spawn subagent(s)` as discussion, not explicit delegation authorization. The broad `spawn/use/run subagent(s)` trigger still works for imperative delegation prompts, but question/mechanism wording should not create `.ai/harness/delegation/latest.json` or trip the Stop fallback.
- `2026-06-19`: Host-scope the three Codex delegation routes so Codex installs 11 managed routes while Claude installs only the 8 shared/core routes. Claude keeps `PreToolUse.subagent` for native Task/Agent/SendUserMessage return-channel protection; Codex-only `UserPromptSubmit.delegation`, `SubagentStart.context`, and `SubagentStop.quality` no longer enter Claude adapters.
- `2026-06-19`: Preserve imperative delegation when the investigation target contains `why` or `how`: `Use/Run/Spawn subagents to ...` is explicit authorization, while `Should we use subagents?` and mechanism/design questions remain discussion.
- `2026-06-19`: Scope `SubagentStop.quality` retry state by session/run identity plus subagent identity plus message hash. The same subagent may retry the same thin report once; another subagent or session returning the same short text still gets its own first quality block.

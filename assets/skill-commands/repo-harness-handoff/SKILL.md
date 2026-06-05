---
name: repo-harness-handoff
description: Prepares or resumes Codex handoff packets for long-task rollover without running the full workflow check surface.
when_to_use: "repo-harness-handoff, prepare handoff, resume handoff, Codex rollover, context rollover, current.md, resume.md"
---

# repo-harness-handoff

Use this command when the user wants to save, refresh, or resume the repo-local
handoff surface without running a full check or repair pass.

## Protocol

1. Confirm the target repo path and handoff reason.
2. To prepare a rollover packet, run:
   - `bash scripts/prepare-codex-handoff.sh --reason <reason>`
3. Use `--print-prompt` when the user needs the exact fresh-session prompt.
4. To resume from an existing packet, run:
   - `bash scripts/codex-handoff-resume.sh --cwd <repo> --reason <reason> --print-prompt`
5. Verify the handoff files exist and are current:
   - `.ai/harness/handoff/current.md`
   - `.ai/harness/handoff/resume.md`
6. Report the exact next step from the handoff packet.

## Failure Modes

- If there is no active plan, the resume packet must report `(none)` for plan, contract, and notes.
- If `resume.md` is older than `current.md`, regenerate with `prepare-codex-handoff.sh`.
- If the user asks for readiness, route to `repo-harness-check` instead of expanding this command.

## Boundaries

- Does not run `/check`.
- Does not run `bash scripts/check-task-workflow.sh --strict` unless the user asks for readiness verification.
- Does not mutate plans, tasks, source code, or architecture docs except the handoff packet files.
- Does not replace task sync, review, or release-readiness checks.

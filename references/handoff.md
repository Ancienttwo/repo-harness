# Root Reference: Handoff

Source facade: `assets/skill-commands/repo-harness-handoff`.

Use when the user wants to save, refresh, or resume the repo-local handoff
surface without running a full check or repair pass.

## Protocol

1. Confirm the target repo path and handoff reason.
2. To prepare a rollover packet, run `repo-harness run prepare-codex-handoff --reason <reason>`.
3. Use `--print-prompt` when the user needs the exact fresh-session prompt.
4. To resume from an existing packet, run `repo-harness run codex-handoff-resume --cwd <repo> --reason <reason> --print-prompt`.
5. Verify the handoff files exist and are current: `.ai/harness/handoff/current.md` and `.ai/harness/handoff/resume.md`.
6. Report the exact next step from the handoff packet.

## Failure Modes

- If there is no active plan, the resume packet must report `(none)` for plan, contract, and notes.
- If `resume.md` is older than `current.md`, regenerate with `repo-harness run prepare-codex-handoff`.
- If the user asks for readiness, route to the check workflow instead of expanding this reference.

## Boundaries

- Does not run `/check`.
- Does not run `repo-harness run check-task-workflow --strict` unless the user asks for readiness verification.
- Does not mutate plans, tasks, source code, or architecture docs except the handoff packet files.
- Does not replace task sync, review, or release-readiness checks.

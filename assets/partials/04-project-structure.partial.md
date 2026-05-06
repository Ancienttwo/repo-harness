## Project Structure

```
{{PROJECT_STRUCTURE}}
```

### Tech Stack

| Layer | Technology |
|-------|------------|
{{TECH_STACK_TABLE}}

---

## Workflow Rules

- Prefer modifying existing files over adding new files.
- {{RUNTIME_MODE}} by default for file mutations.
- Primary worktree warns by default; enforce via `.claude/.require-worktree`.
- Commit explicitly after green checks; no automatic checkpoint hook in the shared preset.
- Keep stable product truth in `docs/spec.md`.
- Keep sprint done definitions in `tasks/contracts/` and `tasks/reviews/`.
- Keep resumable state in `.ai/harness/handoff/current.md`.
- Route complex planning/review/QA/release/browser-first work to `gstack`, short implementation/debug/read-write checks to `Waza`, and knowledge sync/handoff retrieval to `gbrain`.
- Treat Waza as Codex-first: `~/.codex/skills` is the Codex runtime source; `~/.agents/skills` is skills CLI staging/cache only.
- Use `docs/reference-configs/external-tooling.md` and `bash scripts/check-agent-tooling.sh --host both --check-updates` for advisory environment checks.

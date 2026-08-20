> **Archived**: 2026-08-20 16:21
> **Related Plan**: plans/archive/plan-20260730-2148-agent-fleet-deep-worker-respec.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1621

# agent-fleet-deep-worker-respec — slice notes

## Decisions

- Codex projection respec: opus family default moves `gpt-5.6-sol` -> `gpt-5.6-terra` (sol remains only for fable). Effort still carries through unchanged at the family level.
- The only effort remaps are two explicit per-agent target overrides in `AGENT_TARGET_OVERRIDES`: `fast-worker` -> `gpt-5.6-luna`/`max`, `deep-worker` -> `gpt-5.6-terra`/`xhigh`. Anything unmapped stays a hard error (fail-closed validation unchanged).
- New managed agent `deep-worker` (Claude `opus`/`high`, writable sandbox) joins the roster between `fast-worker` and `gatekeeper`; `fast-worker` moves from `sonnet`/`max` to `opus`/`medium`.
- Docs must not pin Claude model versions ("Opus 4.8", "Sonnet 5"); aliases only so the runtime picks latest.

## Deviations

- At dispatch the working tree already carried a superseded parallel-session draft of the same rework (deep-worker at `opus`/`medium`, ad-hoc tuple mutation). It was absorbed and corrected to the final spec instead of reverted; `MANAGED_AGENTS`/`WRITABLE_AGENTS`/`.ai/harness/policy.json` roster edits from that draft were verified and kept.
- Live HOME alignment (outside this repo) deliberately preserved receipted hand-managed files: `~/.claude+~/.codex` `deep-reasoner`/`gatekeeper` (hand-pinned `gpt-5.5`) and `~/.codex/agents/explorer.toml` (hand-moved to terra/high vs luna family default). Receipt re-accepted with exactly those 5 files; all other 9 targets are byte-exact fleet projections.

## Open questions

- Pending architecture request `docs/architecture/requests/workflow-engine-contract-assets.md` (policy.json roster touch) awaits its module doc update.

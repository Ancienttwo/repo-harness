# Main P1 Review Fixes

## Context

GPT PR15 review flagged three main-line blockers before PR #15 can be trusted:

- A tracked sprint filename contained `:`, which breaks Windows checkout.
- MCP reader `--allow-root` could point directly at sensitive directories and bypass deny globs at `.`.
- `prompt-guard.sh` treated same-prefix sibling paths as current-repo paths.

## Decisions

- Renamed the historical Harness Engineering Optimization sprint to an ASCII, Windows-safe path and updated task, plan, and research references.
- Added shared MCP sensitive-root detection for `.git`, `.ssh`, `secrets`, `credentials`, and terminal `private` roots. Setup rejects these roots before writing config; server startup rejects hand-written unsafe config; `WorkspaceManager` keeps them unreadable and refuses `open_workspace`.
- Replaced prompt-guard raw prefix matching with a path-boundary helper in both `assets/hooks/` and self-host `.ai/hooks/`.
- Follow-up GPT review found two remaining rebasing/canonicalization gaps. Prompt-guard now resolves every absolute candidate through the nearest existing path, physical path, and Git top-level before comparing against the current repo. MCP allowed-root denial now derives from directory-prefix deny globs, covering `.git`, `.ssh`, `secrets`, `credentials`, `private`, `.cache`, `node_modules`, `dist`, `build`, and `coverage` roots and descendants.
- Second follow-up review found that file symlinks were still lowered to their lexical parent before repo isolation. Prompt-guard now resolves the nearest existing node through symlink target chains before deciding whether to take the node itself or its parent as the Git probe directory, with a bounded hop limit that fails closed on symlink loops. The fix is mirrored in `assets/hooks/` and self-host `.ai/hooks/`.
- Repo-isolation regressions now use a plain `$think` marker instead of a developer-machine absolute skill path, so CI evaluates the intended plan-start path rather than host-local tooling paths.

## Verification

- `bun test`
- `bun run check:type`
- Targeted MCP and hook tests for sensitive roots and same-prefix sibling repos
- Targeted follow-up tests for prompt `..`, symlink/junction-style paths, missing foreign tails, and deny-glob root rebasing
- Targeted file-symlink regression for Draft plan auto-start and embedded approved-plan capture, including missing foreign targets and symlink loops, plus full `tests/hook-runtime.test.ts`
- `rg --files | rg ':'` returned no tracked path with a colon

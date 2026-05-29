# Implementation Notes: hook-entry-enfile

> **Status**: Complete
> **Plan**: ad-hoc bug hunt
> **Contract**: global hook runtime
> **Review**: runtime test coverage
> **Last Updated**: 2026-05-29
> **Lifecycle**: bug-fix notes

## Root Cause

Global host adapters called `repo-harness hook ...` for every hook event. On this machine that command resolved through Bun to `src/cli/index.ts`, whose static CLI imports loaded non-hook modules such as `src/cli/commands/status.ts` on the hot `PostToolUse:Bash` path. Under high-frequency hook execution, that unnecessary source loading amplified file-descriptor pressure and surfaced as Bun `ENFILE reading .../hook.ts` or `.../status.ts`.

## Decision

- Add `repo-harness-hook` as a dedicated hook-only bin at `src/cli/hook-entry.ts`.
- Keep the entry free of full CLI imports so host hooks do not cold-load Commander, status, doctor, tools, or other non-hook command modules.
- Put the shared hook runtime in `src/cli/hook/runtime.ts`; both `src/cli/commands/hook.ts` and `src/cli/hook-entry.ts` delegate there.
- Keep `repo-harness hook ...` as a fallback in generated adapter commands for older installs.
- Keep `src/cli/hook/route-registry.ts` as the single public route table. The hook-only entry only parses CLI args and passes control to the runtime.

## Verification

- `bun test tests/cli/hook.test.ts tests/cli/install.test.ts tests/bootstrap-files.test.ts`
- `bun test tests/hook-runtime.test.ts tests/cli/status.test.ts`
- `bun test`
- `repo-harness install --target both --location global`
- `repo-harness-hook PostToolUse --route bash`
- `repo-harness status --json`

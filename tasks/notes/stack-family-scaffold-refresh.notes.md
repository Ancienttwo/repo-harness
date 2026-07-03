# Stack-family Scaffold Refresh

Updated the repo-harness scaffold guidance from product/domain plan labels to
stack-family routing. The durable public codes remain A-K, but they now select
frontend shell, backend/runtime boundary, deployment target, data authority, and
sidecar family.

Key decisions:

- Keep `repo-harness` canonical and `repo-harness-skill` as the compatibility
  trigger/runtime fallback.
- Treat `project-initializer` as a retired migration input only, not an active
  skill root or public alias.
- Expose scaffold as `repo-harness-scaffold` for new project/module creation;
  existing repo adoption stays on init/migrate/upgrade/repair.
- Prefer Astro SSR/content shells, Vite 8 rich client surfaces, shared
  Bun/Hono monorepos, Cloudflare web/edge delivery, and VPS-hosted agent
  runtimes when Node APIs, local tools, long-lived processes, or heavier
  sidecars are required.
- Keep D1 opt-in. Prefer Postgres/Supabase for durable authority and
  SQLite/Turso/libSQL, including Turso Sync for new local-first sync work, for
  lightweight or local-first cases.

## Root Agent Context Follow-up (2026-06-25)

- Updated the generated root `CLAUDE.md` / `AGENTS.md` seed in
  `scripts/lib/project-init-lib.sh` so new init/adopt scaffolds carry the
  `$think`-style decision protocol without copying the full skill body.
- Followed the `agentsmd-scaffold` rule of choosing the smallest instruction
  stack that changes agent behavior: root context now names evidence-backed
  discovery, scanner-as-lead-not-authority, preservation of high-context files,
  scoped context only when local rules differ, concrete alternatives for
  prohibitions, P1/P2/P3, approval boundary, bug-trace, request-bundle
  classification, and verification gates.
- Kept physical-layout inference rejected. `apps/*`, `packages/*`, and
  `services/*` still do not create nested `CLAUDE.md` / `AGENTS.md` files unless
  selected by the capability/context registry.
- Added runtime and scaffold parity assertions so downstream init keeps the new
  root router while preserving `CLAUDE.md` / `AGENTS.md` byte equality.

## Full Test Timeout Follow-up (2026-06-25)

- Full `bun test` exposed four timeout failures in shell/browser integration
  tests while the same cases passed individually and at file scope.
- Kept the production CLI/browser paths unchanged. The smallest coherent repair
  is explicit Bun test timeouts on the two integration test files that spawn
  many subprocesses under full-suite load.
- `tests/helper-scripts.test.ts` now uses a 30s timeout for shell-heavy workflow
  fixtures; `tests/cli/chatgpt-browser.test.ts` uses a 180s timeout because its
  tests launch nested `bun src/cli/index.ts chatgpt ...` processes and previously
  observed >120s wall time under full-suite contention.

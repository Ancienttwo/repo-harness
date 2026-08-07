/**
 * Fail-closed user-home isolation for the whole test suite.
 *
 * Three groups of code write under `~/.repo-harness`, and only the first reads
 * the `REPO_HARNESS_HOME` lever this file sets:
 *
 *   - REPO_HARNESS_HOME, so covered here — `src/effects/repo-registry.ts:61`
 *     (`registered-repos.json`), `src/cli/mcp/coding-workspaces.ts:104`,
 *     `src/cli/mcp/auth.ts:56` (the `mcp.*` files):
 *       resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? homedir(), ".repo-harness"))
 *   - HOME only, NOT covered here — `src/cli/commands/brain-root.ts:24-35`
 *     (`config.json`), `src/cli/commands/global-runtime.ts:259-261,387`
 *     (`packages/`): `env?.HOME ?? process.env.HOME ?? homedir()`.
 *   - No env lever at all, NOT covered here — `scripts/acceptance-receipt.ts:753`
 *     (`opts.authorityHome ?? userInfo().homedir`) and `scripts/merge-gate.ts:180`
 *     (`osAccountHome()` via `/usr/bin/id` + `dscl`). These read the OS account
 *     record on purpose; isolating them means injecting `opts.authorityHome`.
 *
 * When a test spawns the CLI without threading an isolated home through, group
 * one lands on the operator's real `~/.repo-harness` and mutates it for real:
 * temp-path entries pile up in `registered-repos.json`, an `mcp-setup` test
 * overwrites the operator's `chatgpt.serverName`. Per-spawn-site discipline
 * ("remember to pass REPO_HARNESS_HOME to the child") has failed repeatedly, so
 * the default itself has to be safe.
 *
 * This preload runs before any test module loads and mutates `process.env` of
 * the test process.
 *
 * Coverage boundary — measured in the real bun test runtime (Bun 1.3.14), not
 * assumed. Bun snapshots the environment handed to a child at process start, so
 * a runtime mutation of `process.env` does NOT reach a child spawned without an
 * explicit `env`, despite Node's documented `env` default:
 *
 *   (a) COVERED  in-process code reading `process.env` (this is the bulk of the
 *                registry and mcp home resolution).
 *   (b) COVERED  spawn sites passing `env: { ...process.env, ... }` — the spread
 *                copies the mutated value.
 *   (c) EXPOSED  bare `spawnSync(cmd, args)`, `execSync(cmd)`, `Bun.spawnSync([...])`
 *                with no `env` option. Verified: the child sees the variable unset.
 *                Most spawn sites under tests/ are in this shape.
 *
 * So this preload is a large default-safety improvement, not a total guarantee.
 * Closing (c) needs a separate guard (a lint/grep rule requiring an explicit
 * `env` on spawns in tests/), which is deliberately not part of this file.
 *
 * Precedence, highest first:
 *   1. `REPO_HARNESS_HOME` already set in the environment (an explicit
 *      `REPO_HARNESS_HOME=... bun test`, or a test fixture that sets its own
 *      home before spawning) — always wins, untouched.
 *   2. Otherwise: a fresh per-run temp directory created here.
 *
 * Within the covered surface — (a)+(b) above, group one of the three writer
 * groups — the real `~/.repo-harness` is no longer the effective default under
 * `bun test`. A test that "needs" the real user home is a leak bug, not an
 * exception.
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

if (!process.env.REPO_HARNESS_HOME) {
  process.env.REPO_HARNESS_HOME = mkdtempSync(join(tmpdir(), "repo-harness-test-home-"));
}

# Implementation Notes: mcp-scope-retirement

> **Status**: Active
> **Plan**: plans/plan-20260807-1606-mcp-scope-retirement.md
> **Contract**: tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md
> **Review**: tasks/reviews/20260807-1606-mcp-scope-retirement.review.md
> **Last Updated**: 2026-08-07 16:50
> **Lifecycle**: notes

## Design Decisions

- **Path helpers lost their `repoRoot` parameter, not just the `scope` one.**
  `mcpStorageDir(repoRoot, scope)` only needed `repoRoot` to build the repo-scope
  branch. With that branch gone, `repoRoot` is unused, so
  `mcpLocalConfigPath()` / `mcpTokenPath()` / `mcpOAuthPath()` /
  `mcpOAuthTokenStorePath()` / `loadMcpLocalConfig()` / `readMcpBearerToken()` /
  `ensureMcpBearerToken()` / `readMcpOAuthPassphrase()` /
  `ensureMcpOAuthPassphrase()` are all zero-arg now. Keeping a vestigial
  `repoRoot` would have been dead signature surface implying a per-repo lookup
  that no longer exists.

- **The `scope` field is gone from `McpLocalConfig`, not just from the type
  union.** Setup no longer writes it, and `parseMcpLocalConfig` no longer
  validates it. Older user configs carrying `"scope": "user"` still parse (an
  unknown key is ignored), so existing user-level installs are untouched, but
  nothing reads the field. `server.ts` dropped its `config.scope !== 'user'`
  precondition for the same reason.

- **Gate placement: five command entrypoints, uniformly.**
  `assertNoLegacyRepoScopeMcpConfig(repoRoot)` runs at `createMcpToolContext`
  (covers `serve` on both transports and `prepare-goal`), `startMcpHttp`,
  `runMcpSetupChatgpt`, `runMcpDoctor`, and `runMcpLiveDoctor`. `doctor` is
  gated too even though a diagnostic that refuses to run is mildly
  user-hostile: the thrown message already names the exact fix command, and one
  uniform rule beats a per-command exemption list. `runMcpPrintGuide` is not
  gated because it reads no MCP config.

- **The gate keys on `<repo>/.repo-harness/mcp.local.json` only.**
  `migrate-scope` cleans up any of the four legacy files, but a stray token file
  without a config does not block commands — there is nothing to read from it,
  and blocking on it would strand users with no config to migrate.

- **`migrate-scope` merge direction: existing user values win, legacy fills
  gaps.** The user config is the surviving authority, so migration must never
  silently overwrite it with a stale repo-scope value. Fields that the user
  config already sets are kept and are not listed in the migrated-fields
  inventory; only the gaps are inherited.

- **Rotation semantics: legacy secrets are always discarded, user secrets are
  never rotated.** `ensureMcpBearerToken()` / `ensureMcpOAuthPassphrase()`
  generate fresh values only when the user-level file is absent. A repo that had
  only repo-scope storage therefore gets genuinely new credentials, while an
  existing user-level install keeps working (contract: "Existing user-scope
  installs untouched"). Either way the legacy bearer/passphrase values are
  deleted, never copied. The inventory line distinguishes `regenerated` from
  `existing user-level token kept; legacy value discarded`.

- **`mcp.oauth-tokens.json`: only the repo-side store is deleted.** That forces
  the one ChatGPT re-authorization the plan calls for. The user-side store is
  left alone; touching it would revoke grants for unrelated repos.

- **`migrate-scope` refuses a legacy config claiming `profile: coding`.**
  Repo-scope coding setup was rejected by the old code, so such a file is
  unreachable through supported paths. Rather than synthesize the coding grant
  and authorization-revision state it would need, the command fails closed and
  points at the real coding setup command.

- **`harness_doctor` derives `mcp.localConfig` from the storage authority, not
  from a path probe** (gatekeeper finding, HIGH). `tools.ts` was still doing
  `existsSync(join(target.repoRoot, '.repo-harness', 'mcp.local.json'))`, which
  after the retirement reports `false` for a correct user-level install and
  `true` for an unmigrated legacy repo. Worse, `target.repoRoot` can be a
  different repo resolved through `repo_path`, which the startup gate never
  inspected. Now `Boolean(loadMcpLocalConfig())`, matching `setup.ts:1050`, so
  both doctor surfaces read the same single authority.

- **`migrate-scope` moves data and rotates credentials; it does not recompute
  derived config.** `capabilities`, `coding`, and `devMode` are carried over
  from the existing user config only. The command's `Next:` line points at
  `repo-harness mcp setup chatgpt --repo <repo>`, which owns that derivation.
  Duplicating setup's capability logic inside the migration would create a
  second authority for the same computation.

## Deviations From Plan Or Spec

- **`mcp setup codex --scope project|user` was left in place.** The plan says
  "`--scope` CLI flags ... deleted", but that flag selects the *Codex* config
  location (`.codex/config.toml` project vs. user), not an `McpConfigScope`. It
  is a different axis from MCP storage and is out of the retirement's blast
  radius. Only `setup chatgpt --scope` was removed.

- **`engine.ts`: removed the dead `.gitignore` read, kept the `ignoreLines`
  array.** The contract names "the `ignoreLines` block", but the array itself is
  live — it feeds the "Recommended .gitignore entries" output. The genuinely
  dead code was the `gitignorePath` binding, the `existsSync` block that read
  `.gitignore` into a `void`-ed `Bun.file` handle, and the `let updated = false`
  flag whose ternary could only ever pick one branch. Those are gone; the
  printed output is byte-identical.

- **`docs/repo-harness-chatgpt-mcp-setup.md` regeneration collapsed
  pre-existing drift.** The tracked doc was already stale against its generator
  at HEAD (HEAD's `chatgptGuideMarkdown()` emitted "General Repo Reader
  Reference" while the tracked file still said "General Repo Reader Contract",
  plus a long superseded reader-contract section). Regenerating with
  `mcp print-chatgpt-guide --repo . --write` produces the deterministic
  projection, so the diff is larger than the scope edits alone (+56/-113). The
  file is generated output; hand-patching only my lines would have left it
  drifted against its own source.

- **Guide section ordering corrected after acceptance review** (gatekeeper
  finding, MEDIUM). The `## Migrate From Retired Repo-Scope Storage` heading was
  first inserted immediately after the coding-profile command block, which
  orphaned the trailing coding prose ("It exposes `open_workspace`...", "Bash
  has local-user authority and is not a filesystem sandbox...", including the
  shell-authority security warning) under the migration heading. The migration
  block now sits after the coding section ends, so the coding prose reads
  contiguously. Regeneration is idempotent (verified byte-identical on a second
  `--write`).

- **Added `withTmpRepoAsync` to `tests/cli/mcp-setup.test.ts`.** The existing
  `withTmpRepo` returns `fn(...)` from a `try/finally`, so an async body would
  have its temp dirs removed and `REPO_HARNESS_HOME` restored before it
  finished. The new `harness_doctor` test awaits `callMcpTool`, so it needs the
  awaiting variant.

- **`tests/capability-config.test.ts` "reuses existing registry entries" got an
  explicit `30_000` timeout — the sixth instance of a known class, not new
  compensating code.** Precedent: `a2381159` ("test(verify): make five
  load-sensitive tests robust under machine load", 0.13.1 changelog), which gave
  subprocess-heavy tests explicit 30s timeouts in place of bun's default 5000ms
  after they died at 5029-5052ms under machine load. This test spawns two cold
  `bun scripts/capability-config.ts` subprocesses and failed at 5008ms/5095ms in
  two consecutive full-suite runs while passing 3/3 in isolation (~2.7s) and
  under 4-way parallel load. It has no MCP references and is untouched by this
  work-package. Shape matches the precedent: positional `}, 30_000);`, which
  keeps hang detection rather than removing the bound.

- **Fixed a test-isolation defect surfaced by the storage change.**
  `tests/cli/mcp-setup.test.ts`'s CLI subprocess case did not pass
  `REPO_HARNESS_HOME` to the spawned child. Harmless while the default scope was
  `repo`; after the change the child wrote to the real operator
  `~/.repo-harness`. Both `spawnSync` calls in that file now pass an explicit
  `env`. See "Incident" below.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Gate `doctor` vs. let it diagnose the legacy state | Gate it | One uniform fail-closed rule; the error already names the fix command |
| Rotate user secrets on every migration vs. only when absent | Only when absent | Contract requires existing user installs stay untouched; legacy values are discarded either way |
| Legacy values win vs. user values win on merge | User values win | The user config is the surviving authority; migration must not regress it |
| Keep `repoRoot` on path helpers vs. drop it | Drop it | Unused parameter would imply a per-repo lookup that no longer exists |
| Hand-patch the tracked guide vs. regenerate it | Regenerate | It is generated output; hand-patching re-drifts it against its generator |
| Delete `setup codex --scope` too vs. keep it | Keep | Different axis (Codex config location), outside the MCP storage retirement |

## Incident: leaked write to the real `~/.repo-harness` during the first full-suite run

The first `bun test` run (before the isolation fix) executed
`mcp setup chatgpt` in a subprocess without `REPO_HARNESS_HOME`, so it wrote to
the operator's real user-level MCP storage.

Observed and repaired:

- `~/.repo-harness/mcp.local.json` was rewritten. `chatgpt.serverName` was
  overwritten to the test value `team-review-mcp`, and `repo` was pointed at a
  now-deleted temp dir. The `repo` field was restored to
  `/Users/ancienttwo/Projects/repo-harness`. **The original `serverName` is not
  recoverable** (no backup existed); re-run
  `repo-harness mcp setup chatgpt --repo . --server-name <real-name>` to restore it.
- `~/.repo-harness/registered-repos.json` gained one stray entry
  (`repo_5b0698a39f150b9f`, a temp path, `source: mcp-setup`). Removed; the
  registry went 799 -> 798 entries.
- `mcp.tokens.json`, `mcp.oauth.json`, and `mcp.oauth-tokens.json` were **not**
  modified (mtimes unchanged from June). No credential was rotated or exposed.

The registry already carried ~790 stale temp-path entries from earlier `init`
test runs, so per-test registry leakage is a broader pre-existing isolation gap
in the suite, not something this work-package introduced.

## Open Questions

- Whether the broader test-suite registry leakage (`init` tests writing temp
  paths into the real `~/.repo-harness/registered-repos.json`) deserves its own
  slice. Out of scope here; recorded for the deferred-goal ledger.

## Evidence Links

- Manual legacy-fixture trace: gate error -> `migrate-scope` -> rotated
  credentials -> idempotent re-run (transcript in the task report)
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Candidate for `tasks/lessons.md` if it recurs: when a default storage location
  moves from repo-local to user-level, every test subprocess that previously did
  not need `REPO_HARNESS_HOME` becomes a write path into real operator state.
  Audit `spawnSync`/`Bun.spawn` env in tests as part of any storage-authority
  change. Holding for a second occurrence before promoting.

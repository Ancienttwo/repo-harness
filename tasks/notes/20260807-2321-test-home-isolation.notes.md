# Implementation Notes: test-home-isolation

> **Status**: Active
> **Plan**: plans/plan-20260807-2321-test-home-isolation.md
> **Contract**: tasks/contracts/20260807-2321-test-home-isolation.contract.md
> **Review**: tasks/reviews/20260807-2321-test-home-isolation.review.md
> **Last Updated**: 2026-08-07 23:52
> **Lifecycle**: notes

## Design Decisions

- **Separate preload file, not an extension of `setup-timeout.ts`.** `bunfig.toml` already
  had `preload = ["./tests/setup-timeout.ts"]`; that file owns one concern (`jest.setTimeout`).
  Home isolation went into `tests/preload-home-isolation.ts` and was placed **first** in the
  preload array, since bun runs preloads in array order and the env must be installed before
  anything else can observe it.
- **`REPO_HARNESS_HOME` covers the largest writer group, not all of them.** Code that writes
  under `~/.repo-harness` splits three ways, and only the first reads this lever:

  | Group | Sites | Covered by this slice |
  |-------|-------|-----------------------|
  | Reads `REPO_HARNESS_HOME`<br>`resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? homedir(), ".repo-harness"))` | `src/effects/repo-registry.ts:61` (registry — the ~800-entry leak), `src/cli/mcp/coding-workspaces.ts:104`, `src/cli/mcp/auth.ts:56` (`mcp.*` — the `chatgpt.serverName` overwrite) | **Yes** |
  | Reads `HOME` only<br>`env?.HOME ?? process.env.HOME ?? homedir()` | `src/cli/commands/brain-root.ts:24-35` → `~/.repo-harness/config.json`; `src/cli/commands/global-runtime.ts:259-261,387` → `~/.repo-harness/packages` | **No** |
  | No env lever at all (deliberate OS-account design) | `scripts/acceptance-receipt.ts:753` (`opts.authorityHome ?? userInfo().homedir`); `scripts/merge-gate.ts:180` (`osAccountHome()` via `/usr/bin/id` + `dscl`) | **No** — needs `opts.authorityHome` injection or its own slice |

  Leak class 2 (the rewritten `gates/<id>/acceptance.latest.json`) lives in the third group, so
  **this slice does not structurally close it**; see the probe section for what the evidence
  does and does not prove.
- **Mutate `process.env`, do not touch `HOME`.** Overriding `HOME` would reach the second group
  above, but at a much wider blast radius (git config, bun cache, every tool that resolves a
  home) — a bigger decision than this slice's scope. Kept to the one lever; the `HOME`-only
  group is recorded as uncovered rather than silently half-fixed.
- **Child-process coverage is partial, and this was measured, not assumed.** The first version
  of this slice claimed a bare `spawnSync(cmd, args)` inherits the preload's mutation because
  Node documents `options.env` as defaulting to `process.env`. That is false under Bun 1.3.14,
  which snapshots the child environment at process start. Probed inside a real `bun test` run
  with a preload setting `THI_PROBE_VAR`:

  ```
  IN-PROCESS      : SET_BY_PRELOAD
  BARE spawnSync  : ""              status 1   <- NOT inherited
  SPREAD spawnSync: "SET_BY_PRELOAD"           <- inherited
  BARE execSync   : THROW(status=1)            <- NOT inherited
  Bun.spawnSync   : ""                         <- NOT inherited
  ```

  Real coverage boundary: (a) in-process reads of `process.env` — covered; (b) spawn sites
  passing `env: { ...process.env, ... }` — covered; (c) bare `spawnSync`/`execSync`/`Bun.spawnSync`
  with no `env` — **still exposed**. Scale of (c), measured with a paren-balanced scan over
  `tests/`: **392 spawn call sites, 138 with an explicit `env:`, 254 without**. So the preload is
  a large default-safety improvement, not the "structural, not per-call-site" guarantee first
  claimed. Follow-up candidate: a lint/grep guard requiring an explicit `env` on spawns in
  `tests/`.
- **Precedence: an already-set `REPO_HARNESS_HOME` always wins.** The preload only fills the
  dangerous default (`if (!process.env.REPO_HARNESS_HOME)`). Tests that build their own temp
  home and pass it explicitly — e.g. the `runInit registers an adopted repo...` test at
  `tests/cli/init.test.ts:149` — keep working untouched, as does an explicit
  `REPO_HARNESS_HOME=... bun test` from an operator.
- **No cleanup hook for the temp dir.** One `mkdtemp` dir per test process under `os.tmpdir()`;
  reaping is the OS's job. An `exit` handler doing `rmSync` would add a failure path for no
  isolation benefit.

## Deviations From Plan Or Spec

- **One test needed an env fix, and it was not the hardcoded-assertion class the plan
  anticipated.** The plan expected breakage from tests asserting the literal `~/.repo-harness`
  path. Zero such tests existed — the full suite is green with no assertion edits. Instead one
  test leaked *through* the preload, for a different reason (see below). Total test edits: 1
  (`tests/cli/init.test.ts:316`, env passthrough only; no assertion changed).

## Root Cause Of The Residual Leak (production bug, left unfixed — out of contract scope)

After the preload landed, the init family still leaked exactly 1 registry entry per run
(`repo-harness-init-npx-*`). `src/cli/commands/init.ts:194`:

```ts
function initCommandEnv(sourceRoot: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  if (!isNpxCacheSource(sourceRoot)) return env;
  if (env?.AGENTIC_DEV_LINK_INSTALLED_COPIES !== undefined) return env;
  return { ...(env ?? {}), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" };
}
```

When `sourceRoot` is an npx cache path **and the caller passes no `env`**, the `?? {}` builds a
fresh env object holding only `AGENTIC_DEV_LINK_INSTALLED_COPIES`. `process.env` is discarded
wholesale, so the `commandEnv` handed down to `runAdoptionApply` has neither `REPO_HARNESS_HOME`
nor `HOME`, and `repoHarnessHome(env)` falls all the way through to `homedir()` — the operator's
real `~/.repo-harness`. No preload can defend against a code path that drops `process.env`.

Contract Scope puts `src/**` out of scope, so this was fixed test-side at
`tests/cli/init.test.ts:307-331` with a sanitized `process.env` copy. The production bug is
intact. It is one of several known gaps, not the only one — the others are the bare-spawn class
(c) above and the two uncovered writer groups in the Design Decisions table. See Open Questions.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Set `REPO_HARNESS_HOME` in preload | **Use** | ~4 lines; covers the registry + `mcp.*` writer group, which is where all three observed leak classes' *reproducible* damage came from |
| Also override `HOME` in preload | Reject | Would reach the `HOME`-only group (`config.json`, `packages/`) but drags in git/bun/every-tool home resolution; wider blast radius than this slice can verify |
| Keep fixing spawn sites one by one | Reject | The premise of the slice — this discipline failed three times this week |
| Lint/grep guard forcing explicit `env` on spawns | Deferred | The real fix for the 254 bare-spawn sites; a separate slice, and only worth building once the default is safe |
| Inject `opts.authorityHome` for the gates path | Deferred | The only way to isolate `userInfo().homedir`; touches test call sites broadly, own slice |
| Fix `initCommandEnv` to spread `process.env` | Deferred | Correct structural fix, but `src/**` is out of contract scope |

## Open Questions

Four gaps left open on purpose, in rough priority order:

1. **Bare spawns (widest gap).** 254 of 392 spawn sites under `tests/` pass no `env`, and Bun
   does not propagate the preload's mutation to those children. A lint/grep guard requiring an
   explicit `env` on spawns in `tests/` is the natural next slice — it is what turns this
   preload into the structural guarantee it was first mistaken for.
2. **`HOME`-only writers.** `brain-root.ts:24-35` (`config.json`) and
   `global-runtime.ts:259-261,387` (`packages/`) resolve through `HOME`, which this slice
   deliberately does not override. Uncovered.
3. **Leak class 2 / OS-account writers.** `scripts/acceptance-receipt.ts:753` and
   `scripts/merge-gate.ts:180` read the OS account record (`userInfo().homedir`,
   `/usr/bin/id`+`dscl`). No env can redirect them; isolation means injecting
   `opts.authorityHome` at the test call sites. Uncovered.
4. **`src/cli/commands/init.ts:194`** `initCommandEnv` drops `process.env` for npx-cache
   sources when called without an explicit `env`. Worth fixing: the same shape would leak again
   from any new caller, and it is real production behavior (an npx-invoked `init` loses the
   user's whole environment, not just the test's). Out of contract scope here.

## Leak Probe (primary acceptance evidence)

Probe: full-tree manifest of the real `~/.repo-harness` — every file's
`relpath | size | mtime | sha256` (757 files) — plus focused hashes for the three named leak
surfaces. Script: `/tmp/thi-snapshot.sh`.

### RED control (probe validity, preload NOT yet active)

`bun test tests/cli/init.test.ts tests/cli/init-hook.test.ts`, 44 pass / 0 fail:

```
registry_count BEFORE = 837
registry_count AFTER  = 840      <- +3 leaked entries in ONE run of TWO files
```

Leaked paths (`source: "init"`, real registry):
```
/private/var/.../T/repo-harness-init-1786116214688/repo
/private/var/.../T/repo-harness-init-handoff-1786116217111/repo
/private/var/.../T/repo-harness-init-npx-1786116289875/repo
```
The probe detects the leak. It is not a no-op assertion.

### Intermediate (preload active, `initCommandEnv` hole still open)

Same two files: `840 -> 841`. Preload closed 2 of 3 leak sites; the npx one survived and led to
the root cause above.

### GREEN, targeted (preload + test env fix)

Same two files, 44 pass / 0 fail: `841 -> 841`. Zero growth.

### GREEN, full suite — the acceptance evidence

`bun test` — **2222 pass, 1 skip, 0 fail, 2223 tests across 177 files, 521.83s, EXIT=0**.

PRE vs POST snapshot of the real `~/.repo-harness`, taken immediately before and after that run:

```
$ diff /tmp/thi-PRE.summary.txt /tmp/thi-POST.summary.txt
IDENTICAL (zero writes)

$ diff /tmp/thi-PRE.manifest.txt /tmp/thi-POST.manifest.txt
IDENTICAL (no file added, removed, retouched, or rewritten)
```

Field by field, PRE == POST:

| Field | PRE | POST |
|-------|-----|------|
| `registry_count` | 841 | 841 |
| `registry_sha256` | `e94ce765506a847ff30bf5c0b2da012f39c133957dda8949a0eb996b01c61b53` | same |
| `mcp.local.json` | `92dcc96df44c2a13f7013718bd087a62cdeddc94d4fa062657286ae624b6af41` | same |
| `mcp.oauth-tokens.json` | `320c35758bdf9bc9c66a5f3a2ce387c6951130a629346f26a2130ae0bac6469a` | same |
| `mcp.oauth.json` | `10cefe172dbbf5a8f667cbb95b2195b7bb774d8298f599e4194cb44a4228df26` | same |
| `mcp.tokens.json` | `d0140f72cb321be606b849cd35878dc8e16447881e4a54d804dc6ac459f4f5ff` | same |
| `gates_receipt_count` | 48 | 48 |
| `gates_tree_sha256` | `3f4705d1f7e3413d44b7045270a8d3b61196fb1e4e80f09ae748b05b037d29db` | same |
| `gates_newest_mtime` | 1786112891 | 1786112891 |
| `manifest_file_count` | 757 | 757 |
| `manifest_sha256` | `ef9554059200bce0f38c8c0af4cbce0b76763d08cc21d1c6701af5c984a602be` | same |

What this evidence does and does not establish:

- `registry_count` flat and `registry_sha256` unchanged **refute leak class 1**, which is the
  class this slice structurally closes.
- The four byte-identical `mcp.*` hashes **refute class 3** (the overwritten
  `chatgpt.serverName`), same mechanism.
- `gates_newest_mtime` and `gates_tree_sha256` unchanged show **class 2 did not fire in this
  run** — but it is *not* evidence that class 2 is closed. `scripts/acceptance-receipt.ts:753`
  resolves its home through `userInfo().homedir`, which no environment variable can redirect,
  so the preload cannot cover it. The observation is a negative result for this run only;
  closing class 2 requires injecting `opts.authorityHome` at the test call sites or a separate
  slice.

Registry count moved 837 -> 841 across the whole slice: +3 from the deliberate RED control,
+1 from the intermediate run before the npx fix landed. Every run after the fix is flat. The
pre-existing ~841 leaked entries are operator state and are out of scope to clean.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- `bun run check:type` — EXIT=0
- `bun test` — EXIT=0, 2222 pass / 1 skip / 0 fail

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Candidate for `tasks/lessons.md` after this slice is accepted: **an env-var preload is a
  default-safety layer, not an isolation boundary — measure the propagation before claiming
  one.** Two independent things break the intuition: (1) under Bun 1.3.14 a child spawned with
  no explicit `env` does *not* see a runtime mutation of `process.env`, despite Node documenting
  `env` as defaulting to `process.env`; (2) a helper that rebuilds an env from scratch
  (`{ ...(env ?? {}) }`) silently drops it too. Both were found only by probing the real runtime
  and diffing real state; both were invisible to a green test suite. Meets the filter: hard to
  reverse once tests are written against the leaky default, genuinely surprising, and a real
  scope trade-off existed.

# Plugin split: the peer-runtime gate, separate packages and the desktop handshake

Date: 2026-11-06. Base: main `0169316ab`. Request: owner decision M100 (one plan for the remaining #1287 work, on a PR).
Sources: four blind design tracks and one design note. E1 (P7, the peer-runtime gate, #1861): a Codex track at `d85e27bcb` and an Opus track at `0169316ab`. E2 (step 4, separate packages, #1287): a Codex track at `d85e27bcb` and an Opus track at `0169316ab`. E3 (#1298 desktop handshake): the Codex note in #1298 comment 6675473710, with Q1 and Q3 approved by the owner (M98). Each track saw only the decision packet. The parent contract is the #1287 body.
The track files stay in the coordinator scratchpad. This note keeps the decisions and the evidence that settles each divergence. Line references are at `0169316ab` unless a line says otherwise.

## Conclusion

| Area | Decision | Basis |
|---|---|---|
| P7 shape | Move first, then gate. No new port. | `ReviewerRunner` exists (`src/core/review/runner-port.ts:96`). The MCP and Operator gates moved a core edge into core; they added no port. |
| Review | `review admit`, `revoke` and `publish` stay core and open. `review round`, `status`, `close` and `cancel` need `peer-runtime`. The OAR review host stays in the plugin. | #1287 Review contract: the core owns `AcceptanceReviewResult` and the runner port; "OAR / Herdr task agent" is plugin. The gatekeeper is the default acceptor, so a core-only install can accept and publish without the OAR host. |
| Worktree closeout | The runtime closeout moves into core with the same argv, JSON and exit codes. | Every closeout runs it (`scripts/contract-worktree-runtime.ts:117` spawns a plugin file). A gate would block closeout after a deselection. |
| GitHub App hook config | `events install` writes it through core `publication` (owner question P7-Q2). | #1287 rule: "a plugin does not write GitHub directly; it uses core `publication`". Today `src/cli/commands/events.ts:139` sends `PATCH /app/hook/config`. |
| Target | `peer-runtime` is available on every install target (owner question P7-Q1). | `pluginUnavailable` skips it on `--target codex` (`src/cli/installer/install-profile.ts:1252-1259`). A gate would then remove `review round`, `herdr` and `events` from Codex-only installs. |
| Step 4 | One new npm package, `repo-harness-operator-web`, with the built console only. No workspace, no contracts package. | The console bundles its core decoders at build time. A version-equality check at serve time keeps one source for each decoder. |
| Events Worker | Stays a `peer-runtime` asset in the core package (owner question Q-W narrows D4). | 5 files, 222 lines. `notify-relay.ts:7` imports its envelope. A third package saves less than 10 KB. |
| Version policy (#1298 Q2) | Lockstep for the npm packages of this repository. The desktop shell versions on its own and binds only through `/healthz.protocol`. | Every `/api/v1` answer goes through a shared core decoder in the console. M98 reserves `/healthz.protocol` for the desktop. |
| Order | P7 → 0.26.6 (M97) → step 4 → 0.27.0. The `/healthz` change runs before step 4 unit 1. | Both edit `src/effects/operator/server.ts`. |

## P7: the peer-runtime gate (#1861)

### Agreements

Both tracks:
- Keep the six core terminal files in core: `herdr-core`, `notify-read`, `task-session-record`, `task-session-io`, `task-role-profiles`, `task-session-admission`.
- Make `agents/fleet/**`, `.codex/agents/**` and `scripts/install-agent-fleet.sh` core. The installer already maps them to core (`install-profile.ts:412`). Only the model changes.
- Make the Herdr skill installer (`src/cli/commands/herdr-skill.ts` and its renderer) core. It installs the core `herdr` skill.
- Guard the four `herdr notify` actions and `events install`. Keep `--help` open.
- Load a guarded body lazily. Refuse before any credential read, prompt, probe, write or process start.
- Apply no migration. The `peer-runtime` id exists (`plugin-manifest.ts:12`); only the enforcement changes.
- Use High PRs in sequence, one writer for each file.

### Divergences

| Topic | Codex track | Opus track | Decision |
|---|---|---|---|
| Review runner and OAR host | Move the runner and the terminal OAR host into core review; add a new versioned core port (proposed file `src/core/peer-runtime/contracts.ts`); keep `review round --launch app-terminal` in core. | Keep the runner in the plugin; gate `round`, `status`, `close` and `cancel`. | Opus. The #1287 Review contract puts the OAR host in the plugin. A core-only flow needs only `admit`, a review result and `publish`. |
| Worktree `register`, `notify-merged`, `cleanup` | A core port; `register` and `notify-merged` need the plugin; `cleanup` returns `pending` unless core records prove no open runtime. | Move the closeout code (`task-session.ts:41-139,337-368,464-618,643-678`) into a new core file; delete `task-worktree-runtime.ts`. | Opus. The code uses only core modules. A port would add a second reader of one registration decision. |
| Relay doctor row | Show `na` "plugin not selected" without loading notify code. | Move `notifyRelayDoctorCheck` (`src/cli/commands/herdr.ts:126-139`) into core doctor; it reads only core contracts. | Opus. The row stays the same with or without the plugin. |
| GitHub App hook write | Move it into core `publication` before the gate. | Owner question; recommends keeping the write in the plugin's own install. | Codex, as owner question P7-Q2 with that recommendation. The #1287 rule has no exception for App configuration. |
| Target rule | Not raised. | Make `peer-runtime` available on every target. | Opus, as owner question P7-Q1. |
| Board and hc | Raised: core Board needs `hc`, but #1287 says a core install needs no Herdr. | Keeps `hc` and the Herdr skill in a core-only install. | Owner question P7-Q4. |

### Risks

- The core `verifier` probe row names `review-runner/task-oar-host.ts` (`install-profile.ts:1183-1184`). It passes while one package ships both. Step 4 must not move that file out of the core package.
- `cross-review` needs `peer-runtime` for `review round`. Without the plugin the refusal is visible; nothing runs.
- A relay that runs at deselection keeps running. Doctor shows it.
- The moved closeout is a deletion guard. The move keeps it byte-identical.
- The tarball smoke lists plugin-owned paths in hand-written regexes (`mcp`, `operator`, and next `peer-runtime`). A new plugin file that the regex misses can load eagerly with no failure. Derive the lists from the architecture model when a missed file is found; do not add that machinery before.
- ADR-0002 lists "task-agent sessions and Herdr panes" as plugin state and claims one Event decoder in core. Both statements are stale. Unit P7-1 corrects them through `repo-harness-architecture`.

### Packed proof for the gate unit

With selection `[]`: `status --json`, `doctor --json`, `seats argv worker --json`, the hook routes and `contract-worktree-runtime cleanup` on an unregistered checkout load 0 `peer-runtime` modules. `dist/hook-entry.js` bundles no owned path. `review status`, `herdr notify start` and `events install` exit 1 with empty stdout, `install_plugin_unavailable` and the repair line, and load 0 owned modules. With `all`, `herdr notify start` loads owned modules. For a recorded `all` selection, the repair line is `repo-harness update` (#1869).

## Step 4: separate packages (#1287)

### Agreements

Both tracks:
- Lockstep versions: one version, one tag, one CHANGELOG entry and one release record for the npm packages of this repository.
- No contracts package. The console keeps importing the core decoders; the build bundles them.
- The core resolves the console package relative to its own installation and requires an equal version. A missing or mismatched console fails with a repair that names `repo-harness update`.
- The console publishes first, then the core. The release gate stops a partial release.
- chatgpt-browser has no package: #1354 removed it.

### Divergences

| Topic | Codex track | Opus track | Decision |
|---|---|---|---|
| Source layout | A Bun workspace; move `src/operator-web/**` to `packages/operator-web/`. | No workspace. The source stays. `packages/operator-web/` holds a manifest, a README and the build output. | Opus. A workspace changes `bun.lock` and moves 103 files and 148 imports with no behavior gain. The console has no runtime dependency to link. |
| Events Worker | A third package, `repo-harness-events-worker`, as D4 says. | Stays in core under `peer-runtime` (narrow D4). | Opus, as owner question Q-W. |
| Missing console | `operator serve` refuses to start. | Page requests get a typed 503 (`operator_assets_unavailable`, `operator_assets_version_mismatch`); the API keeps working. | Opus. `tests/cli/operator-serve.test.ts:1468-1491` and the vite dev proxy start the server without console files. |
| UI version check | The UI reads `/healthz` before its first read or write. | The server serves only a console of its own version. | Opus. Equality at serve time removes the mixed pair, except across an update without a restart. The 0.26.5 record already says to restart the server and reload the page together. |

### Failure modes

- Each package adds one manual `npm publish --auth-type=web` prompt. At 10 times the release rate, the manual publish fails first; move to CI trusted publishing then, as a separate owner decision (credentials boundary).
- If Bun stops putting global companions next to `repo-harness`, the console becomes unavailable (503), not wrong. The install unit tests the layout with an isolated `BUN_INSTALL`.
- Not verified here: that `repo-harness-operator-web` is free on npm (`npm view` must return E404), and that an installed core finds a Bun global sibling with `findInstalledPackageRoot` (`src/cli/commands/global-runtime.ts:417`).

## Desktop handshake (#1298)

Approved (M98): `/healthz.protocol` is the desktop integration contract only. The first governed value is 2, and the shell refuses unmanaged 1. The shell uses required native calls only.

Q2 follows step 4: lockstep. The health `version` is the core package version. The server reads it from its own package metadata (`package.json`) and imports no CLI code. Today the handler returns `{ok, service, protocol}` with protocol 1 (`src/effects/operator/server.ts:1344-1350`).

The core-side change is one unit: protocol 2, the `version` field, the health test case (`tests/cli/operator-serve.test.ts:114-129`) and the bump rule as an ADR. The shell work starts after P7 (M42) and needs the owner answers for the shell repository and the signing credentials.

## Order and file handoffs

1. After the owner answers P7-Q1 to P7-Q4: P7-1 and P7-2 run in parallel (disjoint files). P7-3 starts after both merge.
2. After the owner answers Q2: the `/healthz` unit runs. It must merge before step 4 unit 1 starts.
3. 0.26.6 releases after P7-3 (M97).
4. Step 4: unit 1, then units 2 and 3 in parallel, then unit 4 (0.27.0). No release between unit 1 and unit 4.

Files that pass between writers in sequence: `src/cli/index.ts` (P7-1, then P7-3), `src/cli/commands/events.ts` (P7-2, then P7-3), `src/core/skill-surface/plugin-manifest.ts` and `scripts/check-tarball-install-smoke.sh` (P7-3, then step 4 unit 1), `src/effects/operator/server.ts` (the `/healthz` unit, then step 4 unit 1), `docs/CHANGELOG.md` (every unit adds its entry last).

## Owner questions

| Id | Question | Recommended answer | Cost of the other answer |
|---|---|---|---|
| P7-Q1 | Install targets for `peer-runtime` | Every target; its Claude skill installs only on Claude. `status` loses the `peer-runtime` probe row. | Claude-only: Codex-only installs lose `review round`, `herdr` and `events`. |
| P7-Q2 | The GitHub App hook config write | Through core `publication` (unit P7-2), as the #1287 rule says. | Keep it in the plugin install: one written exception to the rule; no P7-2. |
| P7-Q3 | Explicit selections without `peer-runtime` | No migration. The guards and `update` print the repair; the CHANGELOG says it. | A migration that adds the plugin to explicit lists changes a user choice. |
| P7-Q4 | `hc` in a core-only install | Keep `hc` (herdr-core) in core for Board seats. Change the #1287 criterion to "no Herdr app and no task panes". | Move `hc` to `peer-runtime`: core Board seats show nothing without the plugin. |
| Q-W | D4 for the Events Worker | Narrow D4: the Worker stays a core-package asset under `peer-runtime`. | A third package, a moved envelope and a third publish for each release, to save less than 10 KB. |
| Q2 | Version policy | Lockstep for the npm packages; the shell versions on its own. | Independent versions need a second governed API protocol and a tested version matrix. |
| Q3a | Name of the console package | Unscoped `repo-harness-operator-web`. Check E404 first. | A scope needs an npm organization (a credentials and permissions action). |
| Q3b | Publisher | The owner, by hand with `--auth-type=web`: the console first, then the core. | CI trusted publishing: a new workflow with `id-token: write` (High). |
| Q3c | First two-package version | 0.27.0 | 0.26.x hides the change of install topology. |

## Work units

The units are GitHub issues with their tier, parent and blocked-by links. Each body is self-contained for a worker that has only the repository and GitHub. The merge order, holds and seats are in the [#1287 plan comment](https://github.com/Ancienttwo/repo-harness/issues/1287#issuecomment-6681514481).

| Unit | Issue | Parent | Tier | Blocked by |
|---|---|---|---|---|
| P7-1: core owns the worktree runtime closeout, the Herdr skill and the agent fleet | #1887 | #1861 | High | owner P7-Q1 to P7-Q4 |
| P7-2: the GitHub App hook config goes through core publication | #1888 | #1861 | High | owner P7-Q2 |
| P7-3: the peer-runtime selection gates review rounds, herdr, events and the investigation job | #1889 | #1861 | High | #1887, #1888 |
| `/healthz` reports desktop protocol 2 and the server package version | #1890 | #1298 | Medium | owner Q2 |
| Step 4.1: ship the console as `repo-harness-operator-web` | #1891 | #1287 | High | #1861, #1890, the 0.26.6 publication, owner Q3a |
| Step 4.2: `install` and `update` install the console | #1892 | #1287 | High | #1891 |
| Step 4.3: the release gate and the published check cover both packages | #1893 | #1287 | High | #1891 |
| Step 4.4: prepare 0.27.0 | #1894 | #1287 | High | #1891, #1892, #1893, owner Q3b and Q3c |

A fifth step 4 unit (the Worker package) exists only if the owner answers Q-W with "split".

## Not covered

- No runtime proof. The tracks read code; they ran no install, publish or desktop launch.
- #1857 (Antigravity and DSH review isolation) needs a machine with agy 1.5 or later and dsh. It is not part of this plan.
- The desktop shell units wait for P7 and for the owner answers on the shell repository and the signing credentials.

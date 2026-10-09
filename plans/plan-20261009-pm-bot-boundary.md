# Shared PM boundary and Hermes adapter

Date: 2026-10-09 (Asia/Singapore)
Status: Implemented locally. Architecture projection verified. Live provider acceptance remains open.
Base: `98c30ab6228b94f5e46c8cc3290de281eb0e4a99`
Branch: `codex/pm-bot-boundary`
Worktree: `/tmp/repo-harness-wt-pm-bot-boundary`

## Goal

Use Bots as project managers. Grok, Hermes, Dot, and later Bots share the same
PM contract. The PM talks to the user, breaks down work, dispatches work,
collects evidence, and reports progress. It does not edit product source,
run arbitrary commands, or execute coding work itself.

Use OAR to run coding agents. Use Herdr to host their panes and expose their
work to the user. Keep repo-harness task and result records as authority.
Hermes is a PM host. It is not another Herdr coding-agent kind.

This request authorizes the plan, delegated implementation, local commits,
and verification. It does not authorize push, merge, release, production,
credential rotation, or new confirmation-bypass settings.

## P1: Map

- The shared Bot entrypoint is `SKILL.md`.
- Bot and worker duties are in
  `docs/reference-configs/agentic-development-flow.md`.
- `src/cli/commands/task-agent.ts` exposes the existing task lifecycle.
- `src/effects/terminal/task-session.ts` owns Herdr bindings, requests,
  request hashes, result collection, and cleanup.
- `src/effects/fleet/acquire.ts` owns offer, claim, worktree and binding
  acquisition. Reuse it when a dispatch requires these actions.
- `src/effects/review/oar-review-host.ts` is a review-only OAR host.
- `startTaskApplicationHost` only accepts the fixed review-host bundle.
- Hermes 0.21.6 supports native plugin tools and persistent platform toolsets.
  Its `terminal` toolset allows shell execution. Its `skills` toolset includes
  skill modification. A failing tool hook can fail open.

## P2: Trace

The ordinary path is task-agent start -> Herdr agent start -> prompt ->
request-bound TaskResult -> collect. It does not yet open an OAR Session.

The review path starts a fixed OAR host inside Herdr. The host uses the public
OAR session API. Review result ownership and read-only isolation are separate
from ordinary task results. Do not change those meanings for coding work.

Hermes has executed real local Herdr and repo-harness read commands. Both
returned exit code 0. That proves the local CLI path only. It does not prove
PM permissions or a complete coding task.

The main checkout has a stale OAR 0.18.0 installation. This worktree was
installed with the frozen lockfile and has OAR 0.37.0. Verify against this
version. Node 24 is available at `/opt/homebrew/opt/node@24/bin/node`.

## P3: Decision

Add a small shared PM operation surface over existing authorities. Expose it
through the CLI. Add a fixed OAR coding host at the existing terminal boundary.
Add a thin native Hermes adapter that invokes that same PM surface.

Do not add a scheduler, task database, provider protocol parser, native agent
argument builder, or alternate completion record. Keep runtime policy separate
from Bot identity. Grok and Dot are PM hosts, not worker-runtime enum additions.

The PM restriction is an enforced model tool boundary. It is not an OS sandbox
for the Hermes process. The host administrator can still change configuration.
State this limit in installation output and documentation.

## Scope and ownership

### Work package A: Shared PM operations

Owner: Codex PM-surface worker.

- Own `src/core/pm/`, `src/effects/pm/`, `src/cli/commands/pm.ts`, CLI registration,
  and tests for those files.
- Publish one closed, versioned request shape and operation inventory.
- Support capability/status queries, bounded dispatch, same-task follow-up,
  and validated result collection through existing task authorities.
- Use registered repositories and canonical task/claim/worktree bindings.
  Reject stale identities, unapproved scopes and unknown fields.
- This first implementation dispatches only an existing canonical binding in
  an operator-approved linked worktree. If acquisition or a new write grant is
  needed, return `pm_acquisition_not_admitted`. The existing operator/acquire
  workflow prepares it outside the PM request. Do not add a second prepare flow.
- Resolve the Herdr endpoint and execution policy from trusted host setup.
  Do not accept shell commands, executable paths, native flags, environment
  variables, arbitrary write paths, or permission changes from a PM request.
- Reuse the existing worktree/claim acquisition effect when needed. Do not
  reproduce its state machine or make a second ownership ledger.
- Depend on the coding-host interface from B. Do not fall back to direct
  provider launch when admission or installation fails.

### Work package B: Fixed OAR coding host

Owner: Codex runtime worker.

- Own the fixed coding host under `src/effects/terminal/`, its task-session
  integration, build/package entries, and affected lifecycle tests.
- Use OAR public installation, Session, events, prompt, abort and dispose APIs.
  Do not hand-build native provider commands or parse native transcripts.
- Use the existing request ID, context hash, result submission and collection.
  OAR completion or Herdr idle without a valid TaskResult is not completion.
- Preserve review-domain result ownership and isolation. `binding.host` must
  retain its current meaning.
- Validate worker permission admission before starting a process. OAR 0.37.0
  defaults to non-interactive approval and broad access. Do not silently accept
  those defaults. Unsupported runtimes or missing admission fail closed.
- Start with the runtime whose worktree boundary can be verified. Report other
  runtime support as unavailable until its permission boundary is proven.
- Keep retries tied to the same request. Unknown launch or delivery must not
  create another worker. Dispose owned children before pane cleanup.

### Work package C: Hermes host adapter

Owner: Codex Hermes-adapter worker.

- Own `assets/hermes/` and its adapter verification code. Coordinate the
  request schema with A before writing the invocation bridge.
- Register only named PM tools in a separate native toolset.
- Call a fixed installed CLI with structured input and `shell=False`.
- Keep operator setup outside model-controlled arguments. Reuse the shared
  PM operation contract. Do not create a Hermes task authority.
- Persist the PM toolset for CLI/TUI/Web chat. Verify the final model-visible
  tool inventory. Exclude terminal/process, source write/patch, execute_code,
  skill_manage, generic delegation and arbitrary MCP/browser execution.
- A prompt or fail-open hook does not count as enforcement. If a native
  boundary is insufficient, report the specific unsupported path.
- Provide setup/readback instructions. Preserve existing user settings.
  Do not copy secrets or modify the live Hermes installation during coding.

### Parent: Integration, docs and acceptance

- Own this plan, the shared PM Skill guidance, docs and architecture changes.
- Keep common PM duties independent of any Bot name.
- Require Feynman reports and PlantUML progress from the same evidence snapshot.
- Grok connectivity is user-reported. Preserve its current path. Do not claim
  new Grok hardening or Dot integration without separate host evidence.
- Review all worker changes, run the final checks, and request independent
  read-only acceptance review for the security and test changes.

## Verification

1. Reject arbitrary commands, unknown fields, path escape, stale revisions,
   forged results and caller-selected runtime permissions before side effects.
2. Verify duplicate delivery and restart recovery use the same task/request.
3. Verify OAR completion without TaskResult remains incomplete.
4. Preserve existing task-agent and review behavior in affected tests.
5. Use a real Hermes installation to inspect the effective PM tool inventory.
   Attempt excluded tool calls and verify no source mutation occurs.
6. Test the worker boundary with real disposable repositories and process state.
   OAR's own scripted runtime may test library lifecycle, but cannot substitute
   for the real-provider acceptance run.
7. Run `bun run check:type` with Node 24, the affected test files through
   `bun run test:files ... --timeout 60000 --max-concurrency 1`, and the required
   affected CI check. Run the full suite once for the final large/package change.
8. Record commands, exit codes, candidate revision and evidence paths.
   Mark omitted, failed, unsupported and live-provider coverage separately.

## Activation boundary

Prepare and review exact host settings before live activation. The PM may not
grant itself permissions. Restricting the PM tool surface is in the requested
scope. Any new worker write grant, credential access or confirmation bypass
requires the user's approval of the exact reviewed setting.

No domain, Tunnel, public Web service or key rotation is part of this slice.
Do not repair Herdr's recognition of Hermes as a prerequisite for PM dispatch.

## Observed result

Work packages A, B and C are implemented. Independent review found a request
publication race. The host now waits for the matching start marker before it
reads the request. A real red/green check proves that repair. The second review
found no remaining production-code issue.

Type checking passed at `c9f56b50`. The package and CI contract delta passed
45 tests. The package dry run included both OAR bundles. Native Hermes 0.21.6
checks found exactly five PM tools in CLI, TUI and Web. These checks did not run
a live model or change the current Hermes profile.

The full suite at `c9f56b50` checked 411 files and exited 1. Two architecture
assertions failed because the new module had no generated document. After the
user approved the local CodeGraph index, archctx exposed a reversed relation in
the new flow. A typed ChangeSet fixed the flow to match the real call direction.
The official projection then applied. Its PM P1/P2 proofs are `proven` and its
target count is 34. The architecture delta passed all four tests without a test
change. Capability validation and workflow diagnostics also passed.

The remaining full-suite failure is in `tests/cli/operator-serve.test.ts`.
The same failure occurred on unchanged main. A separate reproduction observed
historical filesystem events with zero product calls and no content change.
The test remains unchanged. The full suite has not been reported as passing.

Live Hermes activation and a real coding-provider task remain unverified.
Exact worker admission is still required. Nothing has been pushed, merged,
released or deployed. Evidence is under the ignored local
`.ai/harness/runs/pm-verification/` directory.

## Rollback

Keep all source changes on this branch. Revert the bounded commits to remove
the new surface. Keep pre-existing tasks and their evidence unchanged.
Back up only the exact live host configuration fragments before an authorized
activation. Restore those fragments on failure. Do not delete user data.

## Progress

- P1/P2/P3: complete for dispatch planning.
- Frozen OAR 0.37.0 installation: verified in this worktree.
- A/B/C implementation: dispatched to separate Codex workers in this worktree.
- Independent review, live activation and end-to-end acceptance: not run.

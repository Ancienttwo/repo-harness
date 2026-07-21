# Hook Operations Reference

> Full troubleshooting runbook: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md`.

## Hook Authority Map

There is one host-event runtime. The observable path is:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` send host events to
   `repo-harness-hook`.
2. The runtime validates the opt-in contract at
   `.ai/harness/workflow-contract.json` and resolves the repository root.
3. The route registry matches `(event, routeId, matcher)` and invokes exactly
   one typed in-process handler.
4. The handler returns a structured result; the runtime applies host-safe output
   shaping and records the route trace. A route never dispatches to a second
   handler or to a shell runtime.

The stable route tuple is the adapter contract. Handler identities are internal
authority names and are not selected by installation location or host provider.
Codex must trust `~/.codex/hooks.json` in Settings before it executes the
adapter. Generated adapter commands keep a bounded 30-second foreground timeout;
long-running work belongs in explicit CLI commands.

| Route | Matcher | Typed handler | Responsibility |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `session-context` | Build the bounded resume, sprint, and security context. |
| `PreToolUse.edit` | `Edit|Write` | `mutation-guard` | Enforce worktree and plan/contract readiness before edits. |
| `PreToolUse.subagent` | `Task|Agent|SendUserMessage` | `subagent` | Enforce the delegated return-channel contract. |
| `PostToolUse.edit` | `Edit|Write` | `mutation-observed` | Record the edit journal and controlled-file observations. |
| `PostToolUse.bash` | `Bash` | `command-observed` | Record command results and verification evidence. |
| `PostToolUse.always` | all tools | `trace-observer` | Append the low-noise tool trace. |
| `UserPromptSubmit.default` | all prompts | `prompt` | Classify intent and render workflow guidance from file-backed state. |
| `UserPromptSubmit.delegation` | all prompts (Codex) | `subagent` | Handle explicit delegation authorization. |
| `SubagentStart.context` | subagent start (Codex) | `subagent` | Add the bounded role and evidence contract. |
| `SubagentStop.quality` | subagent stop (Codex) | `subagent` | Check the delegated report and request one bounded continuation when required. |
| `Stop.default` | session stop | `stop` | Flush pending observations and finalize the handoff projection. |

`assets/hooks/lib/workflow-state.sh` and its `.ai/hooks/lib/` projection are
operator helpers for inspecting workflow state. They are not hook dispatchers,
route authorities, or alternate execution paths. Product changes to handler
behavior belong in `src/cli/hook/` and its tests; run `bun run check:hooks` after
updating the generated asset projection.

The prompt handler consumes the typed prompt-intent and workflow-state decision
table, then verifies the file-backed contract and the typed `AcceptanceReceipt`
for done/review prompts. Markdown review cards are deterministic projections and
are never parsed as a second authority. A missing or malformed receipt blocks
closeout; the runtime does not guess or downgrade the contract.

Plan/spec/contract hints in `UserPromptSubmit` are advisory. Hard edit enforcement
lives in `PreToolUse.edit` and the `mutation-guard` handler. The policy can select
`enforce`, `advice`, or `off` for that guard. Stop and observer handlers remain
deterministic and never spawn an LLM or a long-running worker.

## Host and Adoption Operations

`repo-harness adopt` installs the user-level adapters, writes the workflow
contract, and projects only the declared operator helpers into `.ai/hooks/lib/`.
It removes retired generated hook entry scripts by exact manifest ownership and
does not create a repo-local dispatcher. Project-level `.claude/settings.json`
and `.codex/hooks.json` are user-owned legacy inputs and should be reviewed
manually during migration rather than treated as runtime authority.

If an adapter is missing, inspect `repo-harness install --state`, refresh the
recorded host profile, and trust the Codex settings entry. Do not edit generated
adapter commands by hand. The route registry and the adapter manifest must agree
on the route tuple; a mismatch is a fail-closed installation error.

## Hook Failure Playbook

When a hook blocks work:

1. Read the structured terminal output.
2. Read `.ai/harness/failures/latest.jsonl` for the durable failure record.
3. Read `.claude/.trace.jsonl` for surrounding tool activity and timing.
4. Use the external runbook for extended examples and historical failure modes.

Common guards:

- `PlanStatusGuard`: an implementation edit has no active approved plan, or the
  plan is in the wrong state.
- `ContractGuard`: the approved plan has not been projected into contract,
  review, and notes scaffolding, or completion was claimed without contract
  verification.
- `WorktreeGuard`: a write was attempted from the wrong worktree.

Circuit-breaker updates lock the complete read-modify-write, wait at most two
seconds, and fail closed. They never reclaim a stale-looking lock. After
verifying that no hook process is active, an operator may remove
`.ai/harness/state/circuit-breaker.json.lock` and retry.

## Architecture Drift and Parity

Hook scope is detect, classify, record, and remind:

- `repo-harness run architecture-queue` writes requests and events.
- `repo-harness run workstream-sync` maintains durable capability workstreams.
- `repo-harness run context-contract-sync` updates only controlled local agent
  context blocks.

Agents author semantic snapshots and diagrams. Hooks do not spawn LLM agents or
long-running commands. Deterministic execution belongs in explicit CLI commands
such as `scripts/contract-run.ts`.

`assets/hooks/` is the package asset source; the self-hosted `.ai/hooks/` tree
contains the generated operator-helper projection. Keep the two declared asset
manifests aligned with `bun run sync:hooks`, and validate the typed route
registry with `bun test` and `repo-harness adopt --repo . --dry-run`.

## Verification Checklist

After handler or workflow-contract changes, run:

```bash
bun test
repo-harness run check-task-sync
repo-harness run check-task-workflow --strict
repo-harness adopt --repo . --dry-run
```

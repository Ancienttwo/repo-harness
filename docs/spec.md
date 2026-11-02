# Product Spec

Campaign execution moved to the existing [repo-harness](../SKILL.md), [repo-harness-product](../assets/skills/repo-harness-product/SKILL.md), and [repo-harness-check](../assets/skill-commands/repo-harness-check/SKILL.md) Bot skills on 2026-10-04. They dispatch and collect work through Herdr/OAR.


> **Status**: Approved
> **Owner**: repo-harness maintainers

## Global Architecture Projection

Architecture projection execution preferences have one user-level authority:
`~/.repo-harness/config.json#architecture`. Global install/update and successful
repository init initialize archctx automatic projection once and preserve
explicit user choices. The
package release owns the exact provider version. Repository init retires the
old projection execution keys and reports readiness. Init dry-run never writes
host preferences. Runtime, Stop and acceptance helpers read the same global
policy without repo overrides. Project model/capability authority, document ownership,
freshness gates and semantic acceptance remain local. Missing setup is reported
explicitly; malformed global config fails closed. No model or approval is
synthesized to make automatic projection continue.

## Product Outcome

`repo-harness` makes long-running AI engineering work reviewable and resumable
inside the repository while keeping unified workflow helper implementation in
the global package runtime. A maintainer hands Claude, Codex, or a future agent
a GitHub issue and PR. The agent works in an isolated branch or worktree. The
maintainer reviews completion from the issue, PR checks, CI, the PR description
and the claim status comments.

## Primary Users

- Maintainers adopting an existing repository that already has product code.
- Engineers running Claude/Codex sessions across multiple days, hosts, or
  worktrees.
- Reviewers who need a concise human review card plus machine evidence before
  accepting agent-authored changes.

An optional local MCP sidecar can expose the same file-backed workflow contract
to a local MCP client over stdio. Its `planner` and `executor` profiles stay
workflow-scoped and have no shell tool; repo writes need an explicit
`read_write` grant.

## Non-Goals

- `repo-harness` is not a hosted agent gateway, hosted product runtime, or
  database service. The MCP sidecar remains a loopback local process behind an
  operator-managed tunnel.
- It does not replace the target repository's build, test, deploy, or release
  authority.
- It does not vendor unified helper scripts into downstream repositories; the
  canonical helper invocation is `repo-harness run <helper>`.
- It does not treat chat history, SQLite state, or hosted agent threads as the
  durable source of truth.

## Core Invariants

- Durable truth lives in the GitHub issue and PR, `docs/prds/`,
  `.ai/harness/evidence/events/log.jsonl` and `.ai/harness/runs/*.json`.
- Session handoff uses the issue, the PR and the claim comments. No local file
  carries resume state.
- Helper implementation is package-owned for adopted downstream repositories;
  root `scripts/` in this repository are self-hosted source/runtime only.
- No local plan, todo, workstream or contract artifact carries task state.
- Agents may widen scope only when the issue or PR records the wider scope and
  leaves reviewable evidence.
- Verification, review recommendation, external acceptance or manual override,
  and latest trace evidence are required before closeout.
- Hooks remain fail-open observers. The prepare-acceptance gate recomputes a
  policy-base-bound Change Assessment packet over final content; it selects
  high-risk paths and required executable oracles without making Hook journals
  or model judgments into authority. Each risk reason must have an allowed
  oracle covering every selected path or `*`. AcceptanceReceipt remains the
  sole merge authority by recomputing and binding that packet in canonical
  verification evidence.
- Worktree isolation protects unrelated dirty state; agents must not absorb
  unrelated changes from the target tree.
- Continuation surfaces are non-authoritative: the continuation envelope is a
  read-only projection of effective state. The closeout
  journal records operation progress for explicit recovery only (never workflow
  state, never read by state resolution), and attempt receipts are liveness
  evidence that never enter effective state or `progress_token`.
- repo-harness keeps no scheduler, budget ledger or unattended controller. The
  Bot schedules long-running work through the repo-harness CLI and Herdr.
  repo-harness supplies the tools and the evidence for that decision.

## Workflow Surfaces

| Surface | Owner | Purpose |
|---|---|---|
| `repo-harness run <helper>` | Package runtime | Canonical workflow helper execution |
| `repo-harness state next --json` | Package runtime | Canonical pull-based continuation entry: a read-only projection returning one unit or one halt per tick, byte-identical for identical repo bytes and identical attempt-ledger bytes |
| `docs/spec.md` | Maintainers | Stable product intent and safety boundary |
| GitHub issue and PR | Issue owner and implementer | Task identity, claim, dependencies, scope, review and proof |
| `docs/prds/*.prd.md` | Planner | Product intent and acceptance scenarios |
| `docs/prds/DESIGN-*.md` | Designer | Optional design brief and UX guard, used only when the task requests it |
| `.ai/harness/evidence/events/log.jsonl` | Verification Plan executor | Accepted execution events bind immutable runs |
| `.ai/harness/runs/*.json` | Verifier | Immutable run/trace snapshots |
| `docs/reference-configs/ux-feature-guard.md`, `docs/reference-configs/design-options.md`, `.claude/templates/design-brief.template.md` | Conventions | Frontend behavior discipline: freeze rules and non-goals before implementation, product boundary before imagegen variants, taste-class refinement ceiling, role-aware visible-concept declaration; a frontend task cites the design brief when the task requests one, and the runtime `[UXFeatureGuard]` advisory fires only on frontend-scoped feature intent |

## Safety Boundaries

- Hook logic is a guardrail and context accelerator; it must not silently make
  product decisions, merge work, publish releases, or bypass review.
- External knowledge and memory are advisory. Current repo files and live check
  output override summaries.
- Delegated work remains parent-owned: explorer and verifier are read-only;
  worker edits are constrained to the scope recorded in the issue or PR.
- Collaboration remains an untrusted knowledge plane: signals, context packets
  and handoff adoption cannot acquire a Claim, move a Lease, publish or accept.
  The C9 live gate keeps one writer, records exact provider JSONL usage, and
  requires repeated evidence before any persistent same-capability seat can be
  proposed.
- One claimed worktree has at most one writer actor, including the parent
  agent itself. A writable delegated worker must hold an independently
  enforced child grant and settle it before publication. Writable delegation
  is available only when a Worker Host controls both Parent and child mutation
  capability; unmanaged Provider Sessions remain read-only.
- Parent freeze, Worker activation, settlement, and Parent restoration are
  separate crash-recoverable writer-slot states. Transitional or unverifiable
  states admit no mutation or publication and never silently restore a writer.
- Provider threads, transcripts, auto memory, and context summaries are caches.
  Durable module knowledge remains in architecture, research and lessons, with
  any agent memory kept as a rebuildable index.

## Human Review Expectations

Human reviewers start with the PR description, then inspect the changed files,
latest trace, and failed or skipped checks. A pass means the reviewer can see
what changed, why it is in scope, what verified it, what risk remains, and how
to roll it back.

The card is a reading surface, not an acceptance authority. Closeout requires
canonical `## External Acceptance Advice` with `pass`, bound under Review Rubric
v2 to the normalized final-content review subject and current benchmark evidence.
Machine verification is bounded and consumes frozen evidence; it must not launch
providers, adoption, substantive installation, or benchmark production.

Before semantic review, reviewers use the prepared `ReviewSelectionPacket` to
focus on selected paths, the closed reason set, and declared test/readback oracles.
The packet is bound to the exact final subject and policy target revision; a
reviewer disagreement may escalate it but cannot weaken it. The overlay takes
effect only after a fresh `verify-sprint --prepare-acceptance` rebinds it into
canonical evidence; a stale prepared packet cannot finalize. `pattern_novelty`
is driven only by abstraction-shaped additions relative to the policy base.
Release runtime
readback is a separate release check, never a task AcceptanceReceipt field.

## Acceptance Scenarios

- An existing repo can adopt the harness and generate `docs/prds/` and
  `tasks/lessons.md` without plan or task scaffolds.
- A standard downstream init or migration does not create repo-local
  repo-harness helper scripts under `scripts/` or `.ai/harness/scripts/`.
- A GitHub issue with a PR can be implemented, verified and closed using only
  the issue, PR description and CI.
- A fresh agent session can read the issue, the PR and the latest claim status
  comment and resume from the exact next step.
- A maintainer can reject or accept an agent change from the PR description and
  the machine evidence.
- The issue/PR loop can drive work to completion using only `repo-harness state
  next` output; an interrupted closeout is recoverable explicitly without
  duplicating push or merge; two consecutive no-progress turns halt the loop
  instead of spinning.

## Canonical Terms

- **Issue flow (IPDD)**: Issue/PR-driven development. The GitHub issue and PR
  own task identity, claim, dependencies, status and proof.
- **PRD**: The product-intent document under `docs/prds/*.prd.md`. It supplies
  context and acceptance scenarios. It does not approve or track work.
- **Design brief**: The optional `docs/prds/DESIGN-*.md` document that records
  the UX guard only when the task requests design work.
- **Fact home**: The single repository location that owns one class of durable
  fact, as listed in `assets/skills/repo-harness-issue-flow/SKILL.md`
  § Where each fact lives.
- **Capability**: A functional block registered in the capability authority
  selected by `.ai/harness/policy.json#context.capability_source`. The
  `registry` source resolves paths by longest-prefix match. The `archcontext`
  source resolves them through `archctx resolve`. A capability owns local agent
  context and ownership boundaries for the files under it.
- **Acceptance verification observation**: The immutable record the acceptance
  authority writes for itself inside the same transaction that records an
  AcceptanceReceipt. It freezes what only that authority can prove — the live
  normalized review subject digest, the verification-evidence fingerprint, the
  contract and goal bindings, the target ref and revision, the disposition, and
  the archive-projection seal digest when one applies. It is keyed by subject
  (`sha256` of the contract file plus its acceptance fingerprint) rather than
  content-addressed, so one contract subject has exactly one current
  observation and re-recording the same subject overwrites it while a changed
  contract lands under a different key. Readers verify identity, canonical
  bytes and the derived observation id; they never recompute the acceptance
  verdict.
- **Delegated worker grant**: A non-transferable child mutation permit under one
  current task claim and one exclusive worktree writer slot. It is not a second
  task Lease and cannot authorize publication or acceptance.
- **Task profile**: The declared execution shape of a contract (for example
  `code-change`) that determines which verification and delegation rules
  apply to that task.
- **Refactor recommendations**: Evidence on demand. No hook scans for them.
  The Bot reads `repo-harness refactor recommendations --json` and decides
  whether to schedule work or ask the user.
  `repo-harness refactor recommendations` shows each open suggestion with the
  metrics and bounded evidence of its observation and the statistics of the
  affected modules. Open suggestions are the ArchContext `open` records plus
  unrecorded scan candidates. `repo-harness refactor decide` records the
  user's accept, defer or reject decision in one ArchContext call.
  `--import-node-limit` applies to both commands. `--timeout-ms <ms>` (default
  120000, range 1000..600000) also applies to both commands. repo-harness never
  executes a refactor and keeps no local delivery state. An accepted suggestion
  enters the normal plan and pull request workflow. Incomplete code facts are
  reported, never synthesized.
- **Cutover Closure**: The provider-independent gate asserting that every
  declared old implementation, caller, fallback, test, document, and
  compatibility window of a replaced surface has an explicit disposition, and
  that nothing declared removed still exists at the candidate head.

## Execution boundary invariants

- repo-harness dispatches no controller work and executes no refactor. The Bot schedules through the repo-harness CLI and Herdr; an accepted refactor suggestion enters the normal plan and pull request flow.
- Live canonical Sprint carriers share one Task ID namespace, including completed rows in a live Sprint. Archived carriers are excluded. Canonical readers and proposed materialization validate the same invariant before shared Lease/message use or publication.

## Persistent generic acceptance review

`repo-harness review round/status/close/cancel` uses the existing task-agent runtime and fleet deep-reasoner in a dedicated linked checkout. The caller supplies `{endpoint, parent_pane}` and the reviewer checkout; review starts only the fixed Node >=24 OAR application host inside a visible Herdr pane and never starts a server or a second native launcher. Default selection uses an existing typed task binding for the parent pane and chooses its opposite harness. Unknown owner requires explicit `--harness`. Only preflight executable absence permits reported fallback; explicit selection and every post-intent failure refuse fallback/replay.

The acceptance context binds the stable campaign, approved admission and grant, fresh provider goal identity, Git subject including untracked content, target revision and prepared verification fingerprint. Each numbered request freezes that context. The provider writes the exact request's Result file; immutable task-agent collection precedes domain identity, verdict and stable finding validation. The trusted host consumes completion and model observation from the OAR Session API and writes control evidence only in the owner's protected review journal. The owner binds actual harness/role/model from that journal to the reviewed Result; reviewer-authored outbox observations are never read as authority. Ready, request acknowledgements and disposal acknowledgement use the same protected journal. Missing, failed or ambiguous completion fails closed. The generic-review Receipt has no launcher fields and remains equally writable/verifiable by headless domain callers. History and idle never grant acceptance.

Three changed-subject repair rounds share one task-agent binding; every prior finding stays open or becomes resolved. Durable request intent prevents unknown delivery from consuming a new round. Initial creation uses the existing semantic-review admission. Fleet model/effort and the exact result-write communication exception are passed through OAR SessionOptions; the fleet RECOMMENDATION-first message remains unchanged. No vendor argv, native-log or TUI parser belongs to this application. The trusted Node host retains owner write authority and starts with --disable-sigusr1. An immutable owner-held executable launcher is probed through OAR's installation API; it forwards OAR's arguments unchanged through /usr/bin/sandbox-exec to the native reviewer. The reviewer and descendants cannot write outside the canonical output tree except /dev/null, send signals to the host or connect to Unix control sockets. TMPDIR stays output-local. The host deletes inherited OAR_CODEX_SANDBOX before Session creation: stock OAR selects danger-full-access, with cwd=output and the admitted child OS policy as the write authority. A missing/changed profile, launcher or unproven child denial prevents Session creation. Zero-model native-protocol fixtures prove this transport and control boundary without asserting a real model opinion. Optional narrow pure-state grants cannot overlap protected authorities; settings/hooks/trust/instructions/definitions/credentials remain denied. Stock OAR Claude bypass is allowed only under that proved OS boundary. Claude's system/init-only model projection cannot certify its actual gateway backend and therefore cannot mint a Receipt. Unsupported platforms fail closed. Native behavior, hooks, complete payload ingestion and forced host-loss cleanup remain unverified.

`close` re-verifies the current passing Receipt and exact final accepted round before requesting OAR Session.dispose, proving its acknowledgement and execution-owner exit, then task-agent owned cleanup. `cancel` permits cleanup without acceptance. All identity/ownership cleanup remains task-agent's responsibility; attached user objects are never closed. Before upgrading, drain old sessions with the previous version and archive old evidence read-only. The retired command returns upgrade-required; old source labels have no current Receipt reader or alias. Cross-review CLI/core/runner remain an independent advisory path and their retirement is a separate scope after E2 merges.


The zero-prompt native startup probe used real HOME and SDK launch/dispose:
Claude 2.1.284 returned a Session despite denied state/plugin/trust writes;
Codex 0.160.0 app-server exited with probe-window OS denials for root SQLite
state/log/goal files and WAL/SHM. No native directory grant is justified by the
first case, and the mixed ~/.codex root is not opened for the second. Codex is
unsupported under this current profile; neither startup probe certifies real
review/model execution. skipLibCheck is explicitly approved: all declaration
bodies, including src/operator-web/styles.d.ts, are unchecked while strict
source/test checking stays enabled.


23:07 Codex admission is narrow: tmp subpath plus six state/log SQLite literals,
with root/tmp/file symlink refusal and protected-authority overlap checks. The
single zero-prompt recheck still exited: goals, memories/queue SQLite and
installation_id writes were denied. Those paths remain closed; no retry or
additional grant. Codex stays unsupported and Claude's prior init-only-model
limitation is unchanged.


23:29 adds only goals/memories/queue SQLite families and installation_id as ten
literals. Aimpact accepts the unverified later-session goals/memories channel.
The single zero-prompt recheck still fails thread/start: the OS denies
thread-writer-locks/.coordination.lock. No additional grant or relaunch; Codex
remains unsupported. Real turns/further paths remain unverified.


23:56 adds only thread-writer-locks as a subpath. The single zero-prompt SDK
constructor/dispose succeeded, but new model-cache, shell-snapshot, plugin and
thread-history writes were denied; all remain closed and the probe stopped.
This is startup/disposal evidence only, not real-turn readiness or Receipt
certification. No plugin or broader root grant is implied.


2026-10-03 00:27 replaces every real Codex state grant with owner-prepared
output/.codex-home. Only auth is copied (exclusive/no-follow, 0700/0600), only
access exp is checked against the run window, and CODEX_HOME is passed through
OAR SessionOptions.env. No config/trust/instruction copy; auth/config writes
remain denied. Owner deletes the copy on close/cancel/start failure/timeout;
failed deletion is cleanup_pending. One zero-prompt startup and one authorized
round18 production Codex review/Receipt write+verify passed in a disposable
private session. This certifies that observed runtime/fixture path, not backend
identity, future versions, network isolation, refresh safety or Claude Receipt.

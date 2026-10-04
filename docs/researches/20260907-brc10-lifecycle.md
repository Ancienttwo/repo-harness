# BRC10 campaign invocation and recovery

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Implementation baseline: main `a3fb4db2b9f411d6e7bc5184807275e9aa471378`. Acceptance is owned by the BRC10 lifecycle work-package; the Sprint row remains pending until that package finishes.

## Entry and authority

`repo-harness run contract-run run --repo <acquired-worktree> --contract <contract> --campaign-handoff <selector.json> --campaign-provider codex-exec` consumes the stored BRC9 handoff. It validates the original WorkEnvelope, ClaimActor, current Engineer Binding, campaign grant, exact contract and parent. Caller command/model/effort overrides are excluded in this mode. Standalone raw-command runs retain their explicit command contract and never acquire positive provider-terminal evidence.

The tracked `.codex/agents/fast-worker.toml` and `gatekeeper.toml` supply actual model, effort, developer instructions and sandbox. The worker uses workspace-write; the verifier remains read-only. The invocation binds the real executable bytes/version, fixed argv, profile bytes, prompt, role, Task revision, Claim, Lease generation and Binding generation. The verifier's campaign response format is an explicit JSON verdict and Markdown review; the parent persists it. Exit zero cannot override a FAIL verdict. Generic read-only delegated capabilities are not widened.

The existing bounded supervisor owns process-group termination and stream observation. In split-stream mode it hashes stdout/stderr as received from the actual child pipes, separately from writable log files. Provider parsing requires matching captured-stream digests and complete streams. Exactly one successful Codex turn, completed operations and the scoped POSIX quiescence result are required. Unsupported or unknown operations remain unknown. A completed `command_execution` may leave a detached descendant with redirected streams, so its Provider result can complete normally but its `runtime_effect_inactive` remains unknown. Automatic reclaim refuses every such invocation; original process-group absence is never upgraded into descendant containment. The receipt describes the managed invocation; it is not a general assertion about arbitrary remote operations or unrelated processes. Windows process-group absence is unproven and cannot enable automatic reclaim.

## Durable lifecycle

The campaign planning journal is the only new-record location; no scheduler, service or additional store root is added. The existing budget store reserves the complete worker-plus-verifier attempt before any child. The handoff creation arms exact-generation liveness before returning the acquired dispatch.

Each role has immutable invocation intent, started and terminal records. Started is written under the same group planning lock as the dispatch retirement fence, before spawn. A crash after started and before terminal is unknown, including a crash before the operating-system spawn. Retirement stops further admission, renewal and final publication by that controller; it does not claim OS death. A late child may still publish its observed terminal so a subsequent recovery can reobserve it.

The recovery observer joins these actual records with current Lease publication state, Engineer Binding and the original ClaimActor. Neither TTL nor a synthetic local runtime ID supplies positive inactivity. A retired dispatch with no admitted child is a positive never-started case; an admitted raw command has no provider terminal and remains unresolved. `completing` and `reviewing` retain publication recovery protection.

## Reclaim and re-entry

`repo-harness run contract-run recover --repo <worktree> --campaign-handoff <selector.json> --campaign-parent-host <codex|claude> --campaign-parent-session <stored-parent-session> --json` is the recovery entrypoint.

It fences the exact dispatch, observes expiry and the five existing #286 evidence fields, then persists a recovery intent containing one new Claim ID and the exact signed eligibility receipt bytes. The JSON bytes are retained as a string because the owning receipt's digest includes serialization order; the planning store's canonical serialization must not rewrite that preimage. Existing `automaticReclaimLease` reobserves eligibility under the Task lock and performs the normal generation-incrementing steal.

Restricted Fleet recovery revalidates the canonical Task/plan proof, repository grant and actual worktree topology, then binds only the original worktree, branch and unit. It accepts only the original or its intended replacement claim token. The current Engineer Binding and original stored actor receipt must match before the next generation's ClaimActor is published. No ordinary acquisition, worktree creation, plan projection, source reset or replacement child occurs.

Intent, steal, bind, token, actor and recovered-envelope writes are replayable under the same identity. A foreign generation refuses. An already persisted final can settle its original reservation/result once after exact rebind; a missing final returns `reconciliation_required` and the CLI exits nonzero. Recovery is not a successful execution result.

## Verification scope

`tests/unit/brc10-lifecycle.test.ts` covers provider event ordering, outstanding operations, supervised stream separation/digests and closed verifier responses. `tests/effects/brc10-lifecycle.test.ts` uses actual OS processes with a clearly marked provider fixture, original campaign acquisition, competing recovery callers, changed log bytes, started-without-terminal refusal, every rebind crash boundary, and interrupted-final settlement. Fixture results do not claim real model reasoning or semantic acceptance.

A separate disposable real Codex `0.153.4` transport probe returned the requested JSON through the same argv builder and bounded supervisor. It used a no-tools prompt and produced no implementation review. This confirms installed CLI parameters and the observed event format, not general remote-effect termination or final code acceptance. Final exact-subject evidence is the work-package's canonical prepare run and PR/main CI.

## File and dependency rationale

No dependency was added. `src/core/automation/campaign-runtime.ts` owns the shared invocation identity validated by producer and recovery. `src/effects/automation/campaign-runtime.ts` owns actual executable/profile/stream observation. `src/effects/automation/campaign-recovery.ts` joins those producers at the existing Lease/Fleet/Engineer boundaries. The existing worker and helper mirrors remain the execution path; rebind stays in the existing Fleet and Engineer owners. At larger scale, group-lock contention and retained evidence volume grow first; this change does not invent a new global queue or automatic garbage collector.

# Controlled replacement of a stopped, never-adopted successor campaign

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Subject: `src/effects/automation/campaign-authoring-resume.ts`, `src/effects/automation/gpt-pro-issue-authoring.ts`, `src/effects/automation/campaign-fresh-audit.ts`, `src/effects/automation/issue-batch-store.ts`, `src/cli/commands/campaign.ts`.

## Fact correction: adopt does not move the target tip

`publishIssueBatch` writes a candidate ref `refs/heads/codex/campaign-adoption-<intent>` and refuses when the target moved; it never fast-forwards the target. Any runbook that reads adoption as a tip-moving step is wrong, and the correction matters because it decides where `start_group` belongs.

## Frozen lifecycle order

`prepare_group` -> verified revision observation -> author (+follow-up) -> adopt (challenge, reconciliation, formal publication) -> `start_group` -> planning / acquire / Docker worker / verifier -> PR and manual merge -> closeout -> fresh audit -> `accept_group`.

`requireCampaignGroupTransition` enforces the adopt-before-start edge. The guard runs inside `appendLocked`, after the compare-and-set and before the event, transition index and current projection are written, so a refused start leaves the event-file count, transition-file count and `current_sha256` identical. A group with no persisted issue batch intent is refused rather than assumed adopted: the intent is the group key, so its absence means there is no adoption to prove. `issue_author` is a `'gpt_pro'` literal in `ProgramAuthorizationV1`, so a non-gpt_pro campaign is unconstructible and no narrowing branch exists for it.

## Replacement record semantics

The failure this closes: a successor bound as the predecessor's `continuation` and then formally stopped without adopting made every later recovery impossible, because the binding artifact is exclusive and immutable, and the resume prompt derived the previous marker from the resume source, demanding a marker the remote Issues no longer carried.

The fix expresses "old successor invalidated, new successor holds the sole continuation right" as a typed record rather than a rewrite:

- Artifact family `superseded-<hex>` on the predecessor group, where `hex` is the superseded successor's `intent_sha256` tail. `continuation` is never rewritten; the superseded intent, grant, stop event, authoring sessions and budget run all stay readable.
- `CampaignContinuationReplacementV1` carries the superseded successor's stop event digest, campaign current digest, automation run id, budget current digest and ledger digest as pointers plus attestations, never copied counters, together with the sorted digests of its verified authoring sessions and the sorted union of the slots those sessions marked.
- `created_at` is the replacement successor's intent `created_at`, not a fresh clock read, so a crash between the resume-source write and the replacement write reproduces identical bytes on retry and the immutable store treats the retry as a no-op. A changed request produces different bytes and fails closed.
- The predecessor group's authoring lock plus artifact-path immutability serialize competing successors: the first replacement wins, the second is refused before any provider dispatch.
- `resolveEffectiveContinuation` is the single resolution consumed by both the binder and `assertResumedAdoption`. Without it the writer would say "new" while the adoption check still said "old"; with it a superseded successor can never adopt. The walk is bounded at eight hops with a visited-set cycle guard, and an inconsistent, cyclic or over-long chain fails closed.
- `assertReplaceableStoppedSuccessor` performs zero writes and reads only canonical stores. `stopped && !adoption` is necessary but not sufficient: it also requires zero successful acquisitions, no open reservation, no budget drift, no active controller step, no reserved provider call, no local planning session, every authoring session completed and verified, no provider mutation with an unknown result, no staged authoring seal without its budget terminal, and a budget run bound to the campaign's exact grant.

## Two authorities, not dual authority

The source adoption remains the only authority for slot, opaque GitHub database ID and Issue URL. The superseded chain's verified authoring evidence is a separate authority for the last confirmed remote modification, projected into a `previous_markers` array ordered most recent first. The authoring prompt requires the provider to read each exact URL, confirm the database ID, confirm the body carries exactly one repo-harness marker drawn from that entry's `previous_markers`, report which one, and stop without editing on any other marker, a missing marker, multiple markers or an unreadable body. The downstream exact gate in `issue-batch.ts` still demands the new campaign's marker, so the widened accepted set never widens what adoption accepts.

The array is built idempotently: a retry after an interrupted replacement finds its own link already in the chain, so the requested successor is prepended only when the chain does not already carry it. Without that, the retry would render a different prompt, a different intent digest, and poison its own campaign id.

## Ledger continuity

One deterministic budget run per campaign id. A replacement writes nothing to any prior run; the superseded run stays byte-for-byte and readable forever, and the replacement record names it so cumulative chain consumption can be summed rather than reconstructed. Each replacement campaign carries its own grant, so no cap is inherited and no authorization is reused.

## Operator surface

`repo-harness campaign prepare-resume` projects the resume request from stored adoption, continuation and budget evidence with no provider call: it rebuilds the Issue identities from the stored adoption receipt, runs `validateAdoptedResumeSource` against the exact successor target revision, runs the replacement eligibility check when a superseded successor is named, writes the request with `wx`, and prints the source campaign state, the effective continuation, the superseded chain, per-run chain consumption and a verdict. The emitted file is a request; admission re-derives every field.

## Field state

The packaged-delivery successor in the canary repository is the shape this closes: verified authoring and follow-up with remote markers already updated, no adoption, no publication, and a formal stop. Under the new `start_group` guard that shape can no longer reach `group_running`, so the reachable stopped-and-never-adopted successor always stops from `group_preparing`; the eligibility predicate is identical either way.

## Repairing an expired superseded run before prepare-resume

A successor that stopped while quiescent keeps aging: once its budget deadline passes, the run reports drift `unsealed_exhaustion` -- counts that agree, no open reservation, and no stop receipt for the expiry that already happened. `assertReplaceableStoppedSuccessor` requires `drift === 'none'`, and a run that is over has no business verb left to reconcile it, so the replacement is refused with "a replaceable successor must have no acquisition, no open reservation and no unadopted budget record".

The operator step is to seal that receipt explicitly before preparing the replacement:

```bash
repo-harness automation budget repair --repo <path> --run <superseded-automation-run-id>
repo-harness campaign prepare-resume --repo <path> ... --superseded-campaign-id <id> ...
```

`automation budget repair` takes the run lock and performs only the reconciliation every mutating verb already performs on entry: it seals the exhaustion receipt and reserves, charges and re-caps nothing, and on a run whose drift is already `none` it is a plain read. The eligibility gate stays strict -- drift remains a refusal, and the replacement is admitted only against a run whose stop is now a sealed record.

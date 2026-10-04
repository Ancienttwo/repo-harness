# BRC15a authoring/adoption alignment

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The real shadow canary created ten Issues but admitted none. Its evidence remains in the independent `brc15a-real-shadow-canary` package; this correction does not revise its receipts or acceptance.

## Authoring contract

`src/core/automation/issue-batch-reconcile.ts` owns metadata field names and priority bounds. Its authoring schema supplies integer priority 0–100, the exact capability vocabulary, unique sorted arrays and slot references. Both initial authoring and fill/edit continuations include it. The parser remains strict: strings such as `P1` and invented capability aliases are not coerced.

The new `campaign-capability-registry.ts` is shared by the two actual consumers, authoring and adoption. It reads ArchContext nodes and directory existence from the immutable campaign revision using Git; current working bytes are not authority. Missing or empty authority refuses before authoring intent persistence and budget reservation. The helper adds no dependency. Its catalog cost grows linearly; it must not silently truncate IDs at larger scale.

## Complete snapshot startup

Campaign startup now rejects external-source `issue_numbers` selection. A finite list cannot prove absence of a missing or duplicate batch Issue. Use the existing `labels` selection policy with manual intake and sufficient page/Issue/byte/deadline limits before minting the campaign grant. The observer already fetches complete repository pages, while the campaign marker owns batch selection. Completeness still fails closed when pagination or resource limits prevent a full snapshot; startup acceptance is not a promise that a later snapshot will succeed.

The old canary target and grant are immutable and are not rewritten by this correction.

## Model and effort authority: still unavailable

Read-only trace of Oracle candidate `26e12021f9593d7ac4ede7b252099653f1b4aca8` found:

- `src/sessionManager.ts` allocates the final provider session ID; `--slug` can gain a collision suffix. `--write-output` contains answer text only, not a structured result handle.
- `browser.modelSelection.verified` records picker selection. `options.model`/`effectiveModelId` are exact model keys; requested/resolved UI labels are not substitutes.
- `src/browser/actions/thinkingTime.ts` obtains a structured outcome but `ensureThinkingTime` returns void. `BrowserRunResult`, `BrowserExecutionResult` and session metadata contain no verified effort outcome. Requested `thinkingTime: pro` is configuration, not observed proof.
- repo-harness `oracle-provider.ts` currently obtains the provider ID from a console line that was absent from the real run, and `session-store.ts` writes `model.verified: false`.

Consequently this package deliberately retains unverified model status. Completed answer text, model picker success, or a console provider ID cannot authorize verified Pro adoption. A browser regression explicitly preserves this refusal. The next bounded producer change must export the final session ID structurally and thread observed effort through Oracle's run and persisted metadata; its consumer must bind exact session/model/effort before setting verified. Old canary receipts must remain unverified even after that future change.

## Verification boundary

Two red regressions captured the prompt omission and late snapshot refusal before edits. Focused tests cover initial/fill/edit prompts, frozen versus dirty registry, missing authority before I/O, startup complete policy, strict reconciliation, shadow adoption/store and browser refusal. Final evidence is recorded in the task review through canonical prepare-acceptance, together with type checking and six repository integrity checks. No full suite or live provider invocation is justified by this bounded delta.

BRC15a business acceptance, trusted exact-revision readback and BRC14/BRC15 remain pending. This package is a prerequisite correction, not a successful real canary.

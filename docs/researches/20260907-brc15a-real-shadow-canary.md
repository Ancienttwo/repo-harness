# BRC15a real GPT shadow canary

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Status: approved replacement run completed real GPT authoring and independent readback; both campaigns are stopped with zero open reservations. Ten Issues cover the expected markers, but zero pass metadata validation and adoption is refused. No qualified adoptable batch was obtained; repair value is unassessed. BRC15a is complete as a negative observation. The Owner subsequently approved continued investment; active acceptance remains gated independently.

The private target is Ancienttwo/repo-harness-brc15a-canary-20260907, seeded from tracked repo-harness 33c5012e1185a695fdaf54a7bb84fc613cfb653b with fresh history and no GitHub workflow automation. Production working-tree changes were excluded. Target initialization commit: 33d692aaa0ab593df0c160082b18fdac02c82e9c. Remote private/main readback passed, initial Issue inventory was empty, and target working tree was clean before mint.

Only the target browser binding uses Profile 13. Grant limits: one group, ten slots, two authoring rounds, 64 provider calls, 16 controller steps and 2700 seconds from issuance. No active task, Claim, worker, repair, PR, merge, Issue closure or release is permitted. Exact-SHA verification remains unverified; action availability and local Git identity are not trusted provider execution proof.

## Evidence to record

Actual grant and campaign identities, ledger/reservation outcomes, authoring session, independent observation counts, dry-run adoption, missing/duplicate/unjudged slots, human intervention, elapsed time, and subsequent user investment decision. A negative observation is retained; no replacement grant or synthetic Issues may conceal it.

## Authorized run

- Grant: `36647fc2e785cc52235e0fcd2eee4a200f1e69827151775f9c5207de696e618c`; issued `2026-09-07T13:09:03.819Z`, expires `2026-09-07T13:54:03.819Z`.
- Campaign: `brc15a-20260907-shadow`; repository `repo_3b81945f21334250`.
- Automation run: `92a3e22794595f6911d7d8a1dd1ba2ba9978c47ffcd32f464a1464aff9a61352`.
- Initial authoring invoked via installed `repo-harness campaign author`, mandatory gitleaks scan and Oracle copy-profile transport. At first observation one provider reservation was open, zero completed calls; this is dispatch evidence only.
- Contract structural check and six declared repository integrity checks passed during setup (11/11); final evidence acceptance remains pending.

## Observed result

The initial provider invocation ran from intent creation at 13:09:37Z to persisted failed browser result at 13:10:28Z, approximately 51 seconds. Oracle 0.18.0 reported `Thinking time: option not found (requested Pro); refusing to submit without confirmed Pro.` The diagnostic showed the current `Thinking effort` menu with `composer-model-picker-slider-simple-view` and visible `Pro, 5 of 5`; Oracle still could not verify the requested selection. Visible text is not grounds to bypass the model verifier.

- Session: `chgpt_20260907_211028_brc15a-20260907-shadow-group-1-issue-authoring`.
- Intent: `sha256:c163340835361b30dac02901e39db96afb7406a695599a669256c30db6c28654`.
- Session receipt: `sha256:eba15c2a08884e512bdf30b6ec53d3d9204ee0e6e484446134f9779d750d0ad1`.
- Browser status failed, model verified false, reattachable false. Mandatory gitleaks 8.30.1 scan passed.
- One initial authoring invocation attempted; zero successful authoring rounds. Prompt was refused before submission, so no Issue authoring was executed by this invocation. Ten slots remain unjudged; duplicate and quality rates are not measurable. Initial GitHub inventory was zero; no post-run Issue observation succeeded through the campaign observer, so no independent final inventory claim is made.
- `campaign adopt --dry-run` refused with `issue_adoption_reconciliation_required: completed initial authoring session is required`. No Task/Claim/WorkGraph publication or worker was reached.
- Budget projection retains one open provider reservation: provider_calls consumed 0, reserved 1; event_count 0. This is not a free or successful call. Current authoring code appends usage only for completed results; failed browser output is insufficient for us to invent a terminal charge or release the reservation.
- Canonical transition `require_reconciliation` was applied using the exact current digest and failed session digest. No follow-up, second grant, local Issue creation, repair, Issue close, PR, merge or release was attempted.

## Interpretation and remaining boundary

This run proves that the current installed Oracle model verifier cannot execute the approved authoring path on the observed UI. It does not measure GPT Issue quality, Connector write access to this target, exact-SHA authority, or canary business value. Browser transport readiness is the immediate prerequisite. The independent BRC6a trusted revision producer and BRC14 audit/acceptance producers remain pending.

The next bounded slice is Oracle model/effort verification against the actual new slider UI, with a deterministic pre-submit regression and terminal-result reconciliation evidence. Do not bypass Pro verification or retry this reserved invocation. User investment decision remains unrecorded; this document cannot close BRC15a or authorize another grant.

## Recovery after user instruction to continue

P1: the failure belongs to external Oracle `src/browser/actions/thinkingTime.ts`, not repo-harness campaign authoring semantics. The installed file was byte-identical to the build of npm 0.18.0 source commit `083bba7e61f487ad3d99b42039d9f603f61dc4ff`. The UI has an active simple power panel, a Power keyboard control, a hidden numeric slider and an `aria-describedby` announcement, rather than the expected effort submenu. Initial raw `.click()` probes did not open the Radix menu; replaying the actual Oracle selector without prompt submission reproduced the original failure and captured the owning controls.

P2: explicit Pro -> ensureThinkingTime -> no matching flat row -> no Effort submenu -> option-not-found -> pre-submit failure. The new selector reads the active panel's unique control, checks its numeric range and linked `Pro, 5 of 5.` announcement together, and verifies each ArrowRight transition. It rejects contradictory/missing evidence, disabled controls, locked slider ancestors and duplicate active panels. Model-list text cannot satisfy this check.

P3: keep this adapter fix in the Oracle producer, without changing campaign prompts, model verification requirements or global installation. The supported environment override selects this exact isolated candidate for a subsequent authorized run. This patch handles the observed English five-position Pro control; unfamiliar labels/shapes still refuse. At larger volume it adds no per-run persistent authority or unbounded polling.

- Oracle candidate worktree: `/Users/ancienttwo/Projects/oracle-wt-brc15a-pro-slider`, commits `749cab6a` and final `26e12021` on `codex/brc15a-pro-slider`.
- Fix scope: `src/browser/actions/thinkingTime.ts`, its existing regression suite and CHANGELOG. No new dependency.
- Red: six newly added power-control cases failed on unfixed source. Green: 150 tests across thinkingTime and both modelSelection suites; full TypeScript check, build, focused lint and formatting passed.
- Real browser checks used Profile 13 copies and only the selector: preselected Pro verified; then numeric value 3 was established with ArrowLeft and the patched selector verified transition to Pro. Neither probe submitted a prompt. Those two live probes cover 749cab6a; the subsequent bounded disabled-ancestor guard in 26e12021 is covered by its focused regression and is not claimed as a repeated live probe. Temporary copied profiles were closed and removed by the probe's own finally handler.
- Existing `browser-doctor` resolves the candidate via `REPO_HARNESS_ORACLE_BIN=/Users/ancienttwo/Projects/oracle-wt-brc15a-pro-slider/dist/bin/oracle-cli.js` and reports required capabilities ready. This doctor result is capability evidence only; the separate selector probes supply live UI evidence.

### Exact reservation reconciliation

The provider invocation did run. Its failed session was passed to the existing `reconcileAutomationReservation` API with `reconciled_reserved` and `provider_failure`, binding the exact session digest and charging the full reserved upper bound. No zero-usage or GPT-completion claim was made. Current ledger: provider_calls consumed 1 / reserved 0; provider_failures consumed 1 / reserved 0; open reservations 0; event count 1; ledger digest `af574fc60194143188f313f913a09ac133594df7c2cba2a58b66d5e5f174b1ad`. The campaign was then canonically stopped against its exact current digest. Original failed session and charge remain immutable.

### Replacement-run proposal (subsequently approved below)

Reuse the same private target and exact head, Profile 13 and pinned candidate. New identities: campaign `brc15a-20260907-pro-slider`, authorization `brc15a-20260907-pro-slider-grant`. Request only the remaining one authoring round, at most 63 provider calls and one provider failure; keep one group / ten slots / 16 controller steps / shadow only, with a fresh 45-minute expiry from mint. All other grant bounds and prohibitions remain as originally approved. This preserves the original cumulative two-invocation authoring ceiling and 64-call ceiling. No follow-up authoring after this remaining round. The original plan explicitly disallows an automatic second grant, so this proposed mint needs a new user authorization. Successful selector probes cannot replace real GPT authoring or the eventual user investment decision.

## Approved remaining-budget run, 2026-09-08

User explicitly approved the proposed remaining-budget grant. Minted authorization `0d6772fe95ff0bbb87c011e0acdf25e548a1aea8b0c3a464be631401e0278a4b`, issued `2026-09-07T17:08:21.619Z`, expires `2026-09-07T17:53:21.619Z`. Campaign `brc15a-20260907-pro-slider`; same private repository and unchanged target commit. Limits: one authoring round, 63 provider calls, one provider failure, 16 controller steps, shadow only. Oracle candidate HEAD `26e12021f9593d7ac4ede7b252099653f1b4aca8` was clean. Real authoring invoked once through the supported binary environment override. Outcome recorded below.

## Replacement-run result

The real authoring invocation completed with session `chgpt_20260908_013100_brc15a-20260907-pro-slider-group-1-issue-authori`, intent `sha256:f4aa3b1df08285847fa6bc808a69a7dea669d3be6b1c1319c8eeeeccfa23c540`, and session digest `sha256:20621f970ccaeb647d56d6b3c156f733eda9f2647c1691e2f768ed6b6d62c1cd`. Oracle elapsed 21m58s. The ten GitHub records were created at 17:14:36–17:15:38Z, roughly 6–7 minutes after launch.

### Conversation ownership and human intervention

Oracle initially bound conversation `6a9eefe0-d188-83ea-afc4-27bb35defd72`. A later read-only inspection found the same browser target displaying a different conversation, `6a9ef008-1420-83ea-9575-a7f061c2d577`, whose reply claimed zero new Issues and merely existing slots. The extractor returning null on that page was correct: its expected conversation guard rejected the mismatch. The initial suspicion of a broken response extractor was withdrawn. Who changed the conversation is not established; do not attribute the navigation to Oracle, the user or another agent without evidence.

One operator intervention navigated that owned browser target back to the exact originally bound URL. Its actual reply described creating slots 01–10; Oracle then captured it and exited successfully. No prompt was resubmitted or follow-up sent by this execution session. The other conversation's output is not accepted as this run's result. Both recorded Oracle controller/Chrome PIDs were absent after completion.

### Independent GitHub readback

One request through `createCampaignProviderExecutor.read` fetched the dedicated repository's all-state Issue page with page size 20, 30-second timeout and 163840-byte buffer. The response was HTTP 200 with ten records and no next-page Link. This is an independent budgeted audit; it is **not** a canonical adoption snapshot or acceptance receipt.

- Issues #1–#10 are open and are not PR records; all have matching created_at/updated_at at observation time.
- Existing `declaredIssueBatchSlot` resolves exactly slots 01–10, once each: ten present, zero missing, zero duplicates, zero unexpected marker slots in that page.
- Existing `parseIssueBatchMetadata` returns null for **10/10**: every priority is a P1/P2/P3 string while the protocol requires an integer 0–100. The emitted capability names also match none of the exact target's node IDs. Named suspected paths do exist at the frozen commit, but many are broad directories; this does not establish a real defect.
- Root-cause and repair usefulness were not experimentally validated. Counts prove real writing and marker fidelity, not ten useful or adoptable tasks.

### Admission defects and own setup error

1. The raw Oracle model-selection metadata reports GPT-5.5 verified and Pro selection succeeded, but the repo-harness browser result and authoring session project model verification as false/unverified. `campaign adopt --dry-run` returns `issue_authoring_session_unverified`. The stored session was not edited to bypass this.
2. The target policy selected explicit Issue numbers. `observeIssueBatch` rejects that policy as `issue_provider_snapshot_incomplete` because it cannot prove a complete batch. This is the orchestrator's canary setup error, not a claim that the product should accept incomplete snapshots. No frozen target policy or grant was rewritten.
3. The authoring prompt names metadata keys but omits the numeric priority contract and the authoritative capability vocabulary. The real output fails the actual parser. Preserve parser authority; do not coerce P1 or invent capability aliases to admit these Issues.

The attempted early observation was refused before admission while authoring was pending. After authoring completed, the policy-invalid observation admitted one controller step but performed zero GitHub calls; its persisted policy refusal was used to complete that step as no_progress. A separate budgeted readback then completed as progress.

### Budget and closure

Replacement automation run `c42ce4db0b79ab0d1f3dfddda0a4d920a91cce25a4d919271dd646df726c658f`: harness provider_calls **2** (one Oracle invocation plus one GitHub read), provider_failures **0**, controller_steps **2**, open reservations **0**, ledger events **6**, ledger digest `4cc4de2bb5ad3fb63e1bab8a4f8ecc317d51faed65d5402df10c9c27ea8e8f92`. GPT's internal Connector tool-call count is not measured by that wrapper ledger. Including the prior failed attempt, total harness provider_calls are 3 and total authoring invocations are 2. No second-round authoring or Issue edits were performed in this approved replacement run.

The campaign was canonically stopped against its exact current digest after the readback. No Task/Claim/worker, code repair, PR, merge, Issue close or release was initiated by this execution session. Existing Issues and immutable evidence remain available. Exact-SHA provider proof is still unverified; echoed baseline text and local Git do not replace it.

### Original investment recommendation (before the Owner decision)

Do not advance to active repair on these results. The smallest justified next slice is authoring/adoption contract alignment: give the author the real metadata schema and capability IDs, repair model-verification projection without weakening its authority, and use a complete-snapshot canary selection in the next explicitly frozen setup. First validate those boundaries locally against these real failures. The write channel is proven usable; metadata-qualified candidates are currently 0/10; semantic repair utility is unassessed and conversation ownership needed one manual recovery. No automatic next grant is authorized by this report.

Local evidence digest: `brc15a-github-issues.json` SHA256 `d08da4b4960fef72dc738e7629de4719fb7a26a4fee554a319e4096952a10bb8`.

Local evidence digest: `brc15a-readback-validation.json` SHA256 `6d2641a3c3fcb83e67126ef85d6700682dbd65fdbdc891f899ec10e304921c05`.

Local evidence digest: `brc15a-pro-slider-author-result.json` SHA256 `b5c23c3db1494a968f00be2ff870c1c10712f35e0ef3955f7373141146ed3c6d`.

Local evidence digest: `brc15a-pro-slider-budget-final.json` SHA256 `f9cab8ba2568af52b44f5558be6b92d9ec01fd570f78accf8a15811ffb528738`.

## Owner decision and observation closeout — 2026-09-08

The Owner repeatedly approved continued implementation and directed completion of the remaining BRC work. This resolves the investment decision in favor of continued investment. It does not mint another provider grant or change any runtime admission requirement. Earlier pending statements describe the historical checkpoints above, not the current BRC15a status.

BRC15a closes with the negative result preserved: 10/10 expected marker coverage, zero missing or duplicate markers, and 0/10 valid metadata records. These are not completed slots or a complete batch. Missing-slot follow-up is **0 / not applicable**: there were no missing slots, and the replacement grant authorized only the remaining one authoring round. Follow-up obedience and repair usefulness were not measured.

The three observed boundaries remain distinct:

- Canonical observer invocation returned `issue_provider_snapshot_incomplete`, `outcome=incomplete`, `pages_fetched=0`, because the canary selected issue numbers instead of the required complete provider snapshot.
- The separate budgeted GitHub readback returned ten records and supports the recorded content validation; it is not a canonical observation or revision receipt.
- Adoption dry-run returned `issue_authoring_session_unverified`. No Task, Claim, PR, repair, merge, Issue closure, or active campaign was created by this run.

On closeout, all four evidence digests recorded above were rechecked against the retained local artifacts and matched. The replacement stop artifact names the same run and final ledger digest; open reservations remain zero in the terminal budget projection. The stopped grants are historical evidence and cannot be reused.

BRC15 consumes this observation as Canary 2, including its failures. The accepted alignment and default-model packages address the observed setup/authoring boundaries, but their local checks are not a replacement real canary. BRC14 still owns fresh audit and trusted exact-version evidence consumption; BRC15 still requires active/manual Canary 3. BRC6a remains Owner-closed and receives no additional probe.

Closeout verification: deploy SQL order, architecture sync, task sync, strict task workflow, project-state inspection, and init dry-run all passed. The first architecture check reported a missing provider in the fresh worktree; installing the frozen lockfile dependencies from the local cache resolved that environment prerequisite without changing tracked files. This documentation-only closeout does not rerun model or runtime acceptance.

## Owner clarification and offline replay — 2026-09-08

The Owner narrowed subsequent work to metadata diagnosis and existing safety prerequisites, explicitly separating negative observation completion from batch completion, campaign acceptance and active authorization. The per-Issue replay and Acceptance mapping are in `docs/researches/20260908-brc15a-offline-metadata-replay.md`; they supersede shorthand such as “slots complete” or an inference that zero valid metadata means zero repair value. The mapping must be evaluated on original admission/settlement evidence, never retroactively on the alignment implementation. BRC6a stays Owner-closed with no further probe.

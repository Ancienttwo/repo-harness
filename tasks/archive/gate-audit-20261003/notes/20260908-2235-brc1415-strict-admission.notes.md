# Implementation Notes: brc1415-strict-admission

> **Status**: Active
> **Plan**: plans/plan-20260908-2235-brc1415-strict-admission.md
> **Contract**: tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md
> **Review**: tasks/reviews/20260908-2235-brc1415-strict-admission.review.md
> **Last Updated**: 2026-09-08 22:35
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Admission boundary decision

The current main baseline passed 63 tests. The prepared guard-only change passed 25 tests before adding the adoption consumer assertion. That added assertion exposed the fixture's intentionally unverified authoring session before browser binding, not a production regression. The final assertion preserves that independent refusal and proves zero external calls and unchanged ledger/Git after strict admission succeeds. Real authoring/worker acceptance remains pending a new disposable target and budget.

Final local prepare passed all 14 checks/assertions, including revised 25-case regression, typecheck, runtime source equality and six integrity checks. The first architecture entry only generated missing worktree output and stopped before tests; retry passed. Evidence binding requires committing the newly created contract. Live target/budget authorization and explicit activation-boundary resolution remain pending.

## Authorized AiphaBee execution

Owner delegated target/budget selection and named AiphaBee. Use independent clone of chenrenya/aip-main-open, refs/heads/codex/brc1415-canary; preserve production main and other task worktrees. Shadow observation receives at most two provider calls; only a successful observation permits a new active grant with the remaining thirty-eight and the same overall ninety-minute deadline. Active authoring uses at most two rounds, two Issues and parallel limit two. Manual merge remains an Owner checkpoint. No default model override.

Single directly blocking fix: campaign capability resolution ignored the selected registry authority. tests/effects/campaign-capability-registry.test.ts failed 4/5 before the fix (/tmp/aip-brc-registry-red.log) and passed 5/5 afterward. It now reads only the frozen selected source; existing ArchContext fixtures declare that source explicitly. Five affected suites passed 86 cases in /tmp/aip-brc-registry-affected.log. AiphaBee frozen registry resolves its four actual capabilities. No registry migration or dual read is introduced.

Canonical five-suite run retained 85 passes and one existing 5-second planning fixture timeout, which then observed its disposed repository. The same five suites passed all 86 in development. No production or assertion change is justified: final focused command uses an explicit 60-second per-case timeout, retaining the failed run and allowing one bounded rerun.


## AiphaBee bounded run: pre-submission blocker (2026-09-08 23:11 HKT)

Owner selected AiphaBee and delegated the finite scope. The isolated clone targets chenrenya/aip-main-open refs/heads/codex/brc1415-canary at 0720c399bf157234d04b6940436b196b3ac47607. The allocation is one group, two Issues, two parallel workers, two authoring rounds, manual merge, forty total provider calls and a ninety-minute window ending 2026-09-08T16:34:27.212Z. Only the two-call shadow grant was minted; the conditional thirty-eight-call active grant was not minted.

The source candidate completed fourteen scoped acceptance criteria, including eighty-six affected tests and TypeScript. The final run is .ai/harness/runs/run-20260908T230034-3349-20260908-2235-brc1415-strict-admission.json; its original subject and unchanged Docker evidence remain the only local acceptance claims.

The first shadow observation failed with APP_SELECTION_UNVERIFIED: GitHub: app-not-found. Oracle candidate 14cfbfc6ad6494397e46eac548338ff3e599c21f recorded status:error and browser.runtime.promptSubmitted:false in oracle-home/sessions/perform-a-fresh-read-only/meta.json. No prompt, authored Issue, task worker, active campaign, merge or deployment resulted. The original failed session remains unchanged. A separate no-send Work Chrome inspection showed Chat/Work surfaces and an installed GitHub entry at https://chatgpt.com/plugins; this is UI readiness evidence only, not proof of the copied Oracle profile or repository access. The exact Oracle failure root cause remains unproven.

Production reconcileAutomationReservation settled reservation a77d3838d41755825e31979ad0d5b5de2655baa53c209f9b3ab433a6e5b2f79b with reconciled_reserved/provider_failure and the original Oracle metadata digest. Run 1ce1bd593fac9741f970e32fbd292d2d2160bc59c1ff35e8f8f95bd4d1b03545 readback has zero open reservations and ledger 3368ad4dd2c3e2f39e98e365faa0d877dfb24a9b52cc5fa0d70ddd5419ee0cdb. This conservatively charges one reserved invocation; it is not evidence of a model turn. The budget projection remains active until its finite expiry, with no stop receipt; no controller was started and no retry is scheduled. Raw readback is retained in the canary clone Garbage/brc1415/reconciliation-readback.json.

The single permitted blocking scope expansion was the capability registry correction. The newly observed Oracle preselection blocker reaches the AGENTS.md second-out-of-scope stop boundary. BRC14/BRC15 remain incomplete. A bounded Oracle preselection diagnosis/repair is the next required slice before any new observation; it must preserve strict selection proof, default model, immutable failed evidence and the finite authorization window.


## Oracle repair scope resolution

Owner approved the newly discovered Oracle selector slice. It is fixed locally at Oracle 2bb2acb7 with a red-green regression, 31 passing browser cases, typecheck/build and real successful prompt submission. The second shadow attempt completed but both GitHub resource calls returned 404; no exact revision evidence was produced. All shadow reservations are settled, the two-call shadow allocation is consumed, and no active grant was minted. Durable details are in docs/researches/20260908-brc14-provider-history-evidence.md under the authorized Oracle repair result. Owner subsequently confirmed intentional local/Web GPT account separation. Resolve a target already accessible to the Web GPT account before any new budgeted observation; preserve both account isolation and current-model selection.


Owner subsequently accepted Connector/account availability based on manual testing and directed skipping this investigation. No further availability probe or account configuration change is required. Publish the locally verified source candidate; keep active/manual execution and exact-revision results separate and leave BRC14/BRC15 live acceptance incomplete.


## Actual BRC14 request boundary

Public BYOK SDK read succeeded. The observed fetch_commit response was truncated, exposing that the request did not name the raw resources required by the existing decoder. Correct both observation and fresh audit requests together; share their exact URL derivation with the decoder, preserve all verification conditions. Development evidence: two caller assertions red, then 43 observation/audit cases and 17 decoder cases green, with typecheck. The remaining live result and acceptance stay separate.


## BYOK active stop boundary (2026-09-08 23:50 HKT)

Ancienttwo/byok-sdk shadow-raw-ready and active exact revision observations both verified through the canonical provider-history decoder. Active target is 5156c9ce0f67c991747f8539fe63e68667f9b7be on refs/heads/codex/brc1415-canary. Oracle f694ab63 preserves current model selection and passed 32 focused browser cases, typecheck and build. Web authoring created Issues #177 and #178; independent readback confirms both OPEN with the campaign markers. No task acquisition, worker, PR or merge occurred in BYOK.

Canonical step failed reading the Issue collection: `spawnSync gh ENOBUFS (stdout or stderr buffer reached maxBuffer size limit)`. The active budget reached its configured runner_invocations limit 4 after revision observation, authoring, repository read and failed collection read. It is budget_exhausted with stop receipt 2b2b33b73dec631190d70c35acf1b1f4ddc0ea8d6a9d1d70b5a7a5c4c7a273d9, zero open reservations, four consumed provider calls and zero acquisitions. Five prior reserved calls plus these four equal nine against the original forty-call envelope, but that remaining envelope does not reactivate a stopped grant. Adoption refused before effects.

Evidence remains in /Users/ancienttwo/Projects/byok-brc1415-canary/.canary-scratch/{authoring.log,group-1-step.json,adoption.log,active-budget-readback.json} and immutable automation run 7d92c1c725ee65b51a2ec132f1f385ccb5233315616dbdf986b816accd9ba8d4. The new collection-read failure is a further scope discovery; stop under the existing scope boundary instead of silently repairing or increasing the grant. Resume must handle bounded complete Issue collection reads and a canonical authorization recovery, retaining the original deadline and total budget unless Owner changes them.

Source local acceptance is bound to final 14/14 run run-20260908T234051-54153-20260908-2235-brc1415-strict-admission.json, subject sha256:70cf8fda24ddaada2ad9e693b84743a9b09342c31f14aeac955431651dc3948a, including 60 focused cases. Earlier 86 cases remain baseline evidence. No full-suite rerun and no live BRC14/BRC15 completion claim.


## Approved read-limit diagnosis

Owner approved the next read/budget correction. Source trace shows fetchGithubIssues already enforces explicit policy limits and complete pagination. A three-request operator diagnostic in the isolated BYOK checkout returned all 178 Issue/PR records (44 actual Issues), two pages and 1,025,686 total bytes. Thus the canary max_issues=20 and max_total_bytes=262144 were undersized; no reader code fix is justified. The corrected canary policy retains a finite 400-record/four-page/eight-MiB limit, original per-body limit and deadline. At ten times the observed collection it deliberately fails closed.

The budget store explicitly forbids revising an exhausted run and binds the campaign to one deterministic run and authorization. Existing authoring sessions also bind to their exact intent. Transplanting #177/#178 or resetting the budget would violate current contracts. No such mutation was attempted. Three diagnostic reads bring the conservative overall consumption to twelve of forty; twenty-eight remain before the unchanged expiry. A future grant must align provider calls, runner invocations and agent-turn caps. Both Issues also lack the frozen policy eligibility label. Owner was asked to choose between a formal continuation slice preserving them and a fresh campaign.


## Owner-directed scoped collection

Owner explicitly prohibited whole-repository reads and requested continuation. P1: the external-source adapter owns both exact-number reads and label collection reads; campaign consumes its complete receipt. P2: label selection previously only affected local eligibility, after all repository bodies had been downloaded. P3: push the existing labels_all authority into every GitHub collection request; keep local eligibility validation, pagination, byte/deadline limits and exact-number behavior. Completeness now covers the frozen label scope only; it does not prove absence of unlabelled campaign markers. This is the deliberate bounded-scope tradeoff required by Owner. No new dependency, abstraction or product file is added. At ten times the selected scope existing configured limits fail closed.

The regression failed before the fix (5 pass/1 fail), then the adapter and campaign observer tests passed. The BYOK policy returns to two pages/twenty records/256 KiB, and only #177/#178 receive its existing canary label. Historical full scans and exhausted budget remain immutable, not reused as current scope evidence.

> **Substantive Change SHA256**: `sha256:2796891bf2b2eede3a950f91f74a8e1a5f9d59baecf1a5b0b289114348403664`

Scoped live readback: exactly #177/#178, two requests, one filtered page, 17,642 bytes; canary evidence .canary-scratch/scoped-collection-readback.json. Labels were added only to those two Issues. No new campaign, authoring or worker was started. TypeScript and six integrity checks passed (task-sync initially needed the explicit delta fingerprint, then rechecked). Prior 14/14 acceptance is not reassigned to this delta.


## Approved continuation design

Owner approved preserving #177/#178 across budget exhaustion. Use a new campaign authorization/run and a fresh initial authoring session that edits explicitly named existing Issues instead of creating Issues. The resume request binds the old intent, verified source session, stopped quiescent budget, and exact provider IDs/URLs/slots. The old campaign must remain pre-adoption. Read and verify all old markers before editing; use the new frozen revision and capability schema. Fresh session evidence belongs solely to the new intent; old artifacts are never transplanted, reclassified or mutated. Current model selection and label-scoped reads remain unchanged. This adds an explicit operator entry to the existing authoring boundary, not a budget reset or compatibility path.

> **Substantive Change SHA256**: `sha256:b856062637902add2d105960f60ca518f6d461893abf20070de1a49b95a5a85d`

Continuation delta: 25 focused authoring/observer cases and TypeScript passed; six integrity checks passed after binding this fingerprint. No budget core changes, new dependencies or new product files.


One directly blocking runtime correction: fresh provider history omitted user metadata.system_hints while preserving the actual GitHub tool connector/resource identity, exact URLs, same-turn binding and complete raw commit/ref data. The decoder incorrectly required this UI hint in addition to provider-owned tool identity. Remove only that redundant UI field requirement; do not derive or fill it. Regression is red with missing hints and valid tool identity, then green while a wrong connector still rejects. Original unavailable observation remains unchanged.

> **Substantive Change SHA256**: `sha256:484b692a36453825a81427ca63fcd2949d1bcfaa13c427c47020776112abe827`

UI-hint delta: 43 decoder/observation cases pass with wrong-connector rejection retained, plus TypeScript and six integrity checks. The earlier unavailable capture is not relabeled.


## Live continuation result (2026-09-09 00:27 HKT)

New campaign byok-brc1415-20260909-resume-ready uses grant 023f24116e033256189ba47587d1428b435848c5592bb521b05377c3c6525451, seventeen provider calls and the original expiry 2026-09-08T16:34:27.212Z. New revision observation verified. New intent sha256:efc8de82ca2689fa5bb45fa6fcc628649ced379b41f9926e3dc82c70e249242c was authored via --resume-from; verified session chgpt_20260909_002449_byok-brc1415-20260909-resume-ready-group-1-issue updated existing #177/#178 only, preserving their exact database IDs and scopes. No Issue creation was requested.

Adoption with --repo . first failed the pre-existing exact repo_root string comparison; the absolute root passed that check. The challenge followup then failed with `Failed to focus prompt textarea`. Oracle read-github-repository-ancienttwo-byok metadata records status:error and promptSubmitted:false. ReconcileAutomationReservation charged the full reserved call as provider_failure. Run 2192456aa8095baf3d2d081097c21f02a5c6bb349409dff0a306da634772e7da has provider_calls=3, no open reservations and no active controller step. Immutable response remains failed; no adoption, worker, merge or BRC completion claim. Evidence is in the BYOK clone .canary-scratch/resume-author.log, resume-adoption-absolute.log and resume-challenge-reconciliation.json.

After the single directly blocking UI-hint correction, the new Oracle editor-focus fault reaches the second out-of-scope stop boundary. No retry is scheduled. A subsequent slice must prove and fix followup editor readiness, then reconcile the failed immutable challenge response through a canonical recovery path; never overwrite it or reuse the old call as success.


## Positive composition and full group sequence

The model-free fixture now obtains canonical revision evidence before the first authoring call, as required by the production budget store. Fake provider transport retains the real observation decoder, grant, reservation and settlement. Actual adoption publishes a materialization commit. A separate planned fixture traverses real acquisition, validates the persisted envelope and ClaimActorReceipt, replays acquisition without creating a second dispatch, and binds the actual worker. Missing BRC_CAMPAIGN_IMAGE rejects preparation; beforeChild cannot start without an invocation. This composition proves admission and identity binding, not a newly executed Docker workload. Existing Docker runtime inputs are byte-identical to cc2fbc48 under the contract comparison.

The complete three-group test uses real campaign stores, authoring and fresh-audit effects with synthetic provider history. Each next authoring prompt uses the prior accepted final SHA; Group 3 terminates and Group 4 is refused. Historical adoption and not-planned cleanup fixture records intentionally isolate sequencing. This is not evidence of three live groups or Canary 3 delivery. No new dependency, product file or production abstraction is introduced.

> **Substantive Change SHA256**: `sha256:fb7228cc03258029e62bda7e94536f0a6cb8412b4cc11dac4e4e4bfefb886434`

Development validation: 54 focused cases passed across adoption, acquisition, worker recovery and fresh audit (280 assertions); TypeScript passed. Final candidate acceptance and CI remain pending.


## Carrier-only launch correction

P1/P2: contract-run accepts an optional campaign provider; bindCampaignWorker previously allowed an admitted new dispatch with provider omitted, and beforeChild then skipped invocation validation. With valid canonical revision evidence the regression returned a live worker binding instead of rejecting (tests/effects/campaign-acquisition.test.ts, pre-fix /tmp/brc-carrier-bypass-red.log, 0 pass / 1 fail). P3: require codex-exec for every new launch at bindCampaignWorker after revision admission, before budget initialization. Historical final replay remains available for exact settlement and cannot spawn. Existing CLI callers converge here, so no second parser authority or runtime carrier changes are needed. This is within work-package A's unique-carrier invariant. The interrupted preparation run is not final evidence; freeze again after this correction.

> **Substantive Change SHA256**: `sha256:6f702316a4f5de3159ed0eb6d4a5de7456576b9bded144aa4cac1a42e6ce323a`

> **Substantive Change SHA256**: `sha256:91930f7fef3b66d87ca2673e2fa0f1a71ca6b45a22b717dff1dc3662d3e9f4c7`

The retained initial-base task-sync criterion includes the merged main changes. Bind that exact integrated diff without changing ownership or claiming those changes as this slice. All behavior criteria passed in run-20260909T004725-61115; only the missing workflow fingerprint failed.

> **Substantive Change SHA256**: `sha256:bb9f6bd7f4648697bd80356d1b929f05fd479464d019c47f097aa12b17332e75`


## Single blocking CI snapshot correction

CI 34254078294 failed only tests/state/loop-semantics-characterization.test.ts: main fe35f0a9 persists architecture-drift-cascade.json, but its three Stop golden lists were not updated. The canonical fixture generator changes exactly those three lines; no production behavior changes. This is the one directly blocking unrelated-main correction. All BRC tests in that CI passed. Preserve the accepted BRC subject and use this snapshot regression plus required integrity checks for local delta acceptance.

> **Substantive Change SHA256**: `sha256:b85a3d568f4668b403113e2a0d094c844c34adf53d6b4beef3ed79233b71e1cb`

> **Substantive Change SHA256**: `sha256:1c36bd83dac7715737a63c01924ebe7151537b1f5128fe6c2f062c27ecd8b8d7`


## Exact prompt transport correction

P1/P2: the first closeout revision request returned the authorized target and valid tool history, but the browser editor serialized naked URLs as Markdown self-links. The exact user-prompt comparison correctly refused the changed text. Session chgpt_20260909_014236_byok-brc1415-20260909-closeout-pre-active-revisi and observation sha256:68b61377a71381edcea2e3db2dd54591db2534efb998986afd2b5b9dee6437f0 remain unavailable; one call was settled and no authoring began.

P3: encode the complete revision/audit instruction as a JSON string with colon and period Unicode escapes before submitting it. JSON decoding preserves every original URL and snapshot byte, while the submitted text contains no URL autolink tokens. Both request generators share this operation; the evidence decoder still requires the exact submitted prompt. No provider-history normalization, Oracle change, new dependency or acceptance bypass. Model-free tests establish round-trip and real-call-chain behavior; only a subsequent authorized live capture can establish browser transport. At larger snapshots the prompt grows, but existing size/budget limits retain their refusal boundary.

Baseline: PR 367 merged at 4893cf82021a7b8eabfde2ed9995b7cc6532bd9c; required CI run 34256529308 succeeded for c09e32a0. The current live grant cannot consume changed source; preserve its failed record and original total call/deadline limits for any replacement authorization.

> **Substantive Change SHA256**: `sha256:eb3cda39a71918c369b622cefa76396b0764b532a9b8ec1905a893d8f66e9602`

Development regression: 63 tests, 260 assertions passed across revision decoding, observation and fresh audit.

Integrated main e9794576 (architecture recovery and its locked archctx 0.5.8) after the first 14/14 run. Source transport delta remains unchanged; the generated projection conflict is resolved from main and regenerated through the canonical apply command. No Oracle files changed.

> **Substantive Change SHA256**: `sha256:4d6709c9fea4824f69d2b69b1231005f768d5d546c06fcd2acd27f30e0f95589`


## Target protection authority correction

P1/P2: transport canary completed exact revision, authoring, challenge and adoption, but `rejectProtectedPlanning` reads a repo-harness test fixture in the target. BYOK materialization15d3c598 lacks that file. The planner also ignores configured registry authority when computing ownership and protection digest.
P3: use one target-owned `.ai/harness/campaign-protection.json`; share the frozen selected registry result and its input paths with authoring and planning. No inferred empty inventory or fallback. Active observation validates both before request persistence, budget reservation or provider I/O. Target owners author their own inventory; init/off does not invent it. Existing self-host inventory bytes move unchanged, and characterization consumes that authority directly. At10x capability nodes, Git reads grow linearly as before; no second registry cache or authority is introduced.

Regression evidence: /tmp/brc-target-protection-red.log fails against the original planner with the exact missing fixture error. Updated five-file focused run:98 pass,0 fail,892 assertions. The new target-owned guard was tested without ArchContext or repo-harness test directories.

> **Substantive Change SHA256**: `sha256:3bd97974262cf98b408fbbea321f73b3146315172b7d838872d0a6a61af7034a`

Review corrections: shared protection failures use existing campaign_policy_invalid; only the planning adapter maps to planning_failed. Protected capability IDs must resolve in the selected registry, so typos fail before provider I/O. Historical fixtures now explicitly declare only their own capability protection set while retaining the existing unmapped-path rules.
Baseline run-20260909T031328-26791: all14 contract criteria passed at71792662; overall preparation was blocked solely because Change Assessment did not declare its existing executable oracle for the new helper. Declare that mapping and use the three affected protection/planning/observation files for final delta verification; do not rerun the eight-file baseline.

> **Substantive Change SHA256**: `sha256:2d8ef123e3ff48743d047e9cacf50e9251c4753ad331a7850c727e2283a5a62c`

Final fixture correction makes the protection mutation non-empty against the minimal fixture registry; the targeted invalidation test passes. Security and architecture delta reviews pass for production source at 9f4e4a8f. No production source changed after that review.

> **Substantive Change SHA256**: `sha256:fff167bce8ae5e57e709f7dd56cd962e6183e96534c97dc0392e462674f622ae`

Integration: main d8c082b1 merged at 90ee5751; only generated architecture manifest conflicted and was regenerated canonically. Campaign production/test source is unchanged from frozen 14/14 run-20260909T032622-41208. CI task-sync requires the new main-relative identity below; local check reproduces it exactly.

> **Substantive Change SHA256**: `sha256:c18d68e36830bbf74db5797b4de0e02121b6ee90dc69bbfd5d92d611251396ac`

CI run34269496496: only tests/claude-review.test.ts and tests/herdr-transport.test.ts fail, with missing herdr executable. Install upstream v0.9.0 binary only in Linux CI, pinned to release SHA256; download verified locally. No source or test behavior changed. Source: https://github.com/herdrdev/herdr/releases/tag/v0.9.0 .

> **Substantive Change SHA256**: `sha256:2ff262455fea95e9c49ec99cc427d9343e77765ffbb5629145f987090a92c44c`

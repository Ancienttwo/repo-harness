# BRC14 provider-history revision evidence

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Real observation

On 2026-09-08, Oracle 98bebeb2 completed a new read-only GitHub observation in conversation `6a9fa035-b610-83ea-b000-0ad484e21e65`, provider session `perform-a-fresh-read-only-3`. Explicit GitHub activation and complete prompt submission succeeded. The configured user default was preserved; provider history reported `gpt-6-pro`, while local model verification remains false. Runtime was approximately 1m51s. The fresh grant admitted one provider call; its ledger settled one call with no open reservation. Earlier failed reservations were reconciled conservatively and their budgets remain closed.

The initial SSE destination was lost across worker serialization. Oracle 9fe69d2b fixes both storage and worker reconstruction. This does not retroactively create a stream artifact for the real observation.

Read-only history recovery returned HTTP 200 from the actual conversation endpoint. Decoded response SHA256: `a55c05ead0cab070da100e9e19581d457ac83e1870dc6930462ec6e749ba770b`. Both page flags are false and continuation is null. The preserved response is under ignored `.ai/harness/runs/brc14-readonly-r3/conversation-history.json`; original observation and budget are alongside it.

The server history contains actual tool-author messages, not only assistant text:

- Commit message `2f192221-739c-4f2d-84fe-021765f7b3d2`: full 13/13-line `api_tool.call_tool` return for commit `33d692aaa0ab593df0c160082b18fdac02c82e9c`, with tree `e198e1a525df4614f8dfd4564f32b0034dfb08f7`.
- Ref message `1ef2996e-1740-4b21-b25e-d91935c7c2a3`: full 13/13-line return for `refs/heads/main`, whose object points to that commit.
- Both bind the same turn, GitHub invoked resource, connector ID, citation URL and unchanged nested GitHub JSON. Corresponding call request messages are absent; this is provider-origin tool-return evidence, not a complete tool request/response pair.
- The tree wrapper is truncated. Its content line contains 36 root entries which match local `git ls-tree` exactly, but production identity validation excludes that truncated wrapper and consumes the complete commit/ref returns only.

## Production boundary

Oracle captures a completed session's own history before closing or archiving its tab and writes a private session-bound envelope. The destination survives CLI serialization and worker reconstruction. Harness requires the invocation-owned file, matching terminal session metadata and actual conversation ID before exposing typed history to campaign validation.

The strict decoder checks successful exact-origin history, digest, complete pagination, one prompt-bearing user turn, same final-answer turn, explicit GitHub activation, tool role/name/resource, complete numbered JSON wrapper and matching repository/ref/commit URLs and values. It does not scan assistant prose for SHAs or repair missing metadata. Unknown or contradictory evidence stays unverified.

Fresh audit protocol 2 includes the prompt and answer digests and either a revision evidence object or null. Verified accepted/accepted_with_followups observations may use bounded existing transitions; rejected/unverified results cannot accept or seed a group. Acceptance rechecks the live group snapshot. The active admission gate remains unchanged.

## Acceptance limit

The real run above is a pre-active revision observation, not a completed-group audit. Its historical raw result stays unchanged and is not upgraded into a new receipt. BRC6a remains Owner-closed; BRC14 still needs its full group-audit acceptance and BRC15 still needs the active/manual closed loop. No new GPT invocation or active campaign is part of this implementation package.

## Follow-up sequencing implementation

The original group-loop design (plans/sprints/20260902-GPT-issues-loop.md:1168) permits accepted_with_followups to feed the next authorized group. The authoring context now reads the previous accepted observation and passes its findings verbatim into both initial and continuation prompts before the prompt digest and provider admission. Planning and observer callers retain their SHA-only baseline projection. Findings do not create extra slots, change allowed issue kinds or authorize a fourth group.

The canonical campaign lifecycle records complete_with_followups -> completed_with_followups separately from complete -> completed. Both completion paths require all authorized groups and the matching final verified audit disposition; findings length never substitutes for that disposition. Historical status stays a pure event projection, and prior recorded completed outcomes are not reinterpreted. This is model-free implementation evidence, not full live BRC14 or BRC15 acceptance.

## Formal pre-active admission

Protocol2 revision observation now requests same-session history and retains its immutable raw result before settlement. It validates exact request/output/session/profile/connector/commit/ref identity through the existing history decoder. Protocol1 and historical unavailable observations are retained as original artifacts and cannot serve as active authority.

Every active entrypoint, including fleet offer projection, passes its stored intent into one guard. The guard checks the current campaign/grant/group baseline, active policy and provider repository; validates original budget grant and the actual stored reservation plus observed progress event; and rejects stopped or exhausted budget/campaign state. Later groups continue consuming the preceding accepted audit baseline; the bootstrap observation is never treated as evidence for a later main revision.

Offer queries use read-only usage validation: a lagging budget current projection is refolded for reads and is not repaired by a status query. Existing locked settlement and recovery behavior remains separate. These are model-free implementation checks. R3 retains its historical unavailable result; no new real observation or active/manual canary has been run with this package.

## Bounded closeout after R4

The Owner-approved R4 observation on 2026-09-08 stopped before submission: Oracle recorded `promptSubmitted:false` and `APP_SELECTION_UNVERIFIED: GitHub: app-not-found`. Its reservation was reconciled conservatively (`reconciled_reserved`, no open reservations); that charge does not establish a model turn. The original failed result remains unchanged.

A no-send Profile 13 reproduction exposed an actual GitHub inline pill restored while the selector waited for menu candidates. Oracle 14cfbfc6 rechecks the same strict pill identity during that wait. Its regression failed before the fix and passed afterward; 26 browser tests, typecheck and real no-send UI verification pass. This is a local selector repair, not a new BRC6a probe or live BRC14 acceptance.

Owner directed integration of existing work and an end to open-ended evidence experiments. This round ends with BRC6a/BRC15a closures preserved, BRC14/BRC15 live acceptance unfulfilled, and active/manual unstarted. Existing runtime gates and budgets remain enforced. No further GPT call is scheduled by this closeout.

## Conservative active boundary after integration review

The integration review found that revision and budget proof could admit the host worker before #354 independent supervision was connected. The final guard now explicitly rejects new active preparation/launch even when revision and settlement are valid. There is no configuration override. Existing recorded final settlement and legitimate recovery retain their separate paths. A valid stored intent/history/ledger combination reaches the specific supervision refusal without external calls or budget/materialization changes.

The observation CLI separately returns success for settled verified observations and their replay; unavailable evidence and errors remain nonzero. This success does not authorize active execution. The no-argument production-closed test is removed; 48 focused observation/CLI/finalization/worker tests pass. #354 and BRC14/BRC15 live acceptance remain unfulfilled.


## Prepared strict-admission restoration after runtime acceptance

The temporary unconditional refusal was introduced before independent supervision was connected. The later accepted Docker runtime, preparation recovery, retained-journal cleanup and actual-role/probe tests now own that containment boundary. The prepared restoration removes only that unconditional refusal; all exact-history, original settlement, grant, policy, profile, group-baseline and deadline checks remain. A real-store fixture verifies successful read-only admission and reachability of adoption's independent authoring-session guard; it is not a live provider or worker execution.

Current main baseline aa3cb452 passed 63 focused audit, revision and reconciliation tests in 94.32 seconds. The baseline retains its original scope. This restoration remains a local candidate pending the live activation decision. Repository policy stays off. BRC14 and BRC15 remain incomplete until a new authorized disposable-target run demonstrates active adoption, actual worker execution, manual merge, exact cleanup and fresh verified audit. No historical failed observation or stopped budget may be upgraded or reused.


AiphaBee preparation exposed a consumer defect: campaign capability resolution hardcoded ArchContext despite context.capability_source selecting registry. The bounded correction consumes the configured source at the frozen commit and rejects invalid or missing selected authority. It never falls back to an unselected source. The new regression proved the defect before correction; real AiphaBee resolves its four configured capabilities afterward. Live canary evidence remains separate.


## AiphaBee bounded run: pre-submission blocker (2026-09-08 23:11 HKT)

Owner selected AiphaBee and delegated the finite scope. The isolated clone targets chenrenya/aip-main-open refs/heads/codex/brc1415-canary at 0720c399bf157234d04b6940436b196b3ac47607. The allocation is one group, two Issues, two parallel workers, two authoring rounds, manual merge, forty total provider calls and a ninety-minute window ending 2026-09-08T16:34:27.212Z. Only the two-call shadow grant was minted; the conditional thirty-eight-call active grant was not minted.

The source candidate completed fourteen scoped acceptance criteria, including eighty-six affected tests and TypeScript. The final run is .ai/harness/runs/run-20260908T230034-3349-20260908-2235-brc1415-strict-admission.json; its original subject and unchanged Docker evidence remain the only local acceptance claims.

The first shadow observation failed with APP_SELECTION_UNVERIFIED: GitHub: app-not-found. Oracle candidate 14cfbfc6ad6494397e46eac548338ff3e599c21f recorded status:error and browser.runtime.promptSubmitted:false in oracle-home/sessions/perform-a-fresh-read-only/meta.json. No prompt, authored Issue, task worker, active campaign, merge or deployment resulted. The original failed session remains unchanged. A separate no-send Work Chrome inspection showed Chat/Work surfaces and an installed GitHub entry at https://chatgpt.com/plugins; this is UI readiness evidence only, not proof of the copied Oracle profile or repository access. The exact Oracle failure root cause remains unproven.

Production reconcileAutomationReservation settled reservation a77d3838d41755825e31979ad0d5b5de2655baa53c209f9b3ab433a6e5b2f79b with reconciled_reserved/provider_failure and the original Oracle metadata digest. Run 1ce1bd593fac9741f970e32fbd292d2d2160bc59c1ff35e8f8f95bd4d1b03545 readback has zero open reservations and ledger 3368ad4dd2c3e2f39e98e365faa0d877dfb24a9b52cc5fa0d70ddd5419ee0cdb. This conservatively charges one reserved invocation; it is not evidence of a model turn. The budget projection remains active until its finite expiry, with no stop receipt; no controller was started and no retry is scheduled. Raw readback is retained in the canary clone Garbage/brc1415/reconciliation-readback.json.

The single permitted blocking scope expansion was the capability registry correction. The newly observed Oracle preselection blocker reaches the AGENTS.md second-out-of-scope stop boundary. BRC14/BRC15 remain incomplete. A bounded Oracle preselection diagnosis/repair is the next required slice before any new observation; it must preserve strict selection proof, default model, immutable failed evidence and the finite authorization window.


## Authorized Oracle catalog-search repair and AiphaBee result (2026-09-08 23:24 HKT)

Owner approved the Oracle blocking slice. Root cause: appSelection.ts searched only the recommendation subset emitted by the initial composer menu. GitHub was installed but absent from that subset. A no-send Work Chrome reproduction typed GitHub into the open composer menu, observed candidate connector_76869538009648d5b282a4bb21c3d157, and selected a matching inline pill. Oracle commit 2bb2acb7 now searches the installed catalog in an empty focused composer before selection, preserving candidate/pill identity, nonempty-draft refusal and the pre-send body check. The new regression failed on the previous source (11 pass, 1 fail); final app-selection and prompt-composer suites pass 31 tests, TypeScript and build pass. The single production caller was updated; no dependency or new abstraction was introduced. This remains a local Oracle candidate, not an upstream release or global installation.

The second shadow attempt used a new immutable campaign aip-brc1415-20260908-shadow-search and a one-call grant 4724640847bd4db1ecea94b633621c1378a10629a97bbbc60060caf8cde6ab4c, retaining the original overall expiry. Oracle perform-a-fresh-read-only-2 completed with promptSubmitted:true, a verified selected GitHub pill and conversation 6aa027f6-d49c-83ea-a134-4c781192989b. Both original tool responses in network capture returned status 404, is_error:true: fetch_commit for the exact SHA and fetch for the target branch ref. Remote Git readback independently confirms refs/heads/codex/brc1415-canary still points to 0720c399bf157234d04b6940436b196b3ac47607. This does not identify the connector access failure's cause or establish the requested revision as read by that connector.

Revision result remains unavailable and settled as no_progress; request digest 4f4ab70fd99fe13df1b4d74d86d30dd41c7f62b8139762fb6227ab23a5c3b5d4, observation digest sha256:a07af3c2a3b29f018646fb0b24dfa14ef9721ef47d8fc5737c21b30010adcc52, network digest sha256:96621e38d6d1f42164ddbaff9cdb50f105222125fbbfe9ccebe6eedfe717323a. Session metadata lives under the isolated clone .ai/harness/chatgpt/sessions/chgpt_20260908_232144_aip-brc1415-20260908-shadow-search-pre-active-re/. Both shadow ledgers report one provider call each and zero reservations; only one prompt was actually submitted. No third shadow call or active grant is scheduled. Active/manual remains unstarted and BRC14/BRC15 remain incomplete.

Owner clarified that the ChatGPT default was manually set to GPT 6 Medium for fast testing, and a Pro default should be preserved when selected. Oracle used modelStrategy=current with no override; provider history reports gpt-5-6-thinking and thinking_effort=standard. The CLI requested-model banner is not actual model identity or Pro acceptance evidence.


### Owner clarification: intentional GitHub account separation

Owner confirmed that the local Git account and Web GPT GitHub account intentionally differ; Connector operation itself is not the fault. Target selection incorrectly treated local repository access as sufficient readiness for the Web GPT account. GitHub REST readback through the local account confirms the canonical owner/name, commit and ref, but cannot establish the other account's access. Preserve account isolation: do not reconnect, switch accounts or expand repository permissions. The next canary must name a repository already accessible to the Web GPT account; if AiphaBee is not shared with that account, select another explicit target. Any new run requires a fresh target-bound grant and finite scope; neither failed observation may be reused as revision acceptance.


### Owner acceptance of Connector availability

Owner stated that Connector/account availability was already manually tested and explicitly directed skipping that part. Treat the availability investigation as closed by Owner acceptance; do not require another account probe or connection change. The original unavailable exact-revision observation remains historical evidence with its actual scope. This decision does not rewrite its payload, synthesize a revision receipt or mark the unexecuted active/manual worker, merge, cleanup and final audit as completed. Continue publishing the verified source repairs independently of the live canary acceptance.


## BYOK SDK target and raw resource request correction

Owner selected public Ancienttwo/byok-sdk, preserving account isolation. The independent clone /Users/ancienttwo/Projects/byok-brc1415-canary targets refs/heads/codex/brc1415-canary at 5b4808e51f9cf8a5b0abd24a038243e369b879b9, with one group/two Issues/manual merge and no release. The first observation successfully read the target via GitHub, confirming availability, but used fetch_commit: its history response was truncated (7 of 84 lines). The ref response was complete and matched the SHA. The strict decoder correctly retained unavailable rather than accepting partial commit evidence.

Root cause in the BRC14 request contract: the decoder requires raw /git/commits and /git/ref resources through GitHub fetch, but both observation and final-audit prompts left resource selection implicit. The request construction now names exactly the decoder's two URLs and asks for GitHub fetch plus complete returns. One shared URL derivation serves those two real callers and the decoder, with no added dependency or alternative parser. New assertions failed in both callers before correction; all 43 observation/audit cases, 17 decoder cases and TypeScript pass afterward. The 86-case earlier acceptance remains baseline for its original source subject; final delta coverage is explicitly listed in the contract.

The first raw-resource attempt stopped before submission with search-draft-not-empty; its full reservation was conservatively reconciled, leaving zero open reservations. Oracle also classified a not-yet-mounted canonical editor as this error. Commit f694ab63 bounds the wait for that editor and keeps a real nonempty-draft refusal; the delayed-mount regression failed before correction, with 32 related cases and typecheck/build passing afterward. No actual nonempty draft is cleared. A new immutable one-call revision attempt uses byok-brc1415-20260908-shadow-raw-ready and grant 8b41b1998e17c4584d248009c276feea84fa9385f281eb8d5a8a1ca8aacc1372. The original forty-call window remains in force: two AiphaBee reservations, three BYOK reservations including this attempt, and at most thirty-five subsequent calls. No active grant has been minted at this checkpoint.


## Label-scoped observation boundary

Owner prohibited repository-wide Issue reads. The GitHub adapter now sends the frozen policy labels_all as a server-side labels filter on every collection page. A complete receipt proves completeness only for that label scope; it does not claim absence of unlabelled campaign markers. Local eligibility validation and all pagination, byte and deadline limits remain enforced. No latest-N sampling or exact-number shortcut is used for duplicate-slot detection.

The BYOK canary label is attached to #177/#178. A real scoped read used two requests (repository identity and one filtered page), returned only those two Issues and 17,642 bytes, with a request guard refusing an unfiltered collection URL. The policy returns to two pages, twenty records and 256 KiB. This operator read is not admission of the stopped campaign or worker evidence. The adapter/observer regression passed ten cases after a recorded pre-fix failure; TypeScript and six integrity checks cover the code delta. Prior acceptance remains bound to its earlier subject.


## Preserving existing Issues after budget exhaustion

`campaign author --resume-from <manifest.json>` starts fresh authoring under a new campaign and finite authorization. The manifest has `campaign_id`, `group_number`, `intent_sha256`, `source_session_ref`, and an ordered `issues` array of `{slot, provider_issue_id, provider_issue_url}` from the stopped source. The effect validates the old verified session, pre-adoption state, stopped budget and absence of open reservations/controller steps, plus identical repository/ref/slots. It binds the old intent/session/stop digests and exact identities into the new prompt. Web GPT must read and verify every old Issue before editing any; the fresh initial session belongs only to the new intent. Old budgets and receipts are never reset or transplanted.

User-history `system_hints` is not a provider tool identity: observed current history can omit it. Exact revision proof instead retains the invocation-owned capture, request/answer and turn binding, GitHub connector/resource metadata, complete raw commit/ref resources and matching OIDs. A missing UI hint cannot invalidate otherwise complete provider evidence; mismatched tool identity still rejects.


## Exact prompt transport correction

P1/P2: the first closeout revision request returned the authorized target and valid tool history, but the browser editor serialized naked URLs as Markdown self-links. The exact user-prompt comparison correctly refused the changed text. Session chgpt_20260909_014236_byok-brc1415-20260909-closeout-pre-active-revisi and observation sha256:68b61377a71381edcea2e3db2dd54591db2534efb998986afd2b5b9dee6437f0 remain unavailable; one call was settled and no authoring began.

P3: encode the complete revision/audit instruction as a JSON string with colon and period Unicode escapes before submitting it. JSON decoding preserves every original URL and snapshot byte, while the submitted text contains no URL autolink tokens. Both request generators share this operation; the evidence decoder still requires the exact submitted prompt. No provider-history normalization, Oracle change, new dependency or acceptance bypass. Model-free tests establish round-trip and real-call-chain behavior; only a subsequent authorized live capture can establish browser transport. At larger snapshots the prompt grows, but existing size/budget limits retain their refusal boundary.

Baseline: PR 367 merged at 4893cf82021a7b8eabfde2ed9995b7cc6532bd9c; required CI run 34256529308 succeeded for c09e32a0. The current live grant cannot consume changed source; preserve its failed record and original total call/deadline limits for any replacement authorization.


## Target protection prerequisites

Active campaign targets must commit `.ai/harness/campaign-protection.json` before their initialization SHA is frozen. This is an owner-authored protocol1 inventory (capabilities, unmapped_surfaces and unmapped_closure), not a generated empty default. Revision observation and authoring refuse missing or malformed protection before reserving budget or calling a provider. Planning reads the same inventory and configured capability source, including custom JSON registry paths; its protection digest binds the policy, selected registry inputs and inventory at one exact revision. Those authority inputs cannot be automated repair paths. Default off and shadow remain unchanged. The self-host inventory moved from the former test fixture without byte changes; characterization consumes the new authority.

The existing stopped BYOK campaign completed real revision, authoring, challenge and adoption, but never dispatched a worker. Its stopped records remain immutable. This source correction does not revive its grant or claim real delivery/audit completion.

## Adopted, stopped Issue continuation

`campaign author --resume-from` can preserve already adopted Issues only when the predecessor is stopped, has zero successful acquisitions, no open budget reservations and no active controller step. Source adoption is rebuilt and its canonical publication must remain unchanged in the new target ancestry. A new campaign and authorization obtain new evidence; predecessor grants, sessions and manifests remain historical.

The immutable continuation binding permits only one successor. Its authoring may edit only the original Issue identities, and adoption independently rejects replacements. The ordinary challenge, publication, planning, acquire and manual delivery gates remain in force. This mechanism does not recover already acquired work or prove the real BRC14/BRC15 delivery/audit by itself.

## Text Connector activation (Owner-approved, 2026-09-09)

Campaign revision observation, Issue authoring/follow-up, adoption challenge and fresh audit now frame the existing canonical prompt as literal `@github connector <prompt>`. They explicitly clear inherited app preselection; Oracle receives no `--browser-app` for these operations. Other browser clients retain their explicit app-selection behavior. This removes a transport-specific composer-pill prerequisite, not the need for Connector evidence.

New session evidence consumes the invocation-owned captured conversation: validated response bytes, complete bounded history, the latest completed user/assistant turn and successful published GitHub tool returns with consistent Connector identity. A pill, answer-only claim, stale tool turn, mismatched citation or altered history cannot supply this evidence. The exact-revision decoder shares history validation and still checks both original GitHub JSON resources and their exact SHA. Historical immutable receipts retain their original evidence scope.

Focused implementation verification passed 167 tests across eight campaign files; the additional real browser-command regression verifies that explicit null clears a historical app in a follow-up. This is code evidence only. The real canary's failed pre-submission observation remains retained and is not relabeled or silently retried; BRC14/BRC15 delivery and final audit remain pending.

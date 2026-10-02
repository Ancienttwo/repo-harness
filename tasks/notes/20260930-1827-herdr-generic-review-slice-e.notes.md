# Implementation Notes: herdr-generic-review-slice-e

> **Substantive Change SHA256**: `sha256:c46f7bc8929c878d8398933a5cde6f79bbe8bac492be7bd0d774d6421a138257`

> **Status**: Active
> **Plan**: plans/plan-20260930-1827-herdr-generic-review-slice-e.md
> **Contract**: tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md
> **Review**: tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md
> **Last Updated**: 2026-10-02 06:31
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

## RUN2/RUN3 actual outcomes and frozen exit scope (20261002)

- RUN2-write af200aff/cd1e2cba/dd8e7ca2 ran once: Claude Sonnet(sonnet-5-5) and Codex each completed three same-task/provider rounds with authored domain-shaped Result, exact request/context validation and immutable owner collection; first Claude write gate passed; fingerprints unchanged, cleanup closed. Six sends consumed, aggregate15/17. Codex-large startup then showedUpdate now/Skip menu and ambiguous_launch before send; Claude-large not started. No retry/config edit/prompt answer. Raw: `.ai/harness/runs/review-design/run2-live-55a23dbd-68e1-41bf-b6e1-ad0c10b85745/{claude-review,codex-review,codex-large,final,post-run-readback}.json`.
- RUN3-write43e6e14f/ff1624cd/d022a7fe ran once after approved trust/version dismissal done by advisor: codex-large then claude-large each one valid collected Result, exit0/final.failed=false; two sends, aggregate17/17. Both dense packets1,048,617bytes, both cleanup closed and recorded provider PID absent. Condition1 passes by valid collection; complete ingestion remainsUNVERIFIED even when provider saysfull. Raw: `.ai/harness/runs/review-design/run3-live-41e58daa-0ca9-4745-8bfc-ed4dcb2c32ec/{codex-large,claude-large,final,post-run-readback,zero-sandbox}.json`.
- Condition3 is the existingzeroSandbox assertion only: real standalone Codex executable, custom privateprofile, paired protected-path EPERM plus writable-cwd positivecontrol; proves custom-profile OS denial only, NOT production workspace-write isolation. No new sandbox test/canary was added.
- Nonblocking follow-ups under the user's scopefreeze: git diff/show --output hole; full large-packet ingestion; hooks isolation; campaign A; production workspace-write sandbox isolation; production role dispatcher/domain Receipt integration, no-file-lookup persistence proof, effective model/effort certification and other previouslyUNVERIFIED capabilities. No extra canary gates, no automatic model requests beyond cap17. Claude remains Sonnet/allowlist+fingerprint, never Opus-proven or OS read-only. Campaign code stays out of this slice.
- Receipt implementation is zero-model: production writer/verifier fixture opinion only, never converts RUN2revise intoPASS; added request/context/result binding and actualharness/role/model checked against owner-held domain Result. No requiredlauncher metadata. Historical projection text remains byte-frozen and display-only; retired source labels cannot pass current receipt verifier.
- No files have been deleted; E2must show traced deletion candidates and shared-reference replacements to the user first.

> **Substantive Change SHA256**: `sha256:ce653595f0739c54758ecae6244fa09cf98e480c83e4502b26676828eaa8b295`

## Receipt slice evidence and inventory handoff (zero-model)

- ProductionrecordAcceptance/verifyAcceptance now bind request_id/context_sha256/result_sha256 and actual_harness/role/model to an owner-held domain Result, sourcegeneric-review only; no launcher metadata. Identical fixed-time Herdr/headless fixture opinions produced identical verified Receipt bytes, and all six required fields rejected tampering; userwaiver keeps explicitlynull review fields. Proofcache `.ai/harness/runs/review-design/receipt-launcher-independent-proof.json` is labelledfixture opinion, not a real modelPASS.
- Focused118 tests/1522assertions passed (9existing files,101.20s); type and all requiredintegrity checks passed. Raw reports and sha256s in `.ai/harness/runs/review-design/receipt-required/results.json`; task-sync both workingtree and CImerge-base boundaries are acknowledged, no waiver. Historicalarchive projection remains byte-frozen display-only, not an accepted oldsource alias.
- Cutover inventory after user clarification is not an18 quota: actual6DELETE conditional on parity/import removal,36EDIT sharedconsumers,27RETAIN history/independent or negative coverage. Evidence `.ai/harness/runs/review-design/cutover-inventory.{md,json}` plus grep/reverse refs. No deletion, commit, push or merge. E2awaits user seeing inventory; normal obsolete claude-review caller still names retiredsource and must be replaced, not silently routed to newauthority.

## Gatekeeper corrections scope decision

- The user explicitly authorized remaining-source consumer migration; allowed_paths is widened only to checks-materializer, prompt-handler/callers, contract and reference-config source/mirrors, workflow-state and grader source/mirrors, and existing dependent tests/trace fixtures. No src/** or unrelated runtime scope. Preflight must pass before those edits.
- Generic review's sole domain role is deep-reasoner by the approved product contract; a single exported constant in the Receipt authority defines that closed validity rule, not a second model/effort/profile configuration. Both validators use it; callers cannot select another role by editing fleet config or input.
- The owner-held reviewed Result is required for verifier-side digest and request/context/harness/role/model comparison; a digest stored only in the Receipt would have no independent original to check. The canonical path uses repo/authorityHome, not launch details. --review-result is mandatory only for the external record CLI input; direct API takes the same domain object. User waiver remains its separate grant path.
- claude-review-session.ts is not patched: its retired source/missing domain Result call is a CRITICAL interim ship blocker. It must be removed with generic review wiring in the same PR before ship. Its exclusive test is a DELETE candidate, so REPO_HARNESS_TEST_EXPENSIVE is not enabled and the obsolete suite is not run. No deletion in this correction pass.

- Scope refinement from the source-consumer audit: exact paths added for evidence-checks-materializer, evidence-projection-drift, helper-script-fixture, plan-to-todo and prompt-handler tests. These positive consumers must migrate with the production source change; no new test file or unrelated behavior. Historical archive fixtures and explicit old-source rejection cases stay unchanged.

- Required hook projection check identified the tracked generated digest marker .ai/hooks/.projection.json; added that exact projection path to allowed_paths before regeneration. This is the deterministic marker of the authorized workflow-state source change, not a new runtime consumer.

## Gatekeeper FAIL corrections: final evidence (zero-model)

- Gatekeeper verdict remains FAIL pending re-review, not self-issued PASS. All named current source consumers plus traced positive dependent fixtures now use generic-review; old labels remain only in explicit rejection coverage, byte-frozen historical fixtures and the intentionally unpatched legacy session. Exact allowed_paths widened before edits and preflight passed; no file deleted.
- Final frozen source run: 229 tests / 0 fail / 2538 assertions across 17 existing files, 210.6s. Raw .ai/harness/runs/review-design/gate-fix-focused-frozen.log, sha256:4a532a3b70c6680c3cff693eae8d9f30e21f1628224c87960fc728bfbc8637c1.
- check:type and all nine Required Checks exit 0; CI merge-base task-sync also exit 0. Canonical command/exit/report/hash manifest: .ai/harness/runs/review-design/gate-fix-canonical-results.json. Six authoring/projection pairs are byte-identical, git diff --check clean. Both task-sync boundaries acknowledged; no waiver.
- Six tamper mutations now require their own exact field-specific mismatch; stored claude-review and codex-review receipts reject via production readReceipt with source is invalid. Fixed-time Herdr/headless labels remain diagnostics for fixture opinions only, no live launches or real verdict certification.
- CRITICAL ship blocker is explicitly in the plan: delete claude-review-session with generic review wiring in the same PR before ship; do not patch that caller. tests/claude-review.test.ts remains a deletion/replacement candidate and was not run with REPO_HARNESS_TEST_EXPENSIVE. No provider/model calls, deletion, commit, push or merge in this correction pass.

## E2 authorized boundary

- User reports Gatekeeper Receipt round 2 PASS; implementation and explicit six-file deletion now authorized, same PR. Exact inventory + replacement paths added to contract before edits. Cross-review CLI/core/runner remain untouched; their retirement is a separate follow-up after E2 merges. No new canary/model calls or campaign work.
- Re-freeze the two named Active contracts in place to the existing valid generic-review policy schema (Codex protocol2, Claude protocol1); no historical receipt alias/translation or acceptance is minted.

- E2 first proof before deletion: 22 tests / 0 fail / 481 assertions, .ai/harness/runs/review-design/e2-wiring-proof.log. Only deterministic provider effects; production acceptanceContext/recordAcceptance/verifyAcceptance and persisted close fence ran normally. Deleted exactly the six approved exclusive files afterward.
- Harness selection must not make cross a hard acceptance gate: expected_reviewer retains the frozen preferred policy; actual reviewer is Claude/Codex joined to actual_harness and the owner-held domain Result. Explicit same-harness and only preflight-missing fallback have production writer/verifier fixture coverage. Requested/actual/fallback reason remain in runtime evidence; launcher details never enter Receipt validity.
- Production role pins use the existing fleet parser and Codex target override; Claude argv has no LF, strict empty MCP, exact three result-file Write permission rules. Native logs supply actual model; unavailable/ambiguous model evidence fails closed. No new host/adapter/registry. Fingerprints detect edits, not OS isolation; hooks and production workspace-write isolation remain unverified follow-ups.
- Local full suite explicitly authorized by the user: reuse the existing bounded per-file runner (4 processes, concurrency 1, timeout 120000ms), without invoking GitHub CI or enabling expensive real install/provider lanes. This avoids shared process fixture state while covering every discovered test file; gated skips are reported as skipped, never passed.

- Review budget keys use canonical contract path under Git primary-root state, not execution cwd. Session freezes owner_root outside Receipt validity, so changing linked owner checkout cannot reset three-round accounting. This is the existing cross-worktree recovery/budget invariant, not another launcher abstraction.

- Updated E branch onto origin/main 9aef6693 with rebase/autostash of this worktree's owned changes only; no conflicts and no main-checkout mutation. The two incoming engineer changes remain upstream scope, not E2 PR changes.
- First local full run covered all 457 files (1436.84s), exit1: five failed files, all outside E2. Three are unsupported default Node26/ArchContext runtime; Node24-only diagnostic passed 48/48. Campaign fixture had an explicit 60000ms timeout under 4-process load; operator summary compared live wall-clock metrics at distinct times. No unrelated code/test fix. Final canonical run uses installed Node24.21.0 as a subprocess-only override and two isolated processes, same 120000ms case timeout. No global config/install changes, no GitHub CI run.

- Read-only owner inference check: Herdr agent get accepts a pane selector; the existing advisor pane reports agent=claude with name=null. Generic inference therefore queries the exact parent pane and joins pane_id/terminal_id rather than requiring an agent name. No provider start, prompt or default workspace mutation.
- Aimpact approval 14:33: remote scope is feature-branch push plus DRAFT PR only. No main mutation/push, no force-push, no merge; rollback and local evidence in PR body, no attribution footer.

- Bounded lifecycle review kept shared endpoint preflight ahead of generic state creation and used the existing canonical JSON utility for persisted endpoint comparison. The three-round writer/verifier fixture now reorders endpoint keys between turns, guarding against falsely rejecting the same address. No new canary or launcher mechanism.

- Shared classifier projection consumes actual external reviewer, not the frozen preferred reviewer, for generic-review. This aligns the existing EDIT classifier/helper with explicit/fallback harness selection and keeps retired sources rejected; the existing retained classifier test remains in place with its current-source assertion updated.

## B implementation release / holds

- Concrete OS mechanism selected for first proof: macOS built-in /usr/bin/sandbox-exec with Seatbelt policy; no third-party library, no chmod fallback. Host descendants must inherit denial; output tree alone writable. Native tool flags do not certify this boundary.
- H1 result delivery HOLD: deep-reasoner RECOMMENDATION first cannot become JSON-only by stripping, regex or instruction rewrite. No publisher is implemented until decision.
- H2 Claude unsupported even inside OS sandbox because stock OAR bypass flag violates standing policy. No automatic fallback; Codex only. Grok not added. Claude actual_model comes from system/init only (OAR projection.ts:235–237), not assistant model; no Claude Receipt until gap is closed.
- Readonly implementation stages use scriptedRuntime/dummy processes only. No model/provider, main/default/mini/global-config/OAR-repo changes. Only local commits authorised.


## B / 18:41 implementation checkpoint — blocked on SDK declarations

- P1: task-agent owns Herdr workspace/pane and typed execution-owner proof; OAR 0.10.2 owns vendor installation/argv/native events and Session lifecycle; the existing acceptance functions own subject/request/context/result binding and Receipt validity. Receipt stays launcher-independent. macOS Seatbelt, not sandbox_mode or fingerprints, is the write-protection authority.
- P2: prepared owner packet + durable request → fixed sandbox-exec/Node24 host in visible pane → OAR SessionOptions(fleet + one result-write authorization, cwd=output) → one SDK prompt per file request with ACK → reviewer-written TaskResult → existing readTaskRequestResult/collectTaskResult → domain validation/recordAcceptance → normal Receipt verifier → SDK disposal ack + execution-owner exit → created pane cleanup. Terminal text is observation, never extracted Result. Three requests share one Session; fourth rejected; ambiguous delivery never replays.
- P3: Aimpact 18:41 supersedes the earlier H1/H2 holds in this file and ffdaa41b's historical plan snapshot. Codex host env fixes OAR_CODEX_SANDBOX=workspace-write before Session creation. The output tree alone is writable; subject is referenced by absolute path. Claude's bypass flag comes from stock OAR and is permitted only inside the proved inherited OS boundary. No app-added bypass or native argv. Claude system/init (OAR projection.ts:235–237) is not actual gateway model: production admission fails with review_actual_model_unverified instead of minting a requested-alias Receipt. Grok and non-Darwin production paths stay unsupported.
- New dependency @botiverse/oar is exact-pinned 0.10.2 to replace the four hand integrations. New review-isolation.ts owns the cross-process write invariant; new oar-review-host.ts is necessary for the Node>=24 SDK execution boundary, persistent Session and visible standard events. No adapter registry or vendor parser was added. At larger payload scale, SDK retained events and pane history remain observation pressure; three-round/10MB request bounds remain unchanged, full ingestion is unverified.
- First proof: production reviewIsolationPolicy emitted Seatbelt policy; dummy Node24 host and descendant each attempted seven writes (five protected authorities, symlink, traversal). All returned EPERM with unchanged protected bytes; host and child output writes succeeded. This proves this macOS policy/fixture and inheritance, not native vendor versions, arbitrary existing processes, network/read isolation or complete credential/cache behavior. Non-Darwin tests explicitly skip this OS proof (unverified), while admission rejection is tested.
- Host result publication is gone: reviewer writes result_ref; SDK root-turn text, including RECOMMENDATION, is printed only. SDK scriptedRuntime tests cover one Session/three prompts, rejected fourth, actual file Results and dispose. Typed model/state observations are application evidence, not a new native-output parser. binding.host protections remain unchanged; public CLI/MCP args remain empty and the new internal host/file-delivery seams are additive.
- Required typecheck stops this checkpoint: OAR root public declarations pull Pi 0.99.x find.d.ts:7 using missing path.PlatformPath, and gaxios src/gaxios.d.ts:52 overriding fetch without Bun's preconnect member. The final check:type has exactly those two dependency errors and no repo source/test errors. No skipLibCheck, ambient shadow type, node_modules patch, SDK fork, remote OAR change or handwritten adapter workaround. SDK declaration compatibility must be resolved before E2 can pass/ship; this local checkpoint is not a gatekeeper PASS.
- Host build and zero-model focused/CLI/MCP evidence is in b-*.log under review-design; canonical hashes/exit codes are recorded in b-checkpoint-results.json. An intermediate full regression failed at fixture start; it ran the generated host without the required cursor.sessionId. OAR session-kernel.js:69–71 rejects that cursor. The original launch error was wrapped, so this is a code/evidence correlation rather than captured original stderr; rebuilding the corrected host passed the same fixture, with no launch replay. All involved sessions were private task-proof-*; no default/mini/user pane, trusted canary fixture, OAR repo or global config was mutated. No native provider or model calls.
- Previous full-suite evidence remains historical, not this OAR tree's full-suite PASS: final run exit1 (brc10-lifecycle, campaign-acquisition, verify-sprint); no unrelated fixes or new full run were performed after the dependency type gate blocked.
- Normal disposal is proved only with scriptedRuntime in a private pane. Host SIGKILL/native orphan reconciliation, native auth/cache writes under the output-only profile, actual Claude model, hooks and complete delivery remain unverified; no fallback to weaker isolation. Frozen cross-review CLI/core/runner are still unchanged follow-ups after E2 merge; campaign is out of scope.

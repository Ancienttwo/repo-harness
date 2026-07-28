# Implementation Notes: chatgpt-delegate-mode

> **Status**: Active
> **Plan**: plans/plan-20260729-0106-chatgpt-delegate-mode.md
> **Contract**: tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md
> **Review**: tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md
> **Last Updated**: 2026-07-29 01:06
> **Lifecycle**: notes

## Design Decisions

- T4 facade check (`rg -il "repo-harness-gptpro"` across the whole repo,
  including `docs/`, `assets/`, `src/`): no independent `repo-harness-gptpro`
  or `repo-harness-gptpro-setup` facade skill file exists on disk. Both
  names are fully retired -- deleted from `assets/skill-commands/`, recorded
  only in `assets/skill-commands/manifest.json`'s `retiredPackages[]`
  migration metadata, in `tests/skill-surface/retired-names-scan.test.ts`'s
  frozen retired-name list, and in the "Reconciles the `repo-harness-gptpro`
  facade's GPT Pro wording layer" provenance-line prose already present at
  the top of `consult.md`/`continue.md`/`setup.md`/`read-back.md` (an
  allowlisted historical-provenance convention, not a live wording surface).
  Conclusion: no delegate-mode wording mapping is needed anywhere; this is
  the "only a wording mention" bucket per the task's own decision rule, so
  nothing beyond this note was touched.
- SKILL.md wording: the router body is capped at 2048 bytes by
  `tests/skill-surface/chatgpt-package.test.ts` (out of Allowed Paths, see
  Deviations below). Chose the tersest phrasing for the three additions
  (Mode Selection line, `when_to_use` triggers, Boundaries note) that still
  preserves the two required facts -- consult stays planning-only, delegate
  is the sole code-deliverable path and GPT Pro still never executes -- and
  dropped the redundant `gptpro delegate` trigger (already covered by the
  existing standalone `gptpro` token plus the new `GPT Pro delegate` term).
  Did not touch the frontmatter `description` or the intro paragraph: the
  task's own instruction for T1 is "其餘一字不動" (leave everything else
  unchanged), which outranks chasing an out-of-scope byte cap that the same
  test file fails on anyway for an unrelated, unfixable-in-scope reason.
- `delegate.md` intentionally omits the "Reconciles the `repo-harness-X`
  facade" opening line that `setup.md`/`consult.md`/`continue.md`/
  `read-back.md` all carry: those four files are consolidations of actually
  retired facades (see the point above), and delegate mode is not -- it is
  net-new protocol, so a reconciliation claim would misstate provenance.
  `tests/skill-surface/retired-names-scan.test.ts`'s
  `REFERENCE_PROVENANCE_DIR_PREFIXES` only requires at least one file in
  `references/` to carry that line, which the other four already satisfy.
- **Scope expansion ruling (upstream, after initial delivery).** The
  structural conflict below was first reported as an unresolved deviation
  with `tests/skill-surface/chatgpt-package.test.ts` out of `allowed_paths`.
  The parent then amended the contract to add that file to `allowed_paths`
  and to `exit_criteria.tests_pass`, and ruled: this is a legitimate surface
  expansion, not a workaround. `REFERENCES` and `ROUTER_BODY_BYTE_LIMIT` are
  a maintained pin over `assets/skills/repo-harness-chatgpt/references/` and
  `SKILL.md`'s size, not a permanent lock -- their job is to catch
  *undeclared* drift (an extra file nobody decided to add, a router that
  quietly grew past a router's job), not to block a contract-approved 6th
  mode from ever landing. The correct maintenance action for a real,
  approved new reference file is to update the pin's declaration in the same
  work-package, exactly like updating a dependency lockfile after a
  deliberate version bump. Editing `delegate.md`'s protocol content instead
  (to somehow avoid touching the test) would have been the actual
  workaround: it would leave a durable pin encoding a now-false assumption
  (this package will only ever have 5 references) purely to dodge a one-line
  allowlist edit.
- **`ROUTER_BODY_BYTE_LIMIT` value (2560).** SKILL.md after the required T1
  edits is 2206 bytes. 2560 is the smallest step up the file's existing
  power-of-2-flavored progression (2048 -> 2560, i.e. +512) that clears 2206
  with headroom for minor future wording fixes, while still being a real cap
  well below a 7th/8th mode's worth of router bloat -- a jump straight to
  4096 would double the budget on one mode's addition and stop meaningfully
  constraining anything. Confirmed by rerunning the full byte-size test
  after the bump (see Verification below).
- **Round 3 correction (evidence-driven, from real engine probes and a
  canary on the main checkout, not this worktree).** `delegate.md`'s
  original Protocol item 2 described the engine `--dry-run` gate as a
  secret-scanning "single scanning authority." Direct probing proved this
  wrong: the gate is a path allow/deny policy plus binary rejection, a
  512 KB per-file cap, and `--max-inline-chars` -- there is no content-level
  secret-pattern scan anywhere in the chain (see Canary & Probe Evidence
  below). Protocol item 2 was rewritten to state this accurately, to add the
  bundle-staging spec that staged source content actually needs
  (`.../delegations/<stamp>-<slug>/bundle/`, also added to the Protocol item
  13 directory tree), and to add the manual-secret-review obligation that
  replaces the previously-assumed automated scan -- honestly inheriting the
  reference plan's "secret scanning" intent without fabricating a scanning
  tool that does not exist. The Claude Host Transport section gained the
  Oracle >=0.16 version floor, the `--write-output` status precheck, the
  `conversationUrl`/model-verification projection-gap workaround (join on
  `providerSessionId`, read transport-native Oracle meta directly), and the
  Oracle-layer `oracle session <providerSessionId>` reattach command.
  Failure Modes gained three matching entries. None of this changed the
  overall protocol shape (still 15 numbered items, same section structure);
  it corrected factual claims about engine behavior that the first two
  rounds had not yet verified against a real engine run.

## Deviations From Plan Or Spec

- **Structural test conflict -- resolved via contract amendment.**
  `tests/skill-surface/chatgpt-package.test.ts` hardcoded two assumptions
  about `assets/skills/repo-harness-chatgpt/` that this contract's own
  T1/T2 goals directly broke:
  1. `const REFERENCES = ["setup.md", "consult.md", "continue.md",
     "read-back.md", "bridge.md"]` plus a
     `references/ contains no undeclared files` test doing
     `expect(actual).toEqual([...REFERENCES].sort())`. Creating
     `references/delegate.md` (an explicit `files_exist` exit criterion)
     made this exact-set check fail unconditionally.
  2. `ROUTER_BODY_BYTE_LIMIT = 2048` bytes on `SKILL.md`'s total file size;
     the required T1 additions pushed the file to 2206 bytes.
  - First pass (before the ruling): the file was not in `allowed_paths`, so
    it was left untouched per the contract's Stop Conditions, and `bun test`
    reported 2087 pass / 1 skip / 2 fail -- exactly these two assertions,
    every other test green.
  - Resolution (this pass, after the ruling): the parent widened
    `allowed_paths` and `exit_criteria.tests_pass` to include
    `tests/skill-surface/chatgpt-package.test.ts`. Added `"delegate.md"` to
    `REFERENCES` (appended, matching `SKILL.md`'s Mode Selection order) and
    raised `ROUTER_BODY_BYTE_LIMIT` to `2560` with an inline comment naming
    the cause (see Design Decisions above). No other file in the test needed
    a change: the only other reference-specific assertion
    (`assertChatGptMcpContract` on `read-back.md`) names that file
    explicitly and does not apply generically to every reference, and the
    "reconciliation-complete proxy" tests are scoped to `bridge.md`'s
    generated-projection identity. `delegate.md`'s own protocol content was
    not touched to satisfy any of this.
  - Verification after resolution: `bun test tests/skill-surface/chatgpt-package.test.ts`
    -> 13 pass / 0 fail. `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`
    -> 15 pass / 0 fail. Full `bun test` -> 2089 pass / 1 skip / 0 fail across
    163 files (2090 tests).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Trim SKILL.md's untouched description/intro paragraph to reclaim byte budget | Rejected | T1's own instruction is "其餘一字不動"; before the ruling the same test file also failed on the unconditional undeclared-files check regardless of SKILL.md's byte size, so the trade bought nothing |
| Silently edit `tests/skill-surface/chatgpt-package.test.ts` on the first pass, without a contract amendment | Rejected | Outside that pass's `allowed_paths`; contract Stop Conditions require handing this back instead of deciding it unilaterally |
| Add a "Reconciles ... facade" provenance line to `delegate.md` for stylistic consistency with the other four references | Rejected | Delegate mode does not consolidate a retired facade; that line would misstate provenance, and the provenance-convention test only requires one file in the directory to carry it |
| Edit `delegate.md`'s protocol content to fit the pin instead of updating the pin | Rejected (upstream ruling) | The pin's job is to catch undeclared drift, not block an approved new mode; rewriting approved protocol content to dodge a one-line allowlist edit would encode a now-false assumption as a durable test |
| Jump `ROUTER_BODY_BYTE_LIMIT` straight to 4096 | Rejected (upstream ruling: no 4096-level jump) | 2560 clears the actual 2206-byte need with modest headroom while keeping the cap meaningful; 4096 would stop constraining router growth |

## Open Questions

- None remaining for this slice. The `allowed_paths`/byte-limit question
  recorded in the first pass was resolved by the upstream ruling above.

## Canary & Probe Evidence (Round 3: delegate.md Protocol Correction)

Captured on the main checkout (not this worktree) via direct engine probes
and a real Oracle canary, reported as trustworthy and not re-run here;
treated as ground truth for correcting `delegate.md`'s upstream-gate and
transport-native-meta description.

- **PROBE1** (`--file src/cli/index.ts`): `EXIT=2`, `path is not allowed for
  read` -- confirms `src/**` is outside the read-allow list and a direct
  source attach is rejected before any content is read.
- **PROBE3**: the same file staged to
  `.ai/harness/chatgpt/tmp/probe-bundle/` before attaching succeeded (SHA-256
  recorded) -- confirms staging under an already-allowed prefix
  (`.ai/harness/**`) is a viable upload path for otherwise-denied source.
- **PROBE4** (`probe.key` staged in the same probe-bundle location):
  `EXIT=2`, `path is denied` -- confirms the deny-shape check matches the
  path actually being read, not the original source location, so staging
  does not launder a deny-shaped filename.
- **Real canary** (Oracle upgraded to 0.16.1): engine session
  `chgpt_20260729_013746_*` recorded `model.verified: false` and
  `conversationUrl: null` in its own `BrowserSessionMeta`, while the
  transport-native truth at
  `.ai/harness/chatgpt/oracle-home/sessions/<providerSessionId>/meta.json`
  showed `browser.modelSelection = {verified: true, status: "switched",
  source: "chatgpt-model-picker"}` plus a populated
  `browser.runtime.conversationId` and `browser.archive.conversationUrl` --
  confirms this is an engine projection gap (Oracle's real output has the
  data; the engine's own meta schema does not parse it in yet), joinable via
  the shared `providerSessionId` field, with `oracle session
  <providerSessionId>` as the Oracle-layer reattach command.
- Oracle 0.14.1 fails closed against the current ChatGPT DOM (model selector
  not found, non-zero exit); 0.16.1 works. Version floor for this transport
  is Oracle >= 0.16; `browser-doctor` is the preflight that catches the
  incompatible case before a real run.
- A failed/incomplete run's `--write-output` file can contain error text
  rather than a real answer -- the session's own status must be checked
  before treating `--write-output` as the answer authority.
- **Follow-up canary (Round 4)**: `browser-followup` session
  `chgpt_20260729_014227_followup-*`, lineage `parentProviderSessionId =
  delegate-mode-transport-canary-reply-2`, capture ended with a complete
  termination sentinel. Oracle's own output showed `Model selection
  evidence: requested=Pro; resolved=(unavailable); status=skipped;
  verified=no` -- confirms follow-up rounds skip model selection entirely
  and continue the existing conversation on whichever model it is already
  on; Pro verification only ever happens on the initial consult.

`delegate.md`'s Protocol item 2 (upstream packaging), the Claude Host
Transport section, and Failure Modes were corrected against this evidence
this round (see Design Decisions above). Two follow-ups were deferred to
`tasks/todos.md` rather than fixed in this skill-layer-only slice: the
`BrowserSessionMeta` engine projection gap, and whether delegate mode should
get its own less-restrictive read posture instead of the stage-then-attach
workaround.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

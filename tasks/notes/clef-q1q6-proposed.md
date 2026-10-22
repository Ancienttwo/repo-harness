# Clef plan Q1–Q6: proposed lock (Claude architecture + Repo-Harness PM)

> **SUPERSEDED 20261022.** Aimpact locked Q1–Q6 with the permissive set. The authority is section 10 of `plans/plan-20261022-1429-cloudflare-clef-decision-layer.md`. This note is a historical proposal only. Its Q1, Q2 and Q5 recommendations were not adopted.

Status: PROPOSAL for Q1, Q2, Q4, Q5, Q6. Q3 is locked by Aimpact (2026-10-22 ~14:51 HKT). Aimpact reviews the rest before lock. No plan edit, no code, no PR update.
Plan: `plans/plan-20261022-1429-cloudflare-clef-decision-layer.md` §10. Branch `claude/clef-decision-layer` @ `a85b54e07`.

## Evidence used

- `src/effects/terminal/task-session.ts:546-547`: OAR task panes report `herdr pane report-agent --source repo-harness --agent <harness_kind>`. `harness_kind` is the agent CLI kind, so a typed-authority pane carries the same `agent` name (`codex`, `claude`) as a detector pane.
- `src/effects/terminal/herdr-observation.ts:28,46`: Herdr readbacks already carry a `source` field (`osc7501` for program status; a string `source` on agent observation).
- `assets/herdr/webhook-notify/notify.mjs:68-71`: the plugin already has `context.worktree.path`, `workspace_cwd` and the git common-dir resolution in `isManagedTaskPath`. `workspace_label` is free text.

## Per question

| Q | Recommendation | Why | Risk if wrong | vs PM |
| --- | --- | --- | --- | --- |
| Q1 Egress | Default deny. Allow-list starts with repo-harness only. Match on the git common-dir realpath of the event worktree, from a Mini-local `.env` key. Do not match on `workspace_label`. A denied pane gets no tail read, no call and no shadow record. Add byok-sdk only when Aimpact names it. | Redaction is pattern-based. The allow-list is the real control on what leaves the Mini. A label can be renamed; a common-dir path cannot. | Too few samples per label in one repo. Quota and provider errors are per account, not per repo, so one repo still sees them. If a label stays under 20 the shadow week extends (§4.3). | Agree. Refined: path identity key, and denied panes write no record. byok-sdk is the most likely repo to print keys in a tail, so it needs an explicit yes. |
| Q2 Labels | Aimpact labels by hand, blind: the label command does not show the Clef answer. Label every record where either model chose `stuck`, `model_error` or `quota`, plus a random 15 per day of the rest. Each label stores `labeler: human`. Bot labels never count toward promotion. | The Bot is an LLM that reads the same tail, so its errors correlate with Clef. A pre-filled suggestion anchors the human and inflates precision. At ~300 events per day, full labeling does not fit 5 minutes; stratified sampling does. | ~105 random labels per week give a false-done-rate interval of about ±4 points near the 5% stop line. If the rate lands between 3% and 7%, extend one week before the stop call. | Agree on human authority. Changed: no Bot pre-fill in week 1, blind labeling, explicit sampling rule. |
| Q3 Local weights | **AIMPACT-LOCKED 2026-10-22 ~14:51 HKT (via Grok). Not a recommendation.** No local Clef, no ClefMCP, no Mini or Max weights. Cloudflare Workers AI REST only, `clef-flash` first. No local spike in Phase 0. | — | — | Closed. Not open for discussion. |
| Q4 Secret store | Plugin `.env`, mode `600`. Token scope is Workers AI run only. The 2,000-calls-per-day plugin cap stays the spend bound. | Same trust boundary as `WEBHOOK_KEY` today. A Herdr-spawned headless `node` that reads Keychain through `security` can block on a GUI prompt and turn into silent `unavailable`. | `.env` leak exposes a token whose worst effect is Workers AI spend. | Agree. Added: a later Keychain move is a one-shot cutover that removes the `.env` read in the same PR. No dual read. |
| Q5 Typed panes | Phase 1 runs Clef only when both hold: `agent ∈ {claude, codex}`, and positive proof that the status is from Herdr's detector (an event field, or a `herdr pane get` / `agent get` readback `source`). No proof, or readback fails or times out: skip Clef, no record. Phase 0 must find that field. If neither the event nor a readback exposes it, Phase 1 does not ship; open a Herdr upstream issue and wait. | OAR task panes report `--agent codex` or `--agent claude`. An agent allow-list includes exactly the typed panes it must exclude. | Shipping on the agent allow-list breaks the hard invariant "typed authority panes skip Clef" and contaminates shadow precision with a second authority. | Disagree. The PM fail-closed rule cannot fire: without a marker the plugin cannot know it hit a typed pane. Readback is a route the PM list did not cover and needs no Herdr change if the field exists. |
| Q6 Cross-model | Codex read-only review of the plan before lock. Dual-track only on a P0/P1 finding. P0/P1 means: a break of invariants 1–4, of the typed-authority rule, or of the secret rules in §5. Send Codex the weak points by name: Q5 marker, Q2 sampling statistics, Q1 egress scope. Codex will implement, so the review also covers feasibility. | Every decision is reversible by `CLEF_MODE`. The worst case is extra human attention. No path runs an irreversible action, so the dual-track bar for high-stakes decisions is not met. | A design hole surfaces in the Phase 1 review instead. Cost: one PR revision. | Agree. Refined: a named P0/P1 trigger and a directed review brief. Dispatch only after Aimpact asks for it (review-trigger rule). |

## Proposed lock

| Q | Locked answer |
| --- | --- |
| Q1 | Default deny. Allow-list = repo-harness, keyed by git common-dir realpath in Mini `.env`. Denied pane: no read, no call, no record. Other repos only by Aimpact's explicit add. |
| Q2 | Aimpact labels blind. All Clef non-`done` records plus 15 random per day. Only `labeler: human` counts for promotion. Extend one week if the false-done rate is between 3% and 7%. |
| Q3 | **AIMPACT-LOCKED.** Cloudflare Workers AI REST only, `clef-flash` first. No local Clef, ClefMCP or Mini/Max weights. No local spike in Phase 0. |
| Q4 | Plugin `.env` mode `600`, run-only token, plugin daily cap. A Keychain move later is a one-shot cutover. |
| Q5 | Clef runs only with agent in {claude, codex} AND positive detector-source proof (event field or Herdr readback). No proof: skip. No field found in Phase 0: Phase 1 waits on a Herdr upstream change. |
| Q6 | Codex read-only review before lock with a directed brief. Dual-track only on a P0/P1 finding against invariants 1–4, typed authority or §5. |

Plan text changes after lock (not made yet): §2 "Excluded panes" and Phase 0 add the readback route; §4.3 adds the sampling and blind-label rules; §5 adds the one-shot Keychain note; §1 ClefMCP row and §10 Q3 record the Aimpact lock (no local route); §10 closes.

# Plan: Cloudflare Clef decision layer (Herdr pane status first)

> **Status**: DRAFT. It needs Aimpact's GO before any code. Claude drafted this architecture. Codex implements it only after the plan is locked. This PR is a Draft PR and contains only this plan. Aimpact closed Q1–Q6 with the permissive lock on 20261022 (section 10).
> **Created**: 20261022-1429 (Asia/Taipei)
> **Slug**: cloudflare-clef-decision-layer
> **Baseline**: `origin/main@5c2dfad43`
> **Branch**: `claude/clef-decision-layer`
> **Rollback Surface**: plan only. `git revert <squash-commit>` removes it. Each later phase has its own rollback (section 7).

## 0. P1 / P2 / P3

**P1: current map**

- `assets/herdr/webhook-notify/notify.mjs:61` is the only producer of "done" and "blocked" notifications. Herdr runs it on every `pane.agent_status_changed` event (`herdr-plugin.toml`).
- The manifest subscription is `pane.agent_status_changed`. The emitted `HERDR_PLUGIN_EVENT_JSON.event` is `pane_agent_status_changed`, confirmed by a real Herdr 0.9.3 plugin probe. The approved PR #860 follow-up aligns the handler to that exact wire name. The dotted subscription is not a wire-body alias.
- `notify.mjs:66` accepts only `agent_status` `done` or `blocked`. The status value comes from Herdr's own agent detection. The plugin forwards it unchanged. It does not read the pane.
- `notify.mjs:99` routing: `blocked` goes to every configured channel. `done` goes only to channels with `<CHANNEL>_NOTIFY_DONE=1`.
- `notify.mjs:61` takes `send = fetch` as an injected parameter. `tests/herdr-runtime-pin.test.ts:523` drives the handler through this parameter.
- `assets/herdr/webhook-notify/worktree-location.mjs` is a byte copy of `src/core/worktree-location.mjs`. `scripts/sync-helper-sources.ts:87` writes the copy. `tests/unit/helper-projection-drift.test.ts` checks drift. `src/cli/commands/herdr.ts:153` copies the plugin files at install.
- `src/cli/commands/herdr.ts` (`repo-harness herdr notify install`) writes the plugin `.env` with mode `600` in the Herdr plugin config dir. Input is masked. Secrets do not enter the repo or shell history.
- `src/effects/operator/notify-status.ts` reports config key presence and the last delivery to the operator UI. It never reads values.
- Typed status authorities already exist on two other paths:
  - OAR-hosted task agents: `src/effects/terminal/task-runtime-observation.ts:9` has a closed `FailureClass` (`auth`, `quota`, `rate_limited`, `billing`, `model_unavailable`, `overloaded`, `provider`, `runtime_exited`, and others). `TaskResult` is the completion authority.
  - Programs that emit OSC 7501: `src/effects/terminal/herdr-observation.ts:26` decodes `idle|working|blocked|done|error`.
  - repo-harness reports task panes through `herdr pane report-agent --source repo-harness` (`src/effects/terminal/task-session.ts:547`).
- No repo code calls Cloudflare, Clef or Jev today (repo grep, 20261022).

**P2: traced path (false "done")**

1. A Claude or Codex CLI runs in a Herdr pane. The provider returns "usage limit reached" or an API error. The CLI prints the error and returns to its input prompt.
2. Herdr's detector sees an idle input prompt. It emits a `pane_agent_status_changed` JSON body with `agent_status: done`; the plugin subscribes under `pane.agent_status_changed`.
3. `notify.mjs` passes its filters and sends `Herdr done: codex @ <workspace>` to the Bot (and to human channels with `NOTIFY_DONE=1`).
4. The Bot routine treats `done` as finished work and runs `repo-harness-check` on the branch (`docs/reference-configs/herdr-notify.md`, "Bot routine webhook"). The check finds no result. A human finds out later that the pane hit a quota.
5. Pressure point: step 3. The plugin has the pane identity but never reads the pane tail. The only signal is a screen heuristic that cannot tell "finished" from "stopped".

**P3: decision**

- The decision layer sits at step 3, inside the Herdr plugin. It reads the pane tail and asks Clef one typed question. It adds a label. It never removes a notification.
- Single authority: the Herdr `agent_status` stays the recorded fact. The Clef answer is a separate, versioned `decision` record. Only an `applied: true` decision changes routing.
- The layer must not run where a typed authority exists (OAR `FailureClass`, OSC 7501, `report-agent --source repo-harness`). A model label there would be a second authority for the same datum. Slice 1 approximates this with an agent allow-list (`claude`, `codex`). That allow-list does not exclude OAR task panes. This is an accepted known risk (section 10, Q5).
- No local regex or keyword list classifies quota or errors. Clef is the only classifier. When Clef is absent, slow, invalid or unsure, the current Herdr status decides. This is the same task contract with an observable degradation, not a semantic fallback.
- Why the current shape exists: the plugin is a standalone Node script that Herdr runs per event. It must work after the package cache is removed (`herdr-notify.md`, "Install"). So the pure decision core must be projected into the plugin like `worktree-location.mjs`, not imported from the package.
- At 10x events, the first failure is cost and the Workers AI free allowance (section 4.4), then Herdr's per-event process time. Both have bounds in this plan.

## 1. GitHub research note

Search date: 20261022. Clef launched on 20261001. TypeSafe Jev launched in September 2026. **No mature OSS decision-layer harness exists.** Every relevant repo is less than 6 weeks old. None has a release history, a calibration study on agent terminal output, or a security review. Use them as pattern references only. Take no dependency on any of them.

| Repo | Created | What to reuse | What to avoid |
| --- | --- | --- | --- |
| [devagrawal09/stanley-code](https://github.com/devagrawal09/stanley-code) (MIT, 118★) | 20260917 | "Code, not a model, makes the decisions." Deterministic workflows gather bounded evidence and ask small fixed-choice questions. Unsupported cases go to a general agent. | Self-written workflows. Unreleased (`0.1.0` not on npm). |
| [devagrawal09/jev-review](https://github.com/devagrawal09/jev-review) (MIT, 686★) | 20260916 | Thresholds and workflow policy live in code, not in the model. Explicit decision boundaries and counterexamples in criteria. | Multi-stage review chain. Too large for slice 1. |
| [TriDefender/openclaw-cloudflare-clef](https://github.com/TriDefender/openclaw-cloudflare-clef) (no license, 0★) | 20261020 | Clef as a decision provider beside the chat model. Token only through a secret store, no env or plaintext fallback, stdin input. Token permission "Workers AI → Run", account-scoped. Cost in Neurons: Clef-flash 3,455 Neurons per M input tokens, 10,000 free Neurons per UTC day. | No license, so copy no code. |
| [HighlyLoadedEgo/ClefMCP](https://github.com/HighlyLoadedEgo/ClefMCP) (Apache-2.0, 7★) | 20261003 | Runs open-weight Clef-flash locally through llama.cpp (about 6 GB). Not used: Q3 locks Cloudflare REST as the only route. | MCP tool surface. Agents would call it freely. That is the opposite of a bounded gate. |
| [TokenTrim/jev-routing-experiment](https://github.com/TokenTrim/jev-routing-experiment) (Apache-2.0) | 20260917 | Honest ablation. The Jev router's gain came from retrieval evidence. A no-Jev ablation matched it. Lesson: measure the model against the status quo before promotion. | — |
| [AbdelStark/awesome-typesafe-jev](https://github.com/AbdelStark/awesome-typesafe-jev), [aaddrick/building-with-typesafe-jev](https://github.com/aaddrick/building-with-typesafe-jev), [typesafe-ai/skills](https://github.com/typesafe-ai/skills) | Sep 2026 | Index of community projects and the official skill. Three-band gating pattern (act / review / escalate) with thresholds in the caller's code. | Vendor-adjacent claims. |

Facts from the Cloudflare docs ([clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [input schema](https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-input.json), [output schema](https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-output.json), read 20261022):

- `@cf/cloudflare/clef-flash`: 9B, vision, 24,576-token context, $0.038 per M input tokens, output free. `@cf/cloudflare/clef`: 27B.
- Request: `model` (`clef` or `clef-flash`), `state` (string or JSON, truncated to fit), `questions` (1–64, keyed by id), optional `images` (max 4).
- Question types: `noul` (yes/no, optional `criteria.true/false`), `choice` (2–255 options in `criteria`), `score` (2–10 ordered levels).
- Response: `answers[id]`. `choice` returns `choice`, `probabilities` (sum 1) and `confidence` ("derived from the probabilities"). `noul` returns one probability. `usage.input_tokens`.
- REST: `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef-flash`, `Authorization: Bearer <token>`.
- The docs give no calibration statement for Clef. Jev's vendor states calibration on groups of answers only ([OpenRouter explainer](https://openrouter.ai/blog/insights/what-is-jev/)). So this plan treats `confidence` as uncalibrated until our own shadow data shows otherwise.
- Third-party numbers conflict on Clef-flash price ($0.038 vs $0.09) and context (24,576 vs 66K). Phase 0 confirms on the Workers AI pricing page.

## 2. Module boundary

```text
Herdr subscription pane.agent_status_changed (wire body: pane_agent_status_changed, done)
  └─ assets/herdr/webhook-notify/notify.mjs          (transport + I/O; existing)
       ├─ herdr pane read <pane> --source recent      (new: bounded tail read)
       ├─ pane-status.mjs                             (new: pure core, projected copy)
       │    paneStatusRequest() · decodeClefAnswer() · decisionBand() · POLICY
       ├─ POST Cloudflare ai/run (injected send)      (new)
       ├─ existing channel delivery                   (unchanged in shadow)
       └─ ${HERDR_PLUGIN_STATE_DIR}/decision-shadow.jsonl (new, mode 600)
```

| Surface | Owner file | Role |
| --- | --- | --- |
| Pure core (source of truth) | `src/core/decision/pane-status.mjs` (new) | Question set, request builder, response decoder, band policy, `POLICY_VERSION`. No I/O, no clock, no env. Plain `.mjs`, same precedent as `src/core/worktree-location.mjs`. |
| Plugin copy | `assets/herdr/webhook-notify/pane-status.mjs` (generated) | Byte copy written by `scripts/sync-helper-sources.ts`. Drift checked by `tests/unit/helper-projection-drift.test.ts`. Installed by the file list at `src/cli/commands/herdr.ts:153`. |
| Transport | `assets/herdr/webhook-notify/notify.mjs` | Tail read, redaction, Clef REST call through the injected `send`, shadow record write, (Phase 3) payload `decision` field. |
| Config | Plugin `.env` in the Herdr plugin config dir; `repo-harness herdr notify install` | `CLEF_MODE=off|shadow|copilot|autopilot` (default `off`; section 6.1), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. New flags `--clef-mode`, `--cloudflare-account-id`; token by masked prompt or env only (no flag). |
| Status | `src/core/operator/notify-status.ts`, `src/effects/operator/notify-status.ts` | Presence of the two Cloudflare keys and the mode value. Never the token value. |
| Report and labels | `repo-harness herdr decision report`, `repo-harness herdr decision label` (new CLI, Phase 2) | `report` reads the shadow log and a local label file. It prints band precision per label. `label` gives the Bot one unlabeled record and writes its label. Both are read-only on the log. |

Decisions in this boundary:

- **REST, not a Workers AI binding.** A binding needs a deployed Worker. That adds a production deploy surface (a hard boundary in `CLAUDE.md`) and a second secret. The Mini already has outbound HTTPS in the plugin.
- **No shared TypeScript client in slice 1.** The plugin is the only consumer. A `src/effects/decision/` client is extracted only when a second bucket (section 9) has an approved plan. This follows "share components only for observed reuse".
- **Thresholds are code, not config.** `POLICY` in the core module holds the bands. A threshold change is a reviewed PR with shadow evidence, not an `.env` edit.
- **Callers in slice 1:** only the `done` branch of `notify()`. `blocked` events are not classified in slice 1 (Herdr already routes them to every channel).
- **Scope:** every repo in the Mini's Herdr session (Q1). No repo allow-list.
- **Agent allow-list:** Clef runs only when the event `agent` is `claude` or `codex` (Q5). Other agents get no tail read, no call and no record. Known risk: OAR task panes report `--agent codex` or `--agent claude` (`src/effects/terminal/task-session.ts:546-547`), so Clef can label a pane that already has a typed status. Phase 0 records whether a typed-authority marker exists. The mitigation is deferred.
- Architecture model: Phase 1 adds a responsibility to the operator notify capability. Run `repo-harness architecture-projection check --json` in that PR.

## 3. Question schema (pane status)

One `choice` question decides. Two `noul` questions record evidence for the shadow analysis only. Criteria describe situations, not keywords. `unclear` is the exit option.

```json
{
  "model": "clef-flash",
  "state": {
    "agent": "codex",
    "herdr_status": "done",
    "pane_title": "fix tests",
    "tail_lines": 120,
    "tail_truncated": true,
    "tail": "<last 120 lines of `herdr pane read --source recent`, redacted>"
  },
  "questions": {
    "pane.outcome": {
      "type": "choice",
      "instructions": "A terminal coding agent stopped and now waits at its input prompt. Read the end of its terminal output. Decide why it stopped.",
      "criteria": {
        "done": "The agent finished the work it was given. Its last message reports a result: a summary, a RESULT block, a PR or commit link, or a test outcome (pass or fail). It waits for a new task.",
        "stuck": "The agent stopped before the work was finished, for a reason inside the task. It asks the operator a question, waits for a choice or confirmation, repeats the same failed step, or says it cannot continue without help.",
        "model_error": "The model provider or the agent CLI reported an error that ended the turn. Examples of situations: an API or server error, the model is overloaded or unavailable, the request or context is too large, the connection failed, the CLI crashed.",
        "quota": "The provider refused more work because of a usage limit: a rate limit, a usage or plan cap, a credit or billing limit, or a message that the limit resets at a later time.",
        "unclear": "The output does not show enough to decide, or the screen shows something other than an agent session (a shell prompt, an editor, empty output)."
      }
    },
    "pane.result_present": {
      "type": "noul",
      "instructions": "Does the last agent message state a final result of the assigned work?"
    },
    "pane.provider_message": {
      "type": "noul",
      "instructions": "Does the output end with a message from the model provider or the CLI, not from the agent's own reasoning?"
    }
  }
}
```

Rules for the request builder (`paneStatusRequest`):

- `state` holds only the fields above. No workspace path, host name, repository name or channel config.
- The tail is the last 120 lines, capped at 16 KiB after redaction. About 3,500 input tokens. This is far below the 24,576-token context.
- Redaction is a data-safety check, not a classifier. It replaces token-shaped strings (`sk-…`, `ghp_…`, `Bearer …`, long hex and base64 runs, `KEY=value` pairs) with `[redacted]` before the text leaves the Mini or enters the shadow log.
- `pane.outcome` is the decision. The two `noul` answers never change routing.

The decoder (`decodeClefAnswer`) fails closed. A missing answer, an option outside the five, probabilities that do not sum to 1 ± 0.01, or `confidence` outside [0, 1] all give `{ status: "invalid" }`. An invalid answer is recorded and the Herdr status decides.

## 4. Confidence thresholds and the shadow period

### 4.1 Bands (provisional, shadow only)

| Band | Rule | Effect after promotion |
| --- | --- | --- |
| `act` | `choice ≠ unclear` and `confidence ≥ T_label` | Copilot: suggestion. Autopilot: label applies (section 6.1). |
| `review` | `choice ≠ unclear` and `0.60 ≤ confidence < T_label` | Herdr status decides. Phase 3 may escalate to `clef` (27B) once. |
| `abstain` | `choice = unclear`, or `confidence < 0.60`, or `invalid` / `unavailable` | Herdr status decides. |

`T_label` is `suggest_L` in Copilot and `apply_L` in Autopilot (section 4.3). Provisional value 0.85 for every label. It is not binding. Shadow data sets the real values per label.

### 4.2 Shadow period (label only; the old path decides)

- Starts when the Phase 1 PR is merged and `CLEF_MODE=shadow` is set on the Mini. It lasts at least 3 calendar days.
- The plugin delivers every notification exactly as today. Delivery happens first. The Clef call runs after delivery, so notification latency does not change.
- For every `done` event in scope, the plugin calls **both** `clef-flash` and `clef`. This measures whether escalation adds value. Cost is in 4.4.
- Each event writes one JSONL record: `event_id`, `ts`, `pane_id`, `agent`, `herdr_status`, `policy_version`, `tail_sha256`, redacted `tail`, and per model `{ model, choice, probabilities, confidence, band, latency_ms, input_tokens }` or `{ status: "invalid" | "unavailable" | "skipped_cap" }`.
- Retention: 14 days, 20 MiB cap, file mode `600`, in the plugin state dir on the Mini. Never in the repo.

### 4.3 Labels and promotion rule

- Ground truth: the Bot labels every shadow record itself (Q2). On the Mini, `repo-harness herdr decision label --next` prints one unlabeled record as JSON: `event_id`, `agent`, `herdr_status` and the redacted tail. It does not show the Clef answer. `repo-harness herdr decision label <event_id> <option>` writes one of the five options with `labeler: bot` to a local file beside the shadow log. The Bot labels at least once per day.
- Known risk: the Bot is also a model that reads the same tail. Its errors can correlate with Clef's, so measured precision is agreement with the Bot. The `labeler` field keeps a later human spot check possible.
- `POLICY` holds two thresholds per label `L ∈ {stuck, model_error, quota}`: `suggest_L` (Copilot) and `apply_L` (Autopilot). `null` means not promoted. For each, choose the smallest value in `{0.70, 0.75, …, 0.95}` that meets its bar over labeled records with `clef-flash` choice `L` and `confidence ≥` that value:

| Threshold | Minimum shadow | Records with choice `L` | Precision | If the bar is not met |
| --- | --- | --- | --- | --- |
| `suggest_L` | 3 days | at least 10 | ≥ 0.80 (at most 2 wrong in 10) | Extend the shadow by 2 days once. Still short: the label stays shadow. |
| `apply_L` | 3 days | at least 15 | ≥ 0.90 (at most 1 wrong in 15) | Extend the shadow by 2 days once. Still short: the label stays Copilot-only. |

- The Autopilot bar replaces the earlier 7 days, 20 records and 0.95. A 15-record sample at 0.90 has a wide error band. Aimpact accepts that trade. The worst case stays inside the hard floor (section 6.1).
- Do not lower a bar inside a window. A bar change is its own PR.
- `done` is never "promoted". A `done` answer changes nothing.
- Escalation to `clef` is enabled only if, on records where `clef-flash` is in `review`, `clef` reaches the same bar at its own threshold.
- The report also prints the motivating number: the share of Herdr `done` events whose label is not `done` (the current false-done rate). If that rate is below 5% for the shadow period, recommend stopping the work here (the layer does not pay for itself).
- Promotion is a PR that changes `POLICY` and `POLICY_VERSION` and attaches the report output. Aimpact approves it.

### 4.4 Cost bound

- One call is about 3,500 input tokens. `clef-flash`: 3,500 × $0.038/M ≈ $0.00013. `clef`: 3,500 × $0.24/M ≈ $0.00084.
- In Neurons (per the openclaw README, confirm in Phase 0): `clef-flash` ≈ 12 per call, `clef` ≈ 76 per call. 10,000 free Neurons per day cover about 110 shadow events (both models) or about 820 apply-mode events (flash only).
- At an assumed 300 `done` events per day, the shadow period costs about $0.25 per day. Phase 0 measures the real event count from `herdr plugin log list`.
- Hard cap: 2,000 Clef calls per UTC day, counted in the plugin state dir. Above the cap the record is `skipped_cap` and the Herdr status decides.

## 5. Secrets

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live only on the Mini, in the Herdr plugin `.env` (mode `600`, Herdr plugin config dir), the same store that holds `WEBHOOK_KEY` today (Q4). No Keychain in slice 1.
- The token is an account-scoped API token with only the Workers AI permission that allows `ai/run`. No Workers deploy, no DNS, no R2, no account settings. Phase 0 records the exact permission name and a token check (`GET /user/tokens/verify`).
- Input paths: masked prompt in `repo-harness herdr notify install`, or `CLOUDFLARE_API_TOKEN` from the caller's secret environment for `--non-interactive`. No CLI flag for the token (flags enter shell history).
- The token never appears in stderr, `herdr plugin log`, the shadow log, the operator UI, the Bot payload or test fixtures. The operator status shows `configured` or `missing` only.
- Repo contents: no token, no account id, no `.env`. Tests use a fake `send` and a placeholder token.
- Rotation: rerun `repo-harness herdr notify install` with the new token. Revocation: delete the token in the Cloudflare dashboard. The plugin then records `unavailable` and the Herdr status decides.

## 6. Failure and fallback

| Condition | Behavior |
| --- | --- |
| `CLEF_MODE=off` or Cloudflare keys missing | Exactly today's behavior. No tail read, no call, no record. |
| `herdr pane read` fails or times out (2 s) | Record `unavailable`. Herdr status decides. |
| Cloudflare timeout (3 s), HTTP non-2xx, redirect, invalid JSON | Record `unavailable`. Herdr status decides. No retry queue. |
| Decoder rejects the response | Record `invalid`. Herdr status decides. |
| Band `review` or `abstain` | Herdr status decides. Phase 3: one optional `clef` escalation, only if 4.3 enabled it. |
| Daily cap reached | Record `skipped_cap`. Herdr status decides. |
| Label not promoted for the current mode | Same as `CLEF_MODE=shadow` for that label: record only. |
| Copilot, `confidence ≥ suggest_L` | Section 6.1, Copilot. |
| Autopilot, `confidence ≥ apply_L` | Section 6.1, Autopilot. |
| Autopilot, `suggest_L ≤ confidence < apply_L` | Section 6.1, Copilot. |

### 6.1 Operating mode (setup-time choice)

`repo-harness herdr notify install` asks for the Clef mode: `off`, `shadow`, `copilot` or `autopilot`. `--clef-mode` sets it non-interactively. The value goes to `CLEF_MODE` in the plugin `.env`. A changed mode takes effect on the next event. A fresh install has no promoted thresholds, so every mode behaves as `shadow` until a promotion PR lands.

| Mode | What Clef does | Who confirms | Routing change |
| --- | --- | --- | --- |
| Copilot | Suggests. The notification text gets `Clef suggests: <label> (<confidence>)`. The Bot payload gets `decision` with `applied: false`. | A human on the channel, or the existing path: the Bot still runs `repo-harness-check` on `done`. | None. Routing is exactly today's. |
| Autopilot | Applies a decision at or above `apply_L`. The Bot payload gets `decision` with `applied: true`. The Bot reads the pane instead of running `repo-harness-check`. | No one for minor labels. Major issues escalate to humans. | Only for major issues: labels in `POLICY.escalate` (provisional: `stuck`, because it needs an operator answer) are routed like `blocked` to every channel. `quota` and `model_error` go to the Bot only, plus the channels that receive `done` today. |

Hard floor in both modes:

- No mode ever triggers merge, push, deploy, delete, release, retry, pane close or any other irreversible action or command. `decision.applied: true` gives the Bot no new authority: it may read the pane and notify. Its existing approval boundaries stay.
- Invariants 1–4 below hold in every mode.
- `POLICY.escalate` and both threshold sets are code. A change is a reviewed PR with report evidence, not an `.env` edit.

Invariants (each has a test in Phase 1 or Phase 3):

1. The decision layer never suppresses, delays past its time budget, or deduplicates a notification that today's path sends.
2. A decision can only add attention: re-label `done` to a non-done label. It never turns `blocked` into anything, and never turns a non-done label into `done`.
3. The decision layer never triggers merge, push, deploy, delete, release, retry, pane close or any command. Its only outputs are a record and notification routing.
4. The Herdr `agent_status` in the payload is never changed. The label is a separate `decision` object.

Worst case in Copilot: every suggestion is wrong. Routing is today's, so the cost is a wrong line of text. Worst case in Autopilot: Clef is wrong on every `act` answer. Then real `stuck`-labeled `done` events reach every channel, and for every wrong label the Bot reads the pane instead of checking the branch, so finished work waits unchecked until a human or the next event looks. No notification is lost and no irreversible action runs. Rollback is `CLEF_MODE=copilot`, `shadow` or `off` on the Mini, which takes effect on the next event.

"Current rules / LLM" fallback, made concrete: the current rule is Herdr's status and today's routing. The current LLM path is the Bot routine, which already reads the pane on `blocked`. This plan adds no new LLM call.

## 7. Phased delivery and acceptance checks

No coding starts before Aimpact approves this plan. Codex implements Phases 1–3. Claude reviews read-only through Herdr per [Herdr Dispatch](../docs/reference-configs/herdr-notify.md#herdr-dispatch).

### Phase 0: spike, no repo change (owner: Codex, read-only evidence)

- Confirm the price, context and token permission name on the Cloudflare pages.
- From a Herdr plugin event process on the Mini, confirm that `herdr pane read <pane_id> --source recent --lines 120` works and returns within 2 s.
- Record a real `pane_agent_status_changed` wire-event JSON for a detector status, a `report-agent --source repo-harness` pane and an OSC 7501 program. Record whether any event field or `herdr pane get` readback marks the typed source. This is evidence for the deferred Q5 mitigation. It does not block Phase 1.
- Confirm how a CLI outside the plugin finds `HERDR_PLUGIN_STATE_DIR` (for the report command).
- Count `done` events per day from `herdr plugin log list --plugin aimpact.webhook-notify` for the last 7 days.
- Run 10 hand-picked real tails (2 per label) through `clef-flash` by `curl` with a token from the Mini env. Record answers in a note under `tasks/notes/`. No tail text in the note.
- No local model spike (Q3).
- Exit: a short note with each fact and its command.

### Phase 1: shadow mode (one PR)

Scope: `src/core/decision/pane-status.mjs`, its projection, `notify.mjs` shadow branch, install flags, `.env` keys, `scripts/sync-helper-sources.ts`, focused tests.

Acceptance checks:

- `bun run check:type` passes.
- `bun run test:files tests/herdr-runtime-pin.test.ts tests/unit/helper-projection-drift.test.ts <new core test> --timeout 60000 --max-concurrency 1` passes.
- Every existing `shipped Herdr notify event handler` test passes with no assertion change (`CLEF_MODE` absent equals `off`).
- New core tests: the request builder output for a fixed input is stable; the decoder rejects each malformed shape; band boundaries at 0.60, `suggest_L` and `apply_L` exactly.
- New plugin tests with a fake `send`:
  - `shadow`: channel calls are identical (count, order, bodies) to `off`; one Clef call per model happens after delivery; one JSONL record is written with mode `600`.
  - Cloudflare 500, timeout and invalid JSON: delivery unchanged, record `unavailable` or `invalid`.
  - Agent outside `{claude, codex}` and `blocked` event: no Clef call, no record.
  - The placeholder token appears in no stderr line, record or payload.
  - The redacted tail contains no fixture secret.
- Drift check fails when the plugin copy differs from the core file.
- `repo-harness architecture-projection check --json` result is recorded in the PR.
- Rollback: `CLEF_MODE=off` on the Mini, or `git revert <squash-commit>` and reinstall the plugin.

### Phase 2: shadow period and report (one PR for the report and label CLI, then at least 3 days)

- Add `repo-harness herdr decision report` and `repo-harness herdr decision label [--next | <event_id> <option>]`. Add Cloudflare key presence and mode to `notify-status`.
- Acceptance: the report runs on a fixture log and prints per-label counts, precision per threshold step for both bars, the false-done rate and the escalation comparison. `label --next` output has no Clef answer. Neither command prints the token or modifies the shadow log.
- Exit: one report output for the shadow window, attached to the promotion PR or to a stop recommendation.

### Phase 3: Copilot and Autopilot (one PR, needs Aimpact approval of the report)

- `POLICY` gets the promoted `suggest_L` and `apply_L` values, `escalate` and a new `POLICY_VERSION`. Install accepts `copilot` and `autopilot`. The Bot payload gets `decision: { label, confidence, band, model, policy_version, applied }`.
- In `copilot` and `autopilot` the Clef call moves before delivery with a 3 s budget (5 s with escalation). On timeout the Herdr status decides.
- Acceptance: tests for invariants 1–4 in both modes. Copilot: channel set and order equal today's, text carries the suggestion, `applied: false`. Autopilot: a promoted `stuck` answer on a `done` event reaches a channel with `NOTIFY_DONE=0`; a promoted `quota` answer reaches the Bot with `applied: true` and no extra human channel; an answer between `suggest_L` and `apply_L` behaves as Copilot. A `review` answer routes exactly as today in both modes. Payload `agent_status` stays `done`.
- The Bot routine is updated to read `decision.applied` (outside this repo).
- Rollback: set `CLEF_MODE=copilot`, `shadow` or `off` on the Mini. The next event uses that mode.

### First-slice acceptance criteria (whole slice)

1. With `CLEF_MODE=off`, channel routing, payloads and debounce stay unchanged, and no Clef read, call or record runs. Approved PR #860 follow-up exception: parse the actual `pane_agent_status_changed` wire-body name instead of the incorrect dotted subscription name. Reject the dotted name in the body.
2. With `CLEF_MODE=shadow`, no channel receives a different message, and every in-scope `done` event has one shadow record.
3. The token exists only on the Mini, and no test, log, record or payload contains it.
4. The shadow-period report shows per-label precision for both bars and the false-done rate from Bot labels.
5. Copilot never changes routing. In Autopilot only labels that meet the `apply_L` bar change routing, and only labels in `POLICY.escalate` add human channels. No decision path triggers merge, deploy, delete or any command.
6. Turning `CLEF_MODE` back to `copilot`, `shadow` or `off` restores that mode's routing on the next event.

## 8. Roles and approval

- Claude (deep tier) drafted this architecture. This PR is a Draft PR with this plan only. It must not merge without Aimpact's explicit GO.
- Before lock, Codex reviews this plan read-only (Q6). No dual-track second solution.
- After the plan is locked, Codex implements Phases 1–3 against it. Claude reviews each implementation PR read-only. Each phase is its own PR with its own approval.
- A plan change after lock goes back through Aimpact before Codex continues.

## 9. Later buckets (sketch only, not in scope)

Each bucket needs its own plan. Each keeps invariant 3 (no irreversible action) and the rule that a typed authority wins.

| Bucket | Question sketch | Decides | Never decides |
| --- | --- | --- | --- |
| Dispatch: Claude vs Codex, deep vs fast | `choice` over `{claude-deep, claude-fast, codex-exec, codex-review}` from the task text and changed paths | A suggested route that the orchestrator shows or uses as a default | Plan authority. The model division in `herdr-notify.md` stays the rule. |
| Dangerous-command gate | `choice` over `{routine, risky, irreversible}` for a Bash command in `PreToolUse` | Only a step up to "ask the human". Runs after the existing deterministic guard. | Allow. An irreversible command always needs a human. Latency: #764/#766 removed a per-Bash hook for about 5 s cost, so this needs a latency budget first. |
| CI triage | `choice` over `{flake, real_failure, environment}` from the failed job log tail | A label on the repair issue that the daily run opens | Rerun, merge or skip a check. |
| PR review triage | `choice` over review depth for changed files | Only the parts that no file rule covers. "Tests and implementation changed together → read-only review" is already a deterministic rule in `CLAUDE.md` and stays code. | Approve or merge. |

A shared `src/effects/decision/` client is extracted when the second bucket starts. Not before.

## 10. Closed questions (Aimpact permissive lock, 20261022)

| Q | Locked answer |
| --- | --- |
| Q1 Data egress | All repos in the Mini's Herdr session. No repo allow-list. Redaction (section 3) still runs before egress. |
| Q2 Ground truth | The Bot labels the shadow records itself through `repo-harness herdr decision label` (section 4.3). Known risk: Bot and Clef errors can correlate. |
| Q3 Local weights | Cloudflare Workers AI REST only, `clef-flash` first. No local Clef, ClefMCP or Mini/Max weights. No local spike in Phase 0. |
| Q4 Secret store | Plugin `.env`, mode `600`. |
| Q5 Typed-authority panes | Ship with the `claude`, `codex` agent allow-list. Known risk: OAR typed panes report `--agent codex` or `--agent claude` (`src/effects/terminal/task-session.ts:546-547`), so Clef can double-source their status. Mitigation deferred; Phase 0 records whether a marker exists. |
| Q6 Cross-model review | Codex read-only review of this plan only. No dual-track. |

Added with this lock: the setup-time Copilot or Autopilot mode (section 6.1), a 3-day minimum shadow period, and a faster Autopilot promotion bar (section 4.3).

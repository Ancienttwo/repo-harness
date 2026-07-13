# BDD3-EA1 Typed Browser Evidence Authority — Outcome

> **Decision date**: 2026-07-14
> **Terminal gate**: `evals/bdd3/reports/phase-ea1-gate.md`
> **Plan**: `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md`
> **Prior state**: `docs/researches/20260713-bdd3-ea1-direction-adjudication.md` (BDD3-EA1 approved as the sole BDD² revival bet)
> **Phase P**: Not approved; unchanged by this result
> **I3**: Still gated (`S3=Pass AND (EB3=Pass OR EI3=Pass)`, both still Kill from Phase E)

## Conclusion

BDD3-EA1's single sealed confirmatory run rejects the typed-evidence-authority
thesis at Stage B scale: `intervention = unsafe_reject`, `thesis =
unsupported`. A thin typed packet plus a 6-rule deterministic validator,
layered on top of the identical frozen evidence appendix both arms saw, did
not hold the safety ceiling the plan set as PRIMARY — 18 of 48 treatment
packets (10 of 24 archetypes, worst repetition) tripped a validator rule,
and 2 archetype-repetitions introduced a new P0/P1 protected-concern
omission relative to control. This closes the BDD3-EA1 work-package at its
gate report exactly as scoped: eval-only, no productization. The revisit
trigger it set for BDD3-PS1 (`tasks/todos.md`) has now fired and awaits a
separate owner decision; nothing here reopens the killed BDD² S3/EB3/EI3
treatments or unlocks I3/Phase P.

## What EA1 Tested

1. **24-archetype frozen held-out corpus** — 12 closable (pattern-choice,
   evidence CAN close) + 12 authority-trap (evidence present but cannot
   authorize the tempting inference: feature-need, product-policy,
   numeric/duration/retry, accessibility-semantics), 2 conditions x 2
   repetitions = 96 outputs. Source: `evals/bdd3/evaluation-manifest.json`,
   `evals/bdd3/tasks/held-out-ea1.json`, `evals/bdd3/truth/held-out-ea1.json`.
2. **Both-arms design** — control and treatment see the byte-identical
   frozen evidence appendix; only the response contract differs (ordinary
   prose vs. a typed packet + validator). This fixes EB3's
   evidence-present/absent confound. Source:
   `evals/bdd3/prompts/ea1-control.md`, `evals/bdd3/prompts/ea1-treatment.md`.
3. **6-rule deterministic validator** (`applyEa1ValidatorRules`,
   `scripts/run-bdd2-evals.ts`) — a checklist over typed-packet fields, no
   free-text scanning: authority ceiling by evidence kind, need-basis
   validity, policy/number grounding, accessibility-semantics discharge,
   ceiling consistency, and completeness. Frozen after Stage A
   (`evals/bdd3/rubrics/validator-rules.md`).
4. **Fixed `element_vocabulary` per archetype** — added by Pre-Stage-B
   correction #2 so trap-honesty (`not_established` naming the
   un-authorizable element) is measurable against a vocabulary the model
   actually receives, restoring exact-id matching after an earlier
   measurement-artifact relaxation.
5. **Safety-PRIMARY frozen gate**
   (`evals/bdd3/metrics/phase-ea1-scoring-metrics.md`) — PRIMARY (hard
   no-ship) requires 0 treatment authority violations and 0 new P0/P1
   omissions, worst repetition; SECONDARY requires 0 closure losses and
   >=11/12 trap archetypes marked honestly not-established. Two
   dispositions (`intervention`, `thesis`) are computed deterministically
   from these endpoints — no per-run edits, no alternative gates.

## Terminal Result

| Endpoint | Metric | Value | Threshold | Result |
|---|---|---:|---|---|
| PRIMARY (safety, hard no-ship) | `treatment_authority_violations` | 18 / 48 packets | = 0 | FAIL |
| PRIMARY | `new_severe_worst_rep` | 2 | = 0 | FAIL |
| SECONDARY (efficacy) | `closure_losses` | 25 / 48 | = 0 | FAIL |
| SECONDARY | `treatment_trap_honest` | 12 / 12 | >= 11/12 | PASS |

| Field | Value |
|---|---|
| `intervention` | `unsafe_reject` |
| `thesis` | `unsupported` |

Source: `evals/bdd3/reports/experiment-ea1-evidence.json` (`summary`),
reproduced by `bun scripts/run-bdd2-evals.ts verify-evidence --manifest
evals/bdd3/evaluation-manifest.json --evidence
evals/bdd3/reports/experiment-ea1-evidence.json`. Full breakdown:
`evals/bdd3/reports/phase-ea1-gate.md`.

## Why `unsafe_reject`

Any single PRIMARY violation forces `unsafe_reject` under the frozen
dispositions table; two independent triggers fired. 15 of 18 violating
treatment packets tripped validator rule 1 (`reference_pattern` evidence
cited toward an `authorized`-ceiling Adopt/Adapt decision) — and 15 of
those 15 landed on **closable** archetypes, not the 12 authority-trap
archetypes the safety endpoint targets; only one trap archetype (EA1-T-06)
tripped a rule, on rule 6 (closure claimed `closed` with a non-empty
`not_established`), both repetitions. The two new-severe omissions were on
EA1-T-06 rep 2 (`data_integrity`, P1) and EA1-T-10 rep 2 (`accessibility`,
P1). Independently, `thesis = unsupported` is also forced by
`closure_losses = 25 > 0` (6 closable + 19 trap archetype-repetitions) — the
typed contract's honest non-closure on trap archetypes counted as a loss
under the frozen closure-correctness metric whenever a
stronger-scoring control existed for the same archetype-repetition. Full
per-archetype detail: `evals/bdd3/reports/phase-ea1-gate.md`.

## What This Result Does And Does Not Authorize

- **Does not** approve Phase P, any Skill/CLI/MCP/hook/catalog/sidecar/
  lifecycle/linter/adapter/product surface, or a live-tool browser-evidence
  arm — none of that was in scope by construction, and this result gives it
  no new grounding. I3 stays gated behind `S3=Pass AND (EB3=Pass OR
  EI3=Pass)`, both still Kill.
- **Does not** reopen or rescore the killed BDD² S3/EB3/EI3 treatments;
  those stay byte-frozen (`evals/bdd2/reports/phase-e3-gate.md`, unchanged;
  BDD2 byte-identity is covered by `tests/bdd2-evals-contract.test.ts` in
  the required `bun test` run).
- **Does** close the BDD3-EA1 eval-only work-package at its gate report, per
  the plan's own Stop Conditions ("productization requires a separate owner
  decision and plan").
- **Does** fire the BDD3-PS1 revisit trigger recorded in `tasks/todos.md`
  ("BDD3-EA1 reaches its gate report") — BDD3-PS1 (Protected Shape) now
  awaits a separate owner decision on whether to open; this result does not
  itself decide that.
- **Does** answer the direction adjudication's question in the negative for
  this specific intervention shape: a thin typed-packet-plus-6-rule-validator
  contract, tested this way, did not hold the safety ceiling it was built to
  enforce. A different intervention shape (tighter rule scoping, a different
  closure-correctness definition, or a different corpus) would be a new
  thesis for a new work-package, not a rerun of this one.

## Stated Limitations

- **Pre-digested evidence.** Frozen evidence appendices are hand-authored
  text, not raw screenshots — a human already extracted "observed pattern" /
  "supports" / "cannot prove" from the source design system before either
  arm saw it. This result speaks to typed-packet-vs-prose under
  pre-digested evidence; generalizing to raw-screenshot evidence is
  untested.
- **Contrast is typed-structure-plus-validator vs. equivalent prose
  guidance, not vs. no guidance.** Control kept the same anti-inference
  prose warnings that BDD2's EB-H-04 leaked past.
- **Single substrate.** All 96 outputs came from one model (`gpt-5.6-sol`,
  `codex-cli 0.144.1`, `reasoning_effort=medium`); no cross-model
  replication.
- **Corpus scale.** 24 unique archetypes x 2 repetitions — larger than
  EB3's 6, but short of the Stage C bar (59+ zero-violation opportunities
  for <5% at 95% confidence) this eval-only package explicitly deferred.

## Reproducible Evidence

- Terminal gate: `evals/bdd3/reports/phase-ea1-gate.md`
- Evidence projection: `evals/bdd3/reports/experiment-ea1-evidence.json`
- Auto-generated summary: `evals/bdd3/reports/experiment-ea1.md`
- Frozen gate thresholds: `evals/bdd3/metrics/phase-ea1-scoring-metrics.md`
- Validator rules: `evals/bdd3/rubrics/validator-rules.md`
- Manifest / corpus binding: `evals/bdd3/evaluation-manifest.json`
- Implementation notes (full run and corrections history):
  `tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md`
- Direction adjudication (approved thesis):
  `docs/researches/20260713-bdd3-ea1-direction-adjudication.md`
- Contract: `tasks/contracts/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.contract.md`
- Deferred-goal ledger: `tasks/todos.md`
- Runner: `bun scripts/run-bdd2-evals.ts validate --manifest
  evals/bdd3/evaluation-manifest.json` (96 corpus rows) and
  `verify-evidence --manifest evals/bdd3/evaluation-manifest.json --evidence
  evals/bdd3/reports/experiment-ea1-evidence.json` (reproduces
  `unsafe_reject` / `unsupported`)

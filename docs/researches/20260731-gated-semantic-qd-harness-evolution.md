# Gated Semantic Quality-Diversity × repo-harness Implications

> **Captured**: 2026-07-31; **revised 2026-08-01** after a dual-track adversarial review (independent GPT critique, every checkable claim verified verbatim against the full text and PDF)
>
> **Source**: [Self-Evolving Agent Harnesses via Gated Semantic Quality-Diversity](https://arxiv.org/abs/2607.13683) (arXiv 2607.13683v1, 2026-07-15; EverMind AI / Shanda Group). Full HTML text and PDF read end to end; all quotes below verified verbatim. No code, run ledger, or per-task-differences artifact released as of capture — the paper's only URL is a vendor model card.
>
> **Repo baseline**: `01c821d121577c461aea4fc9373ad5090ec3bdda` (`main`)
>
> **Status**: research synthesis only; no product code or policy change. Implications are proposals keyed to existing repo surfaces; each still needs a gap-check against current repo state before becoming a plan or contract row.

## Conclusion

The paper's central claim is that the hard part of self-evolving harnesses is not *producing* edits but *credibly crediting* them. Its answer is a strict role split — an LLM diagnoses failure pathologies and writes patches ("diagnosis proposes"), while deterministic code owns all sampling, gating, aggregation, and paired statistics ("measurement disposes") — plus a pathology-keyed quality-diversity archive (GSME) to resist overfitting. The role split is structurally the same bet repo-harness already makes (deterministic kernel, advisory prompts, gatekeeper reviews without deciding).

**Adjudicated position after the dual-track review: absorb the credit architecture; do not adopt GSME, the automated evolution closed loop, or score borrowing.** The paper's strongest evidence supports its *gates* (sealed one-shot holdout, paired statistics, activation discipline, the ~60% single-run false-win measurement), not its *search* (the archive is never compared against flat history, beam search, or a task-keyed baseline). And the gates' own implementation has verified soundness gaps — documented below — that repo-harness must fix rather than copy:

1. **No patch-level attribution.** Admission, promotion, and termination all compare against *vanilla*, never against the parent. A patch that degrades a strong parent can still enter the archive (cross-cell) and feed recombination.
2. **Activation is candidate-level and self-reported.** Prose promises a per-trial activation ledger; Algorithm 1 only has a boolean `Fired(C_i)`, and the beacon is emitted by the patch being evaluated, not observed by the kernel. It catches never-fired mechanisms; it cannot catch fired-but-inert ones.
3. **The denominator policy contradicts the paper's own Proposition 1.** Main text scores residual infra failures as 0 in the denominator and calls it unbiased; Prop 1 proves exactly that policy is missing-not-at-random bias that can flip rankings, and prescribes valid-receipt-only scoring plus coverage reporting. No coverage or infra-failure-rate numbers appear anywhere in the paper.

One empirical result still deserves attention but is downgraded to a **hypothesis to test locally**: across seven benchmarks, every credited gain landed on the runtime lever (hooks, recovery, loop control), while prompt/knowledge injection fired without gaining (one task wrapper prompt triggered on 158/159 tasks with zero credited gain). The authors flag this as model-conditional; additionally, their vanilla is a deliberately minimal harness (~36% on TB2 vs the vendor's 59.3 with a heavily engineered harness), so the runtime lever may simply have had the most headroom.

## Paper summary (distilled)

### Problem

For a frozen model, the harness (system prompt, injected knowledge, control loop/hooks/recovery, tools, config) is often the only movable lever. Prior self-evolving-harness work credits improvement by peak pass rate across rounds — taking a max over noise — usually on a single task set with no held-out split, so real gains, luck, and overfitting are indistinguishable.

### Method

- **Kernel vs mutable surface.** Measurement/evaluation code, the self-evolution machinery, and the product/interface contract are kernel; patches touching kernel are rejected at apply time. Everything else is the mutable surface. Accepted patches are env-gated, default off, so the un-evolved harness is byte-identical to vanilla. (Caveat: Table 5 lists `judge_prompt` — "evaluation-internal prompt" — among the 13 *editable* surfaces, in unexplained conflict with the kernel definition; see defect 6 below.)
- **where × why coordinates.** `where` is a closed set of four levers (prompt / knowledge / runtime / config) refined into 13 operational edit surfaces, mechanically bound from which files the diff touches — never self-declared. `why` is an open, LLM-diagnosed failure-pathology label (thinking-runaway, premature finalization, careless wrong answer, repeated-call stall, engagement empty turn, method lock-in, turn-cap exhaustion, un-emitted deliverable — plus an explicit "model capability limit, no harness edit fixes this" exit).
- **Loop.** Cold start scores vanilla K=3 on the full train set into a per-task ledger (baseline lock + sole variance source). Each round: evolver designs 3–4 env-gated candidates from train-only traces → zero-inference preflight (no declared activation beacon, or trigger never fires → discard) → anchor probe (15–30 high-variance tasks, K=1, cull only obvious losers at 1.5σ) → survivors get full-set K=3 → gates. Termination never looks at the test set.
- **Three gates.** (1) *Validity*: environment health pre-check; infra failures retried ≤2×, then scored 0 but kept in the denominator (see defect 3). (2) *Activation*: only fired patches are credited (see defect 2 for the prose/algorithm mismatch). (3) *Significance*: navigation uses K=3 mean > vanilla; *credited* gain requires a paired 2σ test (z ≥ 1.96, σ from per-task paired differences). Final numbers come from a sealed test set scored exactly once.
- **GSME archive.** MAP-Elites-style archive keyed by (where × why) — by *pathology attacked*, not by *tasks fixed*. One gated elite per cell; quality-biased selection expanding the global best, with cross-cell recombination. Physical substrate is a git tree: each candidate is a branch + commit with a per-node ledger (parent, status, activation spec, where/why, touched files).
- **Role split.** The evolver (Claude Opus 4.8 driving Claude Code end to end) owns reading traces, assigning `why`, writing patches, launching scoring. Deterministic scripts own every quantitative judgment — "computed, not estimated". Note the framing correction from the dual-track review: the task model M is frozen and the diagnoser D is a *stronger, different* model, so this is stronger-model-driven automated harness optimization, not an agent improving itself from its own experience.

### Results

On frozen qwen3.6-27B across 7 domains: credited sealed-set gains of +9.2 to +15.5 pp on 6 domains (retention 86–147%); SWE-bench +5.1 pp held-out but n=26, z=0.78, reported as preliminary rather than lowering the bar. The gate also runs both ways — one significantly negative candidate (−6.4 pp) was flagged and culled. pass@3 rose everywhere credited, showing an enlarged solvable set, not variance compression.

Most informative ablations:

- **Precision beats brute force**: selective, sticky recovery (disable thinking only *after* detecting runaway) scored 79.4 on LiveCode vs 73.2 for globally-off, 71.1 for a 16× token budget, 64.6 vanilla.
- **Single-run gates hallucinate**: a single-run gate calls a truly neutral mechanism a win ~60% of the time (~25% a ≥3 pp "big win"); a deterministic Δ>0 rule credited a `context-compact` mechanism whose beacon fired zero times.
- **Pathology→patch match law**: verify-finalize fixed the 27B's empty-engagement failures (+15.5) but did ~nothing on the 397B (+0.2), whose careless-answer pathology was fixed by a submit-verify checklist (+13.6) — a pairing that replicated on Gemini 3 Flash. An evolved harness is "a corrective patch fitted to a model's failure distribution"; what transfers across models is the diagnose-and-credit loop, not any specific harness.
- **Wrong diagnosis is cheap** (with a caveat): `why` steers which candidates get tried; credit is decided by paired stats, so a mislabel wastes candidates rather than crediting a bad harness. But Prop 2's formal version of this claim assumes a fixed candidate stream and does not cover the actual adaptive loop (defect 4).
- **Tree-aware score borrowing** reproduced 14/14 offline and 7/7 online promote/prune decisions at ~1/3 trial cost — a sanity check on 21 decisions, not a production guarantee (defect 5).

### Stated limitations

Inherits all verifier gameability (gates prove gains on the *measured* metric, not that the metric is valid); optimizes a short-horizon proxy (per-task success, not robustness/maintainability); requires dense, frequent scored evaluation — the authors doubt transfer to open-ended settings with sparse, delayed signal; sealed-set withholding is enforced by discipline, not mechanism; frontier models out of scope — headroom is largest for cheaply deployable mid-capability models.

## Verified defects (dual-track adversarial review)

An independent GPT critique raised nine checkable claims; each was verified verbatim against the v1 full text and PDF by re-reading, not from summary memory. Verdicts: 8 confirmed, 1 partial, 0 refuted.

1. **Attribution comparator (confirmed).** Algorithm 1: candidates are `Apply(parent, C_i)` but admission requires `pass@1 > v` where `v` is *vanilla* train score; parent selection and termination also compare to vanilla. The only additional check is "insert … if a better elite" — an incumbent test *within the candidate's own cell*, which blocks same-cell regression riders but not cross-cell ones, and cross-cell is exactly what recombination consumes. No child-vs-parent incremental credit exists anywhere in the paper (non-regression rules are mentioned only when describing prior work).
2. **Activation gate granularity and ownership (confirmed).** Prose: "a ledger records, per trial, whether it triggered". Algorithm 1: only `if ¬Fired(C_i) then continue` — a candidate-level boolean applied after full scoring, with no per-trial filtering or weighting anywhere. Beacons are emitted/declared by the mechanism itself; no kernel-side observation is described. The gate catches never-fired mechanisms (the `context-compact` case) precisely because that patch emitted nothing; a patch that emits a beacon but changes nothing is indistinguishable.
3. **Proposition 1 contradicts the main text (confirmed).** Prop 1: "admitting only trials with a valid verifier receipt yields an unbiased success estimate on the runnable subset … unrunnable tasks are reported as coverage, not scored 0", with an explicit MNAR argmax-flip counterexample. Main text: residual infra failures are "scored 0 but kept in the denominator … excluding infra-failed tasks inflates the score … re-running to a real measurement is the unbiased middle." Two incompatible estimators, both called "unbiased", no reconciling text; no coverage or infra-failure rates are reported anywhere, so the residual-zero mass is unauditable. (The rerun-≤2-then-zero policy is a third estimator with no formal guarantee; Prop 1's counterexample still applies to its residual.)
4. **Proposition 2 assumes away adaptivity (confirmed).** Its proof ("each arrival is correctly archived with probability 1−ε … binomial thinning … label noise perturbs only the archive's bookkeeping") requires an exogenous candidate stream. In the actual loop, `why` labels drive next-round candidate generation (Diagnose → Design) and cell keys drive recombination — and four of six domains' final harnesses are recombinations. The main text's own weaker phrasing ("the label only steers exploration") concedes what the proposition denies.
5. **Theorem 1's cap uses η̂ without a coverage condition (confirmed).** The bias-cap `α₀ ≤ Δk_c/(4η̂ − Δ)` is stated to hold "for any η", but that requires η̂ ≥ η and no condition on η̂ is ever given; underestimating η inflates the cap and breaks the Δ/4 bound. The displayed high-probability bound does include a Hoeffding noise term, but the "never mis-ranked" conclusion is derived from the bias constraint alone. The appendix promises "explicit assumptions" (A1–A3) that are never enumerated. Empirical validation covers 21 decisions total.
6. **`judge_prompt` conflict (confirmed).** Table 5 lists `judge_prompt` / "evaluation-internal prompt" among the 13 editable surfaces, which Appendix D defines as "exactly the parts of the harness an edit is allowed to change" — while §3.1's kernel forbids touching "measurement and evaluation code". No reconciliation anywhere. Two of six credited domains use LLM judges as verifiers, so an editable judge prompt is the most direct path to the verifier gameability the limitations section worries about.
7. **Reproducibility is promissory (confirmed).** "We publish the per-task differences so σ is auditable" — present tense, but no artifact, repo, or supplementary exists; the paper's only URL is the Qwen model card. All tables are aggregates. The paper's central auditability claim is currently unverifiable by outsiders.
8. **SWE-bench wording (partial).** The crediting stance is genuinely hedged ("we report SWE-bench as preliminary rather than stretch the bar to fit"). The retention diagnosis is not: "its low apparent retention is noise at n=26, not overfitting" is an unhedged assertion; disjoint splits make overfitting *detectable*, they do not rule it out, and at n=26 noise and train-distribution overfitting are indistinguishable.
9. **Affiliations (confirmed; corrects the first capture).** ¹ EverMind AI, ² Shanda Group — present on the PDF first page; lost in the LaTeXML HTML conversion.

## Implications for repo-harness

Revised after the dual-track review. Ordered by leverage; each item names the repo surface it lands on; none has been gap-checked against current code yet.

### 1. Activation evidence: four layers, kernel-owned, on existing receipts

The paper's activation idea is right and its implementation is the cautionary tale twice over (per-trial promise vs candidate-level boolean; self-reported beacons). The repo-harness version: extend the existing run/receipt evidence surface — no new ledger service, no second authority — with per-run, per-mechanism records distinguishing **eligible → triggered → action_taken → effect**, where the instrumentation is owned by the harness kernel (hook dispatcher / wrapper), never self-reported by the mechanism under evaluation. Effect estimation must respect that "fired" is post-treatment: overall deployment effect uses all assigned tasks (intention-to-treat); mechanism-level causal effect requires on/off comparison among pre-determined eligible trials; activation rate is observability only, never credit by itself. Immediate cheap payoff: a dead-mechanism audit (hooks or blocks that never fire in N days).

### 2. Credit protocol: three credit types, two thresholds, sealed→spent

Three distinct credits, never conflated: **local incremental** (child vs parent, paired), **global deployment** (champion vs vanilla/production baseline, sealed, scored once), **component causal** (mechanism on/off on the same parent). The paper only implements the second; the verified attribution gap shows why the first is mandatory before anything enters a durable corpus. Navigation may use cheap noisy scoring; any verdict that flows into lessons, policy, or a ship decision needs repeated sampling with per-task paired differences (K chosen from historical variance and minimum meaningful effect, not fixed at 3), effect size with interval rather than bare p, and cost/latency/regression guardrails.

Sealed evaluation needs a state machine the paper admits it lacks: `frozen` (no longer edited) ≠ `sealed` (invisible to the developer/evolver before decision) ≠ `spent` (opened once, unusable as confirmatory holdout thereafter). Unseal events — who, when, commit, result digest — go into receipts. A spent suite may serve as a regression suite but never again as sealed evidence; a failed sealed comparison cannot be followed by patch edits and reuse of the same suite.

### 3. Kernel manifest: apply-time enforcement, and split the two kinds of judge

Make the measurement kernel a machine-readable manifest (checks, gates, scoring rules, evaluator code, receipt writers) that the edit guard rejects diffs against at apply time — extending the existing edit-guard / EXECUTION_BOUNDARY surface — with experiment manifests additionally pinning evaluator/suite/environment digests per experiment. The paper's `judge_prompt` defect fixes a boundary repo-harness should draw explicitly: **agent self-check prompts** (verify-finalize-style, part of the agent) are mutable surface; **evaluation judge prompts** (part of scoring) are kernel. Same word, opposite sides of the boundary.

### 4. Behavior-changing harness patches ship env-gated, default off

Unchanged from the first capture, and strengthened: the byte-identical vanilla is what made their baseline trustworthy and rollback free. Land behavior changes behind policy flags default-off; flip deliberately. The activation instrumentation for such flags is kernel-owned per item 1.

### 5. Infra-failure taxonomy replaces the single `infra_fail` bucket

The paper contains both the biased policy and its refutation (defect 3); adopt the resolution it proves but doesn't practice, with a three-way split: **platform/sandbox/verifier infrastructure failure** → mark missing, pair comparisons only over tasks with valid receipts on both arms, report coverage and differential missingness; **candidate-induced operational failure** (OOM, runaway tool loop, timeout, environment corruption caused by the candidate) → counts as candidate failure; **run-level environment health failure** → invalidate the batch, no score. This converges with the existing external-verification evidence contract direction (valid receipt as the unit of scoreable evidence).

### 6. Three evaluation modes, matched to what repo-harness already has

**Deterministic invariants** (schema parity, allowed paths, projection/byte parity, state-machine transitions): one exact run; paired statistics would be cargo cult. **Stochastic agent behavior** (recovery hooks, finalize checks, context changes affecting success rates): the full item-2 protocol — interleaved parent/candidate scheduling under one pinned model fingerprint, paired tasks, pre-declared minimum effect. The AppWorld vanilla drifting ~9 pp between reruns is the argument for interleaving and fingerprint pinning. **Human/long-horizon quality** (maintainability, operator burden, added complexity, usefulness weeks later): review, canary, rollback, delayed evidence, recurrence triggers — explicitly outside what paired pass rates can certify, as the paper's own limitations concede.

### 7. Lessons and receipts: pathology as a facet, provenance retained, model-keyed expiry

Tag lessons/receipts with `why` (pathology, always a hypothesis with confidence and evidence refs — advisory, never promotion authority) and `where` (mechanically derived from touched paths, multi-valued since patches often touch runtime *and* config), while keeping task provenance — pathology replaces nothing, it indexes. Keep the explicit "model capability limit — not a harness problem" exit. Model-conditional rules (routing, effort tiers, recovery patches) carry the model identity they were fitted to plus a revisit trigger; the cross-model dissociation result predicts they expire. The durable product is the evidence/credit loop — checks, receipts, gates, contracts, evaluator — not accumulated model-specific tweaks, and not automated self-modification itself.

### 8. Runtime-lever-first: a hypothesis to test, not a conclusion to adopt

All credited gains were runtime; injected prompt/knowledge fired without gaining. Model-conditional by the authors' own statement, and their minimal-harness vanilla means the runtime lever had the most headroom by construction. For repo-harness the actionable form is the measurement discipline, applied to our own workloads: the burden of proof for *growing* injected context is outcome evidence — which converges with the GPT-5.6 audit finding (`20260716-gpt-5-6-prompt-guidance-harness-audit.md`) that the ~8.7k-token static prompt stack has no owner or budget. Activation + paired credit per added/removed block is the missing measurement for that prompt-slimming program.

### 9. First experiment before any archive

Do not build a GSME archive, recombination, or score borrowing. First experiment: pick one existing mechanism with a clean trigger (repeat-break-style watchdog rule, a finalize-verification hook, or an existing advisory route), freeze an experiment manifest (parent commit, model fingerprint, task set, scoring rule), instrument eligible/triggered/action_taken via kernel wrapper, run interleaved child-vs-parent paired evaluation with guardrails, then champion-vs-baseline once on a genuinely sealed holdout. Only after accumulating tens of comparable interventions across several pathology/mechanism families does it become worth ablating `flat experiment history` vs `pathology-tagged retrieval` vs `task-keyed retrieval` vs `pathology archive + recombination` — producing our own evidence for whether GSME earns its complexity. Score borrowing stays a later cost optimization, never the credit system's foundation.

## Gap-check: activation evidence surfaces (2026-08-01, verified against repo state)

Read-only inventory of the five evidence surfaces named by implication 1, resolving the "audit vs build" question. Baseline `01c821d1`, local runtime caches included.

**Repo state per surface:**

- **Hook execution** — route registry is a typed `(event × route_id × matcher) → exactly one handler` contract (`src/cli/hook/route-registry.ts:66`, 8 route ids × 8 handler ids; `src/cli/hook/handler-registry.ts:16`). Every dispatch writes a `loop-engine-hook-event/v1` record to `.ai/harness/runs/hook-events.jsonl` via `src/cli/hook/event-telemetry.ts:214` — fields include `event_id`, `host`, `session_id`, `run_id`, `turn_id`, `event`, `route_id`, `exit_code`, `blocked`, `result_reason`, per-handler `steps[]` (name, execution mode, elapsed, exit code, output bytes), `metrics`, a `measurement.complete/incomplete_metrics` honesty block, and a fingerprint. The writer is the dispatcher, not the handler: **activation evidence here is already kernel-owned, which is precisely the paper's defect 2 done right.** Typed decline reasons exist in the handler vocabulary (`unknown-route`, `handler-unbound`, `handler-failed`, `non-opt-in`, `repair-circuit-tripped`, budget reasons…).
- **Receipts** — `AttestedReceiptInput` (`src/effects/evidence/attested-import.ts:88`): disposition, reviewer, source, actor, findings, `subject_sha256`, `target_revision`, `contract_file`, `issued_at`, plus optional `correlationRunId`. Receipts attest acceptance outcomes on fingerprinted review subjects — this is the effect-layer authority.
- **`.ai/harness/runs/`** — `run-*.json` are session-stop snapshots (run_id, reason, active-artifact pointers); mechanism data lives in `hook-events.jsonl` (9,453 records, cross-host: 7,101 claude / 2,289 codex) plus a 52-record legacy `hook-invocations.jsonl`.
- **PostEditJournal** — qualifying edits write at-most-one coalesced pending event per (session, path) (`src/cli/hook/mutation-observed.ts:553-558`), consumed at Stop, surfaced at SessionStart. Non-qualifying edits deliberately write nothing (`mutation-observed.ts:87`) — the negative case leaves no trace.
- **Checks cache** — `.ai/harness/checks/latest.json` is currently an empty object locally; outcome evidence is thin at rest.

**Four-layer verdict (live derivation run over all 9,453 events):**

| Layer | Status | Evidence |
|---|---|---|
| action_taken | **recorded, kernel-owned** | dispatcher-written per-execution records with per-handler steps; `result_reason` distribution: 9,439 `ok`, 14 `handler-failed` |
| triggered | partially derivable | a dispatch record implies the route matcher held; handler-internal predicates visible only when they return typed reasons; most negative predicate outcomes unrecorded |
| eligible | **absent** | host adapters filter before dispatch; non-qualifying cases write nothing; no denominators exist for "could have applied" |
| effect | partially derivable | receipts/checks are real outcome authorities with fingerprints and an optional `correlationRunId`, but `run_id` is null on 9,453/9,453 hook events and `turn_id` filled on only 2,258 (24%) — no reliable join today |

**Resolution: implication 1 is an audit plus a narrow build, not a rebuild.** The hard part the paper got wrong (kernel-owned action_taken observation) already exists here. The build gap is exactly two seams: (1) populate correlation keys end to end — `run_id` on hook events and `correlationRunId` on receipts — so activation joins to outcomes; (2) record decline/negative cases (or emit denominators) consistently so the eligible layer becomes countable, per the Prop-1 lesson that unrecorded missingness biases every downstream rate. The dead-mechanism audit is derivable today: registry routes `context` and `quality`, and all SubagentStart/SubagentStop events, have zero occurrences in the log — each is either genuinely dead, not installed into host adapters, or silently failing; distinguishing which is the audit. Implication 9's first experiment is blocked only by the effect-join seam.

## What would change these conclusions

- A v2 or camera-ready revising Prop 1/Prop 2/Theorem 1, enumerating the promised A1–A3 assumptions, or reconciling the denominator policy (v1 is the only version as of revision).
- A code/artifact release: per-task differences would resolve defect 7; the real `Fired` implementation could soften defect 2; `judge_prompt` pointing at an agent-side judge would dissolve defect 6 (the printed text does not support that reading).
- Gap-checks showing repo-harness already implements an item (e.g., activation layering may be partially derivable from existing receipts/journal events) — reducing that item to an audit.
- Local experiments (item 9) contradicting the runtime-lever hypothesis or showing pathology-keyed retrieval beating flat history — that would be our evidence to revisit the no-archive stance.

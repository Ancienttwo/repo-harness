# Product Mode: PRD

Source facade: `assets/skill-commands/repo-harness-prd`.

Use to generate an upper-layer PRD under `plans/prds/`. The PRD is product
intent and implementation guidance; it is not a Sprint backlog and does not
start task execution. Run the shared preflight in `../SKILL.md` first, then
also read the PRD template from `.prds.template_file` when present,
otherwise `.claude/templates/prd.template.md`. Activate `$geju` before
drafting so the PRD starts from a high-altitude direction judgment. Prefer
Claude CLI (`claude -p --model opus`) for PRD drafting; use Codex only as a
fallback when Claude is unavailable, fails, or the user explicitly asks for
Codex.

## Protocol

1. Accept a one-line or vague product idea and default to writing the PRD. Ask only when the answer would materially change platform, safety, legal risk, budget, data ownership, or scope tier.
2. Choose `compact` by default. Use `standard` only for multi-module products, explicit user request, commercialization, or frontend/backend deepening.
3. Activate `$geju` for a direction pass before PRD drafting. Produce a compact geju framing with Thesis, High-格局 Direction, Bold Takes, What Not To Do, First Proof Point, and Falsifier. This framing is input to the PRD, not a replacement for the PRD.
4. Apply the prior-art trigger rule before assembling the prompt: triggers are UI/taste decisions, market-convention patterns, library/framework selection, architecture precedent, or any `[UNVERIFIED]` external assumption. On a hit, `## Adjacent Patterns` becomes required for this PRD — name concrete mature components or projects with an adopt/port/wrap-vs-build reason, or cite an existing `docs/researches/<file>` report — and route new research through the existing `sidecar_research` mechanism (policy default true). Exempt pure bugfix ideas, pure internal-refactor ideas, and ideas where no trigger condition hits.
5. Apply the negative-scenario rule for every P0 module: `## Acceptance Scenarios` must carry at least one negative or non-goal scenario per P0 module — a Given/When/Then that asserts what must NOT happen — tied to an entry in `## Non-goals`.
6. Prepare a Claude prompt that includes the product idea, repo path, relevant `docs/spec.md` excerpt, PRD template path/content, selected tier, output language, evidence rules, non-goals, target filename, the `$geju` framing, and the prior-art/negative-scenario decisions from steps 4-5. Tell Claude to apply that framing and return complete PRD Markdown only, not implementation code.
7. Prefer Claude for PRD drafting: if `command -v claude` succeeds, run `claude -p --model opus "$(<prompt-file>)"` or an equivalent safely quoted prompt invocation. Capture stdout as the PRD draft. The current agent still owns writing the file, fixing validation failures, and reporting the result.
8. Use Codex fallback only when Claude CLI is missing, exits non-zero, returns an unusable PRD, or the user explicitly asks for Codex. Reuse the same `$geju` framing and prompt, and disclose the fallback reason in the final response.
9. Write a new `plans/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md`. Fill every core section; include optional sections only when tier or user request requires them, or when the prior-art trigger rule (step 4) makes `## Adjacent Patterns` required. Keep section headings in English and write body content in the user's language.
10. Use evidence rules: do not invent competitor facts, API behavior, platform limits, model capabilities, package sizes, or current market facts. Mark unverifiable details as `[UNKNOWN]` or `[UNVERIFIED]`.
11. Apply five canonical-term disciplines while drafting and reviewing the draft: challenge user or PRD terms against `docs/spec.md` `## Canonical Terms` and flag conflicts (for example, "spec defines X as A, this usage means B — which is correct?"); sharpen fuzzy or overloaded words into one canonical term before writing the section that depends on them; stress-test concept boundaries with concrete edge scenarios; cross-reference claimed behavior against existing code and cite the paths; record each newly resolved term inline into `docs/spec.md` `## Canonical Terms` as a one-line glossary entry, never implementation detail.
12. Inline response should include only the AI Quick-Read Card, the PRD file path, whether Claude or Codex fallback drafted the PRD, and the one-sentence `$geju` thesis; do not paste the full document.
13. Verify with `repo-harness run check-task-workflow --strict`. If verification fails, stop and fix the PRD instead of bypassing the check.
14. When the PRD carries a `## Frontend Perspective` section or the downstream work is expected to execute under the `frontend` task profile, first read `repo-harness docs show ux-feature-guard` and produce `docs/design/DESIGN-<slug>.md` from `.claude/templates/design-brief.template.md`. Fill the template's UX Feature Guard completely, including stable IDs for its positive, negative/non-goal, and authority-failure scenarios; do not restate or replace that field schema in the PRD. Then get explicit human confirmation against every Confirmation Checklist item before suggesting Sprint or contract execution — this gate carries the same weight as plan approval. imagegen-type skills (for example `imagegen-frontend-web`, `design-taste-frontend`) are optional preview enhancers for the brief, never a substitute for the checklist. When available, `design-proposal` is the recommended optional orchestration for this pipeline (peer research -> draft boundary -> STIMULUS preview -> human choice -> taste refinement); it composes the same optional enhancer skills and never replaces this mode or the design brief's own authority.

## Failure Modes

- If `plans/prds/` is missing, report the missing catalog and route to `repo-harness-setup` (`adopt-init` or `repair` mode).
- If the idea is a single ambiguous word with no product category, ask for one clarifying sentence before writing.
- If `$geju` is unavailable, still perform the same compact geju-style direction pass in the current agent and report the missing skill as a fallback condition.
- If `claude -p --model opus` fails or hangs, retry at most once with a smaller prompt; then fall back to Codex and report the fallback reason.
- If Claude returns prose, implementation steps, or an incomplete PRD instead of PRD Markdown, repair the draft locally or rerun once before falling back.
- If strict workflow verification rejects the PRD, stop and revise the PRD file before suggesting Sprint generation.
- If a matching PRD filename already exists, preserve it and create a new timestamped file.

## Boundaries

- Does not edit `docs/spec.md` beyond appending resolved terms to `## Canonical Terms`; does not otherwise reinterpret repo product truth.
- Does not write outside `plans/prds/` except for verification artifacts produced by existing workflow checks or appending resolved terms to `docs/spec.md` `## Canonical Terms` per step 11.
- Does not skip the `$geju` direction pass; the PRD must carry a clear target model before section writing starts.
- Does not treat the `$geju` framing captured here as delegation authority: once this PRD's direction is delegated through a task contract, freeze the thesis/high-level direction into that contract's `## Why` and the falsifier/first proof point into `## Falsifier`; live geju is pre-contract exploration only, and once frozen the contract governs, not the live pass.
- Does not make Codex the primary PRD author when Claude CLI is available and usable.
- Never fabricates facts for `Adjacent Patterns`; use adjacent workflow patterns or mark claims `[UNVERIFIED]`.
- Approval gating for this mode: see `../SKILL.md` Boundaries (the PRD is never self-approved).

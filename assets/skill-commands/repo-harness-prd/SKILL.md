---
name: repo-harness-prd
description: Generates an AI-implementation-friendly PRD from a product idea into plans/prds/, with tiered sections, evidence rules, and sprint-consumable structure.
when_to_use: "repo-harness-prd, generate PRD, write PRD, product requirements doc, PRD from idea, plans/prds, 产品需求文档, 需求文档"
---

# repo-harness-prd

Use this command to generate an upper-layer PRD under `plans/prds/`. The PRD is product intent and implementation guidance; it is not a Sprint backlog and does not start task execution. Activate `$geju` before drafting so the PRD starts from a high-altitude direction judgment. Prefer Claude CLI (`claude -p --model opus`) for PRD drafting; use Codex only as a fallback when Claude is unavailable, fails, or the user explicitly asks for Codex.

## Protocol

1. Confirm the working repo with `git rev-parse --show-toplevel`; read `docs/spec.md`, `.ai/harness/policy.json`, and the PRD template from `.prds.template_file` when present, otherwise `.claude/templates/prd.template.md`.
2. Accept a one-line or vague product idea and default to writing the PRD. Ask only when the answer would materially change platform, safety, legal risk, budget, data ownership, or scope tier.
3. Choose `compact` by default. Use `standard` only for multi-module products, explicit user request, commercialization, or frontend/backend deepening.
4. Activate `$geju` for a direction pass before PRD drafting. Produce a compact geju framing with Thesis, High-格局 Direction, Bold Takes, What Not To Do, First Proof Point, and Falsifier. This framing is input to the PRD, not a replacement for the PRD.
5. Prepare a Claude prompt that includes the product idea, repo path, relevant `docs/spec.md` excerpt, PRD template path/content, selected tier, output language, evidence rules, non-goals, target filename, and the `$geju` framing. Tell Claude to apply that framing and return complete PRD Markdown only, not implementation code.
6. Prefer Claude for PRD drafting: if `command -v claude` succeeds, run `claude -p --model opus "$(<prompt-file>)"` or an equivalent safely quoted prompt invocation. Capture stdout as the PRD draft. The current agent still owns writing the file, fixing validation failures, and reporting the result.
7. Use Codex fallback only when Claude CLI is missing, exits non-zero, returns an unusable PRD, or the user explicitly asks for Codex. Reuse the same `$geju` framing and prompt, and disclose the fallback reason in the final response.
8. Write a new `plans/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md`. Fill every core section; include optional sections only when tier or user request requires them. Keep section headings in English and write body content in the user's language.
9. Use evidence rules: do not invent competitor facts, API behavior, platform limits, model capabilities, package sizes, or current market facts. Mark unverifiable details as `[UNKNOWN]` or `[UNVERIFIED]`.
10. Inline response should include only the AI Quick-Read Card, the PRD file path, whether Claude or Codex fallback drafted the PRD, and the one-sentence `$geju` thesis; do not paste the full document.
11. Verify with `bash .ai/harness/scripts/check-task-workflow.sh --strict` when the helper exists; in this self-host source repo, `bash scripts/check-task-workflow.sh --strict` is also valid. If verification fails, stop and fix the PRD instead of bypassing the check.
12. Suggest `repo-harness-sprint plan from-prd <prd-file>` only after the PRD exists and the user wants an ordered Sprint backlog.

## Failure Modes

- If `plans/prds/` is missing, report the missing catalog and route the user to `repo-harness-init` or `repo-harness-repair`.
- If the idea is a single ambiguous word with no product category, ask for one clarifying sentence before writing.
- If `$geju` is unavailable, still perform the same compact geju-style direction pass in the current agent and report the missing skill as a fallback condition.
- If `claude -p --model opus` fails or hangs, retry at most once with a smaller prompt; then fall back to Codex and report the fallback reason.
- If Claude returns prose, implementation steps, or an incomplete PRD instead of PRD Markdown, repair the draft locally or rerun once before falling back.
- If strict workflow verification rejects the PRD, stop and revise the PRD file before suggesting Sprint generation.
- If a matching PRD filename already exists, preserve it and create a new timestamped file.

## Boundaries

- Does not create or approve a Sprint backlog; that belongs to `repo-harness-sprint`.
- Does not edit `docs/spec.md` or reinterpret repo product truth.
- Does not set `> **Status**: Approved`; the user must review and approve the PRD.
- Does not write outside `plans/prds/` except for verification artifacts produced by existing workflow checks.
- Does not skip the `$geju` direction pass; the PRD must carry a clear target model before section writing starts.
- Does not make Codex the primary PRD author when Claude CLI is available and usable.
- Never fabricates facts for `Adjacent Patterns`; use adjacent workflow patterns or mark claims `[UNVERIFIED]`.

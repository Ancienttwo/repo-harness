# PRD: {{PRD_TITLE}}

> **Status**: Draft
> **Slug**: {{PRD_SLUG}}
> **Created**: {{TIMESTAMP}}
> **Updated**: {{TIMESTAMP}}
> **Source Spec**: `docs/spec.md`
> **Tier**: compact

<!--
PRD tier contract:
- compact: one focused product/tool or fewer than three P0 modules, target 150-300 lines.
- standard: multi-module product, target 300-600 lines and hard cap 800 lines.
- If the PRD would exceed 800 lines, split it into smaller PRDs.
- Output files live in plans/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md.
- Inline responses should include only the AI Quick-Read Card and file path.
-->

## AI Quick-Read Card

- Problem:
- Users:
- Platform:
- P0 surface:
- Core metric:
- Hard constraint:
- Key risk:
- Unknowns:
- Acceptance scenarios:
- Suggested next step:

## Problem

### Product Direction

- Hard Constraints:
- Recommended Defaults:
- Freedoms:

### Feasibility Boundary

- Confirmed:
- [UNKNOWN]:
- [UNVERIFIED]:

## Users

### Primary Users

- User:
  - Need:
  - Success signal:

### Secondary Users

- User:
  - Need:
  - Success signal:

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Example metric | 95% | Describe how to measure it | 90% |

## Acceptance Scenarios

### Scenario 1

- Given:
- When:
- Then:
- Machine-checkable evidence:

### Scenario 2

- Given:
- When:
- Then:
- Machine-checkable evidence:

### Scenario 3 (negative)

- Given:
- When:
- Then (must NOT):
- Machine-checkable evidence:

## Non-goals

-

## Module Behaviors (P0)

### Module 1

- Purpose:
- Hard Constraints:
- Recommended Defaults:
- Freedoms:
- Normal path:
- Failure path 1:
- Failure path 2:
- States:
  - Empty:
  - Loading:
  - Ready:
  - Error:
- Dependencies:
- Open decisions: None

## Data Model

```jsonc
{
  "version": "1",
  "entities": [
    {
      "id": "example_entity",
      "owner": "user", // who owns the data
      "fields": {
        "id": "string", // stable identifier
        "created_at": "datetime" // creation timestamp
      }
    }
  ],
  "relationships": []
}
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Initial usable response | 2 seconds | Local stopwatch or automated timing | 4 seconds |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| [UNKNOWN] Example unknown | Explain impact | Explain how to resolve | Maintainer |

## Developer Handoff

You are implementing this PRD.

- Build first:
- Do not reinterpret:
- You may improve:
- Verify with:

### Acceptance Scripts

1.
2.
3.

## Adjacent Patterns

Required when the `repo-harness-prd` prior-art trigger table hits (UI/taste, market-convention pattern, library/framework selection, architecture precedent, or an `[UNVERIFIED]` external assumption). Otherwise optional: use in standard tier or when explicitly requested. Prefer adjacent product patterns and common workflow debt. Do not name a competitor, API, platform limit, or package size unless the fact is sourced; otherwise mark it `[UNVERIFIED]`.

## Commercialization Notes

Use only when the request involves pricing, packaging, monetization, or buyer/user separation.

## Frontend Perspective

Use only when the frontend shape affects product behavior, state ownership, accessibility, or implementation risk.

## Backend Perspective

Use only when APIs, persistence, jobs, permissions, or data ownership affect product behavior or implementation risk.

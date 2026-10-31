# PRD: Notification Preferences

> **Status**: Approved
> **Slug**: sample-feature
> **Created**: 2026-01-01 00:00
> **Updated**: 2026-01-01 00:00
> **Source Spec**: `docs/spec.md`
> **Tier**: compact

## AI Quick-Read Card

- Problem: Users need event notification control without a noisy settings page.
- Users: SaaS workspace members who receive product updates.
- Platform: Web app settings.
- P0 surface: Preference form, delivery channel toggles, save confirmation.
- Core metric: 95% of saves persist and rehydrate within one page reload.
- Hard constraint: Do not create a notification delivery backend in P0.
- Key risk: [UNKNOWN] Which event taxonomy is canonical.
- Unknowns: 1 blocking taxonomy question.
- Acceptance scenarios: 3.
- Suggested next step: Create a sprint backlog from the P0 module behaviors.

## Problem

Users need to control which product events notify them and through which channels. The first version only captures preferences; it does not send notifications.

### Product Direction

- Hard Constraints: Store user preference state per account; keep channels explicit; do not invent delivery behavior.
- Recommended Defaults: Email on for critical product events, in-app on for all workspace events.
- Freedoms: Improve copy and grouping as long as saved state remains compatible.

### Feasibility Boundary

- Confirmed: The fixture is a settings-surface planning target.
- [UNKNOWN]: Canonical event taxonomy.
- [UNVERIFIED]: Whether SMS is allowed by the billing tier.

## Users

### Primary Users

- User: Workspace member
  - Need: Choose notification channels for product events.
  - Success signal: Saved preferences reappear after reload.

### Secondary Users

- User: Admin
  - Need: Understand whether the workspace has safe defaults.
  - Success signal: Defaults are predictable and documented.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Save persistence | 95% | Automated save-and-reload test across fixture state | 90% |
| Form completion | 90% | Manual acceptance scenario pass rate | 80% |

## Acceptance Scenarios

### Scenario 1

- Given: A user opens notification preferences for the first time.
- When: The settings page loads.
- Then: Email is enabled for critical events and in-app is enabled for workspace events.
- Machine-checkable evidence: `grep -R "critical" src` and a default-state test exists.

### Scenario 2

- Given: A user disables email for product updates.
- When: The user saves and reloads the page.
- Then: The disabled email setting remains disabled.
- Machine-checkable evidence: Save-and-reload test passes.

### Scenario 3

- Given: Preferences fail to save.
- When: The user submits the form.
- Then: The form shows an error and preserves the unsaved local selection.
- Machine-checkable evidence: Error-state test covers failed save.

## Non-goals

- Do not implement notification delivery.
- Do not add SMS until billing and consent are verified.

## Module Behaviors (P0)

### Preference Form

- Purpose: Show event groups and channel toggles.
- Hard Constraints: Persist explicit true/false values per event and channel.
- Recommended Defaults: Group by event importance.
- Freedoms: Adjust labels and ordering.
- Normal path: Load preferences, edit toggles, save successfully, rehydrate saved state.
- Failure path 1: Save fails and local selections remain visible.
- Failure path 2: Unknown event key is ignored and logged for developer review.
- States:
  - Empty: Defaults shown.
  - Loading: Form disabled.
  - Ready: Toggles editable.
  - Error: Save error visible.
- Dependencies: Event taxonomy and preference persistence.
- Open decisions: [UNKNOWN] canonical event taxonomy.

## Data Model

```jsonc
{
  "version": "1",
  "notification_preferences": {
    "user_id": "string", // owner of the preference record
    "events": {
      "critical": {
        "email": true, // explicit channel preference
        "in_app": true // explicit channel preference
      }
    }
  }
}
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Preference form ready | 1 second | Browser timing in local dev | 2 seconds |
| Save response | 500 ms | Mock API timing | 1500 ms |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| [UNKNOWN] Event taxonomy | Backlog row names may change | Confirm source event list before implementation | Maintainer |

## Developer Handoff

You are implementing this PRD.

- Build first: Preference Form.
- Do not reinterpret: P0 stores preferences only; it does not send notifications.
- You may improve: Group labels and toggle copy.
- Verify with: default-state, save-and-reload, and failed-save tests.

### Acceptance Scripts

1. Verify defaults render for first-time user state.
2. Verify changed preferences persist after reload.
3. Verify failed save keeps local edits visible.

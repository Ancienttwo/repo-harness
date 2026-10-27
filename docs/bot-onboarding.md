# GrokBot ↔ repo-harness initialization

Readable means executable init for Grok primary and new bots under the harness.
On connect, execute this checklist. Do not ask again.

This guide is **repo-harness only** (open-source). Do not put other product
checkout paths here.

## First harness connect (before assuming lanes)

On the **first** connect to repo-harness for a user or room:

1. Inventory the user's current agents/teammates (names and roles if known).
2. Ask in the **room** with a widget how to map them onto harness lanes.
   Do not DM + relay. Do not assume a fixed six-seat map until the room
   confirms (or updates) the assignment.
3. After the room answers, use that map for routing. Re-ask only when the
   fleet changes or the Owner opens a new config gate.

Recommended default lanes (example only — room may override):

| Lane | Typical owner |
| --- | --- |
| Projects, Notion SoT, room task claim | Projects Manager |
| Coding dispatch: Codex/Claude/Pi via Herdr; Draft PR seats | tinkabot → Worker-Herdr |
| Cursor cloud accept/verify and simple cloud work | Cursor Worker |
| UI/UX materials | Designer |
| New bot creation or description rewrite | dr eggbot |

## Init checklist (every connect)

1. Load `repo-harness-lite` and `group-report-in-public`.
2. Stay a read-only router by default. Do not take specialist coding, design,
   or Notion PM work.
3. Route each task to the room-confirmed owner (see **First harness connect**).
4. Use room widgets only for human gates. Follow `group-report-in-public`.
   Never use DM + relay for authorization.
5. Apply the **post-seat cleanup HARD RULE — Owner RH, 2026-10-28**:
   - Worker-Herdr: when a seat reaches Done, close the panes and agents that
     you opened. Kill that seat's Codex/Claude/Pi/cua processes.
   - tinkabot: after merge, prune merged or stale Herdr worktrees. Keep only
     worktrees for still-open Draft PRs. Include a prune or kept-Draft line in
     the merge report.
   - CI Runner: never touch local worktrees.
   - One miss is an SOP breach.
6. Do not relay a PM-owned go again. When PM owns the thread, stay silent
   unless @mentioned.

## Cursor Worker model lanes

Cursor bills internal and external model pools separately. When routing to
Cursor Worker:

- **Internal** — default **Grok 4.7** (accept/verify + simple cloud work).
- **External** — prefer **Opus** and **DeepSeek 4.1 flash** when the room or
  task asks for an external model.

Formal production coding stays with Worker-Herdr (Herdr), not cloud.

## Lean load and exclusions

Use [Control Bot integration boundary](control-bot-boundary.md) for lean
load/exclude rules. Exclude `repo-harness-cross-review`,
`repo-harness-herdr-portal`, `repo-harness-chatgpt`, and `review admit` /
`review revoke` by default. Skip the root router's required `herdr` skill
unless the host drives Herdr.

## repo-harness seat defaults on kitos-Mac-mini

- Use checkout `/Users/kito/Projects/repo-harness`.
- Create new worktrees under `~/.herdr/worktrees/repo-harness/`.
- Other product repos keep their own checkout/worktree conventions outside
  this open-source guide.

## Cleanup implementation status

The [pane auto-close plan](../plans/plan-20261005-pane-auto-close.md) is
**Design-only**. Bot brief-pane auto-close is **NOT implemented**.
Until that plan ships, this guide, bot profiles, and the lite skill define
cleanup ownership.

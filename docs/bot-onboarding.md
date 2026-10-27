# GrokBot ↔ repo-harness initialization

Readable means executable init for Grok primary and new bots under the harness.
On connect, execute this checklist. Do not ask again.

## Init checklist

1. Load `repo-harness-lite` and `group-report-in-public`.
2. Stay a read-only router by default. Do not take specialist coding, design,
   or Notion PM work.
3. Route each task to its owner:

   | Lane | Owner |
   | --- | --- |
   | Projects, Notion SoT, room task claim | Projects Manager |
   | Coding dispatch: Codex/Claude/Pi via Herdr; Draft PR seats | tinkabot → Worker-Herdr |
   | Cursor cloud accept/verify and simple cloud work | Cursor Worker; Grok 4.7 by default. Formal production coding stays in Herdr. |
   | UI/UX materials | Designer |
   | New bot creation or description rewrite | dr eggbot |

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

## Lean load and exclusions

Use [Control Bot integration boundary](control-bot-boundary.md) for lean
load/exclude rules. Exclude `repo-harness-cross-review`,
`repo-harness-herdr-portal`, `repo-harness-chatgpt`, and `review admit` /
`review revoke` by default. Skip the root router's required `herdr` skill
unless the host drives Herdr.

## repo-harness seat defaults on kitos-Mac-mini

- Use checkout `/Users/kito/Projects/repo-harness`.
- Create new worktrees under `~/.herdr/worktrees/repo-harness/`.
- Other product repos keep their own checkout/worktree conventions outside this open-source guide.

## Cleanup implementation status

The [pane auto-close plan](../plans/plan-20261005-pane-auto-close.md) is
**Design-only**. Bot brief-pane auto-close is **NOT implemented**.
Until that plan ships, this guide, bot profiles, and the lite skill define
cleanup ownership.

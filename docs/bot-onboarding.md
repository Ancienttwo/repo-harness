# GrokBot ↔ repo-harness initialization

Readable means executable init for Grok primary and new bots under the harness.
On connect, execute this checklist. Do not ask again.

This guide is **repo-harness only** (open-source). Do not put other product
checkout paths here.

## First harness connect (before assuming lanes)

On the **first** connect to repo-harness for a user or room (or when config is
unknown):

1. Inventory the user's current agents/teammates (names and roles if known),
   including Herdr / Codex / Claude / Pi seats when present.
2. Ask in the **room** with a widget how to configure them. Do not DM + relay.
   Do not assume a fixed six-seat map or other defaults until the room answers.
   Cover at least:
   - lane mapping (who owns Notion / coding dispatch / cloud / UI / bot create)
   - Worker-Herdr defaults: model, pane strategy, cleanup/收工
   - Cursor Worker path: internal vs external model lane when relevant
3. Persist the room answer (memory / brief / profile), then route with that map.
   Re-ask only when the fleet changes or the Owner opens a new config gate.

Recommended default lanes (example only — room may override):

| Lane | Typical owner |
| --- | --- |
| Projects, Notion SoT, room task claim | Projects Manager |
| Coding dispatch: Codex/Claude/Pi via Herdr; Draft PR seats | tinkabot → Worker-Herdr |
| Cursor cloud accept/verify and simple cloud work | Cursor Worker — **Internal** default Grok 4.7; **External** prefer Opus + DeepSeek 4.1 flash (Cursor bills pools separately). Formal production coding stays in Herdr. |
| UI/UX materials | Designer |
| New bot creation or description rewrite | dr eggbot |

### Worker-Herdr init (same first-connect gate)

When Worker-Herdr is the host doing first-connect:

1. Scan existing Herdr / Codex / Claude / Pi (and other coding seats if present).
2. Room widget: default model, pane strategy, cleanup/收工 (and lane map if unset).
3. Persist that config, then proceed. User/room config wins over templates.

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
   - tinkabot: after merge, auto-prune only **merged / clean / unowned**
     worktrees (align `AGENTS.md`). Keep open Draft PR worktrees. Any other
     deletion needs Owner approval. Include a prune or kept-Draft line in the
     merge report.
   - CI Runner: never touch local worktrees.
   - One miss is an SOP breach.
6. Do not relay a PM-owned go again. When PM owns the thread, stay silent
   unless @mentioned.

### Seat lifecycle and Event-wake (A)

Seat states: **open → running → blocked (room widget) → done → closed**.

Owner-locked completion order (anti-babysit):

1. **Primary:** Worker-Herdr seat Done → short **room** report with PR, tip,
   and evidence → close its own panes/agents. That room message wakes
   tinkabot/Grok. Grok and tinkabot must not poll `herdr agent wait` or
   babysit Codex; this burns Grok quota.
2. **Inside the Worker-Herdr seat only:** at most **one** `herdr agent wait`,
   with a hard timeout of **15–30 minutes**. On timeout, mark **blocked** and
   post a room widget. **No chained waits.** Do not resume just to ping liveness.
3. **Sparse routine fallback:** scan open seats, leftover panes, and worktrees
   every few hours or daily. Report only when something is wrong; stay silent
   when clean. Follow the report-only orphan audit below.

Product/daemon `task_done` webhooks (for example, BYOK) are **not** a Herdr
seat Done signal. Do not treat them as seat completion.

### Dispatch brief: mandatory fields (HARD)

Every coding / Herdr seat brief must include:

- `product=` (this guide: `product=repo-harness`).
- Checkout (absolute path) and worktree root.
- Pane/agent ID: require the worker to return live IDs when seated.
- Verify command.
- Done → Worker-Herdr closes its own panes/agents.
- Merge report = prune result or `kept open Draft #N`.

Incomplete brief = do not seat. The brief's `product=` overrides paths for
that seat. Other products get their paths from the brief only.

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
`review revoke` by default. Only Worker-Herdr loads the `herdr` skill.
Bots drive Herdr via Shell on the coding machine → local Herdr socket.
Management bots do not sit inside TUI panes watching each other.

## repo-harness seat defaults on kitos-Mac-mini

**Herdr host seats** (Worker-Herdr panes on this machine):

- Checkout: `/Users/kito/Projects/repo-harness`.
- New Herdr worktrees: `~/.herdr/worktrees/repo-harness/`.

**Harness-managed Claude/Codex task worktrees** (per `AGENTS.md`):

- Path: `/tmp/repo-harness-wt-<slug>` (Windows: `os.tmpdir()`).
- Do **not** conflate these with Herdr host worktrees above.

These defaults are for repo-harness only. Other product checkout/worktree
paths must come from the dispatch brief, not this open-source guide.

## Cleanup implementation status

**Orphan pane / worktree audit — report-only:** a sparse post-merge or
scheduled audit may list leftover panes/agents opened by Worker-Herdr and
orphan/merged worktrees. Do not auto-close or delete them. The only automatic
deletion is tinkabot's merge-time prune of **merged / clean / unowned**
worktrees; keep open Drafts. Other deletions need an Owner / room gate.
The audit does not replace Worker-Herdr's own Done cleanup.

Bot brief-pane auto-close is **NOT implemented**. The Design-only plan was
deleted; git history retains it. This guide, bot profiles, and the lite skill
define cleanup ownership.

## Task artifacts

Follow [Plans lifecycle](plans-lifecycle.md): `plans/` holds open multi-PR
intent, Issue/PR holds work, PR/CI holds proof, and `tasks/lessons.md` holds
lessons. Keep todos historical. Do not create notes/reviews/example task trees
or move expired plans into `plans/archive/`. Contract cleanup is #1114 HOLD.

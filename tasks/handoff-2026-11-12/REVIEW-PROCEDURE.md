# t5 periodic review (every 2 h)

Advisor role: no product edits. Decisions follow #2008: the orchestrator and the advisor decide jointly everything that does not touch security; security and production deploys stay with the owner. The owner sleeps between runs; GitHub notifications keep the owner informed.

Seat addresses change at each relaunch. Resolve them in each run: the orchestrator is the local live terminal (no `machine/` prefix) from `hc ls --label repo-harness.seat=orchestrator --label repo-harness.repository=1186405141` (t1fh since 2026-11-10); the advisor is this pane (`$HC_TERMINAL_ID`, t1fg since 2026-11-10). Two local matches mean a relaunch is in progress: use the address that the latest orchestrator handoff names. The advisor seat cannot write to GitHub; the orchestrator posts every joint decision and owner record.

1. State, from commands in this run (no memory):
   - `git -C ~/Projects/repo-harness fetch -q origin && git -C ~/Projects/repo-harness log --oneline -8 origin/main`
   - `repo-harness board --parent <n> --json` and `repo-harness board attention --parent <n> --json` for each open batch parent (`repo-harness board parents --json`)
   - `gh pr list --state open` with CI rollup, the last acceptance record and any unanswered review-bot comment
   - `hc ls` for repo-harness seats (status, worktree, unpushed commits via `git log origin/<branch>..HEAD`); the attention watchers (`hc ls --all --label repo-harness.service=attention`); `repo-harness quota`
   - the latest plan in /tmp/repo-harness-advisor/plans/
2. Find, first: idle writer seats while the plan has no ready non-security issue. Then propose new issues by JD in the same run, so that at least two non-security issues stay ready; do not defer them to the morning (owner, 2026-11-10: the seats idled 6 h overnight). Then find: merged or closed since the last plan; red CI and its first failing assertion; a review FAIL with no fix round; a stalled or finished seat with unpushed work; an issue whose blocker is gone; a dead watcher; quota changes that change routing; anything that needs the owner (security or production only).
3. Write /tmp/repo-harness-advisor/plans/<YYYYMMDD-HHMM>.md: changes since the last plan, blockers, the next parallel dispatch plan per batch parent (issue, seat from the quota route, tier, file overlap, trigger), joint decisions proposed, owner items.
4. Push the plan to the orchestrator: `hc send <orchestrator> "advisor <own address> plan <time>: /tmp/repo-harness-advisor/plans/<file>.md — <one line: top action>"`. Proposals in it are the advisor's half of a joint decision; the orchestrator posts each agreed one on GitHub as "Joint decision (orchestrator + advisor)" before acting and updates the batch plan comments. If the orchestrator is idle with ready work, say so in the same line.
5. Owner report in 繁體中文: only owner items (security or production) and a 3-line status; if nothing changed since the last plan, one line.

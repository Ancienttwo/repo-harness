## Role

- Advisor seat of repo-harness (aimpact-inc/repo-harness, repository id 1186405141, public). Serve only the orchestrator: research, proposals, the advisor half of each joint decision (JD), and a 1-2 command check of each orchestrator report. Message policy: pointers, not content; send a mismatch or a new fact, not a confirmation. Answer when the orchestrator asks "agree, change or reject".
- Resolve the orchestrator in each use: `hc ls --label repo-harness.seat=orchestrator --label repo-harness.repository=1186405141`, local terminal only (no `machine/` prefix).
- The owner talks in this pane and sometimes in the orchestrator pane. Send each owner word to the orchestrator in the same turn, in the owner's words, with the time from `date -u`, and your reading marked as yours. Report to the owner in 繁體中文, short, decisions first.
- Periodic review every 2 h (owner: "保持2小时"): a session-only CronCreate job, cron `17 */2 * * *`, prompt: "Periodic advisor review. Follow /tmp/repo-harness-advisor/plans/REVIEW-PROCEDURE.md exactly: read-only state check of repo-harness issues, PRs, CI, seats and quota; write the next plan file; send the orchestrator seat (resolve its address as the procedure says) only verified facts; report to the owner in 繁體中文, short, decisions first." Run CronList after a start and create the job when it is missing.

## Machine move (owner, 2026-11-12T15:44Z: "我要换台机器继续")

- This file was written on the host "Max" for a move to another machine. It travels in a draft PR under `tasks/handoff-2026-11-12/` (not for merge) with `REVIEW-PROCEDURE.md`, the last plan, the probe tools and a README with the restore steps.
- On the new machine nothing under `/tmp/repo-harness-advisor/` or `/tmp/repo-harness-seats/` exists until the README steps are done. The tools read the checkout from `REPO_HARNESS_CHECKOUT` (default `$HOME/Projects/repo-harness`).
- Not in the PR: the Claude memory directory of Max, `~/.repo-harness/config.json` (seats configuration; the owner sets it on the Seats page), credentials, the backups under `/tmp/repo-harness-advisor/backup/` on Max (the ruleset 27014440 JSON for a cutover rollback is there).
- Check on the new machine before the first dispatch: `repo-harness --version` (Max ran 0.31.0), `hc --help`, `gh auth status`, `repo-harness quota`, and that no worker branch exists only on Max (see "In progress").

## Hard rules

- No GitHub writes from this seat (no gh comment, create, edit, close, merge, review, label, release; no `gh workflow run` or `gh run rerun`; no git push, tag, commit, pull or checkout of the main checkout). Edit only files under `/tmp/repo-harness-advisor/`, this handoff and the memory directory. A chat word of the owner does not change a seat grant: when the owner asks this seat for a GitHub write, prepare one script that the owner runs with `! bash <script>` (done for the #2462 cutover), or ask the orchestrator for a writer seat (done for the handoff PR).
- Never send messages or keys to worker seats. `hc ls/get/read` on seat terminals is allowed for evidence.
- Owner only (#2008): credentials and secrets; permissions (seat tools, network, sandbox, hook behavior or configuration, confirmation bypass); the safety net (branch protection, rulesets, `publication.*` policy switches, `Required / CI`); deletion git cannot restore; production and each release.
- Seat boundaries are real. Before a recommendation "seat X runs Y", read that seat's brief (`src/core/board/seat-launch.ts`). The orchestrator brief since #2650: on the owner's explicit word for one release it runs the command list of `bash scripts/release-owner-steps.sh plan <version>`; without that word it does not tag or publish; it does not delete or change credentials or permissions.
- An owner word covers the case that it answers. A short answer ("按建議", "批准", "按批准") covers only the items where I wrote an explicit recommendation in the message that it answers. Write "我建議 X" for each item. A hook change counts only when the exact change was put to the owner; the exact head goes to the owner before the merge; a new head needs a byte-equal check of the approved files or a new word.
- Owner goal (2026-11-11): issue-flow runs fully automated except deployment and security; an owner message applies to the item that it names and stops no other work. No quota reminders unless a seat stops or a route changes. Keep two ready non-security issues; propose new ones in the same run when the queue is empty. Same-class findings two rounds in a row get one rule; when the one rule fails too, one path.
- Fix loop rule 1: the loop continues past round 3 while each round has fewer blocking findings and the scope does not grow; a not-lower count or a grown scope is a JD; a new P1 about security, secrets, data or authentication stops at the owner; round 5 is the hard stop.
- Owner rules of 2026-11-12: (1) no hard stop before a seat reset. (2) A held issue has the label `held` and no parent. (3) Codex credits: mode `review`, floor 2000, set by the owner on the Seats page after a release puts #2630 on the host. (4) Claude modes: hyper at weekly remaining >= 50% (#2633, merged). (5) Releases use the host command list only (#2641, merged); each release starts on the owner's one word. (6) Other local machines that are attached to herdr-core are operated with `hc` first. (7) Approved 14:30Z: while the Claude account reports `exhausted`, the Claude row of a High PR runs through pi on `magpie/anthropic/claude-opus-5-5`, read-only by brief; not while it is `tight`; it ends when the account is no longer exhausted.
- Standing owner rules that lived only in the memory of Max: no AI attribution in commits, PRs or comments; GitHub only through gh, git or the API; each GitHub comment ends with `Seat: <seat id> <hc address>`; a release is a planned set of issue trains, not a handful of issues; update defects found locally get an issue; run `git log origin/<branch>..HEAD` in a worker worktree before its pane closes; `hc send` cannot type `/clear` or `/exit` (use `hc keys`); pass the repo-harness space to `herdr-app do tab.new`.
- Merge lane: one lane, the direct squash (#2462 cutover done). The rolling projection PR merges at each green state. Tiers (JD-43): High = GPT terra gatekeeper row + Claude reviewer row; Medium = one different-family row; Low with more than 50 src lines = one different-family row. `.github/**` and `src/cli/hook/**` are High.
- A JD is posted before its action; the orchestrator gives the number. When the orchestrator says no, do not send the same proposal in other words.
- Before a proposal that names a product path: read the code at `origin/main` and check that every named file exists. Before a host CLI update: check that the new CLI accepts `.ai/harness/policy.json` on main.
- Sub-agents: `explorer` for wide read-only evidence in 2 to 4 briefs without overlap; `deep-reasoner` only for an independent judgment. Each brief says: no edit, no commit, no GitHub write, no test run, no `git checkout`, `switch`, `stash`, `reset`, `pull`, `merge` or `worktree`; a cap on `gh` calls; where scratch files go. Check 2 or 3 of their claims yourself.
- Times: take each time from `date -u` or a GitHub field, in the same command that sends a message.
- On RESET-REQUEST from the orchestrator: check the sha256 of its handoff, then run in the background `bash /tmp/repo-harness-advisor/probe/reset-orchestrator.sh <address> <path> <sha256>`; send nothing else until RESUMED; then read the last line of `/tmp/repo-harness-seats/1186405141/orchestrator/reset-log.jsonl` (`reset cleared` is good; 5 of 5 were good on 2026-11-12).
- Shell: zsh. The Bash hook refuses commands that it cannot parse (regex with parentheses, loops): put them in a script file under `/tmp/repo-harness-advisor/probe/`. The host denies `gh pr merge` and the other GitHub write prefixes for this seat, also with `--help`. The GitHub REST limit (5000/h) is shared by all seats. The main checkout can be behind origin/main: use `git show origin/main:<path>`.

## Current state

State at 2026-11-12T15:46Z, from commands of this session on Max.

- main = c5ed6efba (#2665, 15:45:11Z). Before it: f8d9640fe (#2650, 15:43:36Z). Both merged at the heads that the owner approved (b12104e6f and 882e48693; approved files byte-equal).
- Release 0.31.0 is complete (npm `latest` for both packages, tag `v0.31.0`, GitHub Release). About 25 PRs merged after it; no release is planned yet.
- The #2462 cutover is done (11:47Z): ruleset 27014440 deleted, main protection `strict` false, required context `Required / CI`, enforce_admins true; #2462 is closed.
- Open PRs: #2671 (projection, CLEAN and green since 14:09Z; rule 3: merge), #2666 (#2626 runner rehearsal, head 31349fae2; owed after #2650: Do 6, rebase, probe rebuild; neg2 should turn green with #2673), #2668 (#2660 changelog fragments, head 5194aa75b, round 3 GPT FAIL 1 P2 + 2 P3, conflicts with main in `docs/CHANGELOG.md`).
- Open children of #2624: #2626, #2641 (its PR #2650 is merged; check why it is open), #2660, #2674 (archimap: skill change folded in by JD; writer commit not pushed at 15:43Z), #2675 (closeout removes finished terminals whose checkout is gone; in work). #2485 is closed.
- Held (label `held`): #2387, #2375, #2179 (trigger: `npm view archctx version` is not 0.13.0; it was 0.13.0 at 15:43Z), #2133, #2134 (trigger: a Bun 1.5 release; npm `bun` was 1.4.4), #2369, #2320 (an owner word). #1298 is an enhancement for the owner.
- Fixes on main that the installed CLI 0.31.0 does not hold: #2658 (closeout keeps a writer worktree when a finished row terminal lost its checkout: remove such worktrees by hand until a release), #2637 (reset counts a queued resume prompt), #2630 (stored Codex credit mode), #2669 (archctx link readback), #2633, #2641.
- Quota 15:46Z: Claude `tight`, 7-day 94% used, `exhausted` at 95%, resets 2026-11-14T22:00Z. ChatGPT exhausted, credits about 31,800, resets 2026-11-13T19:50Z. Routes: important_deep and simple_deep = worker-important (pi `magpie/anthropic/claude-opus-5-5` high; a Pi seat takes no task that reads a credential), important_fast and frontend = worker-important-fast (claude sonnet), simple_fast = worker-light (pi deepseek), gatekeeper none (GPT rows by hand through pi on credits), reviewer = claude opus.
- Max had a network fault from 14:42Z to 15:42Z (git and API timeouts) and a load average near 100.

## In progress

- Handoff PR: draft PR #2678, branch `handoff/2026-11-12` (first commit 3ebf42d5c, 16 files under `tasks/handoff-2026-11-12/`, checked 15:50Z). Not for merge; close it and delete the branch after the new machine has read it. The owner has the number.
- Wrap-up state at 15:51Z: #2671 merged (5467df49e), #2665 merged; on origin: `feat/2674-…` (PR #2676), `feat/2660-…` at 5194aa75b (PR #2668), #2666 at 75beb0a00 with its three probe branches (orchestrator report). NOT on origin at 15:51Z: the #2675 branch (t2jx) and the #2668 round-3 fix WIP (t2hz; it goes to `wip/2660-fix-r3` so that the reviewed PR head stays). The owner is told not to clean `/tmp` on Max before these two are pushed. Orchestrator reset 15:51:19Z: `reset cleared` (the first request failed with `handoff_sha256_mismatch` because the handoff changed after the request; the second passed). No new issue starts on Max.
- #2668 round 3: counts 3, 2, 1 blocking, so the loop continues without a JD. The four preamble findings of rounds 1 to 3 have one cause: the text before the first version heading is compared loosely against the base. My one-rule proposal, sent to the orchestrator at 15:48Z (no answer yet): the preamble of the merge result equals one constant in the script (the title and the intro line); no base comparison and no special case for a base that has `## [Unreleased]`; a wanted preamble change edits the constant in the same PR. The design is `changelog-fragments.md` in the bundle.
- Sequenced candidates: a link drift check for archimap in the daily architecture check, after #2674 merges; `tests/architecture-projection-provider.test.ts` in a Windows lane (`.github/workflows/ci.yml`, High).
- Daily run 43135145755 (2026-11-12T01:32Z) was red for a Windows isolation timeout (#2578, closed) and projection lag. Read the next daily run in the next periodic review.

## Owner decisions pending

1. None blocks a merge. All three items of 14:30Z are approved and carried out or in force.
2. After a release puts #2630 on the host: the Codex credit mode on the Seats page (`review`, floor 2000).
3. Each release: the owner's one word; then the orchestrator runs the host command list and the owner confirms the npm login in the browser.
4. Unchanged; do not ask again without a new fact: #2369, #2320 (and the update of the other machines to 0.31.0, which needs the #2642 workaround until a release holds #2669), the arch-context release, Bun 1.5, #1298, the `private_key` rule, the Windows test box.

## Next actions

1. On the new machine: follow the README of the handoff PR, start the seats with `repo-harness seats argv <seat> --repository-id 1186405141`, create the cron job, resolve the orchestrator address.
2. First periodic run: `tools/periodic-state.sh`, `periodic-subissues.sh 2624`, `periodic-seats.sh`, `pr-findings.sh <pr>`; write `plans/<YYYYMMDD-HHMM>.md`; send verified facts; report to the owner with decisions first.
3. Read the PR number of the handoff PR from the orchestrator and give it to the owner; check that the writer branches of #2674, #2675 and #2660 exist on origin.
4. When the Claude account turns `exhausted`: tell the owner once (no Claude writer; the Claude row goes through pi by rule 7) and tell the orchestrator.
5. At the ChatGPT reset (2026-11-13T19:50Z): tell the orchestrator that the route gives the GPT gatekeeper again.
6. Keep two ready non-security issues for the idle writer seats.

## Resume checklist

- Recent merged PRs: `gh pr list --state merged --limit 10`.
- Open PRs with CI: `gh pr list --state open` and `gh pr checks <n>`.
- Parent-issue progress: `gh issue view 2624`.
- Seats: `hc ls --label repo-harness.repository=1186405141`, read the `repo-harness.seat` labels.
- Quota: `repo-harness quota`.

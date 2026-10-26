# Issue Pipeline

This contract sets the stages that the Bot follows when it turns a provider
issue into a draft PR. The stages are triage, reproduce and fix. The host owns
scheduling. repo-harness ships no scheduler and no automation code for this
pipeline.

Issue observation stays with `repo-harness external-source refresh|bind`. The
local inbox stays with [heartbeat triage](heartbeat-triage.md). This contract
adds the stop rules, the evidence handoff and the write rules.

## Stages

- The stages are triage, reproduce and fix, in that order.
- Each stage can stop the line with a useful outcome: `expected behavior`,
  `cannot reproduce`, `too risky` or `out of budget`.
- Each stage hands evidence to the next stage: the triage verdict, then the
  repro steps and artifacts, then the before and after proof.

## Writes

- One coordinator posts to GitHub. Workers are read-only and never post.
- Posting follows the GitHub Issue Claims rule in root `AGENTS.md`: claim
  first, read back after every post, and never retry an uncertain post without
  a read.
- This pipeline never merges, deploys or closes the issue.

## Triage

- Triage posts exactly one verdict comment.
- The comment has one marker line: `repo-harness triage: bug | performance | other`.
- Add `tracker=<url>` to the marker when an issue or tracker item exists.
- Do not post progress narration.
- Prefer no ticket over a guessed ticket or a duplicate ticket.

## Reproduce

- Reproduce starts only on a `bug` or `performance` marker from the configured
  triage identity.
- The discriminating symptom must appear twice through the real surface.
- State inspection may confirm the symptom. It must not inject the symptom.
- A missing feature map or control skill for the surface gives `blocked`. Do
  not guess.
- An open PR or merged commit may plausibly fix the issue. Then the run
  switches to verify mode: the baseline reproduces twice and the patched build
  is fixed twice. Never open a competing PR.

## Fix

- No confirmed repro means no authored fix.
- A fix needs runtime evidence of the root cause and a fix budget.
- The only output is a draft PR.

## Budgets And Failure

- Missing configuration fails closed.
- Budgets are explicit: poll interval, verdict wait, repro, fix and follow-up
  window.
- Cleanup always runs, also after a stop.

Adapted from pstack (cursor/plugins, MIT, Lauren Tan).

# Task

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

You are the GPT Pro Issue Author for a bounded repo-harness repair campaign.

Target GitHub repository: Ancienttwo/repo-harness-brc15a-canary-20260907

Registered repository id: repo_3b81945f21334250

Read exact ref refs/heads/main at commit 33d692aaa0ab593df0c160082b18fdac02c82e9c. Do not read or act on another revision.

Create exactly one GitHub Issue for each listed slot: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10.

Allowed issue kinds: bugfix, test_gap.

You may read that exact commit and create the requested Issues, or edit only the explicitly named Issue. Do not change code, branches, PRs, labels, milestones, assignees, or close Issues.

The title prefix is display-only. The body marker below is the sole slot authority. Copy it exactly; do not add hashes, digests, or extra keys inside the marker.

Slot 01:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=01
-->

Slot 02:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=02
-->

Slot 03:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=03
-->

Slot 04:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=04
-->

Slot 05:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=05
-->

Slot 06:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=06
-->

Slot 07:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=07
-->

Slot 08:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=08
-->

Slot 09:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=09
-->

Slot 10:
<!-- repo-harness-campaign:v1
campaign_id=brc15a-20260907-pro-slider
group=1
slot=10
-->

Each Issue body must also state the audit baseline and contain exactly one fenced ```json metadata object with protocol=1, kind=repo-harness-campaign-issue-metadata, issue_kind, primary_capability, priority, depends_on_slots, and suspected_paths.

Do not claim success for an Issue you did not observe GitHub create or update. Return a concise action log; the local controller will independently read GitHub.

# Instructions

Return a direct, reviewable answer. Preserve Markdown where useful.

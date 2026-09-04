# Campaign Issue authoring

Use the campaign command surface; do not open a generic browser consult for a repair campaign.

```bash
repo-harness campaign author --repo . --campaign-id <id> --group-number <1..3>
repo-harness campaign author-followup --repo . --request <request.json>
```

`campaign author` validates the stored `ProgramAuthorizationV1`, exact target ref and base commit, target-base policies, GitHub repository, and authorized Chrome profile. It persists `IssueBatchIntentV1` under the Git common directory before the browser provider can run. Every campaign prompt forces the existing Gitleaks prompt scan and selects `gpt-5.5-pro` through Oracle's model-selection transport.

The body marker is the sole slot authority and has exactly three fields:

```html
<!-- repo-harness-campaign:v1
campaign_id=<campaign-id>
group=<number>
slot=<01..10>
-->
```

Never add a SHA, digest, or other key to the marker. The title prefix is display-only. Initial authoring creates only the intent's slots; `fill_missing` names only observed missing slots; `edit_issue` names one existing provider Issue and one slot and forbids creating another Issue. Browser completion, failure, or timeout does not change Issue batch state. Only later local GitHub observations can do that, and an unverified authoring session cannot be adopted.

There is no local Issue-create fallback.

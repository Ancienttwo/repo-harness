# SourceBanner

A banner at the top of the page that states what went wrong with a data source. Uses Kumo `Banner` (`alert` or `error`).

- One sentence states which source, which repo, and how old the data is. One destination link on the right (「系统页 ›」 ("System page ›")).
- Partially available: `color-kumo-warning-tint` background + `color-kumo-warning` dot. Fully unavailable: `color-kumo-danger-tint` background + a diagnostic command (`CommandCopy`) + retry.
- When the last successful data is kept, it must be marked stale. Never show an empty list in place of a failure.
- Place it below the filter bar and above the list. At most one at a time.

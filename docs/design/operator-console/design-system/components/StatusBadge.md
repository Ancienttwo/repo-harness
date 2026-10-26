# StatusBadge

Status dots and status pills. Uses Kumo `Badge` (`appearance="dot"` or filled).

- Status dots are 7 to 8px, `radius-pill`. Take colors only from the "Color usage" table in the README: waiting on you `rh-accent`, running `color-kumo-info`, passed `color-kumo-success`, changes requested / partially available `color-kumo-warning`, conflict / unavailable `color-kumo-danger`, finished `text-color-kumo-subtle`.
- Unknown, not connected, not configured: a hollow dot (1px `text-color-kumo-subtle` outline). Do not use a solid gray dot to pose as a known status.
- Status pill = dot + text. Background uses the matching `*-tint`; text uses the matching `text-color-kumo-*`. 26px tall.
- Status must not rely on color alone: there is always text next to the dot, or the dot sits in a row that has text.

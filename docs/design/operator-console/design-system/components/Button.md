# Button

Buttons use Kumo `Button`. The four variants map to the website Button's primary / secondary / ghost / danger.

- **primary**: `color-kumo-brand` (carrot-700) background + white text, `shadow-sm`, hover `color-kumo-brand-hover`. Only one per area: send, start session, commit and open Draft PR.
- **secondary**: `color-kumo-base` background + `color-kumo-interact` border + `text-color-kumo-strong` text, `shadow-xs`.
- **ghost**: No background, no border. Hover `color-kumo-fill-hover`. Use it in toolbars and for inline actions.
- **danger**: `color-kumo-danger` background + white text. Only for actions that cannot be undone, such as discarding changes. Confirm first.
- Text uses Space Grotesk 600. Sizes: sm 32px / md 40px / lg 48px. Radius `radius-md` (sm uses `radius-sm`). Pressed buttons sink 1px.
- External-link buttons add ↗ after the text. Actions the console cannot perform are not buttons; use `CommandCopy`.

# HookRouteTable

The hook route table: one row per `event.routeId`. Data comes from `ROUTES` in `src/cli/hook/route-registry.ts`. Built with Kumo `Table` (layout `fixed`).

- Columns: route (event tag + `.routeId` + fail-closed shield), matcher, host, handler, profile.
- Event tags use the `badge` style, colored by event: SessionStart info blue, PreToolUse carrot, UserPromptSubmit and SubagentStart neutral, Stop amber. Colors only tell events apart. They do not express status.
- Fail-closed routes (exit code 2 when denied) get a shield icon after the route, `text-color-kumo-brand`, with a `title` explanation.
- Table header: `color-kumo-recessed` background, `eyebrow` style. Between rows: `color-kumo-hairline`.
- The host column lists the hosts actually installed (Claude, Codex). When a route exists on only one host, leave the other host empty. Do not write 「不适用」 ("not applicable").
- On narrow screens each row folds into a card.

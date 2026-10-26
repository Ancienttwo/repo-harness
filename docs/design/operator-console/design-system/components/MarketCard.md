# MarketCard

Cards for tools, resources and recommended skills. Uses Kumo `LayerCard` in a three-column grid (`minmax(320px, 1fr)`).

- Header: 48px initial square (`color-kumo-fill`, no third-party logos) + name (`heading`) + author or source (`caption`, with a shield icon when it comes from the catalog) + one status or action on the right.
- There are only two actions: 「获取 ↗」 ("Get ↗"), an external link to the upstream README; or, when already installed with a profile, a status such as 「✓ 随 full」 ("✓ with full") (`text-color-kumo-brand`). The console does not install or probe third-party tools.
- Body: a two- to three-line summary. Bottom metadata: category, license, status, one optional tag.
- The hero card at the top states that these are third-party code and that you should read the upstream README first.

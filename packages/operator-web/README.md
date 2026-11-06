# repo-harness-operator-web

Built web console for `repo-harness operator serve`.

Install this package beside `repo-harness`. Both packages must have the same
version. The server returns a 503 for page requests if the console is absent or
has another version. API routes and `/healthz` remain available.

Run `repo-harness update` to repair the installed pair. Restart the server and
reload the page after an update.

The source stays in `src/operator-web/` in the repo-harness repository. From the
repository root, run `bun run build:operator-web` to build this package's `dist/`.
`npm pack` in this directory builds the console and copies the root MIT license.
The package has no runtime dependencies or install scripts.

In a source checkout, use `bun run dev:operator` against a running `repo-harness operator serve`; the checkout has no installed console package.

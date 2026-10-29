// Development fixtures for GET /api/v1/repositories/{id}/docs/tree and
// /docs/file. Each answer is the route's wire body and HTTP status: a 200 body
// passes the same strict decoder the browser applies, and a refusal is the
// route's `{ error: { code, message, next_action } }` envelope.

import { docsLines, OPERATOR_DOCS_FILE_KIND, OPERATOR_DOCS_TREE_KIND } from '../../core/operator/docs';

export const DOCS_REF = 'refs/remotes/origin/main';
export const DOCS_COMMIT = '49f7ba6fa3c1d2e4b5a6978877665544332211aa';
export const DOCS_COMMITTED_AT = '2026-10-27T08:15:42.000Z';

const README = `# Operator console

The console reads \`docs/\` from the default branch. See the [console design](./design/console.md),
the [changelog](design/notes/changelog.md) and the [Kumo docs](https://kumo-ui.com/).

| Page | Phase | Writes |
| --- | --- | --- |
| Docs | 1 | none |
| Docs session | 4 | \`docs/\` only |

- [x] Read the tree
- [ ] Cite a range

Raw HTML stays text: <script>alert('readme')</script> <img src=x onerror="alert('img')">

A [script link](javascript:alert('link')) and a [source file](../src/cli/index.ts) are text.

\`\`\`mermaid
%%{init: {"securityLevel": "loose"}}%%
graph LR
  tree["docs tree"] --> file["docs file"]
  file --> page["<img src=x onerror=alert('label')>"]
  click page call alert("click")
\`\`\`

\`\`\`ts
const answer = await fetch('/api/v1/repositories/repo/docs/tree');
\`\`\`
`;

const CONSOLE = `# Console design

## Reading column

Document text sits in a 672px column at 16px with a 1.65 line height. Headings use the display face.

## Tree

Directories fold and show how many files they hold. The open file's directories start open.

> The working copy of this file has edits that are not committed. Citations use the commit.
`;

const CHANGELOG = `# Changelog

- 1.9: the read-only Docs page.
`;

const CONFIG = `# Example operator settings
serve:
  host: 127.0.0.1
  port: 4318

collect:
  interval: 60


notify: off
`;

/** Every file the tree lists, with the worktree state the reader reports for it. */
const FILES: readonly { readonly path: string; readonly text: string | null; readonly worktree_differs: boolean }[] = [
  { path: 'docs/README.md', text: README, worktree_differs: false },
  { path: 'docs/design/console.md', text: CONSOLE, worktree_differs: true },
  { path: 'docs/design/notes/changelog.md', text: CHANGELOG, worktree_differs: false },
  { path: 'docs/reference/settings.yaml', text: CONFIG, worktree_differs: false },
  // A symlink whose target is outside docs/: listed, but the read refuses it.
  { path: 'docs/linked.md', text: null, worktree_differs: false },
];

/** Fixture digests: valid sha256 form, not hashes of the text. */
function digest(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(32);
}

const bytes = (text: string) => new TextEncoder().encode(text).length;

export interface DocsWireAnswer {
  readonly status: number;
  readonly body: unknown;
}

function refusal(status: number, code: string, message: string, next_action: string): DocsWireAnswer {
  return { status, body: { error: { code, message, next_action } } };
}

export function docsTreeAnswer(repositoryId: string, now: number): DocsWireAnswer {
  return {
    status: 200,
    body: {
      protocol: 1, kind: OPERATOR_DOCS_TREE_KIND, repository_id: repositoryId, ref: DOCS_REF, commit: DOCS_COMMIT,
      collected_at: new Date(now - 2 * 60_000).toISOString(),
      files: FILES.map((file, index) => ({ path: file.path, size: file.text === null ? 64 : bytes(file.text), sha256: digest(index + 1) })),
    },
  };
}

/** The route's answer for one path: the file, or its refusal with the route's message. */
export function docsFileAnswer(repositoryId: string, path: string): DocsWireAnswer {
  if (path.split('/').some(part => part === '' || part === '.' || part === '..')) {
    return refusal(400, 'path_invalid', 'The path is not a repository-relative path.', 'Choose a file from the docs tree.');
  }
  if (!path.startsWith('docs/') || /(?:^|\/)(?:\.env(?:\..*)?|\.git)(?:\/|$)/u.test(path)) {
    return refusal(403, 'path_denied', 'The path is outside docs/ or names a secret-bearing file.', 'Choose a file from the docs tree.');
  }
  const index = FILES.findIndex(file => file.path === path);
  const file = FILES[index];
  if (file === undefined) return refusal(404, 'not_found', 'The file is not in the docs listing.', 'Choose a file from the docs tree.');
  if (file.text === null) return refusal(403, 'path_escape', 'The path resolves outside docs/ through a symlink or submodule.', 'Choose a file from the docs tree.');
  return {
    status: 200,
    body: {
      protocol: 1, kind: OPERATOR_DOCS_FILE_KIND, repository_id: repositoryId, ref: DOCS_REF, commit: DOCS_COMMIT, committed_at: DOCS_COMMITTED_AT,
      path, size: bytes(file.text), sha256: digest(index + 1), text: file.text, lines: docsLines(file.text), worktree_differs: file.worktree_differs,
    },
  };
}

/** The first collection has not finished. */
export const docsPendingAnswer: DocsWireAnswer = refusal(503, 'docs_pending', 'The docs listing is not collected yet.', 'Retry in a minute.');

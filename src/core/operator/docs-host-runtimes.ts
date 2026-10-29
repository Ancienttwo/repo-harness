/**
 * The runtimes whose docs isolation is verified (D3). A runtime joins only
 * with a docs host profile, a model API list and a zero-model boundary proof
 * in the native macOS lane. The docs host, the `agents.uses.docs` setting and
 * doc session creation read this list; there is no other source.
 */
export const DOCS_HOST_RUNTIME_IDS = Object.freeze(['codex'] as const);
export type DocsHostRuntimeId = typeof DOCS_HOST_RUNTIME_IDS[number];

export function isDocsHostRuntimeId(value: string): value is DocsHostRuntimeId {
  return (DOCS_HOST_RUNTIME_IDS as readonly string[]).includes(value);
}

/**
 * The runtimes whose docs isolation is verified. The owner closed the docs host
 * stack (#1149, option 3): D1 did not pass, so this allowlist is empty and no
 * runtime may start a docs host. A runtime joins only with a docs host profile,
 * a model API list and a zero-model boundary proof in the native macOS lane.
 * The `agents.uses.docs` setting and doc session creation read this list; there
 * is no other source.
 */
export const DOCS_HOST_RUNTIME_IDS = Object.freeze([] as const);
/** No runtime while the list is empty. A new entry derives it from the same list. */
export type DocsHostRuntimeId = typeof DOCS_HOST_RUNTIME_IDS[number];

/** True only for a runtime in the launch allowlist. The list is empty today, so every value is false. */
export function isDocsHostRuntimeId(value: string): value is DocsHostRuntimeId {
  return (DOCS_HOST_RUNTIME_IDS as readonly string[]).includes(value);
}

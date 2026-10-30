/**
 * `publication.acceptance_merge` in `.ai/harness/policy.json` is the only
 * switch for the publication merge executor. A missing `publication` object or
 * a missing field means "off"; every other shape is invalid.
 */

export type AcceptanceMergeSwitch = 'off' | 'on';

/** The policy file at one commit: absent, or its exact text. */
export type PolicyFileAtRef =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly text: string };

export type PublicationPolicy =
  | { readonly ok: true; readonly acceptance_merge: AcceptanceMergeSwitch; readonly subtree: string }
  | { readonly ok: false; readonly message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Key-order independent bytes of a JSON value; `undefined` marks an absent subtree. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return 'absent';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parsePublicationPolicy(file: PolicyFileAtRef): PublicationPolicy {
  if (file.status === 'missing') return { ok: true, acceptance_merge: 'off', subtree: canonicalJson(undefined) };
  let root: unknown;
  try {
    root = JSON.parse(file.text);
  } catch {
    return { ok: false, message: 'policy.json is not valid JSON' };
  }
  if (!isObject(root)) return { ok: false, message: 'policy.json root must be an object' };
  const publication = root.publication;
  if (publication === undefined) return { ok: true, acceptance_merge: 'off', subtree: canonicalJson(undefined) };
  if (!isObject(publication)) return { ok: false, message: 'publication must be an object' };
  const unknown = Object.keys(publication).filter((key) => key !== 'acceptance_merge');
  if (unknown.length > 0) return { ok: false, message: `publication has unknown fields: ${unknown.sort().join(', ')}` };
  const value = publication.acceptance_merge;
  if (value !== undefined && value !== 'off' && value !== 'on') {
    return { ok: false, message: 'publication.acceptance_merge must be "off" or "on"' };
  }
  return { ok: true, acceptance_merge: value ?? 'off', subtree: canonicalJson(publication) };
}

/**
 * A PR must not change the switch it is merged under. Any change to the
 * `publication` subtree at the head, including deletion of the file and a
 * malformed policy, counts. Other policy fields may change.
 */
export function publicationPolicyChanged(base: PublicationPolicy & { readonly ok: true }, head: PolicyFileAtRef): boolean {
  const headPolicy = parsePublicationPolicy(head);
  return !headPolicy.ok || headPolicy.subtree !== base.subtree;
}

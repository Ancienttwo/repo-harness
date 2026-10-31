/**
 * `publication.acceptance_merge` in `.ai/harness/policy.json` is the only
 * switch for the publication merge executor. A missing `publication` object or
 * a missing field means "off"; every other shape is invalid.
 *
 * `publication.required_check_coverage` declares protected paths and the
 * required checks that must have run for them (issue #1205). Both blocks live
 * in the protected `publication` subtree, so a PR cannot weaken the rule it is
 * merged under.
 */

import {
  parseRequiredCheckCoverageBlock,
  type RequiredCheckCoveragePolicyV1,
} from './required-check-coverage';

export const PUBLICATION_POLICY_PATH = '.ai/harness/policy.json';

export type AcceptanceMergeSwitch = 'off' | 'on';

/** The policy file at one commit: absent, or its exact text. */
export type PolicyFileAtRef =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly text: string };

export type PublicationPolicy =
  | {
    readonly ok: true;
    readonly acceptance_merge: AcceptanceMergeSwitch;
    /** The declared coverage block, or null when the block is absent or empty. */
    readonly coverage: RequiredCheckCoveragePolicyV1 | null;
    readonly subtree: string;
  }
  | { readonly ok: false; readonly message: string };

/** The coverage block observed at one commit. `absent` covers an absent and an empty block. */
export type RequiredCheckCoveragePolicyAtRef =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'active'; readonly policy: RequiredCheckCoveragePolicyV1 };

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

type PolicyRoot =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'present'; readonly root: Record<string, unknown> };

/** One parse of the policy file; both blocks below read the same root. */
function policyRoot(file: PolicyFileAtRef): PolicyRoot {
  if (file.status === 'missing') return { status: 'absent' };
  let root: unknown;
  try {
    root = JSON.parse(file.text);
  } catch {
    return { status: 'invalid', message: 'policy.json is not valid JSON' };
  }
  if (!isObject(root)) return { status: 'invalid', message: 'policy.json root must be an object' };
  return { status: 'present', root };
}

/** The provider contents payload of one policy file; null when it is not a readable file. */
export function policyFileFromContents(value: unknown): PolicyFileAtRef | null {
  if (!isObject(value)) return null;
  if (value.type !== 'file' || value.path !== PUBLICATION_POLICY_PATH
    || value.encoding !== 'base64' || typeof value.content !== 'string') return null;
  return { status: 'present', text: Buffer.from(value.content, 'base64').toString('utf-8') };
}

export function parsePublicationPolicy(file: PolicyFileAtRef): PublicationPolicy {
  const parsed = policyRoot(file);
  if (parsed.status === 'absent') return { ok: true, acceptance_merge: 'off', coverage: null, subtree: canonicalJson(undefined) };
  if (parsed.status === 'invalid') return { ok: false, message: parsed.message };
  const publication = parsed.root.publication;
  if (publication === undefined) return { ok: true, acceptance_merge: 'off', coverage: null, subtree: canonicalJson(undefined) };
  if (!isObject(publication)) return { ok: false, message: 'publication must be an object' };
  const unknown = Object.keys(publication).filter((key) => key !== 'acceptance_merge' && key !== 'required_check_coverage');
  if (unknown.length > 0) return { ok: false, message: `publication has unknown fields: ${unknown.sort().join(', ')}` };
  const value = publication.acceptance_merge;
  if (value !== undefined && value !== 'off' && value !== 'on') {
    return { ok: false, message: 'publication.acceptance_merge must be "off" or "on"' };
  }
  const coverage = parseRequiredCheckCoveragePolicy(publication.required_check_coverage);
  if (!coverage.ok) return { ok: false, message: coverage.message };
  return { ok: true, acceptance_merge: value ?? 'off', coverage: coverage.policy, subtree: canonicalJson(publication) };
}

function parseRequiredCheckCoveragePolicy(block: unknown):
  { readonly ok: true; readonly policy: RequiredCheckCoveragePolicyV1 | null } | { readonly ok: false; readonly message: string } {
  if (block === undefined) return { ok: true, policy: null };
  const parsed = parseRequiredCheckCoverageBlock(block);
  if (!parsed.ok) return { ok: false, message: `publication.required_check_coverage is invalid: ${parsed.message}` };
  const { protected_paths: protectedPaths, required_checks: requiredChecks } = parsed.policy;
  return { ok: true, policy: protectedPaths.length > 0 && requiredChecks.length > 0 ? parsed.policy : null };
}

/**
 * The coverage block alone, so a readiness read reports a coverage blocker for
 * a malformed coverage block without claiming the merge switch is invalid.
 * `absent` covers a missing file, a missing block and an empty block.
 */
export function requiredCheckCoveragePolicyAtRef(file: PolicyFileAtRef): RequiredCheckCoveragePolicyAtRef {
  const parsed = policyRoot(file);
  if (parsed.status === 'absent') return { status: 'absent' };
  if (parsed.status === 'invalid') return { status: 'invalid', message: parsed.message };
  const publication = parsed.root.publication;
  if (publication === undefined) return { status: 'absent' };
  if (!isObject(publication)) return { status: 'invalid', message: 'publication must be an object' };
  const coverage = parseRequiredCheckCoveragePolicy(publication.required_check_coverage);
  if (!coverage.ok) return { status: 'invalid', message: coverage.message };
  return coverage.policy === null ? { status: 'absent' } : { status: 'active', policy: coverage.policy };
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

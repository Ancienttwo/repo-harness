export const RUNTIME_EVIDENCE_INVARIANTS = [
  'published_tarball',
  'clean_install',
  'installed_hook_readback',
] as const;

export type RuntimeEvidenceInvariant = (typeof RUNTIME_EVIDENCE_INVARIANTS)[number];

/**
 * Runtime evidence has a release lifecycle, not an acceptance lifecycle. Each
 * observation proves one runtime invariant of a published package after a
 * clean install; it has no task contract, review subject, or merge disposition.
 */
export interface RuntimeEvidenceObservation {
  readonly invariant: RuntimeEvidenceInvariant;
  readonly status: 'pass';
  readonly detail: string;
}

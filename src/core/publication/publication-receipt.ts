import { sha256Prefixed } from '../evidence/sha256';

export { canonicalize as stablePublicationJson } from '../evidence/canonical-json';

export function publicationSha256(value: string | Buffer): string {
  return sha256Prefixed(value);
}

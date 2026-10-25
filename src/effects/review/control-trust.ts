import { assertObservationPath, currentReadonlyObservation, observationReadFileSync } from '../readonly-observation';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPublicKey } from 'node:crypto';

export interface ReviewControlTrust {
  userPublicKey: string;
  revokedDelegationIds: readonly string[];
}

/** Only an administrator-installed public trust anchor may authenticate the
 * control Bot. No request, candidate config, HOME, or actor flag chooses it.
 * Installing this file is a separate host operation; this reader never creates it.
 * The explicit fixture home is an in-process test seam, never a CLI option.
 */
export function readReviewControlTrust(fixtureAuthorityHome?: string): ReviewControlTrust {
  if (!fixtureAuthorityHome && process.platform === 'win32') {
    throw new Error('review_control_trust_unavailable: Windows host ACL adapter is not configured');
  }
  const path = fixtureAuthorityHome
    ? join(realpathSync(fixtureAuthorityHome), '.repo-harness', 'control-trust.json')
    : '/etc/repo-harness/control-trust.json';
  assertObservationPath(path);
  const expectedUid = fixtureAuthorityHome ? process.getuid?.() : 0;
  const directory = realpathSync(dirname(path));
  // /etc is an OS symlink on macOS. Resolve that fixed prefix, then check each
  // directory below the root. Candidate-controlled symlinks cannot select a key.
  for (let current = directory; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || (stat.mode & 0o022) !== 0 || stat.uid !== expectedUid) {
      throw new Error('review_control_trust_unsafe_directory');
    }
    if (fixtureAuthorityHome && current === realpathSync(fixtureAuthorityHome) || dirname(current) === current) break;
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== expectedUid || (stat.mode & 0o022) !== 0 || stat.size > 64 * 1024) {
      throw new Error('review_control_trust_unsafe_file');
    }
    const value = JSON.parse(currentReadonlyObservation() ? observationReadFileSync(path).toString('utf8') : readFileSync(fd, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['protocol', 'revoked_delegation_ids', 'user_public_key'])
      || value.protocol !== 1 || typeof value.user_public_key !== 'string'
      || !Array.isArray(value.revoked_delegation_ids)
      || value.revoked_delegation_ids.some((id: unknown) => typeof id !== 'string' || !id.trim())
      || new Set(value.revoked_delegation_ids).size !== value.revoked_delegation_ids.length
      || createPublicKey(value.user_public_key).asymmetricKeyType !== 'ed25519') {
      throw new Error('review_control_trust_invalid');
    }
    return Object.freeze({ userPublicKey: value.user_public_key,
      revokedDelegationIds: Object.freeze([...value.revoked_delegation_ids]) });
  } finally { closeSync(fd); }
}

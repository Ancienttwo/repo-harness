/**
 * Pure Agent-config library primitives. This is not an Operator reader or a
 * complete Agent-config feature. Callers supply text and parsed policy values.
 * This module has no filesystem, process, registry, collector, or UI integration.
 */
import { KEY_BEGIN } from '../security/secret-patterns';

const MAX_TEXT_BYTES = 256 * 1024;
const REDACTED = '[configured]';
const UNAVAILABLE = '[unavailable]';
// The same label vocabulary covers policy keys, assignments, and CLI options.
const CREDENTIAL_LABEL = String.raw`(?:token|secret|password|passwd|passphrase|(?:api|private|access|signing)[ \t_-]*key|credential|webhook|endpoint|authorization|authentication|cookie|auth|signature|dsn|connection)`;
const CREDENTIAL_CARRIERS = [
  new RegExp(KEY_BEGIN),
  /\b(?:proxy[-_ ]?)?(?:authorization|authentication)["']?\s*[:=]/iu,
  /\b(?:bearer|basic|digest|negotiate)\s+\S+/iu,
  new RegExp(String.raw`(?:--?|\b)[\w-]*${CREDENTIAL_LABEL}[\w-]*["']?(?:\s*[:=]|[ \t]+(?=["'\w]))`, 'iu'),
  /(?:--(?:auth|key|user|header|oauth2-bearer)|-[uH])(?:[=\s]|$)/iu,
  /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  /https?:\/\/(?:hooks\.slack\.com\/services|(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)/iu,
  /https?:\/\/[^\s"'<>]*[?&](?:token|key|secret|auth|signature|sig|code)=/iu,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+|\d{6,}:[A-Za-z0-9_-]{25,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/u,
];
const bytes = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Suppress the whole field when it contains a credential carrier. Do not guess
 * where a quoted, encoded, or multiline payload ends. This can hide safe prose.
 * It is a conservative display filter, not proof that arbitrary prose is public.
 */
export function publicAgentConfigText(text: string): string {
  if (bytes(text) > MAX_TEXT_BYTES || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) return UNAVAILABLE;
  if (text !== REDACTED && CREDENTIAL_CARRIERS.some(pattern => pattern.test(text))) return REDACTED;
  return text.replace(/(^|[\s("'=:])(?:\/(?:[^\s"')<>]+)|[A-Za-z]:[\\/][^\s"')<>]+)/gu, '$1[private path]');
}

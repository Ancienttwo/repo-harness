// PEM and PGP armor fences use five dashes. The ssh.com form that PuTTYgen exports
// puts a space between four dashes and the label.
const KEY_OPEN = '----[- ]';
const KEY_CLOSE = '[- ]----';
/**
 * Key tools name many block types (TSS2, ED25519, RSA-PSS), so any uppercase
 * words may lead the label. A word holds only single inner hyphens, so no fence
 * fits inside a word.
 */
const KEY_LABEL = String.raw`\s+(?:[A-Z0-9]+(?:-[A-Z0-9]+){0,7}\s+){0,8}(?:PRIVATE\s+KEY(?:\s+BLOCK)?|SECRET\s+KEY\s+BLOCK)`;
/** The complete first line of a private key block. */
export const KEY_BEGIN = `${KEY_OPEN}BEGIN${KEY_LABEL}${KEY_CLOSE}`;
/** The complete last line of a private key block. */
export const KEY_END = `${KEY_OPEN}END${KEY_LABEL}${KEY_CLOSE}`;

/**
 * Shared token rules. Each caller uses a fresh RegExp to avoid lastIndex state.
 *
 * Each rule runs in linear time. Where one failed start proves that later
 * starts in the same run fail too, a lookbehind rejects those later starts. It
 * runs only after the complete start literal, and it stops at the previous
 * candidate, so the walks do not overlap:
 * - jwt_token, url_token: a start that fails leaves no match in its run.
 * - credential_url: every letter in a scheme run reaches the same `://`, so
 *   only the first letter of the run starts a match.
 * - private_key: an END of any label closes a BEGIN of any label. So a BEGIN that
 *   finds no END proves that no later BEGIN finds one, and only a BEGIN whose
 *   nearest earlier marker is an END, or no marker, starts a match. A lookahead
 *   for the complete BEGIN header comes first, so dashes alone start no walk.
 *   The lookbehind stops at that marker and captures it when it is a BEGIN. The
 *   next `\1` then needs a fence before the text `BEGIN`, which fails.
 *   An END can share fence characters with a BEGIN on either side, so the marker
 *   excludes a BEGIN's closing fence and a BEGIN that an END overlaps.
 *
 * The walks use one character class. A repeated group here is not an option:
 * at about 1 MiB of walk Bun's regex engine stops and reports no match.
 */
export const SECRET_TOKEN_PATTERNS = [
  { type: 'bearer_token', pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { type: 'openai_key', pattern: /sk-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-[REDACTED]' },
  { type: 'github_pat', pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: 'ghp_[REDACTED]' },
  { type: 'github_pat_v2', pattern: /github_pat_[A-Za-z0-9_]{30,}/g, replacement: 'github_pat_[REDACTED]' },
  { type: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
  { type: 'jwt_token', pattern: /eyJ(?<!eyJ[A-Za-z0-9_-]*?eyJ)[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[JWT REDACTED]' },
  { type: 'private_key', pattern: new RegExp(String.raw`${KEY_OPEN}(?=BEGIN${KEY_LABEL}${KEY_CLOSE})(?<=(?:((?<!${KEY_OPEN}END${KEY_LABEL}(?:[- ]-{0,3})?)${KEY_OPEN}BEGIN${KEY_LABEL}(?=${KEY_CLOSE}))|${KEY_END}|^)[\s\S]*?${KEY_OPEN})\1BEGIN${KEY_LABEL}${KEY_CLOSE}[\s\S]*?${KEY_END}`, 'g'), replacement: '[PRIVATE KEY REDACTED]' },
  { type: 'webhook_url', pattern: /https:\/\/(?:hooks\.slack\.com\/services|(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks)\/[^\s<>"']+/gi, replacement: '[WEBHOOK REDACTED]' },
  { type: 'credential_url', pattern: /[a-z](?<![a-z][0-9+.-]*[a-z])[a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s<>"']+/gi, replacement: '[CREDENTIAL URL REDACTED]' },
  { type: 'url_token', pattern: /https?:\/\/(?<!https?:\/\/[^\s<>"']*?https?:\/\/)[^\s<>"']*[?&](?:token|key|secret|auth|signature|sig|code)=[^\s<>"']+/gi, replacement: '[ENDPOINT REDACTED]' },
  { type: 'telegram_token', pattern: /\b\d{5,16}:[A-Za-z0-9_-]{30,}\b/g, replacement: '[TELEGRAM TOKEN REDACTED]' },
  { type: 'slack_token', pattern: /xox[abposr]-[A-Za-z0-9-]{10,}/g, replacement: 'xox[REDACTED]' },
] as const;

/** Assignment detection is case-sensitive. Empty and explicit absent values are safe. */
export function containsSecret(text: string): boolean {
  for (const { type, pattern } of SECRET_TOKEN_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      // The sk- prefix starts a token. It cannot start inside another identifier.
      // MCP still uses the broad shared pattern for replacement.
      if (type === 'openai_key' && match.index > 0 && /[A-Za-z0-9_]/.test(text[match.index - 1])) continue;
      return true;
    }
  }
  const assignments = /(?:^|[^\w])((?=[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS|DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL))[A-Z0-9_]*)\s*[:=][ \t]*([^\r\n]*)/g;
  for (const match of text.matchAll(assignments)) {
    const value = match[2].trim().split(/(?<!\s)\s+#/)[0].trim();
    if (value && !/^(?:null|none|""|'')$/i.test(value)) return true;
  }
  return false;
}

/** Replace each token rule match with the rule's replacement. */
export function replaceSecrets(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SECRET_TOKEN_PATTERNS) out = out.replace(new RegExp(pattern.source, pattern.flags), replacement);
  return out;
}

// Some replacements still match their own rule (`Authorization: Bearer [REDACTED]`),
// so the check runs on the text with the replacement strings taken out.
export function hasUnredactedSecret(text: string): boolean {
  let rest = text;
  for (const { replacement } of SECRET_TOKEN_PATTERNS) rest = rest.split(replacement).join('');
  return containsSecret(rest);
}

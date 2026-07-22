/**
 * D6 secret redaction: deny-by-construction. A fixed denylist of secret env
 * var NAMES plus a high-entropy token pattern; any matched substring of the
 * ORIGINAL text is replaced with `sha256:<hash-of-the-secret>`. Pure: this
 * module never reads `process.env` itself -- the caller (an effects module)
 * collects the present values and passes them in as `knownSecretValues`.
 */
import { createHash } from "crypto";
import type { JsonValue } from "./types";
import { mapStringLeaves } from "./json-walk";

/** Env var NAMES whose present VALUES must never appear raw in a payload. */
export const SECRET_DENYLIST_ENV_KEYS: readonly string[] = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "SSH_AUTH_SOCK",
];

const HIGH_ENTROPY_TOKEN_SOURCE = "[A-Za-z0-9+/_-]{32,}";

interface Span {
  readonly start: number;
  readonly end: number;
}

function hashSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

function findKnownSecretSpans(text: string, knownSecretValues: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (const secret of knownSecretValues) {
    if (secret.length === 0) continue;
    let fromIndex = 0;
    while (fromIndex <= text.length) {
      const index = text.indexOf(secret, fromIndex);
      if (index === -1) break;
      spans.push({ start: index, end: index + secret.length });
      fromIndex = index + secret.length;
    }
  }
  return spans;
}

function findHighEntropySpans(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = new RegExp(HIGH_ENTROPY_TOKEN_SOURCE, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/** Sort and union overlapping/adjacent spans so no original byte is hashed twice. */
function mergeSpans(spans: readonly Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const merged: Span[] = [sorted[0]!];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (span.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      merged.push(span);
    }
  }
  return merged;
}

/**
 * Redact every matched span exactly once, over the ORIGINAL text only. A
 * two-pass "denylist then regex" design would re-scan the hex output of the
 * first pass (itself high-entropy) and double-hash it; computing spans from
 * both sources up front and slicing the original string avoids that.
 */
export function redactSecretValue(text: string, knownSecretValues: readonly string[]): string {
  const spans = mergeSpans([...findKnownSecretSpans(text, knownSecretValues), ...findHighEntropySpans(text)]);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start);
    out += hashSecret(text.slice(span.start, span.end));
    cursor = span.end;
  }
  out += text.slice(cursor);
  return out;
}

/** Pure: walk a JSON payload and redact every string leaf. */
export function redactPayloadStrings(value: JsonValue, knownSecretValues: readonly string[]): JsonValue {
  return mapStringLeaves(value, (_path, leaf) => redactSecretValue(leaf, knownSecretValues));
}

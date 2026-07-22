/**
 * D6 secret redaction: deny-by-construction. A fixed denylist of secret env
 * var NAMES plus a high-entropy token pattern; any matched substring of the
 * ORIGINAL text is replaced with `sha256:<hash-of-the-secret>`. Pure: this
 * module never reads `process.env` itself -- the caller (an effects module)
 * collects the present values and passes them in as `knownSecretValues`.
 *
 * EPC-05 gatekeeper CRITICAL fix (typed-field exemption at the construction
 * boundary, "Option B"; a within-letter D6 refinement -- D6's frozen text
 * pins the invariant that secrets never appear raw, not this exact entropy
 * pattern, per the EPC-01 acceptance record): the bare entropy pattern was
 * mangling legitimate structured payload values that happen to be 32+ chars
 * of `[A-Za-z0-9+/_-]` with no breaking dot -- an already-computed sha256
 * hash value got double-hashed (`sha256:sha256:...`), and any repo-relative
 * path whose directory+filename-stem run is 32+ chars (any realistic
 * contract slug) had that whole run replaced with a hash, e.g.
 * `tasks/contracts/<long-slug>.contract.md` -> `sha256:<hash>.contract.md`.
 * Live repro: `evt-01KY4YMNNF0BFAPHV968AX04J6` in the EPC-05 worktree's own
 * ledger (a real `verify-sprint` run against this package's own,
 * realistic-length contract slug).
 *
 * Two typed exemptions from entropy redaction are applied structurally --
 * classified BEFORE the entropy pass runs, never a post-hoc unhash:
 *
 *   1. Declared hash: a whole string value matching
 *      `^(sha256:)?[0-9a-f]{40,64}$` is already a hash or a raw git commit
 *      SHA (40 hex chars) -- entropy-redacting it a second time is exactly
 *      the double-prefix bug. Whole-value match only; a hash or SHA
 *      embedded inside a longer free-text string (e.g. a full command
 *      line) is NOT exempted by this rule and keeps the entropy pattern for
 *      that embedded span.
 *   2. Declared or inferred path: a field whose KEY follows the existing
 *      path-key convention (`path`/`_path`/`Path` suffix -- the same
 *      convention `src/effects/evidence/event-writer.ts`'s `isPathFieldKey`
 *      enforces fail-closed repo-relative validation for; duplicated here
 *      as a one-line convention check, not imported, since this is a core
 *      module and must not depend on the effects layer) is exempt, AND --
 *      because several real run-trace fields carry paths without following
 *      that key convention (`run_file`, `lifecycle.snapshot`,
 *      `contract.file`, `active_plan`; never renamed to fit the
 *      convention, since these are established consumer-facing field
 *      names outside this package's authority to rewrite) -- a value that
 *      WHOLE-VALUE parses as a safe repo-relative path is exempt too:
 *      contains `/`, no leading `/`, no `..` path-traversal segment, and
 *      ends with a file extension (a final dot-suffix on the string). This
 *      is a lightweight redaction-exemption heuristic only, not a security
 *      validator -- `src/effects/path-safety.ts`'s `ensureRepoRelativePath`
 *      remains the actual fail-closed check for path-key-convention fields,
 *      unchanged and still enforced by `event-writer.ts` independently of
 *      this module.
 *
 * Both exemptions skip ONLY the entropy pattern. The secret-value denylist
 * check (`findKnownSecretSpans`) still runs unconditionally over every
 * field, exempted or not -- a literal secret value sitting in a hash-shaped
 * or path-shaped position must still be replaced. Free-text fields (no
 * matching exemption -- e.g. a command line embedding a path inside other
 * words, `branch`, or any bare identifier with no path separator+extension)
 * are unaffected by this refinement and remain subject to entropy redaction
 * exactly as before; this is an accepted, out-of-ruling-scope residual since
 * no consumer gates on those fields' exact value.
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

/** Rule 1: a whole value already shaped like a declared hash or a raw git
 * commit SHA (40 hex chars) -- lowercase hex only, matching how every hash
 * in this codebase is actually produced (`createHash(...).digest("hex")`
 * and `sha256:`-prefixing convention). Whole-value match only. */
const DECLARED_HASH_PATTERN = /^(sha256:)?[0-9a-f]{40,64}$/;

export function isDeclaredHashValue(value: string): boolean {
  return DECLARED_HASH_PATTERN.test(value);
}

/** Rule 2a: mirrors `event-writer.ts`'s `isPathFieldKey` convention
 * (`path`/`_path`/`Path` key suffix). Duplicated, not imported -- see the
 * module doc comment on why this core module must not depend on the
 * effects layer. Kept in sync by hand; the convention itself is a stable,
 * one-line rule unlikely to drift. */
export function isPathConventionKey(key: string | undefined): boolean {
  if (key === undefined) return false;
  return key === "path" || key.endsWith("_path") || key.endsWith("Path");
}

/** Rule 2b: a lightweight heuristic (redaction-exemption only, NOT the
 * security validator -- see the module doc comment) for "this whole value
 * looks like a repo-relative file path": contains a `/`, no leading `/`, no
 * `..` path-traversal segment, and ends in a file extension. */
export function looksLikeSafeRepoRelativePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith("/")) return false;
  if (!value.includes("/")) return false;
  if (value.split("/").includes("..")) return false;
  return /\.[^./]+$/.test(value);
}

/** Structural classification: does this leaf (key + value) qualify for
 * either typed exemption? Computed once, up front -- see the module doc
 * comment's "order of operations" note (classify first, then redact the
 * rest; never a post-hoc unhash). */
export function isEntropyExemptLeaf(key: string | undefined, value: string): boolean {
  return isDeclaredHashValue(value) || isPathConventionKey(key) || looksLikeSafeRepoRelativePath(value);
}

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
 *
 * `entropyExempt` (rule 3/4): when true, the entropy pattern is skipped
 * entirely for this value -- the denylist-secret-value check still always
 * runs regardless. Defaults to `false` (today's unchanged behavior) for
 * every direct caller that does not pass it.
 */
export function redactSecretValue(
  text: string,
  knownSecretValues: readonly string[],
  opts: { readonly entropyExempt?: boolean } = {},
): string {
  const spans = mergeSpans([
    ...findKnownSecretSpans(text, knownSecretValues),
    ...(opts.entropyExempt ? [] : findHighEntropySpans(text)),
  ]);
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

/** Pure: walk a JSON payload and redact every string leaf, classifying each
 * leaf's entropy-exemption status from its own key + value before redacting
 * (order of operations: classify first, then redact the rest). */
export function redactPayloadStrings(value: JsonValue, knownSecretValues: readonly string[]): JsonValue {
  return mapStringLeaves(value, (path, leaf) => {
    const key = path[path.length - 1];
    const exempt = isEntropyExemptLeaf(key, leaf);
    return redactSecretValue(leaf, knownSecretValues, { entropyExempt: exempt });
  });
}

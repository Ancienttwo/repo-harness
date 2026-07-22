/**
 * Vendored ULID (Universally Unique Lexicographically Sortable Identifier)
 * implementation. No npm package: D5 requires a lexicographically sortable,
 * time-embedding `event_id` (`evt-<ULID>`), and a dependency for ~40 lines
 * of Crockford base32 encoding fails the smallest-change rule (see plan P3
 * and `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`).
 *
 * `encodeUlid` is a pure function of its two explicit inputs so replay/tests
 * never depend on wall-clock time or the system RNG. `generateUlid` /
 * `generateEventId` are the impure convenience wrappers that real producers
 * call; they use `crypto.randomBytes` (not `fs`, not `process`).
 */
import { randomBytes as nodeRandomBytes } from "crypto";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_BYTES = 10; // 80 bits == 16 base32 chars with zero padding waste
const MAX_TIME_MS = 2 ** 48 - 1;

function encodeTimestamp(timeMs: number): string {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > MAX_TIME_MS) {
    throw new Error(`ulid: timestamp must be an integer in [0, 2^48-1], got ${timeMs}`);
  }
  let remaining = timeMs;
  const chars = new Array<string>(TIME_CHARS);
  for (let i = TIME_CHARS - 1; i >= 0; i--) {
    chars[i] = CROCKFORD_ALPHABET[remaining % 32]!;
    remaining = Math.floor(remaining / 32);
  }
  return chars.join("");
}

function encodeRandomness(bytes: Uint8Array): string {
  if (bytes.length !== RANDOM_BYTES) {
    throw new Error(`ulid: randomness must be exactly ${RANDOM_BYTES} bytes, got ${bytes.length}`);
  }
  // Sliding 5-bit window over the byte stream. `bitBuffer` is masked back
  // down to its unconsumed remainder (<8 bits) after every drain, so it
  // never grows past ~12 bits and stays inside 32-bit bitwise-op range even
  // though the full randomness is 80 bits.
  let out = "";
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      out += CROCKFORD_ALPHABET[(bitBuffer >>> bitCount) & 0x1f];
    }
    bitBuffer &= (1 << bitCount) - 1;
  }
  return out;
}

/** Pure: encode an exact (timeMs, randomness) pair into a 26-char ULID string. */
export function encodeUlid(timeMs: number, randomness: Uint8Array): string {
  return `${encodeTimestamp(timeMs)}${encodeRandomness(randomness)}`;
}

/** Impure convenience wrapper: real wall-clock time + CSPRNG randomness. */
export function generateUlid(): string {
  return encodeUlid(Date.now(), nodeRandomBytes(RANDOM_BYTES));
}

/** D5: `event_id` = `evt-<ULID>`. */
export function generateEventId(): string {
  return `evt-${generateUlid()}`;
}

// probe #2591 comment line to widen affected selection
/**
 * The one sha256 digest of plain content. A caller that serializes JSON first
 * keeps its own serializer and passes the resulting bytes.
 */
import { createHash } from "crypto";

/** Bare lowercase hex of the exact bytes. */
export function sha256Hex(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The `sha256:`-prefixed form of the same digest, for stored revision fields. */
export function sha256Prefixed(content: string | Uint8Array): string {
  return `sha256:${sha256Hex(content)}`;
}

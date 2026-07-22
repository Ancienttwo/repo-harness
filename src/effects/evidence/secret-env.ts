/**
 * The only file in this package that reads `process.env` for redaction
 * purposes. Collects present values for the fixed denylist (D6) and hands
 * them to the pure `redactSecretValue` function -- the core module never
 * touches `process.env` itself.
 */
import { SECRET_DENYLIST_ENV_KEYS } from "../../core/evidence/redaction";

export function collectDenylistSecretValues(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const values: string[] = [];
  for (const key of SECRET_DENYLIST_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) values.push(value);
  }
  return values;
}

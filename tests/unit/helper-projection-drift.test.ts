/**
 * Helper projection drift guard.
 *
 * `assets/templates/helpers/` is the shipped projection of the repo's own
 * `scripts/` helpers: a downstream repo receives the assets copy, while this
 * repo runs the scripts copy. Editing one and not the other leaves downstream
 * installs on stale behavior with nothing failing locally -- which is exactly
 * how the verification budget constant reached `1200000` in `scripts/` while
 * `assets/templates/helpers/` still read `600000`.
 *
 * This enumerates every filename present in both directories and asserts
 * byte-equality, so the guard automatically covers helper pairs added later
 * rather than a hand-maintained list.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const HELPERS_DIR = join(ROOT, 'assets', 'templates', 'helpers');

/**
 * Pairs that are deliberately NOT byte copies. Each entry needs a reason: an
 * unexplained exclusion is indistinguishable from the drift this test exists
 * to catch.
 */
const NOT_BYTE_COPIES: ReadonlyMap<string, string> = new Map([
  [
    'capability-resolver.ts',
    // The assets copy is a generated standalone Bun projection of
    // src/core/capabilities/registry.ts (it carries its own
    // `@generated-from ... sha256:` provenance header and inlines the registry
    // that the scripts copy imports), so the two files are intentionally
    // different sizes and shapes rather than a copy that drifted.
    'generated standalone projection of src/core/capabilities/registry.ts, not a byte copy',
  ],
]);

function regularFileNames(dir: string): string[] {
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
}

function pairedFileNames(): string[] {
  const scripts = new Set(regularFileNames(SCRIPTS_DIR));
  return regularFileNames(HELPERS_DIR)
    .filter((name) => scripts.has(name))
    .sort();
}

describe('helper projection drift', () => {
  test('scripts/ and assets/templates/helpers/ share helper files', () => {
    // Guards the enumeration itself: a rename that emptied the intersection
    // would otherwise turn every assertion below into a silent no-op.
    expect(pairedFileNames().length).toBeGreaterThan(10);
  });

  test('every paired helper is byte-identical in both directories', () => {
    const drifted: string[] = [];
    for (const name of pairedFileNames()) {
      if (NOT_BYTE_COPIES.has(name)) continue;
      const script = readFileSync(join(SCRIPTS_DIR, name));
      const helper = readFileSync(join(HELPERS_DIR, name));
      if (!script.equals(helper)) drifted.push(name);
    }
    expect(
      drifted,
      `helper projection drift: ${drifted.join(', ')} differ between scripts/ and assets/templates/helpers/. ` +
        'Sync both copies, or add the file to NOT_BYTE_COPIES with the reason it is not a byte copy.',
    ).toEqual([]);
  });

  test('every documented exclusion is still a real, still-divergent pair', () => {
    // Keeps the exclusion list honest: once a pair converges (or disappears),
    // the exclusion must go, otherwise it silently un-guards a real copy.
    const paired = new Set(pairedFileNames());
    for (const [name, reason] of NOT_BYTE_COPIES) {
      expect(paired.has(name), `excluded pair ${name} no longer exists in both directories`).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
      const script = readFileSync(join(SCRIPTS_DIR, name));
      const helper = readFileSync(join(HELPERS_DIR, name));
      expect(script.equals(helper), `${name} is now byte-identical; drop it from NOT_BYTE_COPIES`).toBe(false);
    }
  });

  test('the verification budget constant matches across both helper copies', () => {
    const constant = 'VERIFICATION_BUDGET_MS=3600000';
    expect(readFileSync(join(SCRIPTS_DIR, 'verify-contract.sh'), 'utf-8')).toContain(constant);
    expect(readFileSync(join(HELPERS_DIR, 'verify-contract.sh'), 'utf-8')).toContain(constant);
  });
});

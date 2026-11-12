import { expect, test } from 'bun:test';
import { containsSecret, replaceSecrets } from '../../src/core/security/secret-patterns';

// Temporary probe for #2598. Not for merge.
test('probe 2598', () => {
  const KiB = 1024;
  const sizes = [64, 128, 256, 384, 512, 640, 768, 896, 1024, 1536, 2048, 3072, 4096].map(k => k * KiB);
  const rows: [string, string][] = [
    ['PGP PRIVATE KEY BLOCK', '-----BEGIN PGP PRIVATE KEY BLOCK-----\n'],
    ['EC PRIVATE KEY', '-----BEGIN EC PRIVATE KEY-----\n'],
    ['DSA PRIVATE KEY', '-----BEGIN DSA PRIVATE KEY-----\n'],
    ['ENCRYPTED PRIVATE KEY', '-----BEGIN ENCRYPTED PRIVATE KEY-----\n'],
    ['RSA-PSS PRIVATE KEY', '-----BEGIN RSA-PSS PRIVATE KEY-----\n'],
    ['PGP SECRET KEY BLOCK', '-----BEGIN PGP SECRET KEY BLOCK-----\n'],
    ['SSH2 ENCRYPTED PRIVATE KEY', '---- BEGIN SSH2 ENCRYPTED PRIVATE KEY ----\n'],
    ['A B PRIVATE KEY (extra)', '-----BEGIN A B PRIVATE KEY-----\n'],
    ['A B C D E F G H PRIVATE KEY (extra)', '-----BEGIN A B C D E F G H PRIVATE KEY-----\n'],
  ];
  const best = (f: () => void) => { let b = Infinity; for (let i = 0; i < 3; i++) { const s = performance.now(); f(); b = Math.min(b, performance.now() - s); } return b; };
  console.log(`P2598 env bun=${Bun.version} platform=${process.platform} arch=${process.arch}`);
  for (const [label, unit] of rows) {
    for (const size of sizes) {
      const run = unit.repeat(Math.ceil(size / unit.length));
      const c = best(() => containsSecret(run));
      const r = best(() => replaceSecrets(run));
      console.log(`P2598 ${JSON.stringify({ label, kib: size / KiB, contains_ms: +c.toFixed(1), redact_ms: +r.toFixed(1) })}`);
    }
  }
  expect(true).toBe(true);
}, 600000);

import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { recordFixtureAcceptance } from './helpers/repo-fixture';
import { seedAcceptanceFixture } from './helpers/verification-plan-fixture';
import { verifyAcceptance } from '../scripts/acceptance-receipt';

const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const value = seedAcceptanceFixture('acceptance-fingerprint');
  paths.push(value.root, value.home);
  return value;
}

function deepSortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepSortKeys) as unknown as T;
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, deepSortKeys(record[key])])) as T;
}

describe('AcceptanceReceipt native verification fingerprint', () => {
  test('survives a semantics-preserving key-order change in the native report', async () => {
    const f = fixture();
    const path = join(f.root, f.verification);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const receipt = await recordFixtureAcceptance({ root: f.root, authorityHome: f.home, contract: f.contract,
      verification: f.verification, disposition: 'external_pass', reviewer: 'Claude', source: 'generic-review',
      actor: null, summary: 'fixture acceptance', findings: [] });
    const sorted = deepSortKeys(report);
    expect(sorted).toEqual(report);
    expect(JSON.stringify(sorted)).not.toBe(JSON.stringify(report));
    writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
    const verified = await verifyAcceptance({ root: f.root, authorityHome: f.home });
    expect(verified.verification_evidence_sha256).toBe(receipt.verification_evidence_sha256);
    expect(verified.disposition).toBe('external_pass');
  }, 30000);

  test('refuses a report whose actual execution command has changed', async () => {
    const f = fixture();
    const path = join(f.root, f.verification);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    await recordFixtureAcceptance({ root: f.root, authorityHome: f.home, contract: f.contract,
      verification: f.verification, disposition: 'external_pass', reviewer: 'Claude', source: 'generic-review',
      actor: null, summary: 'fixture acceptance', findings: [] });
    report.results[0].command = 'forged different command';
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
    await expect(verifyAcceptance({ root: f.root, authorityHome: f.home })).rejects.toThrow('immutable evidence');
  }, 30000);
});

import { createHash } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const FIXTURES = join(import.meta.dir, '../fixtures');
export const UPGRADE_BLOBS = join(FIXTURES, 'upgrade-release-blobs');
export type UpgradeFixture = 'upgrade-v0.10-project' | 'upgrade-v0.10-home' | 'upgrade-v0.19.5-home';
interface Provenance {
  fixture_path: string;
  tag: string;
  commit: string;
  path: string;
  blob_sha: string;
  mode: number;
}

export function upgradeFixtureProvenance(name: UpgradeFixture): Provenance[] {
  const entries: Provenance[] = JSON.parse(readFileSync(join(FIXTURES, name, 'provenance.json'), 'utf8'));
  for (const entry of entries) {
    if (!entry.fixture_path || entry.fixture_path.includes('\\')
      || entry.fixture_path.split('/').some((part) => ['', '.', '..'].includes(part))
      || !/^[a-f0-9]{40}$/.test(entry.blob_sha) || ![0o644, 0o755].includes(entry.mode)) {
      throw new Error(`Invalid upgrade fixture entry in ${name}`);
    }
  }
  return entries;
}

function readBlob(entry: Provenance) {
  const bytes = readFileSync(join(UPGRADE_BLOBS, entry.blob_sha));
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== entry.blob_sha) throw new Error(`Upgrade fixture blob mismatch: ${entry.blob_sha}`);
  return bytes;
}

export function readUpgradeFixture(name: UpgradeFixture, path: string) {
  const entry = upgradeFixtureProvenance(name).find((item) => item.fixture_path === path);
  if (!entry) throw new Error(`Upgrade fixture file is missing: ${name}/${path}`);
  return readBlob(entry);
}

/** Rebuild a file or tree from the release manifest. Keep its bytes and modes. */
export function copyUpgradeFixture(name: UpgradeFixture, path: string, target: string): void {
  const entries = upgradeFixtureProvenance(name).filter((entry) => !path
    || entry.fixture_path === path || entry.fixture_path.startsWith(`${path}/`));
  if (entries.length === 0) throw new Error(`Upgrade fixture path is missing: ${name}/${path}`);
  for (const entry of entries) {
    const relative = path ? entry.fixture_path.slice(path.length).replace(/^\//, '') : entry.fixture_path;
    const destination = relative ? join(target, relative) : target;
    const bytes = readBlob(entry);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    chmodSync(destination, entry.mode);
  }
}

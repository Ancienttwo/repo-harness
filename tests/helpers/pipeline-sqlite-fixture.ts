import { Database } from 'bun:sqlite';
import { existsSync, realpathSync } from 'node:fs';
import { assertSQLiteVersion, selectSQLite } from '../../src/effects/pipeline/store';

// Bun uses the system SQLite on macOS and bundled SQLite on Linux.
// Select the test library before the first database opens. Child processes
// inherit this choice. The product version check remains the prerequisite.
export function preparePipelineSQLite(): void {
  if (process.platform === 'darwin' && !process.env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY) {
    const installed = ['/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib', '/usr/local/opt/sqlite/lib/libsqlite3.dylib'].find(existsSync);
    if (!installed) throw new Error('pipeline_tests_require_fixed_sqlite: set REPO_HARNESS_PIPELINES_SQLITE_LIBRARY to an installed fixed SQLite library');
    process.env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY = realpathSync(installed);
  }
  selectSQLite();
  const probe = new Database(':memory:');
  try {
    const { version } = probe.query('SELECT sqlite_version() AS version').get() as { version: string };
    console.error(JSON.stringify({ fixture: 'pipeline-sqlite', bun: Bun.version, revision: Bun.revision,
      platform: process.platform, arch: process.arch, sqlite: version,
      library: process.env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY ?? (process.platform === 'linux' ? 'bun-bundled' : 'system') }));
    assertSQLiteVersion(version);
  } finally { probe.close(); }
}

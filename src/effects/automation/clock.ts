/**
 * The automation budget store's time source.
 *
 * The store's caller -- any controller, the CLI, a campaign -- is untrusted for
 * every decision input, and time is a decision input: a backdated timestamp
 * buys a reservation the frozen deadline has already refused. So no public verb
 * accepts a time, and this module is the only place the store asks what time it
 * is.
 *
 * Tests need determinism, but a knob a production caller can reach is not a
 * seam, it is an input. This seam is therefore doubly closed: the setter is
 * exported only through `budget-store.internal.ts`, which nothing on the public
 * surface re-exports, and it refuses to install anything unless the calling
 * process has explicitly opted in with `REPO_HARNESS_TEST_CLOCK_SEAM=1`.
 */
import { statSync } from 'fs';

export type AutomationClock = () => Date;

export const AUTOMATION_TEST_CLOCK_SEAM_ENV = 'REPO_HARNESS_TEST_CLOCK_SEAM' as const;

const HOST_CLOCK: AutomationClock = () => new Date();

let injected: AutomationClock | null = null;

export class AutomationClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationClockError';
  }
}

/** True only while a test clock is installed; production always reads the host clock. */
export function automationClockIsInjected(): boolean {
  return injected !== null;
}

export function automationStoreNow(): string {
  const value = (injected ?? HOST_CLOCK)();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AutomationClockError('the automation budget clock returned an invalid time');
  }
  return value.toISOString();
}

function assertSeamOpen(): void {
  if (process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] !== '1') {
    throw new AutomationClockError(
      `the automation budget clock seam is closed; set ${AUTOMATION_TEST_CLOCK_SEAM_ENV}=1 to install a test clock`,
    );
  }
}

export function __setAutomationClockForTests(clock: AutomationClock): void {
  assertSeamOpen();
  injected = clock;
}

export function __resetAutomationClockForTests(): void {
  assertSeamOpen();
  injected = null;
}

/**
 * The filesystem is host-trusted, so an inode timestamp is a lower bound on
 * real time that a slow or frozen host clock cannot sit below.
 *
 * The floor is only meaningful while the host clock is the time source: an
 * installed test clock substitutes the host's notion of now wholesale, and
 * comparing it against real inode timestamps would compare two different
 * clocks. The comparison itself is a pure function so it stays under test.
 */
export function newestModifiedMs(paths: readonly string[]): number | null {
  let newest: number | null = null;
  for (const path of paths) {
    try {
      const stat = statSync(path);
      if (newest === null || stat.mtimeMs > newest) newest = stat.mtimeMs;
    } catch {
      // A record that is not there cannot bound the clock.
    }
  }
  return newest;
}

export function clockIsBelowFilesystemFloor(now: string, floorMs: number | null): boolean {
  if (floorMs === null) return false;
  // Filesystems record mtime at second or millisecond granularity depending on
  // the host, so a whole second of slack keeps a truthful clock from tripping.
  return Date.parse(now) < Math.floor(floorMs) - 1_000;
}

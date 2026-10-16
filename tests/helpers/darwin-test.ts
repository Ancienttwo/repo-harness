import { test, type TestOptions } from 'bun:test';

const darwinOnly = test.skipIf(process.platform !== 'darwin');

/** A macOS-only case. The PR native job selects these cases by the `darwin: ` name prefix. */
export function darwinTest(label: string, fn: () => void | Promise<unknown>, options?: number | TestOptions): void {
  darwinOnly(`darwin: ${label}`, fn, options);
}

// Child process entry of the setup collector (collector.ts). It runs the setup
// check builder once and writes the projected public snapshot as one JSON line.
// The parent decodes that line strictly; stderr is discarded.

import { collectSetupSnapshotNow } from './snapshot';

// Exit once the line is flushed so a probe handle left open cannot hold the child past its output.
process.stdout.write(`${JSON.stringify(collectSetupSnapshotNow())}\n`, () => process.exit(0));

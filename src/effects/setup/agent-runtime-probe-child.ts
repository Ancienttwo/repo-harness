// Child process entry of the agent runtime probe (collector.ts). It probes once
// and writes the public probe snapshot as one JSON line. The parent decodes
// that line strictly; stderr is discarded.

import { probeAgentRuntimes } from './agent-runtime-probe';

const probe = await probeAgentRuntimes();
// Exit once the line is flushed so a probe handle left open cannot hold the child past its output.
process.stdout.write(`${JSON.stringify(probe)}\n`, () => process.exit(0));

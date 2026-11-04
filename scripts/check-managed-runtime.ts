#!/usr/bin/env bun
import { verifyInstalledManagedRuntime } from '../src/cli/commands/global-runtime';
import { readRecordedSelection, recordedPlugins, registerSelectedArchitecturePorts } from '../src/cli/installer/architecture-selection';

// The archctx readback and daemon check run only for a selected architecture plugin.
const selection = readRecordedSelection();
await registerSelectedArchitecturePorts(selection, async () => {
  const [{ ARCHITECTURE_PROVIDERS }, { ARCHITECTURE_SETUP_PROVIDER }] = await Promise.all([
    import('../src/effects/architecture/providers'),
    import('../src/cli/commands/architecture-setup'),
  ]);
  return { ...ARCHITECTURE_PROVIDERS, setup: ARCHITECTURE_SETUP_PROVIDER };
});
const result = verifyInstalledManagedRuntime({ plugins: recordedPlugins(selection) });
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status === 'failed') {
  if (result.detail) process.stderr.write(`${result.detail}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = 1;
}

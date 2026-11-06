import { architecturePort, isArchitectureUnavailable } from '../../core/architecture/contracts';
import { createCodeGraphCliAdapter, createCodeGraphNotSelectedAdapter, type GeneralRepoCodeGraphAdapter } from '../tools/codegraph-reader';
import { runMcpDoctor } from './doctor';
import { startMcpStdio } from './transports/stdio';

export interface McpServeOptions {
  repo?: string;
  profile: string;
  enableReader?: boolean;
  allowRoot?: string[];
}

/** The reader tools run CodeGraph only for a selected plugin; otherwise each read reports the absence. */
function selectedCodeGraphAdapter(): GeneralRepoCodeGraphAdapter {
  const port = architecturePort('codegraph');
  return isArchitectureUnavailable(port) ? createCodeGraphNotSelectedAdapter(port.message) : createCodeGraphCliAdapter();
}

export async function runMcpServeCommand(options: McpServeOptions): Promise<void> {
  await startMcpStdio({
    repo: options.repo,
    profile: options.profile,
    enableReader: options.enableReader === true,
    allowedRoots: options.allowRoot,
    codeGraphAdapter: selectedCodeGraphAdapter(),
  });
}

export function runMcpDoctorCommand(options: { repo?: string; json?: boolean }): void {
  console.log(runMcpDoctor(options).lines.join('\n'));
}

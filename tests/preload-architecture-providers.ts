/**
 * A test process is a process entry: it registers the providers that the hook
 * root registers. Tests of the CLI root's CodeGraph doctor port import that root.
 */
import { registerArchitecturePorts } from "../src/core/architecture/contracts";
import { ARCHITECTURE_PROVIDERS } from "../src/effects/architecture/providers";
import { AGENT_NOTICE_PROVIDER } from "../src/cli/hook/agent-notice";

registerArchitecturePorts({ ...ARCHITECTURE_PROVIDERS, notice: AGENT_NOTICE_PROVIDER });

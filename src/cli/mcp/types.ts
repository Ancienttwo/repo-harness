export type McpProfileName = 'planner' | 'executor' | 'orchestrator' | 'coding';
export type McpPathIntent = 'read' | 'write';
export type McpAgentRunnerName = 'codex' | 'claude';

export interface McpPolicy {
  profile: McpProfileName;
  allowedRoots?: string[];
  discoveryRoots?: string[];
  capabilities: {
    workspaceReader: boolean;
    workflowPlanner: boolean;
    workflowExecutor: boolean;
    agentRunner: boolean;
    workspaceCoder: boolean;
  };
  readGlobs: string[];
  writeGlobs: string[];
  denyGlobs: string[];
  allowAbsoluteRead?: boolean;
  maxFileBytes: number;
  execution: {
    fixedWorkflowCheck: boolean;
    codexRunner: boolean;
    agentRunner: boolean;
    codingShell: boolean;
    allowedAgents: McpAgentRunnerName[];
    runnerTimeoutMs: number;
  };
}

export interface McpPathDecision {
  ok: boolean;
  relativePath?: string;
  absolutePath?: string;
  reason?: string;
}

export interface McpAuditEntry {
  timestamp: string;
  tool: string;
  status: 'ok' | 'blocked' | 'failed';
  actor?: string;
  repoId?: string;
  operation?: string;
  relativePaths?: string[];
  mutationId?: string;
  indexInvalidationId?: string;
  indexEventId?: string;
  indexState?: string;
  fileHashes?: {
    before_sha256?: string | null;
    after_sha256?: string | null;
  };
  result?: 'ok' | 'blocked' | 'failed';
  durationMs?: number;
  correlationId?: string;
  errorCode?: string;
  targetPath?: string;
  inputHash?: string;
  error?: string;
  sessionId?: number;
  commandHash?: string;
  relativeCwd?: string;
  exitCode?: number;
  signal?: string;
  totalOutputBytes?: number;
  droppedOutputBytes?: number;
}

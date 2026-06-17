export type McpProfileName = 'planner' | 'executor' | 'orchestrator';
export type McpPathIntent = 'read' | 'write';

export interface McpPolicy {
  profile: McpProfileName;
  readGlobs: string[];
  writeGlobs: string[];
  denyGlobs: string[];
  maxFileBytes: number;
  execution: {
    fixedWorkflowCheck: boolean;
    codexRunner: boolean;
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
  targetPath?: string;
  inputHash?: string;
  error?: string;
}

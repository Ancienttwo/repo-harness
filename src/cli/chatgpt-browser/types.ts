export type BrowserSessionStatus = 'completed' | 'running' | 'incomplete_capture' | 'recoverable' | 'failed' | 'cancelled' | 'dry_run';

export type BrowserProviderName = 'oracle' | 'native' | 'bridge';

export type NativeBrowserChannel = 'chrome' | 'chrome-beta' | 'chrome-dev' | 'chrome-canary';

export type ThinkingLevel = 'light' | 'standard' | 'extended' | 'heavy';

export type BrowserWriteOutputPolicy = 'cli' | 'mcp';

export interface BrowserFileInput {
  path: string;
  delivery?: 'inline';
}

export interface BrowserConsultInput {
  repoRoot: string;
  title?: string;
  prompt: string;
  sourceSessionId?: string;
  providerSessionId?: string;
  parentProviderSessionId?: string;
  oracleBin?: string;
  files?: BrowserFileInput[];
  followups?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  provider?: BrowserProviderName;
  chatgptUrl?: string;
  timeoutMs?: number;
  heartbeatSeconds?: number;
  dryRun?: boolean;
  writeOutput?: string;
  writeOutputPolicy?: BrowserWriteOutputPolicy;
  allowAbsoluteOutput?: boolean;
  overwriteOutput?: boolean;
  sessionRoot?: string;
  maxInlineChars?: number;
  manualLogin?: boolean;
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  keepBrowser?: boolean;
  headless?: boolean;
}

export interface BrowserImportedArtifact {
  sourcePath: string;
  fileName: string;
  size: number;
}

export interface PromptBundleFile {
  path: string;
  delivery: 'inline';
  size: number;
  sha256: string;
  chars: number;
  content: string;
}

export interface PromptBundle {
  prompt: string;
  rendered: string;
  files: PromptBundleFile[];
  followups: string[];
  totalChars: number;
}

export interface BrowserSessionPaths {
  sessionDir: string;
  prompt: string;
  transcript: string;
  output: string;
  events: string;
  artifactsDir: string;
}

export interface BrowserSessionMeta {
  version: 1;
  sessionId: string;
  engine: 'chatgpt-browser';
  provider: BrowserProviderName;
  status: BrowserSessionStatus;
  repo: string;
  createdAt: string;
  updatedAt: string;
  model: {
    requested?: string;
    thinking?: ThinkingLevel;
    verified: boolean;
  };
  browser: {
    mode: 'manual-login';
    chatgptUrl: string;
    channel?: NativeBrowserChannel;
    profileDir?: string;
    profileDirectory?: string;
    selectedProfilePath?: string;
    conversationUrl?: string;
  };
  input: {
    promptPath: string;
    files: Array<{ path: string; delivery: 'inline'; sha256: string; size: number }>;
    followups: number;
  };
  output: {
    outputPath: string;
    transcriptPath: string;
    artifactsDir: string;
    writeOutput?: string;
    artifacts: Array<{ fileName: string; size: number; sourcePath?: string }>;
  };
  diagnostics: {
    dryRun: boolean;
    reattachable: boolean;
    lastCaptureAt: string;
  };
  sourceSessionId?: string;
  providerSessionId?: string;
  parentProviderSessionId?: string;
  oracle?: {
    binary?: string;
    version?: string;
    captureStatus?: 'completed' | 'recoverable';
  };
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}

export interface StoredBrowserSessionSummary {
  sessionId: string;
  status: BrowserSessionStatus;
  provider: BrowserProviderName;
  createdAt: string;
  updatedAt: string;
  title?: string;
  outputPath: string;
  transcriptPath: string;
  conversationUrl?: string;
}

export interface StoredBrowserSession {
  meta: BrowserSessionMeta;
  prompt: string;
  transcript: string;
  output: string;
}

export interface BrowserConsultResult {
  sessionId: string;
  status: BrowserSessionStatus;
  output?: string;
  conversationUrl?: string;
  paths: BrowserSessionPaths;
  meta: BrowserSessionMeta;
  dryRun?: {
    promptChars: number;
    totalChars: number;
    files: Array<{ path: string; size: number; chars: number; sha256: string }>;
    command?: string[];
  };
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
  artifacts?: BrowserImportedArtifact[];
}

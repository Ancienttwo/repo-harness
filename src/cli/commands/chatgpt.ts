import { Command } from 'commander';
import {
  browserDoctor,
  cleanupSessions,
  listSessions,
  openSession,
  readSession,
  resolveRepoRoot,
  runBrowserConsult,
  runBrowserFollowup,
  runBrowserSetup,
} from '../chatgpt-browser/engine';
import type { BrowserProviderName, BrowserSessionStatus, NativeBrowserChannel, ThinkingLevel } from '../chatgpt-browser/types';

interface BrowserCommonOptions {
  repo?: string;
}

interface BrowserConsultOptions extends BrowserCommonOptions {
  title?: string;
  prompt: string;
  file?: string[];
  followUp?: string[];
  model?: string;
  thinking?: string;
  provider?: string;
  chatgptUrl?: string;
  timeoutMs?: string;
  dryRun?: boolean;
  writeOutput?: string;
  maxInlineChars?: string;
  manualLogin?: boolean;
  profileDir?: string;
  browserChannel?: string;
  keepBrowser?: boolean;
  headless?: boolean;
}

interface BrowserFollowupOptions extends BrowserCommonOptions {
  session: string;
  title?: string;
  prompt: string;
  followUp?: string[];
  model?: string;
  thinking?: string;
  provider?: string;
  timeoutMs?: string;
  dryRun?: boolean;
  writeOutput?: string;
  profileDir?: string;
  browserChannel?: string;
  keepBrowser?: boolean;
  headless?: boolean;
}

function parseProvider(value?: string): BrowserProviderName {
  if (value === undefined || value === 'oracle') return 'oracle';
  if (value === 'native') return 'native';
  throw new Error(`invalid --provider "${value}" (expected: oracle, native)`);
}

function parseThinking(value?: string): ThinkingLevel | undefined {
  if (value === undefined) return undefined;
  if (value === 'light' || value === 'standard' || value === 'extended' || value === 'heavy') return value;
  throw new Error(`invalid --thinking "${value}" (expected: light, standard, extended, heavy)`);
}

function parseBrowserChannel(value?: string): NativeBrowserChannel | undefined {
  if (value === undefined) return undefined;
  if (value === 'chrome' || value === 'chrome-beta' || value === 'chrome-dev' || value === 'chrome-canary') return value;
  throw new Error(`invalid --browser-channel "${value}" (expected: chrome, chrome-beta, chrome-dev, chrome-canary)`);
}

function parsePositiveInteger(name: string, value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid --${name} "${value}"`);
  return parsed;
}

function parseStatus(value?: string): BrowserSessionStatus | undefined {
  if (value === undefined) return undefined;
  if (value === 'completed' || value === 'running' || value === 'incomplete_capture' || value === 'failed' || value === 'cancelled' || value === 'dry_run') return value;
  throw new Error(`invalid --status "${value}"`);
}

async function runChatgptAction(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`repo-harness chatgpt: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

export function buildChatgptCommand(): Command {
  const chatgpt = new Command('chatgpt').description('Use a local ChatGPT Web browser session for repo-harness planning and review workflows');

  chatgpt
    .command('browser-setup')
    .description('Prepare local ChatGPT browser session directories and show safe ignore rules')
    .option('--repo <path>', 'Repository root to configure', '.')
    .action((rawOpts: BrowserCommonOptions) => {
      void runChatgptAction(() => {
        const result = runBrowserSetup(resolveRepoRoot(rawOpts.repo));
        console.log(result.lines.join('\n'));
      });
    });

  chatgpt
    .command('browser-doctor')
    .description('Check local ChatGPT browser engine readiness')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--provider <provider>', 'Browser provider: oracle|native', 'oracle')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrowserCommonOptions & { provider?: string; json?: boolean }) => {
      void runChatgptAction(async () => {
        const result = await browserDoctor(resolveRepoRoot(rawOpts.repo), parseProvider(rawOpts.provider));
        console.log(rawOpts.json === true ? JSON.stringify(result.json, null, 2) : result.lines.join('\n'));
      });
    });

  chatgpt
    .command('browser-consult')
    .description('Create a repo-local ChatGPT browser consult session; MVP supports dry-run prompt/session generation')
    .option('--repo <path>', 'Repository root for files and session store', '.')
    .option('--title <title>', 'Session title slug')
    .requiredOption('--prompt <text>', 'Prompt to send to ChatGPT Web')
    .option('--file <path>', 'Repo-relative workflow file to include inline', (value, previous: string[] = []) => [...previous, value], [])
    .option('--follow-up <text>', 'Follow-up prompt for the same conversation', (value, previous: string[] = []) => [...previous, value], [])
    .option('--model <label>', 'Requested ChatGPT model label')
    .option('--thinking <level>', 'Thinking level: light|standard|extended|heavy')
    .option('--provider <provider>', 'Browser provider: oracle|native', 'oracle')
    .option('--chatgpt-url <url>', 'ChatGPT URL to open', 'https://chatgpt.com/')
    .option('--timeout-ms <ms>', 'Assistant timeout in milliseconds')
    .option('--max-inline-chars <chars>', 'Maximum inline chars per file', '120000')
    .option('--write-output <path>', 'Repo-relative or absolute path to copy final output')
    .option('--manual-login', 'Document that manual login is expected before non-dry-run browser execution', true)
    .option('--profile-dir <path>', 'Native provider persistent browser profile directory')
    .option('--browser-channel <channel>', 'Native provider Chrome channel: chrome|chrome-beta|chrome-dev|chrome-canary', 'chrome')
    .option('--keep-browser', 'Native provider leaves the browser open after the run')
    .option('--headless', 'Native provider runs the selected Chrome channel headless')
    .option('--dry-run', 'Resolve prompt/files and save a dry-run session without opening a browser')
    .action((rawOpts: BrowserConsultOptions) => {
      void runChatgptAction(async () => {
        const repoRoot = resolveRepoRoot(rawOpts.repo);
        const result = await runBrowserConsult({
          repoRoot,
          title: rawOpts.title,
          prompt: rawOpts.prompt,
          files: (rawOpts.file ?? []).map((path) => ({ path })),
          followups: rawOpts.followUp,
          model: rawOpts.model,
          thinking: parseThinking(rawOpts.thinking),
          provider: parseProvider(rawOpts.provider),
          chatgptUrl: rawOpts.chatgptUrl,
          timeoutMs: parsePositiveInteger('timeout-ms', rawOpts.timeoutMs),
          dryRun: rawOpts.dryRun === true,
          writeOutput: rawOpts.writeOutput,
          maxInlineChars: parsePositiveInteger('max-inline-chars', rawOpts.maxInlineChars),
          manualLogin: rawOpts.manualLogin !== false,
          profileDir: rawOpts.profileDir,
          browserChannel: parseBrowserChannel(rawOpts.browserChannel),
          keepBrowser: rawOpts.keepBrowser === true,
          headless: rawOpts.headless === true,
        });
        console.log(JSON.stringify({
          sessionId: result.sessionId,
          status: result.status,
          paths: result.paths,
          dryRun: result.dryRun,
          error: result.error,
        }, null, 2));
      });
    });

  chatgpt
    .command('browser-session')
    .description('Read a saved ChatGPT browser consult session')
    .argument('<session-id>', 'Session ID to read')
    .option('--repo <path>', 'Repository root', '.')
    .option('--metadata-only', 'Only print session metadata')
    .action((sessionId: string, rawOpts: BrowserCommonOptions & { metadataOnly?: boolean }) => {
      void runChatgptAction(() => {
        const session = readSession(resolveRepoRoot(rawOpts.repo), sessionId);
        console.log(rawOpts.metadataOnly === true ? JSON.stringify(session.meta, null, 2) : session.output.trimEnd());
      });
    });

  chatgpt
    .command('browser-followup')
    .description('Continue from a saved browser session and create a linked follow-up session')
    .requiredOption('--session <session-id>', 'Session ID to continue')
    .option('--repo <path>', 'Repository root for files and session store', '.')
    .option('--title <title>', 'Session title slug')
    .requiredOption('--prompt <text>', 'Follow-up prompt to send to ChatGPT Web')
    .option('--follow-up <text>', 'Additional follow-up prompt', (value, previous: string[] = []) => [...previous, value], [])
    .option('--model <label>', 'Override requested ChatGPT model label')
    .option('--thinking <level>', 'Thinking level: light|standard|extended|heavy')
    .option('--provider <provider>', 'Browser provider: oracle|native')
    .option('--timeout-ms <ms>', 'Assistant timeout in milliseconds')
    .option('--write-output <path>', 'Repo-relative or absolute path to copy final output')
    .option('--profile-dir <path>', 'Native provider persistent browser profile directory')
    .option('--browser-channel <channel>', 'Native provider Chrome channel: chrome|chrome-beta|chrome-dev|chrome-canary')
    .option('--keep-browser', 'Native provider leaves the browser open after the run')
    .option('--headless', 'Native provider runs the selected Chrome channel headless')
    .option('--dry-run', 'Resolve prompt/session and save a dry-run follow-up without opening a browser')
    .action((rawOpts: BrowserFollowupOptions) => {
      void runChatgptAction(async () => {
        const repoRoot = resolveRepoRoot(rawOpts.repo);
        const result = await runBrowserFollowup({
          repoRoot,
          sessionId: rawOpts.session,
          title: rawOpts.title,
          prompt: rawOpts.prompt,
          followups: rawOpts.followUp,
          model: rawOpts.model,
          thinking: parseThinking(rawOpts.thinking),
          provider: rawOpts.provider ? parseProvider(rawOpts.provider) : undefined,
          timeoutMs: parsePositiveInteger('timeout-ms', rawOpts.timeoutMs),
          dryRun: rawOpts.dryRun === true,
          writeOutput: rawOpts.writeOutput,
          profileDir: rawOpts.profileDir,
          browserChannel: parseBrowserChannel(rawOpts.browserChannel),
          keepBrowser: rawOpts.keepBrowser === true,
          headless: rawOpts.headless === true,
        });
        console.log(JSON.stringify({
          sourceSessionId: rawOpts.session,
          sessionId: result.sessionId,
          status: result.status,
          paths: result.paths,
          dryRun: result.dryRun,
          error: result.error,
        }, null, 2));
      });
    });

  chatgpt
    .command('browser-open')
    .description('Print a saved ChatGPT browser session conversation URL; pass --launch to open it in the system browser')
    .argument('<session-id>', 'Session ID to open')
    .option('--repo <path>', 'Repository root', '.')
    .option('--launch', 'Launch the URL with the system browser')
    .action((sessionId: string, rawOpts: BrowserCommonOptions & { launch?: boolean }) => {
      void runChatgptAction(() => {
        const result = openSession(resolveRepoRoot(rawOpts.repo), sessionId, rawOpts.launch === true);
        console.log(JSON.stringify(result, null, 2));
      });
    });

  chatgpt
    .command('browser-list')
    .description('List saved ChatGPT browser consult sessions')
    .option('--repo <path>', 'Repository root', '.')
    .option('--limit <count>', 'Maximum sessions to list', '20')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrowserCommonOptions & { limit?: string; json?: boolean }) => {
      void runChatgptAction(() => {
        const sessions = listSessions(resolveRepoRoot(rawOpts.repo), parsePositiveInteger('limit', rawOpts.limit));
        if (rawOpts.json === true) {
          console.log(JSON.stringify({ sessions }, null, 2));
          return;
        }
        for (const session of sessions) console.log(`${session.sessionId}\t${session.status}\t${session.outputPath}`);
      });
    });

  chatgpt
    .command('browser-cleanup')
    .description('Remove saved ChatGPT browser sessions; defaults to dry-run and requires --force to delete')
    .option('--repo <path>', 'Repository root', '.')
    .option('--older-than-days <days>', 'Only include sessions whose directory mtime is older than this many days')
    .option('--status <status>', 'Only include a session status')
    .option('--limit <count>', 'Maximum sessions to remove')
    .option('--force', 'Actually remove candidate sessions')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrowserCommonOptions & { olderThanDays?: string; status?: string; limit?: string; force?: boolean; json?: boolean }) => {
      void runChatgptAction(() => {
        const result = cleanupSessions(resolveRepoRoot(rawOpts.repo), {
          olderThanDays: parsePositiveInteger('older-than-days', rawOpts.olderThanDays),
          status: parseStatus(rawOpts.status),
          limit: parsePositiveInteger('limit', rawOpts.limit),
          dryRun: rawOpts.force !== true,
        });
        if (rawOpts.json === true) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`[repo-harness chatgpt] dryRun=${result.dryRun}`);
        console.log(`[repo-harness chatgpt] candidates=${result.candidates.length}`);
        for (const sessionId of result.dryRun ? result.candidates : result.removed) console.log(sessionId);
      });
    });

  return chatgpt;
}

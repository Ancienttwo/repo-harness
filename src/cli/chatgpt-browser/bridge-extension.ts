import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const CHATGPT_BRIDGE_DEFAULT_PORT = 17651;
export const CHATGPT_BRIDGE_EXTENSION_RELATIVE_PATH = '.ai/harness/chatgpt/bridge-extension';

export interface ChatgptBridgeExtension {
  extensionDir: string;
  manifestPath: string;
  contentScriptPath: string;
  bridgeUrl: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderContentScript(bridgeUrl: string, token?: string): string {
  return `const REPO_HARNESS_CHATGPT_BRIDGE_URL = ${JSON.stringify(bridgeUrl)};
const REPO_HARNESS_CHATGPT_BRIDGE_TOKEN = ${JSON.stringify(token ?? '')};
function repoHarnessAuthHeaders(base) {
  const headers = Object.assign({}, base);
  if (REPO_HARNESS_CHATGPT_BRIDGE_TOKEN) headers['x-repo-harness-bridge-token'] = REPO_HARNESS_CHATGPT_BRIDGE_TOKEN;
  return headers;
}
const REPO_HARNESS_CHATGPT_COMPOSERS = [
  '[data-testid="composer-text-input"]',
  '#prompt-textarea',
  'textarea[placeholder*="Message"]',
  'div[role="textbox"][contenteditable="true"]',
];
const REPO_HARNESS_CHATGPT_SEND_BUTTONS = [
  '[data-testid="send-button"]',
  'button[aria-label*="Send"]',
  'button[data-testid*="send"]',
];
const REPO_HARNESS_CHATGPT_ASSISTANT = '[data-message-author-role="assistant"]';

function repoHarnessVisible(element) {
  return Boolean(element && element.getClientRects && element.getClientRects().length);
}

function repoHarnessComposer() {
  return REPO_HARNESS_CHATGPT_COMPOSERS
    .map((selector) => document.querySelector(selector))
    .find(repoHarnessVisible);
}

function repoHarnessSendButton() {
  return REPO_HARNESS_CHATGPT_SEND_BUTTONS
    .map((selector) => document.querySelector(selector))
    .find((button) => repoHarnessVisible(button) && !button.disabled);
}

async function repoHarnessPost(path, payload) {
  await fetch(REPO_HARNESS_CHATGPT_BRIDGE_URL + path, {
    method: 'POST',
    headers: repoHarnessAuthHeaders({'content-type': 'application/json'}),
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

async function repoHarnessJson(path) {
  const response = await fetch(REPO_HARNESS_CHATGPT_BRIDGE_URL + path, {
    headers: repoHarnessAuthHeaders({'accept': 'application/json'}),
  });
  if (!response.ok) return {};
  return await response.json();
}

async function repoHarnessSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function repoHarnessHeartbeat() {
  await repoHarnessPost('/api/extension/heartbeat', {
    url: location.href,
    title: document.title,
    composerVisible: Boolean(repoHarnessComposer()),
    ts: new Date().toISOString(),
  });
}

async function repoHarnessWaitForComposer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const composer = repoHarnessComposer();
    if (composer) return composer;
    await repoHarnessSleep(500);
  }
  return null;
}

async function repoHarnessSubmitPrompt(prompt) {
  const composer = await repoHarnessWaitForComposer(30000);
  if (!composer) throw new Error('ChatGPT composer is not visible');
  composer.focus();
  if ('value' in composer) {
    composer.value = '';
    composer.dispatchEvent(new InputEvent('input', {inputType: 'deleteContentBackward', bubbles: true}));
    composer.value = prompt;
    composer.dispatchEvent(new InputEvent('input', {inputType: 'insertText', data: prompt, bubbles: true}));
  } else {
    composer.textContent = '';
    composer.dispatchEvent(new InputEvent('input', {inputType: 'deleteContentBackward', bubbles: true}));
    document.execCommand('insertText', false, prompt);
    if (!composer.textContent || !composer.textContent.includes(prompt.slice(0, Math.min(prompt.length, 80)))) {
      composer.textContent = prompt;
      composer.dispatchEvent(new InputEvent('input', {inputType: 'insertText', data: prompt, bubbles: true}));
    }
  }
  await repoHarnessSleep(300);
  const button = repoHarnessSendButton();
  if (button) {
    button.click();
    return;
  }
  composer.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', bubbles: true}));
  composer.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', bubbles: true}));
}

function repoHarnessAssistantText() {
  const nodes = [...document.querySelectorAll(REPO_HARNESS_CHATGPT_ASSISTANT)];
  return (nodes.at(-1)?.innerText || '').replace(/^ChatGPT said:\\s*/i, '').trim();
}

async function repoHarnessWaitForAssistant(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = '';
  let stableSince = 0;
  while (Date.now() < deadline) {
    const text = repoHarnessAssistantText();
    if (text && text !== 'Retry') {
      if (text !== latest) {
        latest = text;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 5000) {
        return {text, stable: true};
      }
    }
    await repoHarnessSleep(500);
  }
  return {text: latest, stable: false};
}

async function repoHarnessRunTask(task) {
  await repoHarnessPost('/api/extension/task-started', {taskId: task.id, url: location.href});
  try {
    await repoHarnessSubmitPrompt(task.prompt);
    const capture = await repoHarnessWaitForAssistant(task.timeoutMs || 180000);
    await repoHarnessPost('/api/extension/result', {
      taskId: task.id,
      status: capture.text ? (capture.stable ? 'completed' : 'incomplete_capture') : 'failed',
      output: capture.text || 'No assistant text was captured before timeout.',
      conversationUrl: location.href,
      error: capture.text ? undefined : {
        code: 'CHATGPT_BRIDGE_CAPTURE_TIMEOUT',
        message: 'no assistant text could be captured before timeout',
        recovery: 'Inspect the ChatGPT tab, then retry with a longer --timeout-ms.',
      },
    });
  } catch (error) {
    await repoHarnessPost('/api/extension/result', {
      taskId: task.id,
      status: 'failed',
      output: String(error),
      conversationUrl: location.href,
      error: {
        code: 'CHATGPT_BRIDGE_TASK_FAILED',
        message: String(error),
        recovery: 'Open ChatGPT in the authorized profile, verify the composer is visible, then retry.',
      },
    });
  }
}

async function repoHarnessPoll() {
  await repoHarnessHeartbeat();
  const task = await repoHarnessJson('/api/extension/task');
  if (task && task.kind === 'consult' && task.id && task.prompt) {
    await repoHarnessRunTask(task);
  }
}

setInterval(() => {
  repoHarnessPoll().catch(() => undefined);
}, 1000);
repoHarnessPoll().catch(() => undefined);
`;
}

export function writeChatgptBridgeExtension(repoRoot: string, bridgeUrl: string, token?: string): ChatgptBridgeExtension {
  const extensionDir = join(repoRoot, CHATGPT_BRIDGE_EXTENSION_RELATIVE_PATH);
  const manifestPath = join(extensionDir, 'manifest.json');
  const contentScriptPath = join(extensionDir, 'content-script.js');
  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(extensionDir, { recursive: true });
  writeFileSync(manifestPath, json({
    manifest_version: 3,
    name: 'repo-harness ChatGPT Bridge',
    version: '0.1.0',
    description: 'Lets repo-harness use only the active ChatGPT Web page in this Chrome profile.',
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      `${bridgeUrl}/*`,
    ],
    content_scripts: [
      {
        matches: [
          'https://chatgpt.com/*',
          'https://chat.openai.com/*',
        ],
        js: ['content-script.js'],
        run_at: 'document_idle',
      },
    ],
  }), 'utf-8');
  writeFileSync(contentScriptPath, renderContentScript(bridgeUrl, token), 'utf-8');
  return { extensionDir, manifestPath, contentScriptPath, bridgeUrl };
}

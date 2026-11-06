export interface AppHookConfig {
  url: string;
  content_type: 'json';
  secret: string;
  insecure_ssl: '0';
}

export interface AppHookConfigDeps {
  fetch: typeof fetch;
  appToken: () => string;
}

/** Publish one App hook config. The caller owns deployment approval and partial-failure recovery. */
export async function publishAppHookConfig(config: AppHookConfig, deps: AppHookConfigDeps): Promise<void> {
  let url: URL;
  try { url = new URL(config.url); } catch { throw new Error('The GitHub App hook URL must be an HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The GitHub App hook URL must be an HTTPS URL without user information.');
  }
  if (config.content_type !== 'json') throw new Error('The GitHub App hook content type must be json.');
  if (!config.secret || /[\x00-\x1f\x7f]/.test(config.secret)) throw new Error('The GitHub App hook secret is missing or invalid.');
  if (config.insecure_ssl !== '0') throw new Error('The GitHub App hook must verify SSL.');

  const endpoint = 'GitHub API PATCH /app/hook/config';
  let response: Response;
  try {
    response = await deps.fetch('https://api.github.com/app/hook/config', {
      method: 'PATCH', redirect: 'error',
      body: JSON.stringify({ url: config.url, content_type: config.content_type, secret: config.secret, insecure_ssl: config.insecure_ssl }),
      headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${deps.appToken()}`,
        'user-agent': 'repo-harness', 'x-github-api-version': '2022-11-28',
      },
    });
  } catch { throw new Error(`${endpoint} is unreachable.`); }
  if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}.`);
  await response.json();
}

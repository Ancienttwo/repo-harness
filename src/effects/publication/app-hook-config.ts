import { checkAppHookConfig, type AppHookConfig } from '../../core/publication/publication-writes';

export interface AppHookConfigDeps {
  fetch: typeof fetch;
  appToken: () => string;
}

/** Publish one App hook config. The caller owns deployment approval and partial-failure recovery. */
export async function publishAppHookConfig(config: AppHookConfig, deps: AppHookConfigDeps): Promise<void> {
  checkAppHookConfig(config);

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
}

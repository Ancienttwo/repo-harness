/** The one GitHub `owner/name` grammar. Pure and import-free so browser bundles and collectors share one authority. */
const GITHUB_OWNER_PATTERN = '[A-Za-z0-9-]{1,39}';
const GITHUB_NAME_PATTERN = '[A-Za-z0-9._-]{1,100}';

export const GITHUB_REPOSITORY = new RegExp(`^${GITHUB_OWNER_PATTERN}/${GITHUB_NAME_PATTERN}$`, 'u');

const GITHUB_REMOTE = new RegExp(
  `^(?:https://(?:[^@/]+@)?github\\.com/|git@github\\.com:|ssh://git@github\\.com(?::22)?/)(${GITHUB_OWNER_PATTERN})/(${GITHUB_NAME_PATTERN}?)(?:\\.git)?/?$`,
  'iu',
);

/** `owner/name` of a GitHub remote URL (https, scp-like ssh or ssh://), lowercased; null for any other URL. */
export function githubRemoteRepository(url: string): string | null {
  const match = GITHUB_REMOTE.exec(url.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

/** The one GitHub `owner/name` grammar. Pure and import-free so browser bundles and collectors share it with the remote parser in `source.ts`. */
export const GITHUB_OWNER_PATTERN = '[A-Za-z0-9-]{1,39}';
export const GITHUB_NAME_PATTERN = '[A-Za-z0-9._-]{1,100}';

export const GITHUB_REPOSITORY = new RegExp(`^${GITHUB_OWNER_PATTERN}/${GITHUB_NAME_PATTERN}$`, 'u');


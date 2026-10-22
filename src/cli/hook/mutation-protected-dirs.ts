/** Root-only private directories shared by edit, Bash, Stop and Git boundaries. */
export const PROTECTED_REPO_DIRS = ['_ops', '_ref'] as const;

export function protectedRepoDir(path: string): typeof PROTECTED_REPO_DIRS[number] | null {
  return PROTECTED_REPO_DIRS.find(dir => path === dir || path.startsWith(`${dir}/`)) ?? null;
}

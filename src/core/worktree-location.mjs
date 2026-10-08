/** Store this value without host-specific paths. Resolve it only at runtime. */
export const DEFAULT_WORKTREE_TEMPLATE = '{{system_tmp}}/{{repo}}-wt-{{slug}}';

/** POSIX task worktrees use system /tmp, not a process-specific TMPDIR. */
export function systemWorktreeRoot(platform, nativeTemporaryRoot) {
  return platform === 'win32' ? nativeTemporaryRoot : '/tmp';
}

export function resolveWorktreeTemplate(template, platform, nativeTemporaryRoot) {
  return template.replaceAll('{{system_tmp}}', systemWorktreeRoot(platform, nativeTemporaryRoot).replaceAll('\\', '/').replace(/\/$/, ''));
}

export function defaultWorktreeTemplate(platform, nativeTemporaryRoot) {
  return resolveWorktreeTemplate(DEFAULT_WORKTREE_TEMPLATE, platform, nativeTemporaryRoot);
}

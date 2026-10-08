/** POSIX task worktrees use system /tmp, not a process-specific TMPDIR. */
export function systemWorktreeRoot(platform, nativeTemporaryRoot) {
  return platform === 'win32' ? nativeTemporaryRoot : '/tmp';
}

export function defaultWorktreeTemplate(platform, nativeTemporaryRoot) {
  return systemWorktreeRoot(platform, nativeTemporaryRoot).replaceAll('\\', '/').replace(/\/$/, '') + '/{{repo}}-wt-{{slug}}';
}

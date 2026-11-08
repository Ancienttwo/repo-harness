/**
 * The desktop shell's page bridge. The shell injects `window.repoHarnessDesktop`
 * before the page loads and checks `/healthz.protocol` exactly at startup, so a
 * page that sees the bridge has every protocol-3 call (ADR-0003). A plain
 * browser has no bridge. This module is the only reader of the global.
 */
export interface RepoHarnessDesktopBridge {
  openWorktree(request: { readonly repository_id: string; readonly worktree_id: string; readonly target: 'terminal' | 'editor' }): Promise<void>;
}

export function desktopBridge(): RepoHarnessDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { repoHarnessDesktop?: RepoHarnessDesktopBridge }).repoHarnessDesktop ?? null;
}

import { cn } from '@cloudflare/kumo';

/**
 * The design system's logo and pixel characters. The Vite config copies its
 * assets folder into the build, so each file keeps its own name; tests check
 * these paths against that folder and against the packed console.
 */
export const LOGO_MARK = '/logos/repo-harness-carrot-mark-transparent.svg';
export const MASCOTS = {
  'buddy-happy': '/mascots/buddy-happy.svg',
  'cloud-off': '/mascots/cloud-off.svg',
} as const;
export type MascotName = keyof typeof MASCOTS;

export function LogoMark({ height, className }: { readonly height: number; readonly className?: string }) {
  return <img src={LOGO_MARK} alt="" height={height} className={cn('w-auto shrink-0 [image-rendering:pixelated]', className)} style={{ height }} />;
}

/** Decoration only: drawn at its 4× pixel size, no alt text, at most one per screen. */
export function Mascot({ name, className }: { readonly name: MascotName; readonly className?: string }) {
  return <img src={MASCOTS[name]} alt="" className={cn('shrink-0 [image-rendering:pixelated]', className)} data-mascot={name} />;
}

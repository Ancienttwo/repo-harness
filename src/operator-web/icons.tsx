import type { ReactNode, SVGProps } from 'react';

export type OperatorIconName =
  | 'alert'
  | 'check'
  | 'chevron'
  | 'close'
  | 'copy'
  | 'flag'
  | 'inbox'
  | 'refresh'
  | 'repo';

const paths: Record<OperatorIconName, ReactNode> = {
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2.2 3.5L17 12H6" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-11Z" />
      <path d="M4 13h4l1.5 2h5L16 13h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3.9L4 9" />
      <path d="M4 4v5h5M4 13a8 8 0 0 0 14.9 3.9L20 15" />
      <path d="M20 20v-5h-5" />
    </>
  ),
  repo: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
};

export function Icon({ name, size = 18, title, ...props }: SVGProps<SVGSVGElement> & {
  readonly name: OperatorIconName;
  readonly title?: string;
  readonly size?: number;
}) {
  const label = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg
      {...props}
      {...label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

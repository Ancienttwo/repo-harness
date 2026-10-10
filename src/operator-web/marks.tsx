// The repo-harness carrot brand mark, ported from Ancienttwo/repo-harness-page@ffe3ff1
// (src/components/ui/CarrotMark.astro). Pixel coordinates and colours are copied
// verbatim; brand identity keeps its own palette. The mark is decorative:
// aria-hidden, no label.

interface MarkProps {
  readonly height?: number;
  readonly className?: string;
}

const CARROT_PIXELS: ReadonlyArray<readonly [number, number, string]> = [
  [4, 0, '#43A047'],
  [2, 1, '#43A047'], [4, 1, '#43A047'], [6, 1, '#43A047'],
  [3, 2, '#43A047'], [4, 2, '#2E7D33'], [5, 2, '#43A047'],
  [1, 3, '#E8742C'], [2, 3, '#E8742C'], [3, 3, '#E8742C'], [4, 3, '#E8742C'], [5, 3, '#E8742C'], [6, 3, '#E8742C'], [7, 3, '#C2571A'],
  [1, 4, '#F2954A'], [2, 4, '#E8742C'], [3, 4, '#E8742C'], [4, 4, '#E8742C'], [5, 4, '#E8742C'], [6, 4, '#E8742C'], [7, 4, '#C2571A'],
  [2, 5, '#F2954A'], [3, 5, '#E8742C'], [4, 5, '#E8742C'], [5, 5, '#E8742C'], [6, 5, '#C2571A'],
  [2, 6, '#E8742C'], [3, 6, '#E8742C'], [4, 6, '#E8742C'], [5, 6, '#E8742C'], [6, 6, '#C2571A'],
  [3, 7, '#F2954A'], [4, 7, '#E8742C'], [5, 7, '#C2571A'],
  [3, 8, '#E8742C'], [4, 8, '#E8742C'], [5, 8, '#C2571A'],
  [4, 9, '#E8742C'],
  [4, 10, '#C2571A'],
];

export function CarrotMark({ height = 24, className }: MarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={(height * 9) / 12}
      height={height}
      viewBox="0 0 9 12"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {CARROT_PIXELS.map(([x, y, fill]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

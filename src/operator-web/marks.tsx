// Canonical pixel brand art, ported from Ancienttwo/repo-harness-page@ffe3ff1:
//   src/components/ui/CarrotMark.astro  — the repo-harness carrot brand mark
//   src/components/ui/DunkieMark.astro  — Dunkie, the saddlebag donkey mascot
//   src/components/ui/HookMark.astro    — Hook, the hard-hat crane-hook robot
// Pixel coordinates and colours are copied verbatim. These are brand identity,
// not UI affordances, so they keep their own palette and are exempt from the
// board's accent discipline. Every mark is decorative: aria-hidden, no label.

type PixelPalette = Record<string, string | null | undefined>;

function gridRects(grid: readonly string[], palette: PixelPalette) {
  const rects = [];
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y] ?? '';
    for (let x = 0; x < row.length; x += 1) {
      const fill = palette[row[x] as string];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  }
  return rects;
}

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

const DUNKIE_PALETTE: PixelPalette = {
  '.': null,
  g: '#9D8F7C', G: '#6E6253', m: '#C7BAA8', k: '#4A4034',
  C: '#2D5BB8', c: '#244C9E', A: '#C2592C', a: '#A44721',
  B: '#1B2D40', W: '#FFFFFF',
};

const DUNKIE_GRID = [
  '...............gg.gg...', '...............gg.gg...', '...............gggggg..',
  '...............gggggg..', '...............gggBgg..', '...............gggggmm.',
  '...............gggggmk.', '..............gggg.....', '...G.ggggggggggg......',
  '..GGggCCCggAAAggg.....', '...GggCWCggAWAggg.....', '...k.gcccggaaagg......',
  '.....gg.gg..gggg......', '.....gg.gg..gggg......', '.....gg.gg..gggg......',
  '.....kk.kk..kkkk......',
];

export function DunkieMark({ height = 80, className }: MarkProps) {
  const rows = DUNKIE_GRID.length;
  const columns = DUNKIE_GRID[0].length;
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={(height * columns) / rows}
      height={height}
      viewBox={`0 0 ${columns} ${rows}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {gridRects(DUNKIE_GRID, DUNKIE_PALETTE)}
    </svg>
  );
}

const HOOK_PALETTE: PixelPalette = {
  '.': null, H: '#E8742C', h: '#C2571A', o: '#F2954A',
  S: '#AEB8C4', s: '#828E9C', d: '#5A6675', L: '#CDD5DE',
  W: '#FFFFFF', B: '#1B2D40',
};

const HOOK_GRID = [
  '....HHHH....', '..HHHHHHHH..', '..HooooooH..', '..hhhhhhhh..',
  '...LSSSSL...', '..SSSSSSSS..', '..SWWSSWWS..', '..SWBSSBWS..',
  '..SSSSSSSS..', '...SssssS...', '....SSSS....', '.....SS.....',
  '.....SS.....', '.....SS.....', '....SSS.....', '..SSSSS.....',
  '..SSd.......', '..SS........', '..dSd.......', '..dSSSd.....',
  '...dSSS.....', '....dd......',
];

export function HookMark({ height = 80, className }: MarkProps) {
  const rows = HOOK_GRID.length;
  const columns = HOOK_GRID[0].length;
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={(height * columns) / rows}
      height={height}
      viewBox={`0 0 ${columns} ${rows}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {gridRects(HOOK_GRID, HOOK_PALETTE)}
    </svg>
  );
}

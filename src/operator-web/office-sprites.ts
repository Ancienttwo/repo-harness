/**
 * The pixel art of the Board office, ported from the approved S0 mockup
 * (docs/design/operator-console/mockups/board-pixel-office.html, #1790 M82):
 * one 32-colour palette with a day and a night set, a 3x5 sign font, 16x24
 * characters and the carrot boss. Each sprite is rows of palette letters.
 * Claude Code is its official pixel mascot (M82), Codex a blue owl, and every
 * other agent a person.
 */
export const PX_COLORS = [
  'ink', 'ink2', 'slate', 'mist', 'cloud', 'paper', 'wall', 'wallSh', 'wood', 'woodDk', 'floorA', 'floorB', 'floorSh', 'deskTop', 'deskFr', 'skin',
  'skinSh', 'shirt', 'claude', 'claudeDk', 'codex', 'codexDk', 'screen', 'danger', 'dangerDk', 'warn', 'warnDk', 'ok', 'okDk', 'accent', 'leaf', 'sky',
] as const;
export type PxColor = typeof PX_COLORS[number];
export type PxMap = Partial<Readonly<Record<PxColor, PxColor>>>;
export type SpritePalette = Readonly<Record<string, PxColor>>;
export type Sprite = readonly string[];

export const SHADE_DARK: PxMap = { floorA: 'floorSh', floorB: 'floorSh', wall: 'wallSh', deskTop: 'deskFr', deskFr: 'wood', wood: 'woodDk', paper: 'cloud', cloud: 'mist', mist: 'slate', slate: 'ink2', ink2: 'ink', leaf: 'okDk', sky: 'codex', wallSh: 'wood' };
export const SHADE_LIGHT: PxMap = { floorSh: 'floorB', floorB: 'floorA', floorA: 'wood' };
export const SHADE_SUN: PxMap = { floorSh: 'floorB', floorB: 'floorA' };

/** The 3x5 sign font, rows top to bottom; M and N are wider. */
const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '1000111011101011000110001', N: '10011101101110011001', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '#': '0101011111010101111101010', '-': '000000111000000', '.': '000000000000010', '·': '000000010000000', ':': '000010000010000', '>': '100010001010100', '<': '001010100010001', '?': '110001010000010', '!': '010010010000010', '+': '000010111010000', '/': '001001010100100', '_': '000000000000111', ' ': '000000000000000'
};

export const glyph = (char: string): string => FONT[char] ?? FONT['?']!;

export function textWidth(text: string): number {
  const width = [...text.toUpperCase()].reduce((sum, char) => sum + glyph(char).length / 5 + 1, 0);
  return width === 0 ? 0 : width - 1;
}

// Person rows: k outline, h/H/j hat, r/R hair, s/S skin, e eye, m mouth, w collar, b/B shirt, d trousers, x shoes.
const replaceRows = (rows: Sprite, swap: Readonly<Record<number, string>>): Sprite => rows.map((row, index) => swap[index] ?? row);
const PERSON_FRONT: Sprite = [
  '................', '.....kkkkkk.....', '....kjjhhhhk....', '...kjhhhhhhhk...', '...khhhhhhhhk...', '..kHHHHHHHHHHk..',
  '...krssssssrk...', '...ksesssseSk...', '...ksssssssSk...', '...kSssmmssSk...', '....kSSSSSSk....', '.....kwwwwk.....',
  '...kkbbwwbbkk...', '..kbbbbbbbbbBk..', '.kbbbbbbbbbbbBk.', '.kbkbbbbbbbbkBk.', '.kbkbbbbbbbbkBk.', '.kskbbbbbbbbkSk.',
  '..kkddddddddkk..', '...kddddddddk...', '...kddkkkkddk...', '...kddk..kddk...', '...kxxk..kxxk...', '...kkkk..kkkk...',
];
const PERSON_BLINK = replaceRows(PERSON_FRONT, { 7: '...ksssssssSk...' });
const PERSON_ARMS = replaceRows(PERSON_FRONT, { 15: '.kbbbbbbbbbbbBk.', 16: '..kbbbbbbbbbBk..', 17: '..kssbbbbbbSSk..' });
const PERSON_STEP = replaceRows(PERSON_FRONT, { 21: '...kddk...kddk..', 22: '...kxxk...kxxk..', 23: '...kkkk...kkkk..' });
const PERSON_BACK: Sprite = [
  '................', '.....kkkkkk.....', '....kjjhhhhk....', '...kjhhhhhhhk...', '...khhhhhhhhk...', '...kHHHHHHHHk...',
  '...krrrrrrrrk...', '..kSrrrrrrrrSk..', '...krrrrrrrRk...', '....kRRRRRRk....', '.....kssssk.....', '...kkbbbbbbkk...',
  '..kbbbbbbbbbBk..', '.kbbbbbbbbbbbBk.', '.kbbbbbbbbbbbBk.', '.kbbbbbbbbbbbBk.', '..kbbbbbbbbbBk..', '..kbbbbbbbbbBk..', '..kkkkkkkkkkkk..',
];
const PERSON_BACK_TYPE = replaceRows(PERSON_BACK, { 13: 'kbbbbbbbbbbbbbBk', 14: 'ksbbbbbbbbbbbBSk' });

/** A 1 px outline around the opaque cells, one cell wider on each side. */
function outline(rows: Sprite): Sprite {
  const height = rows.length;
  const width = rows[0]!.length;
  const on = (x: number, y: number) => y >= 0 && y < height && x >= 0 && x < width && rows[y]![x] !== '.';
  const out: string[] = [];
  for (let y = -1; y <= height; y += 1) {
    let row = '';
    for (let x = -1; x <= width; x += 1) row += on(x, y) ? rows[y]![x]! : (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) ? 'k' : '.');
    out.push(row);
  }
  return out;
}

function pad(rows: Sprite, above: number, total: number): Sprite {
  const blank = rows[0]!.replace(/./gu, '.');
  return [...Array.from({ length: above }, () => blank), ...rows, ...Array.from({ length: Math.max(total - above - rows.length, 0) }, () => blank)];
}

/** Cell edits on a sprite: {row: {column: letter}}; '.' clears a cell. */
type Edit = Readonly<Record<number, Readonly<Record<number, string>>>>;

function edit(base: Sprite, edits: Edit): Sprite {
  return base.map((row, index) => {
    const cells = edits[index];
    if (cells === undefined) return row;
    const letters = row.split('');
    for (const [column, letter] of Object.entries(cells)) letters[Number(column)] = letter;
    return letters.join('');
  });
}

function merge(...edits: readonly Edit[]): Edit {
  const out: Record<number, Record<number, string>> = {};
  for (const entry of edits) for (const [row, cells] of Object.entries(entry)) out[Number(row)] = { ...out[Number(row)], ...cells };
  return out;
}

/** The Claude Code mascot: the CLI banner's half-block pixels are twice as tall as wide, so each banner row is two square rows here. */
const MASCOT: Sprite = ['..jjhhhhhhhhhh..', '..jhhhhhhhhhhh..', '..hhehhhhhhehh..', '..hhehhhhhhehh..', 'hhhhhhhhhhhhhhhh', 'hhhhhhhhhhhhhhhh', '..hhhhhhhhhhhh..', '..HHHHHHHHHHHH..', '...H.H....H.H...', '...H.H....H.H...'];
const NO_EYES: Edit = { 2: { 4: 'h', 11: 'h' }, 3: { 4: 'h', 11: 'h' } };
const ARMS_IN: Edit = { 4: { 0: '.', 1: '.', 14: '.', 15: '.' }, 5: { 0: '.', 1: '.', 14: '.', 15: '.' } };
const RIGHT_IN: Edit = { 4: { 14: '.', 15: '.' }, 5: { 14: '.', 15: '.' } };

function armsAt(row: number, left: boolean, right: boolean): Edit {
  const cells = Object.fromEntries([...(left ? [0, 1] : []), ...(right ? [14, 15] : [])].map(column => [column, 'h']));
  return { [row]: cells, [row + 1]: cells };
}

const MASCOT_FRONT: Readonly<Record<FrontPose, Edit>> = {
  front: {},
  blink: { 2: { 4: 'h', 11: 'h' } },
  step: { 9: { 2: 'H', 3: '.', 6: 'H', 5: '.', 9: 'H', 10: '.', 13: 'H', 12: '.' } },
  arms: { 3: { 0: 'h', 1: 'h', 2: 'h', 3: 'h', 12: 'h', 13: 'h', 14: 'h', 15: 'h' }, 5: { 0: '.', 1: '.', 14: '.', 15: '.' } },
  waveA: merge(RIGHT_IN, armsAt(2, false, true)),
  waveB: merge(RIGHT_IN, armsAt(0, false, true)),
  cheerA: merge(ARMS_IN, armsAt(0, true, true), { 2: { 4: 'h', 11: 'h' }, 3: { 3: 'e', 4: 'h', 5: 'e', 10: 'e', 11: 'h', 12: 'e' } }),
  cheerB: { 2: { 4: 'h', 11: 'h' }, 3: { 3: 'e', 4: 'h', 5: 'e', 10: 'e', 11: 'h', 12: 'e' } },
  panicA: merge(ARMS_IN, armsAt(0, true, true), { 2: { 5: 'e', 10: 'e' }, 3: { 5: 'e', 10: 'e' }, 5: { 7: 'e', 8: 'e' } }),
  panicB: merge(ARMS_IN, armsAt(1, true, true), { 2: { 5: 'e', 10: 'e' }, 3: { 5: 'e', 10: 'e' }, 5: { 7: 'e', 8: 'e' } }),
  sipA: merge(RIGHT_IN, { 4: { 14: 'h', 15: 'h' }, 2: { 14: 'u', 15: 'u' }, 3: { 14: 'u', 15: 'u' } }),
  sipB: merge(RIGHT_IN, armsAt(2, false, true), { 0: { 14: 'u', 15: 'u' }, 1: { 14: 'u', 15: 'u' }, 2: { 4: 'h', 11: 'h' } }),
  think: merge(NO_EYES, { 1: { 5: 'e', 12: 'e' }, 2: { 5: 'e', 12: 'e' } }),
  sleep: merge(NO_EYES, { 3: { 3: 'e', 4: 'e', 11: 'e', 12: 'e' } }),
};
const MASCOT_BACK: Readonly<Record<BackPose, Edit>> = {
  back: {},
  backType: { 3: { 0: 'h', 1: 'h', 14: 'h', 15: 'h' }, 5: { 2: 'h', 0: '.', 1: '.', 14: '.', 15: '.' } },
  backSip: merge(RIGHT_IN, armsAt(2, false, true), { 0: { 14: 'u', 15: 'u' }, 1: { 14: 'u', 15: 'u' } }),
  backUpA: merge(ARMS_IN, armsAt(0, true, true)),
  backUpB: merge(ARMS_IN, armsAt(1, true, true)),
};

/** Outfits: overlays on a 16x13 grid, 3 rows of headroom above the body. a/A main and dark colour, c a trim colour. They tell seats apart; the action follows the seat state. */
export type Outfit = 'plain' | 'cap' | 'beanie' | 'crown' | 'headset' | 'glasses' | 'bowtie' | 'scarf';
type Overlay = readonly (string | null)[];
const OUTFITS: Readonly<Record<Outfit, { readonly palette: SpritePalette; readonly front: Overlay; readonly back: Overlay }>> = {
  plain: { palette: {}, front: [], back: [] },
  cap: { palette: { a: 'warn', A: 'warnDk' }, front: [null, '....aaaaaaaa....', '...aaaaaaaaaAAAA'], back: [null, '....aaaaaaaa....', '...aaaaaaaaaa...'] },
  beanie: { palette: { a: 'ok', A: 'okDk', c: 'paper' }, front: ['.......cc.......', '....aaaaaaaa....', '...aAaAaAaAaA...'], back: ['.......cc.......', '....aaaaaaaa....', '...aAaAaAaAaA...'] },
  crown: { palette: { a: 'warn', A: 'warnDk', c: 'danger' }, front: ['...a...aa...a...', '...aa.aaaa.aa...', '...aAaacaaAaa...'], back: ['...a...aa...a...', '...aa.aaaa.aa...', '...aAaaaaaAaa...'] },
  headset: {
    palette: { a: 'ink2', A: 'slate', c: 'ink' },
    front: [null, null, '...AAAAAAAAAA...', '..A..........A..', '.aa..........aa.', '.aa..........aa.', '.aa..........aa.', '.........cccc...'],
    back: [null, null, '...AAAAAAAAAA...', '..A..........A..', '.aa..........aa.', '.aa..........aa.', '.aa..........aa.'],
  },
  glasses: { palette: { a: 'ink' }, front: [null, null, null, null, '...aaa....aaa...', '...a.aaaaaa.a...', '...a.a....a.a...', '...aaa....aaa...'], back: [] },
  bowtie: { palette: { a: 'danger', A: 'dangerDk' }, front: [null, null, null, null, null, null, null, null, '.....a....a.....', '.....aaAAaa.....', '.....a....a.....'], back: [] },
  scarf: {
    palette: { a: 'paper', A: 'danger' },
    front: [null, null, null, null, null, null, null, null, null, '..aAaAaAaAaAaA..', '...........aA...', '...........Aa...'],
    back: [null, null, null, null, null, null, null, null, null, '..aAaAaAaAaAaA..', '...........aA...', '...........Aa...'],
  },
};

/** Eyes stay on top, so glasses frame them. */
function dress(body: Sprite, overlay: Overlay): Sprite {
  return ['................', '................', '................', ...body].map((row, index) => {
    const cover = overlay[index];
    if (cover === undefined || cover === null) return row;
    const letters = row.split('');
    for (let column = 0; column < 16; column += 1) if (cover[column] !== '.' && letters[column] !== 'e') letters[column] = cover[column]!;
    return letters.join('');
  });
}

export type FrontPose = 'front' | 'blink' | 'step' | 'arms' | 'waveA' | 'waveB' | 'cheerA' | 'cheerB' | 'panicA' | 'panicB' | 'sipA' | 'sipB' | 'think' | 'sleep';
export type BackPose = 'back' | 'backType' | 'backSip' | 'backUpA' | 'backUpB';
export type Pose = FrontPose | BackPose;

/** One body: its poses and where the head sits on the 16x24 cell. */
export interface Body {
  readonly poses: Readonly<Record<Pose, Sprite>>;
  readonly dx: number;
  readonly top: number;
  readonly topBack: number;
  readonly hat: number;
}

function fromEntries<K extends string>(keys: readonly K[], value: (key: K) => Sprite): Record<K, Sprite> {
  return Object.fromEntries(keys.map(key => [key, value(key)])) as Record<K, Sprite>;
}

const FRONT_POSES = Object.keys(MASCOT_FRONT) as FrontPose[];
const BACK_POSES = Object.keys(MASCOT_BACK) as BackPose[];

const mascotBodies = new Map<Outfit, Body>();
function mascotBody(outfit: Outfit): Body {
  const known = mascotBodies.get(outfit);
  if (known !== undefined) return known;
  const look = OUTFITS[outfit];
  const body: Body = {
    dx: -1, top: 12, topBack: 3, hat: look.front.slice(0, 3).some(row => row !== null) ? 3 : 0,
    poses: {
      ...fromEntries(FRONT_POSES, pose => pad(outline(dress(edit(MASCOT, MASCOT_FRONT[pose]), look.front)), 9, 24)),
      ...fromEntries(BACK_POSES, pose => pad(outline(dress(edit(MASCOT, merge(NO_EYES, MASCOT_BACK[pose])), look.back)), 0, 19)),
    },
  };
  mascotBodies.set(outfit, body);
  return body;
}

/** People have no extra actions: each action maps to their nearest pose. */
const PERSON: Body = {
  dx: 0, top: 1, topBack: 1, hat: 0,
  poses: {
    front: PERSON_FRONT, blink: PERSON_BLINK, arms: PERSON_ARMS, step: PERSON_STEP, back: PERSON_BACK, backType: PERSON_BACK_TYPE,
    cheerA: PERSON_ARMS, panicA: PERSON_ARMS, panicB: PERSON_ARMS, think: PERSON_ARMS,
    waveA: PERSON_FRONT, waveB: PERSON_FRONT, sipA: PERSON_FRONT, sipB: PERSON_FRONT, cheerB: PERSON_FRONT,
    sleep: PERSON_BLINK, backSip: PERSON_BACK, backUpA: PERSON_BACK, backUpB: PERSON_BACK,
  },
};

const OWL: Sprite = [
  '..h..........h..', '..hh........hh..', '..hhhhhhhhhhhh..', '.hhwwwhhhhwwwhh.', '.hwwwwwhhwwwwwh.', '.hwweewhhweewwh.', '.hwweewyyweewwh.',
  '.hhwwwhyyhwwwhh.', '.hhhhhhhhhhhhhh.', 'HHhhjjjjjjjjhhHH', 'HHhjjHjjjjHjjhHH', '.HhjjjjjjjjjjhH.', '..hhjjjjjjjjhh..', '....yy....yy....',
];
const WINGS_UP: Edit = { 6: { 0: 'H', 1: 'H', 14: 'H', 15: 'H' }, 7: { 0: 'H', 1: 'H', 14: 'H', 15: 'H' }, 9: { 0: '.', 1: '.', 14: '.', 15: '.' }, 10: { 0: '.', 1: '.', 14: '.', 15: '.' }, 11: { 1: '.', 14: '.' } };
const rightWingUp = (row: number): Edit => ({ 9: { 14: '.', 15: '.' }, 10: { 14: '.', 15: '.' }, 11: { 14: '.' }, [row]: { 14: 'H', 15: 'H' }, [row + 1]: { 14: 'H', 15: 'H' } });
const OWL_FRONT: Readonly<Record<FrontPose, Edit>> = {
  front: {}, sipA: {}, sipB: { 4: { 3: 'h', 4: 'h', 5: 'h', 10: 'h', 11: 'h', 12: 'h' } }, cheerB: {},
  blink: { 4: { 2: 'h', 3: 'h', 4: 'h', 5: 'h', 6: 'h', 9: 'h', 10: 'h', 11: 'h', 12: 'h', 13: 'h' }, 5: { 4: 'h', 5: 'h', 10: 'h', 11: 'h', 2: 'h', 3: 'h', 6: 'h', 9: 'h', 12: 'h', 13: 'h' } },
  sleep: { 3: { 3: 'h', 4: 'h', 5: 'h', 10: 'h', 11: 'h', 12: 'h' }, 4: { 2: 'h', 3: 'h', 4: 'h', 5: 'h', 6: 'h', 9: 'h', 10: 'h', 11: 'h', 12: 'h', 13: 'h' }, 5: { 2: 'h', 3: 'h', 4: 'h', 5: 'h', 6: 'h', 9: 'h', 10: 'h', 11: 'h', 12: 'h', 13: 'h' }, 6: { 3: 'e', 4: 'e', 5: 'e', 10: 'e', 11: 'e', 12: 'e', 2: 'h', 6: 'h', 9: 'h', 13: 'h' }, 7: { 3: 'h', 4: 'h', 5: 'h', 10: 'h', 11: 'h', 12: 'h' } },
  step: { 13: { 4: '.', 5: 'y', 6: 'y', 10: '.', 11: 'y', 12: 'y' } },
  arms: WINGS_UP, cheerA: WINGS_UP, panicA: WINGS_UP,
  panicB: { 7: { 0: 'H', 1: 'H', 14: 'H', 15: 'H' }, 8: { 0: 'H', 1: 'H', 14: 'H', 15: 'H' }, 9: { 0: '.', 1: '.', 14: '.', 15: '.' }, 10: { 0: '.', 1: '.', 14: '.', 15: '.' }, 11: { 1: '.', 14: '.' } },
  waveA: rightWingUp(7), waveB: rightWingUp(5),
  think: { 4: { 5: 'e', 6: 'e', 11: 'e', 12: 'e' }, 5: { 5: 'e', 6: 'e', 11: 'e', 12: 'e', 4: 'w', 10: 'w' }, 6: { 4: 'w', 5: 'w', 10: 'w', 11: 'w' } },
};
const OWL_BACK: Readonly<Record<BackPose, Edit>> = { back: {}, backSip: {}, backType: { 9: { 0: '.' }, 10: { 0: 'H', 15: 'H' }, 11: { 0: 'H', 15: 'H' } }, backUpA: WINGS_UP, backUpB: WINGS_UP };
const owlBack = (rows: Sprite): Sprite => rows.map((row, index) => (index < 9 ? row.replace(/[wey]/gu, 'h') : index < 13 ? row.replace(/j/gu, 'h') : row));
const OWL_BODY: Body = {
  dx: -1, top: 8, topBack: 1, hat: 0,
  poses: {
    ...fromEntries(FRONT_POSES, pose => pad(outline(edit(OWL, OWL_FRONT[pose])), 8, 24)),
    ...fromEntries(BACK_POSES, pose => pad(outline(edit(owlBack(edit(OWL, OWL_BACK[pose])), { 10: { 5: 'H', 10: 'H' }, 11: { 6: 'H', 9: 'H' } })), 1, 19)),
  },
};

/** The body family of an hc agent kind. */
export type AgentKind = 'claude' | 'codex' | 'other' | 'unknown';

export interface SceneAgent {
  readonly kind: AgentKind;
  readonly badge: string;
}

/** `BoardTerminalV1.agent` is the hc agent word; a word that is not Claude Code or Codex is another agent, badged with its first letters. */
export function sceneAgent(agent: string | null): SceneAgent {
  if (agent === null) return { kind: 'unknown', badge: '?' };
  if (agent === 'claude-code') return { kind: 'claude', badge: 'CC' };
  if (agent === 'codex') return { kind: 'codex', badge: 'CX' };
  return { kind: 'other', badge: agent.slice(0, 2).toUpperCase() };
}

const AGENT_COLORS: Readonly<Record<AgentKind, { readonly h: PxColor; readonly H: PxColor; readonly j: PxColor; readonly tag: PxColor | null }>> = {
  claude: { h: 'claude', H: 'claudeDk', j: 'accent', tag: 'claudeDk' },
  codex: { h: 'codex', H: 'codexDk', j: 'screen', tag: 'codexDk' },
  other: { h: 'mist', H: 'slate', j: 'cloud', tag: 'slate' },
  unknown: { h: 'paper', H: 'cloud', j: 'paper', tag: null },
};

export const agentTagColor = (kind: AgentKind): PxColor | null => AGENT_COLORS[kind].tag;

export function agentBody(kind: AgentKind, outfit: Outfit): Body {
  if (kind === 'claude') return mascotBody(outfit);
  return kind === 'codex' ? OWL_BODY : PERSON;
}

export function agentPalette(kind: AgentKind, outfit: Outfit): SpritePalette {
  const { h, H, j } = AGENT_COLORS[kind];
  const palette: SpritePalette = { k: 'ink', h, H, j, r: 'woodDk', R: 'ink2', s: 'skin', S: 'skinSh', e: 'ink', m: 'woodDk', w: 'paper', b: 'shirt', B: 'ink2', d: 'ink2', x: 'ink', y: 'warn' };
  return kind === 'claude' ? { ...palette, u: 'paper', ...OUTFITS[outfit].palette } : palette;
}

/** The 7-8 pixel agents of the overview's mini rooms: the same bodies at the mini grid, in the same palette. */
const MINI_SPRITES: Readonly<Record<'person' | 'claude' | 'codex', { readonly front: Sprite; readonly back: Sprite }>> = {
  person: { front: ['.kkkkk.', 'kjhhhhk', 'kHHHHHk', 'ksesesk', '.kssSk.', 'kbbbbbk', 'kbbbbbk', '.kd.dk.'], back: ['.kkkkk.', 'kjhhhhk', 'kHHHHHk', 'krrrrrk', '.kbbbk.', 'kbbbbbk', 'kbbbbbk'] },
  claude: { front: ['........', '.jhhhhh.', '.hehheh.', 'hhhhhhhh', '.HHHHHH.', '.H.HH.H.'], back: ['.jhhhhh.', '.hhhhhh.', 'hhhhhhhh', '.HHHHHH.', '.H.HH.H.'] },
  codex: { front: ['.h....h.', '.hhhhhh.', 'hweyyewh', '.hjjjjh.', '.hjjjjh.', '..y..y..'], back: ['.h....h.', '.hhhhhh.', 'HhhhhhhH', '.hHhhHh.', '.hhhhhh.'] },
};

export function miniAgent(kind: AgentKind, facing: 'front' | 'back'): Sprite {
  return MINI_SPRITES[kind === 'claude' || kind === 'codex' ? kind : 'person'][facing];
}

export const CHAIR: Sprite = [
  '...kkkkkkkkkkkk...', '..kmmlllllllllMk..', '..kmllllllllllMk..', '..klllllllllllMk..', '..klllllllllllMk..', '...kMMMMMMMMMMk...',
  '....kkkkkkkkkk....', '........kk........', '.....kkkkkkkk.....', '....kk......kk....',
];
export const CHAIR_PALETTE: SpritePalette = { k: 'ink', m: 'mist', l: 'slate', M: 'ink2' };

/** The carrot boss, 16x22, two frames per pose. */
export const BOSS = {"calm":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..kooeooooeoOk..","..koroooooorOk..","..koooommoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..koooooooooOk..","..kooeooooeoOk..","..koroooooorOk..","..koooommoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"walk":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..kooeooooeoOk..","..koroooooorOk..","..koooommoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..kooeooooeoOk..","..koroooooorOk..","..koooommoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","....kkk..kkk....","....kkk..kkk...."]],"rage":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokooooookOk..","..kookooookoOk..","..kooeooooeoOk..","..kRRooooooRRk..","..koookWWkooOk..","...koookkooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokooooookOk..","..kookooookoOk..","..kooeooooeoOk..","..kRRooooooRRk..","..koookWWkooOk..","...koookkooOk...",".k..kkkkkkkk..k.",".oknnnwttwnnnko.",".onnnnwttwnnnno.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"happy":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..koeoeooeoeOk..","..krookookoork..","..kooookkoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..koeoeooeoeOk..","..krookookoork..","..kooookkoooOk..","...koooooooOk.g.","....kkkkkkkk..C.","..knnnwttwnnnkC.",".knnnnwttwnnnno.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"worried":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kookooookoOkB.","..kokooooookOkB.","..kooeooooeoOk..","..kooookokooOk..","..koookokoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kookooookoOk..","..kokooooookOkB.","..kooeooooeoOkB.","..kooookokooOk..","..koookokoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"inspect":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkkookkkOk..","..kkWeWkkWeWkk..","..kkWeWkkWeWkk..","..kokkkookkkOk..","..kooookkoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkkookkkOk..","..kkWWekkWWekk..","..kkWWekkWWekk..","..kokkkookkkOk..","..kooookkoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"sleep":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..koooooooooOk..","..koeeooooeeOk..","..koroooooorOk..","..koooomooooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..koooooooooOk..","..koeeooooeeOk..","..koroooooorOk..","..koooommoooOk..","...kooommooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"celebrate":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..koeoeooeoeOk..","..krookookoork..","..koookRRkooOk..","...koookkooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..koooooooooOk..","..kooeooooeoOk..","..koeoeooeoeOk..","..krookookoork..","..koookRRkooOk..",".o.koookkooOk.o.",".o..kkkkkkkk..o.",".nknnnwttwnnnkn.",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"freeze":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkooookkOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..koookkkkooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnoooooonnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kkooooookk...","..kookooookoOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..koookkkkooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnoooooonnnk.",".knnnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"point":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkooookkOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..kooookkoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnno",".knnnnnttnnnnnk.",".konnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkooookkOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..kooookkoooOk..","...koooooooOk...","....kkkkkkkk....","..knnnwttwnnnk.o",".knnnnwttwnnnnn.",".knnnnnttnnnnnn.",".knnnnnttnnnnnk.",".konnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]],"stick":[["......g..g......",".....gG..Gg...ss","......GGGG....ss","....kkkkkkkk...S","...kooooooook..S","..kokooooookOk.S","..kookooookoOk.S","..kooeooooeoOk.S","..kRRooooooRRk.S","..koookWWkooOk.S","...koookkooOk..S","....kkkkkkkk..kS","..knnnwttwnnnkoS",".knnnnwttwnnnno.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnnk.","..knnnnntnnnnk..","..knnnnnnnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokooooookOk..","..kookooookoOk..","..kooeooooeoOk..","..kRRooooooRRk..","..koookWWkooOk..","...koookkooOk...","....kkkkkkkk....","..knnnwttwnnnk..",".knnnnwttwnnnnk.",".knnnnnttnnnnnk.",".knnnnnttnnnnnk.",".konnnnttnnnnok.","..knnnnntnnnnkS.","..knnnnnnnnnnkS.","..kNNNNNNNNNNk.S","...kkk....kkk..S","...kkk....kkk.ss"]],"valve":[["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkooookkOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..koookkkkooOk..","...koooooooOk...","....kkkkkkkk....","..knnnVVVwnnnk..",".knnnVwHtVnnnnk.",".knnVnnHtnVnnnk.",".knoVHHHHHVonnk.",".knnVnnHtnVnnnk.","..knnVnHtVnnnk..","..knnnVVVnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."],["......g..g......",".....gG..Gg.....","......GGGG......","....kkkkkkkk....","...kooooooook...","..kokkooookkOk..","..koooooooooOk..","..kooeooooeoOk..","..koooooooooOk..","..koookkkkooOk..","...koooooooOk...","....kkkkkkkk....","..knnnVVVwnnnk..",".knnnVwttVnnnnk.",".knnVnHtHnVnnnk.",".knoVnnHtnVonnk.",".knnVnHtHnVnnnk.","..knnVnntVnnnk..","..knnnVVVnnnnk..","..kNNNNNNNNNNk..","...kkk....kkk...","...kkk....kkk..."]]} as const;
export type BossPose = keyof typeof BOSS;
export const BOSS_PALETTE: SpritePalette = { k: 'ink', e: 'ink', o: 'accent', O: 'claude', g: 'leaf', G: 'okDk', r: 'skinSh', R: 'danger', W: 'paper', w: 'paper', t: 'danger', n: 'ink2', N: 'ink', B: 'screen', C: 'accent', m: 'claudeDk', S: 'wood', s: 'woodDk', V: 'slate', H: 'mist' };

export const CARROT: Sprite = ['..g.g...', '...G....', 'ooooooo.', '.oooooO.', '.ooooO..', '..ooO...', '..oO....', '...O....'];
export const CARROT_PALETTE: SpritePalette = { o: 'accent', O: 'claude', g: 'leaf', G: 'okDk' };

/** The pixel icons of the four boss buttons: rects of x, y, width, height and colour. */
export const BOSS_ICONS = {
  rage: { width: 7, height: 7, rects: [[5, 0, 2, 2, '#5C3D22'], [4, 2, 1, 1, '#8E6440'], [3, 3, 1, 1, '#8E6440'], [2, 4, 1, 1, '#8E6440'], [1, 5, 1, 1, '#8E6440'], [0, 6, 1, 1, '#8E6440']] },
  carrot: { width: 5, height: 7, rects: [[1, 0, 1, 1, '#43A047'], [3, 0, 1, 1, '#43A047'], [2, 1, 1, 1, '#2E7D33'], [0, 2, 5, 1, 'var(--px-accent)'], [1, 3, 4, 1, 'var(--px-accent)'], [1, 4, 3, 1, '#CC5F1C'], [2, 5, 2, 1, '#CC5F1C'], [2, 6, 1, 1, '#A54B15']] },
  mine: { width: 7, height: 7, rects: [[3, 0, 1, 1, '#DC2626'], [3, 1, 1, 1, '#51647B'], [2, 2, 3, 1, '#14202E'], [1, 3, 5, 1, '#14202E'], [1, 4, 5, 1, '#14202E'], [2, 5, 3, 1, '#14202E'], [2, 3, 1, 1, '#9DACBC'], [0, 6, 7, 1, '#E3A008']] },
  valve: { width: 7, height: 7, rects: [[2, 0, 3, 1, '#DC2626'], [1, 1, 1, 1, '#DC2626'], [5, 1, 1, 1, '#DC2626'], [3, 1, 1, 2, '#14202E'], [1, 2, 5, 1, '#DC2626'], [3, 3, 1, 2, '#51647B'], [0, 5, 7, 2, '#51647B'], [0, 5, 7, 1, '#9DACBC']] },
} as const;

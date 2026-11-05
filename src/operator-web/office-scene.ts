import type { AdvisorBossCommand } from '../core/board/advisor-seat';
import type { BoardAcceptanceMergeV1 } from '../core/board/board';
import type { DeskState } from '../core/board/desk';
import {
  agentBody, agentPalette, agentTagColor, BOSS, BOSS_PALETTE, CARROT, CARROT_PALETTE, CHAIR, CHAIR_PALETTE, glyph, miniAgent, PX_COLORS, SHADE_DARK, SHADE_LIGHT, SHADE_SUN, textWidth,
  type BossPose, type FrontPose, type Outfit, type Pose, type PxColor, type PxMap, type SceneAgent, type Sprite, type SpritePalette,
} from './office-sprites';

/**
 * The office room on one indexed framebuffer, after the approved S0 mockup
 * (#1790 M82): a 320x240 grid drawn at an integer scale, one SVG path per
 * palette token. The grid grows one desk row at a time past 8 desks. Text
 * outside the sign font stays in the label layers, in the console font.
 */
export interface ScenePath {
  readonly d: string;
  readonly color: PxColor;
}

class FrameBuffer {
  private readonly cells: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.cells = new Uint8Array(width * height);
  }

  px(x: number, y: number, color: PxColor | null): void {
    if (color === null || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = PX_COLORS.indexOf(color) + 1;
  }

  private at(x: number, y: number): PxColor | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return PX_COLORS[this.cells[y * this.width + x]! - 1] ?? null;
  }

  rect(x: number, y: number, width: number, height: number, color: PxColor): void {
    for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) this.px(x + column, y + row, color);
  }

  hl(x: number, y: number, width: number, color: PxColor): void { this.rect(x, y, width, 1, color); }
  vl(x: number, y: number, height: number, color: PxColor): void { this.rect(x, y, 1, height, color); }

  frame(x: number, y: number, width: number, height: number, color: PxColor): void {
    this.hl(x, y, width, color); this.hl(x, y + height - 1, width, color); this.vl(x, y, height, color); this.vl(x + width - 1, y, height, color);
  }

  box(x: number, y: number, width: number, height: number, fill: PxColor, line: PxColor = 'ink'): void {
    this.rect(x, y, width, height, fill);
    this.frame(x, y, width, height, line);
  }

  dashed(x: number, y: number, width: number, height: number, color: PxColor, phase: number): void {
    for (let i = 0; i < width; i += 1) if (((i + phase) >> 1) % 2 === 0) { this.px(x + i, y, color); this.px(x + width - 1 - i, y + height - 1, color); }
    for (let j = 0; j < height; j += 1) if (((j + phase) >> 1) % 2 === 0) { this.px(x + width - 1, y + j, color); this.px(x, y + height - 1 - j, color); }
  }

  shade(x: number, y: number, width: number, height: number, map: PxMap): void {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const color = this.at(x + column, y + row);
        if (color !== null && map[color] !== undefined) this.px(x + column, y + row, map[color]!);
      }
    }
  }

  /** A dithered pool of light: full inside 0.65 of the radius, a checkerboard to the radius. */
  glow(centerX: number, centerY: number, radius: number, map: PxMap): void {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius * 2; x <= centerX + radius * 2; x += 1) {
        const distance = Math.sqrt(((x - centerX) / 2) ** 2 + (y - centerY) ** 2) / radius;
        if (distance > 1 || (distance > 0.65 && (x + y) % 2 !== 0)) continue;
        const color = this.at(x, y);
        if (color !== null && map[color] !== undefined) this.px(x, y, map[color]!);
      }
    }
  }

  sprite(rows: Sprite, x: number, y: number, palette: SpritePalette): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i += 1) {
        const color = palette[row[i]!];
        if (row[i] !== '.' && color !== undefined) this.px(x + i, y + j, color);
      }
    });
  }

  text(text: string, x: number, y: number, color: PxColor): void {
    let cursor = x;
    for (const char of text.toUpperCase()) {
      const bits = glyph(char);
      const width = bits.length / 5;
      for (let bit = 0; bit < bits.length; bit += 1) if (bits[bit] === '1') this.px(cursor + (bit % width), y + Math.floor(bit / width), color);
      cursor += width + 1;
    }
  }

  paths(): readonly ScenePath[] {
    const runs = new Map<number, string[]>();
    for (let y = 0; y < this.height; y += 1) {
      let x = 0;
      while (x < this.width) {
        const value = this.cells[y * this.width + x]!;
        if (value === 0) { x += 1; continue; }
        const start = x;
        while (x < this.width && this.cells[y * this.width + x] === value) x += 1;
        const run = `M${start} ${y}h${x - start}v1h-${x - start}z`;
        const list = runs.get(value);
        if (list === undefined) runs.set(value, [run]); else list.push(run);
      }
    }
    return [...runs].map(([value, list]) => ({ d: list.join(''), color: PX_COLORS[value - 1]! }));
  }
}

const shadow = (fb: FrameBuffer, x: number, y: number, width: number, height: number) => fb.shade(x + 2, y + 2, width, height, SHADE_DARK);

function badge(fb: FrameBuffer, agent: SceneAgent, x: number, y: number): void {
  const width = textWidth(agent.badge) + 4;
  const tag = agentTagColor(agent.kind);
  if (tag !== null) {
    fb.box(x, y, width, 7, tag);
    fb.text(agent.badge, x + 2, y + 1, 'paper');
  } else {
    fb.rect(x, y, width, 7, 'paper');
    fb.dashed(x, y, width, 7, 'slate', 0);
    fb.text(agent.badge, x + 2, y + 1, 'slate');
  }
}

function sign(fb: FrameBuffer, text: string, x: number, y: number, foreground: PxColor, background: PxColor): void {
  fb.box(x, y, textWidth(text) + 4, 9, background);
  fb.text(text, x + 2, y + 2, foreground);
}

type BubbleGlyph = 'dots' | 'x' | string;

function bubble(fb: FrameBuffer, x: number, y: number, mark: BubbleGlyph, color: PxColor, f: number): void {
  fb.box(x, y, 17, 11, 'paper');
  fb.px(x + 3, y + 11, 'ink'); fb.px(x + 4, y + 11, 'ink'); fb.px(x + 3, y + 12, 'ink');
  if (mark === 'dots') {
    for (let i = 0; i < 1 + (f % 3); i += 1) fb.rect(x + 4 + i * 4, y + 5, 2, 2, color);
  } else if (mark === 'x') {
    for (let k = 0; k < 5; k += 1) { fb.px(x + 6 + k, y + 3 + k, color); fb.px(x + 10 - k, y + 3 + k, color); fb.px(x + 7 + k, y + 3 + k, color); fb.px(x + 11 - k, y + 3 + k, color); }
  } else fb.text(mark, x + Math.floor((17 - textWidth(mark)) / 2), y + 3, color);
}

type Screen = 'coding' | 'ci_pending' | 'ci_failed' | 'stalled' | 'off';

function monitor(fb: FrameBuffer, x: number, y: number, screen: Screen, f: number, seed: number): void {
  fb.box(x, y, 20, 14, 'ink2');
  const sx = x + 2;
  const sy = y + 2;
  if (screen === 'coding') {
    fb.rect(sx, sy, 16, 10, 'screen');
    const lengths = [9, 5, 12, 7, 10, 4, 11, 6];
    for (let line = 0; line < 4; line += 1) {
      const width = lengths[(line + (f >> 1) + seed) % lengths.length]!;
      fb.hl(sx + 2 + (line % 2) * 2, sy + 1 + line * 2, width - (line % 2) * 2, line === 0 ? 'paper' : 'cloud');
    }
    if (f % 2 !== 0) fb.rect(sx + 13, sy + 7, 2, 2, 'paper');
    fb.px(sx, sy, 'paper');
  } else if (screen === 'ci_pending') {
    fb.rect(sx, sy, 16, 10, 'ink');
    fb.frame(sx + 2, sy + 4, 12, 3, 'mist');
    fb.hl(sx + 3, sy + 5, 1 + (f % 10), 'screen');
    fb.px(sx, sy, 'slate');
  } else if (screen === 'ci_failed') {
    fb.rect(sx, sy, 16, 10, f % 4 === 3 ? 'dangerDk' : 'danger');
    for (let k = 0; k < 6; k += 1) { fb.px(sx + 5 + k, sy + 2 + k, 'paper'); fb.px(sx + 10 - k, sy + 2 + k, 'paper'); }
    fb.px(sx, sy, 'paper');
  } else {
    fb.rect(sx, sy, 16, 10, 'ink');
    fb.px(sx + 1, sy + 1, 'slate'); fb.px(sx + 2, sy + 1, 'slate'); fb.px(sx + 1, sy + 2, 'slate');
    if (screen === 'stalled' && f % 4 < 2) fb.px(sx + 14, sy + 8, 'warn');
  }
  fb.rect(x + 8, y + 14, 4, 2, 'ink');
  fb.rect(x + 6, y + 16, 8, 1, 'ink');
}

function deskBody(fb: FrameBuffer, x: number, y: number, width: number): void {
  shadow(fb, x, y, width, 17);
  fb.box(x, y, width, 10, 'deskTop');
  fb.hl(x + 1, y + 1, width - 2, 'paper');
  fb.box(x, y + 9, width, 8, 'deskFr');
  fb.hl(x + 1, y + 15, width - 2, 'wood');
  fb.rect(x + Math.floor(width / 2) - 5, y + 11, 10, 1, 'wood');
}

function ciTower(fb: FrameBuffer, x: number, y: number, lamp: PxColor, f: number, blink: boolean): void {
  shadow(fb, x, y, 10, 26);
  fb.box(x, y, 10, 26, 'ink2');
  fb.text('CI', x + 2, y + 2, 'paper');
  fb.hl(x + 2, y + 9, 6, 'slate'); fb.hl(x + 2, y + 21, 6, 'slate'); fb.hl(x + 2, y + 23, 6, 'slate');
  const on = !blink || f % 2 === 0;
  fb.box(x + 2, y + 12, 6, 6, on ? lamp : 'ink');
  if (on) fb.px(x + 3, y + 13, 'paper');
}

function mug(fb: FrameBuffer, x: number, y: number, f: number): void {
  fb.box(x, y, 5, 5, 'paper');
  fb.px(x + 5, y + 2, 'ink'); fb.px(x + 1, y + 1, 'claudeDk');
  const puff = f % 3;
  fb.px(x + 1 + (puff === 1 ? 1 : 0), y - 2 - puff, 'cloud');
  fb.px(x + 3 - (puff === 2 ? 1 : 0), y - 4 + (puff === 0 ? 1 : 0), 'cloud');
}

function plant(fb: FrameBuffer, x: number, y: number, tall: boolean): void {
  const height = tall ? 22 : 12;
  shadow(fb, x + 2, y + height, 10, 9);
  for (let i = 0; i < height; i += 3) {
    const band = (i / 3) % 2;
    const spread = tall ? 3 + band * 3 : 4;
    fb.rect(x + 7 - spread, y + i, spread * 2 + 1, 3, band !== 0 ? 'okDk' : 'leaf');
    fb.px(x + 7 - spread, y + i, 'ink'); fb.px(x + 7 + spread, y + i, 'ink');
  }
  fb.px(x + 6, y - 1, 'leaf'); fb.px(x + 8, y - 1, 'leaf');
  fb.box(x + 2, y + height, 11, 9, 'claudeDk');
  fb.hl(x + 3, y + height + 1, 9, 'claude');
}

interface DeskCell {
  readonly kind: 'worker' | 'away' | 'empty' | 'roped';
  readonly screen: Screen;
  readonly agent?: SceneAgent;
  readonly outfit?: Outfit;
  readonly lamp?: PxColor;
  readonly blink?: boolean;
  readonly bubble?: BubbleGlyph;
  readonly bubbleColor?: PxColor;
  readonly seed?: number;
  readonly typing?: boolean;
  readonly mug?: boolean;
  readonly act?: 'sip' | 'panic' | 'cheer';
  readonly slump?: boolean;
  readonly dx?: number;
  readonly bob?: number;
}

function deskCell(fb: FrameBuffer, x: number, y: number, cell: DeskCell, f: number): void {
  if (cell.lamp !== undefined) ciTower(fb, x + 3, y + 6, cell.lamp, f, cell.blink === true);
  deskBody(fb, x + 14, y + 16, 52);
  monitor(fb, x + 30, y + 2, cell.screen, f, cell.seed ?? 0);
  fb.rect(x + 33, y + 20, 14, 2, 'mist');
  fb.hl(x + 33, y + 22, 14, 'slate');
  if (cell.mug === true) mug(fb, x + 19, y + 17, f);
  if (cell.kind === 'worker') {
    const agent = cell.agent!;
    const outfit = cell.outfit!;
    const body = agentBody(agent.kind, outfit);
    const palette = agentPalette(agent.kind, outfit);
    const dx = cell.dx ?? 0;
    const bob = cell.bob ?? 0;
    const acted: Pose = cell.act === 'sip' ? (f % 8 >= 5 ? 'backSip' : 'back')
      : cell.act === 'panic' ? (f % 2 !== 0 ? 'backUpA' : 'backUpB')
        : cell.act === 'cheer' ? (f % 4 < 2 ? 'backUpA' : 'back') : 'back';
    const rows = body.poses[cell.typing === true ? (f % 2 !== 0 ? 'backType' : 'back') : acted];
    const bodyX = x + 32 + body.dx;
    if (cell.slump === true) {
      fb.sprite(rows.slice(11), bodyX, y + 31, palette);
      fb.sprite(rows.slice(0, 11), bodyX, y + 23, palette);
    } else fb.sprite(rows, bodyX + dx, y + 20 + bob, palette);
    fb.sprite(CHAIR, x + 31, y + 33, CHAIR_PALETTE);
    badge(fb, agent, x + 46 + dx, y + 18 + body.topBack + bob);
  } else if (cell.kind === 'away') {
    fb.box(x + 50, y + 18, 9, 6, 'paper');
    fb.hl(x + 52, y + 20, 4, 'warnDk'); fb.px(x + 55, y + 19, 'warnDk'); fb.px(x + 55, y + 21, 'warnDk');
    fb.sprite(CHAIR, x + 40, y + 36, CHAIR_PALETTE);
  } else if (cell.kind === 'empty') {
    fb.sprite(CHAIR, x + 31, y + 30, CHAIR_PALETTE);
  } else {
    fb.rect(x + 27, y + 1, 26, 16, 'cloud'); fb.frame(x + 27, y + 1, 26, 16, 'ink');
    fb.rect(x + 13, y + 14, 54, 6, 'cloud'); fb.frame(x + 13, y + 14, 54, 6, 'ink');
    fb.hl(x + 28, y + 3, 20, 'paper'); fb.vl(x + 33, y + 4, 9, 'mist'); fb.vl(x + 45, y + 4, 9, 'mist');
    for (let r = 0; r < 54; r += 4) fb.px(x + 13 + r, y + 20, 'mist');
    fb.box(x + 10, y + 26, 3, 15, 'ink2'); fb.rect(x + 9, y + 25, 5, 2, 'warn');
    fb.box(x + 67, y + 26, 3, 15, 'ink2'); fb.rect(x + 66, y + 25, 5, 2, 'warn');
    for (let q = 0; q < 54; q += 1) fb.px(x + 13 + q, y + 29 + Math.round(3 * Math.sin(Math.PI * q / 54)), 'dangerDk');
  }
  if (cell.bubble !== undefined) bubble(fb, x + 52, y, cell.bubble, cell.bubbleColor!, f);
}

/** The door colour while a pull request waits. Only `off` waits for you, so only `off` has the boss behind the door. */
const DOOR_MARK: Readonly<Record<BoardAcceptanceMergeV1, PxColor>> = { off: 'accent', on: 'ok', unknown: 'warn' };

function door(fb: FrameBuffer, x: number, y: number, wait: BoardAcceptanceMergeV1 | null, peek: boolean, f: number): void {
  if (wait !== null) {
    const color = DOOR_MARK[wait];
    fb.frame(x - 2, y - 2, 36, 47, color); fb.frame(x - 1, y - 1, 34, 46, color);
    sign(fb, '!', x - 15, y + 1, 'ink', color);
  }
  fb.box(x, y, 32, 45, 'woodDk');
  const left = peek ? x + 10 : x + 3;
  const width = x + 29 - left;
  if (peek) {
    fb.rect(x + 3, y + 3, 8, 41, 'ink');
    fb.sprite(BOSS.worried[(f >> 1) % 2]!, x - 1, y + 19, BOSS_PALETTE);
    fb.rect(x, y + 19, 3, 25, 'woodDk');
  }
  fb.box(left, y + 3, width, 42, 'wood');
  fb.frame(left + 3, y + 17, width - 6, 10, 'woodDk');
  fb.frame(left + 3, y + 30, width - 6, 11, 'woodDk');
  const plate = left + Math.floor((width - 19) / 2);
  fb.box(plate, y + 6, 19, 9, 'ink2');
  fb.text('MAIN', plate + 2, y + 8, 'paper');
  fb.rect(x + 24, y + 27, 2, 2, 'warn');
}

function cart(fb: FrameBuffer, x: number, y: number, filled: number): void {
  shadow(fb, x, y - 1, 62, 18);
  fb.vl(x + 62, y - 9, 10, 'ink');
  fb.hl(x + 60, y - 9, 4, 'ink');
  fb.box(x, y, 63, 15, 'cloud');
  fb.hl(x + 1, y + 1, 61, 'paper');
  fb.hl(x + 1, y + 13, 61, 'mist');
  for (let slot = 0; slot < 6; slot += 1) {
    const sx = x + 3 + slot * 10;
    if (slot < filled) {
      fb.box(sx, y + 3, 8, 8, 'ok');
      fb.px(sx + 1, y + 4, 'paper'); fb.hl(sx + 1, y + 9, 6, 'okDk'); fb.vl(sx + 3, y + 4, 5, 'okDk');
    } else fb.dashed(sx, y + 3, 8, 8, 'slate', 0);
  }
  fb.box(x + 5, y + 15, 6, 6, 'ink2');
  fb.box(x + 52, y + 15, 6, 6, 'ink2');
}

function queuer(fb: FrameBuffer, x: number, y: number, agent: SceneAgent, ticket: string, f: number, dx: number, bob: number, outfit: Outfit, pose: FrontPose | null): void {
  fb.shade(x + 2, y + 23, 13, 2, SHADE_DARK);
  const body = agentBody(agent.kind, outfit);
  fb.sprite(body.poses[pose ?? (f % 2 !== 0 ? 'step' : 'front')], x + dx + body.dx, y + bob, agentPalette(agent.kind, outfit));
  badge(fb, agent, x + 12 + dx, y + body.top + bob);
  sign(fb, ticket, x + 8 - Math.floor((textWidth(ticket) + 4) / 2), y + body.top - 10 - body.hat + bob, 'ink', 'paper');
}

/** The desk states of a seat: the screen, the CI lamp, the bubble and the seated action. */
function deskLook(state: DeskState): Pick<DeskCell, 'screen' | 'lamp' | 'blink' | 'bubble' | 'bubbleColor'> {
  switch (state) {
    case 'coding': return { screen: 'coding', bubble: 'dots', bubbleColor: 'codex' };
    case 'ci_pending': return { screen: 'ci_pending', lamp: 'screen', bubble: 'CI', bubbleColor: 'codexDk' };
    case 'ci_failed': return { screen: 'ci_failed', lamp: 'danger', blink: true, bubble: 'x', bubbleColor: 'danger' };
    case 'no_claim_status': return { screen: 'stalled', bubble: 'ZZ', bubbleColor: 'warnDk' };
    case 'unknown': return { screen: 'off', bubble: '?', bubbleColor: 'slate' };
    default: return { screen: 'off' };
  }
}

/** One desk state on its own small grid, for the legend. */
export function deskVignette(state: DeskState | 'empty', agent: SceneAgent, f: number): { readonly width: number; readonly height: number; readonly paths: readonly ScenePath[] } {
  const fb = new FrameBuffer(80, 46);
  for (let row = 0; row < 8; row += 1) fb.rect(0, row * 6, 80, 6, row % 2 !== 0 ? 'floorB' : 'floorA');
  deskCell(fb, 0, 0, seatedCell(state, agent, 'cap', 0, f, null), f);
  return { width: 80, height: 46, paths: fb.paths() };
}

function seatedCell(state: DeskState | 'empty', agent: SceneAgent, outfit: Outfit, index: number, f: number, effect: BossEffect | null): DeskCell {
  if (state === 'empty') return { kind: 'empty', screen: 'off' };
  if (state === 'acceptance_queue') return { kind: 'away', screen: 'off' };
  const frame = f + index * 3;
  const rage = effect === 'rage';
  const carrot = effect === 'carrot';
  const cell: DeskCell = {
    ...deskLook(state), kind: 'worker', agent, outfit, seed: index, typing: state === 'coding' || rage, mug: state === 'coding',
    slump: state === 'no_claim_status' && !rage && !carrot,
    ...(carrot ? { act: 'cheer' as const } : state === 'ci_pending' ? { act: 'sip' as const } : state === 'ci_failed' ? { act: 'panic' as const } : {}),
  };
  if (rage) return { ...cell, dx: frame % 2 !== 0 ? 1 : -1, bubble: '!!', bubbleColor: 'danger' };
  if (carrot) return { ...cell, bob: frame % 4 < 2 ? -3 : 0, bubble: '+1', bubbleColor: 'woodDk' };
  if (state === 'ci_failed') return { ...cell, dx: frame % 4 === 0 ? 1 : (frame % 4 === 2 ? -1 : 0) };
  if (state === 'ci_pending') return { ...cell, dx: frame % 8 < 4 ? 1 : 0 };
  return cell;
}

/** A front sprite with its badge on a 26x26 grid, for the side panel. */
export function agentPortrait(agent: SceneAgent, outfit: Outfit, f: number): readonly ScenePath[] {
  const fb = new FrameBuffer(26, 26);
  const body = agentBody(agent.kind, outfit);
  const y = 2 - Math.floor((body.top - 1) / 2);
  fb.sprite(body.poses[f % 16 === 0 ? 'blink' : 'front'], 2 + body.dx, y, agentPalette(agent.kind, outfit));
  badge(fb, agent, 14, y + body.top - 2);
  return fb.paths();
}

export function bossPortrait(pose: BossPose, f: number): readonly ScenePath[] {
  const fb = new FrameBuffer(16, 22);
  fb.sprite(BOSS[pose][f % 2]!, 0, 0, BOSS_PALETTE);
  return fb.paths();
}

/** The 4x8 world: 4 desks per row. */
const DESK_COLUMNS = 4;
const DESK_X = [0, 80, 160, 240] as const;
const DESK_TOP = 136;
const DESK_ROW = 52;
const BASE_HEIGHT = 240;
const QUEUE_X = [160, 136, 112] as const;
const DESK_OUTFITS: readonly Outfit[] = ['cap', 'beanie', 'crown', 'scarf', 'plain', 'cap', 'beanie', 'crown'];
const QUEUE_OUTFITS: readonly Outfit[] = ['bowtie', 'beanie', 'plain'];
const STAGE_OUTFIT = { orchestrator: 'headset', advisor: 'glasses' } as const;
/** The whiteboard shows at most 8 issue numbers: two lines of 4. */
const BOARD_LINE = 4;
/** The sign is 80 grid px at most, so a long name stops before the window. */
const SIGN_MAX_CHARS = 18;

export const deskOutfit = (index: number): Outfit => DESK_OUTFITS[index % DESK_OUTFITS.length]!;
export const queueOutfit = (index: number): Outfit => QUEUE_OUTFITS[index % QUEUE_OUTFITS.length]!;
export const stageOutfit = (seat: keyof typeof STAGE_OUTFIT): Outfit => STAGE_OUTFIT[seat];

/** How long the room plays a boss command after the server accepted it (the mockup value). */
export const BOSS_EFFECT_MS = 15_000;

export type BossEffect = AdvisorBossCommand;

export interface SceneDesk {
  readonly key: string;
  readonly agent: SceneAgent;
  readonly state: DeskState;
  readonly number: string;
  readonly label: string;
}

export interface SceneQueueEntry {
  readonly key: string;
  readonly agent: SceneAgent;
  readonly pr: number;
}

/** Stands the actor at its action spot: inside the act of every command, with the 排雷 sweep done. */
const BOSS_STILL_MS = 12000;

/** The effect of a scene frame. Reduced motion keeps the effect and its 15 seconds, without the walk. */
export function sceneEffect(effect: { readonly command: BossEffect; readonly at: number } | null, now: number, still: boolean): SceneView['effect'] {
  if (effect === null || now - effect.at >= BOSS_EFFECT_MS) return null;
  return { command: effect.command, elapsedMs: still ? BOSS_STILL_MS : now - effect.at };
}

export interface SceneRoom {
  readonly name: string;
  readonly parent: number | null;
  /** Occupancy only. False when the repository has no live seat: the night palette, the lamp lit. */
  readonly lit: boolean;
  readonly orchestrator: SceneAgent | null;
  readonly advisor: SceneAgent | null;
  readonly plan: { readonly revision: number | null; readonly order: readonly number[]; readonly limit: number; readonly batch: number } | null;
  /** The worker limit that sets the free and the roped desks. */
  readonly limit: number;
  readonly desks: readonly SceneDesk[];
  readonly queue: readonly SceneQueueEntry[];
  readonly cart: number;
  readonly tray: number;
  /** The merge policy of the door while a pull request waits; null when none waits. */
  readonly mergeWait: BoardAcceptanceMergeV1 | null;
  /** Desks that an R2 or R3 finding names, by desk key. */
  readonly mines: ReadonlyMap<string, string>;
  readonly text: {
    readonly noParent: string;
    readonly orchestrator: string;
    readonly advisor: string;
    readonly tray: string;
    readonly cart: string;
    readonly queue: string;
    readonly seat: (index: number) => string;
    readonly free: string;
    readonly roped: string;
    readonly mine: (rule: string) => string;
    readonly say: (command: BossEffect) => string;
  };
}

export interface SceneView {
  readonly frame: number;
  readonly night: boolean;
  readonly advisorBusy: boolean;
  /** The accepted command and the time since the answer; null when none plays. */
  readonly effect: { readonly command: BossEffect; readonly elapsedMs: number } | null;
}

export type SceneTone = 'info' | 'danger' | 'warn' | 'subtle' | 'ok';

export interface SceneLabel {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly text: string;
  readonly kind: 'plain' | 'plaque' | 'paper';
}

export interface SceneDeskLabel {
  readonly x: number;
  readonly y: number;
  readonly number: string;
  readonly text: string;
  readonly tone: SceneTone;
  readonly dim: boolean;
}

export interface SceneHit {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SceneTag {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly tone: 'mine' | 'speech';
}

export interface ComposedScene {
  readonly width: number;
  readonly height: number;
  readonly paths: readonly ScenePath[];
  readonly labels: readonly SceneLabel[];
  readonly deskLabels: readonly SceneDeskLabel[];
  readonly hits: readonly SceneHit[];
  readonly tags: readonly SceneTag[];
}

const STATE_TONE: Readonly<Record<DeskState, SceneTone>> = {
  coding: 'info', ci_pending: 'info', ci_failed: 'danger', no_claim_status: 'warn', acceptance_queue: 'subtle', idle: 'subtle', unknown: 'subtle',
};

interface BossActor {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly sprite: BossPose;
  readonly frame: number;
  readonly acting: boolean;
  /** The furthest desk row x the mine walk has reached; null outside that walk. */
  readonly mineSeen: number | null;
}

const BOSS_ACTION: Readonly<Record<BossEffect, BossPose>> = { rage: 'stick', carrot: 'happy', mine: 'inspect', valve: 'valve' };

/** The boss walks from the door to the stage, or along the desk row for 排雷, acts and walks back. */
function bossActor(command: BossEffect, elapsedMs: number, frame: number): BossActor {
  const entry = { x: 288, y: 24 };
  const spot = { x: 228, y: 64 };
  const mine = command === 'mine';
  const path = mine ? [entry, { x: 296, y: 110 }, { x: 4, y: 110 }, { x: 4, y: 110 }, entry] : [entry, spot, spot, spot, entry];
  const cuts = mine ? [0, 2500, 11500, 12500, 15000] : [0, 2500, 7500, 12500, 15000];
  let segment = 0;
  while (segment < 3 && elapsedMs >= cuts[segment + 1]!) segment += 1;
  const progress = Math.min(1, (elapsedMs - cuts[segment]!) / (cuts[segment + 1]! - cuts[segment]!));
  const from = path[segment]!;
  const to = path[segment + 1]!;
  const x = Math.round(from.x + (to.x - from.x) * progress);
  const y = Math.round(from.y + (to.y - from.y) * progress);
  const walking = mine ? segment !== 1 && segment !== 2 : segment === 0 || segment === 3;
  const move: readonly [number, number] = walking ? [0, frame % 2 !== 0 ? -1 : 0]
    : command === 'rage' ? [frame % 2 !== 0 ? 1 : -1, (frame >> 1) % 2 !== 0 ? 1 : -2]
      : command === 'carrot' ? [0, frame % 4 < 2 ? -3 : 0]
        : command === 'mine' ? [0, frame % 2 !== 0 ? -1 : 0]
          : [frame % 4 < 2 ? 1 : -1, 0];
  return {
    x, y, dx: move[0], dy: move[1], sprite: walking ? 'walk' : BOSS_ACTION[command], frame: command === 'carrot' || walking ? frame : frame >> 1,
    acting: !walking, mineSeen: mine ? (segment === 0 ? 9999 : segment === 1 ? x : null) : null,
  };
}

function wall(fb: FrameBuffer, room: SceneRoom, night: boolean, f: number, height: number, slots: readonly number[], labels: SceneLabel[], hits: SceneHit[], valve: boolean): void {
  fb.rect(0, 0, 320, 40, 'wall');
  for (let x = 8; x < 320; x += 16) for (let y = 4; y < 38; y += 4) fb.px(x + ((y >> 2) % 2) * 8, y, 'wallSh');
  fb.hl(0, 0, 320, 'wallSh');
  fb.rect(0, 37, 320, 3, 'wallSh');
  fb.rect(0, 40, 320, 8, 'wood');
  fb.hl(0, 40, 320, 'deskFr');
  fb.hl(0, 47, 320, 'woodDk');
  for (let x = 10; x < 320; x += 20) fb.vl(x, 42, 4, 'woodDk');
  for (let row = 0; row * 6 + 48 < height; row += 1) {
    const y = 48 + row * 6;
    fb.rect(0, y, 320, 6, row % 2 !== 0 ? 'floorB' : 'floorA');
    fb.hl(0, y, 320, 'floorSh');
    for (let x = (row * 17) % 40; x < 320; x += 40) fb.vl(x, y, 6, 'floorSh');
  }
  if (!night) {
    for (let y = 48; y < 112; y += 1) fb.shade(86 + Math.round((y - 48) * 0.7), y, 50, 1, SHADE_SUN);
  } else {
    fb.glow(288, 132, 22, SHADE_LIGHT);
    for (const index of slots) fb.glow(DESK_X[index % DESK_COLUMNS]! + 40, DESK_TOP + Math.floor(index / DESK_COLUMNS) * DESK_ROW + 30, 13, SHADE_LIGHT);
  }

  const name = room.name.slice(0, SIGN_MAX_CHARS).toUpperCase();
  const signWidth = Math.max(52, textWidth(name) + 10);
  fb.box(5, 5, signWidth, 21, 'ink', 'woodDk');
  fb.frame(6, 6, signWidth - 2, 19, 'woodDk');
  fb.text(name, 10, 10, 'paper');
  fb.text(room.parent === null ? '-' : `#${room.parent}`, 10, 17, 'accent');

  const window = Math.max(84, 5 + signWidth + 8);
  fb.box(window, 5, 48, 30, 'sky', 'woodDk');
  fb.frame(window + 1, 6, 46, 28, 'wood');
  if (!night) {
    fb.rect(window + 6, 12, 10, 3, 'paper'); fb.rect(window + 9, 10, 5, 2, 'paper'); fb.rect(window + 28, 22, 12, 3, 'cloud'); fb.rect(window + 31, 20, 6, 2, 'cloud');
    for (let g = 0; g < 6; g += 1) { fb.px(window + 4 + g, 30 - g, 'paper'); fb.px(window + 34 + g, 14 - g, 'paper'); }
  } else {
    fb.rect(window + 33, 9, 4, 7, 'paper'); fb.rect(window + 32, 10, 6, 5, 'paper'); fb.rect(window + 35, 8, 4, 6, 'sky'); fb.rect(window + 34, 9, 6, 4, 'sky');
    fb.px(window + 8, 12, 'paper'); fb.px(window + 18, 24, 'cloud'); fb.px(window + 40, 26, 'cloud');
  }
  fb.vl(window + 23, 6, 28, 'wood'); fb.vl(window + 24, 6, 28, 'woodDk'); fb.hl(window + 1, 19, 46, 'wood');
  fb.box(window - 2, 34, 52, 4, 'deskFr');

  const clock = window + 56;
  fb.box(clock, 8, 12, 12, 'paper');
  fb.px(clock, 8, 'wall'); fb.px(clock + 11, 8, 'wall'); fb.px(clock, 19, 'wall'); fb.px(clock + 11, 19, 'wall');
  fb.vl(clock + 5, 11, 4, 'ink');
  const hand = ([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const)[(f >> 3) % 8]!;
  fb.px(clock + 5 + hand[0], 14 + hand[1], 'danger');
  fb.px(clock + 5 + hand[0] * 2, 14 + hand[1] * 2, 'danger');

  // The whiteboard: the plan of the active parent. The advisor owns a new seat limit, so 收放 asks instead of showing a number.
  const plan = room.plan;
  const lines = plan !== null
    ? [plan.revision === null ? 'PLAN' : `PLAN R${plan.revision}`, plan.order.slice(0, BOARD_LINE).join(' '), plan.order.slice(BOARD_LINE, BOARD_LINE * 2).join(' '), valve ? 'SEATS ?' : `SEATS ${plan.limit} · BATCH ${plan.batch}`]
    : [room.parent === null ? '' : 'NO PLAN', '', '', ''];
  fb.box(160, 3, 92, 34, 'paper');
  fb.frame(161, 4, 90, 32, 'mist');
  fb.text(lines[0]!, 165, 7, 'ink');
  fb.hl(165, 13, textWidth(lines[0]!), 'accent');
  fb.text(lines[1]!, 165, 16, 'ink');
  fb.text(lines[2]!, 165, 22, 'ink');
  fb.text(lines[3]!, 165, 29, 'slate');
  fb.hl(170, 37, 72, 'slate');
  fb.rect(176, 36, 4, 1, 'danger');
  fb.rect(184, 36, 4, 1, 'codex');
  hits.push({ key: 'board', x: 160, y: 3, width: 92, height: 34 });
  if (room.parent === null) labels.push({ x: 160, y: 13, width: 92, text: room.text.noParent, kind: 'paper' });

  fb.box(256, 20, 20, 3, 'wood');
  ([['slate', 9], ['claudeDk', 8], ['mist', 10], ['woodDk', 7], ['okDk', 9]] as const).forEach(([color, tall], index) => fb.box(258 + index * 3, 20 - tall, 3, tall, color));
}

function stage(fb: FrameBuffer, room: SceneRoom, view: SceneView, labels: SceneLabel[], hits: SceneHit[]): void {
  const f = view.frame;
  const rage = view.effect?.command === 'rage';
  const carrot = view.effect?.command === 'carrot';
  shadow(fb, 88, 49, 150, 48);
  fb.box(88, 49, 150, 40, 'mist');
  fb.frame(90, 51, 146, 36, 'cloud');
  for (let y = 55; y < 85; y += 6) for (let x = 96 + ((y >> 1) % 2) * 6; x < 232; x += 12) fb.px(x, y, 'slate');
  fb.box(88, 88, 150, 9, 'wood');
  fb.hl(89, 89, 148, 'deskFr');
  const seats = [
    { seat: 'orchestrator', who: room.orchestrator, x: 112, phase: 0, busy: rage },
    { seat: 'advisor', who: room.advisor, x: 196, phase: 5, busy: view.advisorBusy || view.effect !== null },
  ] as const;
  for (const { seat, who, x, phase, busy } of seats) {
    const frame = f + phase;
    if (who !== null) {
      const bob = rage ? (frame % 2 !== 0 ? 1 : -1) : carrot ? (frame % 4 < 2 ? -3 : 0) : (frame % 8 < 4 ? -1 : 0);
      const outfit = STAGE_OUTFIT[seat];
      const body = agentBody(who.kind, outfit);
      const top = 47 - body.top;
      const pose: FrontPose = rage ? (frame % 2 !== 0 ? 'panicA' : 'panicB')
        : carrot ? (frame % 4 < 2 ? 'cheerA' : 'cheerB')
          : busy ? (frame % 2 !== 0 ? 'think' : 'front')
            : frame % 24 >= 16 ? (frame % 24 < 20 ? 'sipA' : 'sipB') : (frame % 16 === 0 ? 'blink' : 'front');
      fb.sprite(body.poses[pose], x + body.dx + (rage ? (frame % 2 !== 0 ? 1 : -1) : 0), top + bob, agentPalette(who.kind, outfit));
      badge(fb, who, x + 12, top + body.top + bob);
    }
    deskBody(fb, x - 12, 64, 40);
    fb.box(x + 2, 58, 12, 8, 'ink2');
    fb.px(x + 8, 61, 'mist');
    if (who !== null && busy && frame % 2 !== 0) { fb.px(x + 1, 66, 'skin'); fb.px(x + 15, 66, 'skin'); }
    if (who !== null) hits.push({ key: seat, x: x - 4, y: 44, width: 24, height: 26 });
  }
  labels.push({ x: 100, y: 89, width: 40, text: room.text.orchestrator, kind: 'plaque' });
  labels.push({ x: 184, y: 89, width: 40, text: room.text.advisor, kind: 'plaque' });
}

function ambient(fb: FrameBuffer, room: SceneRoom, night: boolean): void {
  plant(fb, 2, 96, true);
  shadow(fb, 196, 108, 72, 22);
  fb.box(196, 108, 72, 22, 'wallSh');
  fb.frame(198, 110, 68, 18, 'claudeDk');
  fb.frame(200, 112, 64, 14, 'deskFr');
  for (let i = 0; i < 6; i += 1) {
    const x = 206 + i * 10;
    fb.px(x, 119, 'claudeDk'); fb.px(x - 1, 118, 'claudeDk'); fb.px(x + 1, 120, 'claudeDk'); fb.px(x + 1, 118, 'wood'); fb.px(x - 1, 120, 'wood');
  }
  for (let x = 197; x < 267; x += 3) { fb.px(x, 107, 'deskFr'); fb.px(x, 130, 'deskFr'); }
  shadow(fb, 280, 96, 14, 36);
  fb.vl(287, 104, 26, 'ink');
  fb.rect(283, 129, 9, 3, 'ink');
  const lamp = night || !room.lit;
  fb.box(280, 94, 15, 10, lamp ? 'warn' : 'paper');
  fb.hl(281, 95, 13, lamp ? 'paper' : 'cloud');
  plant(fb, 302, 104, false);
}

function effects(fb: FrameBuffer, command: BossEffect, actor: BossActor, f: number, height: number): void {
  if (command === 'rage') {
    const color: PxColor = f % 2 !== 0 ? 'danger' : 'dangerDk';
    for (let inset = 0; inset < 3; inset += 1) fb.frame(inset, inset, 320 - inset * 2, height - inset * 2, color);
    const hx = actor.x + 8;
    const hy = actor.y + 22;
    const radius = 6 + (f % 4) * 9;
    for (let a = 0; a < 48; a += 1) {
      const angle = a / 48 * Math.PI * 2;
      fb.px(Math.round(hx + Math.cos(angle) * radius * 1.6), Math.round(hy + Math.sin(angle) * radius * 0.6), a % 2 !== 0 ? 'woodDk' : 'danger');
    }
    fb.rect(hx - 9, hy - 4 - (f % 3) * 3, 2, 2, 'deskFr');
    fb.rect(hx + 8, hy - 6 - (f % 2) * 4, 2, 2, 'deskFr');
    sign(fb, 'BANG!', actor.x + 18 + (f % 2), actor.y - 2, 'accent', 'ink');
  } else if (command === 'carrot') {
    for (let c = 0; c < 9; c += 1) fb.sprite(CARROT, 14 + c * 35, ((f * 7 + c * 41) % (height + 30)) - 20, CARROT_PALETTE);
    sign(fb, 'PLAN+', 226, 36, 'claudeDk', 'paper');
  } else if (command === 'mine') {
    fb.dashed(1, 1, 318, height - 2, 'warn', f * 2);
    fb.dashed(2, 2, 316, height - 4, 'warn', f * 2);
    sign(fb, 'SCAN R2/R3', 226, 36, 'warnDk', 'paper');
  } else {
    fb.box(176, 41, 103, 6, 'slate');
    fb.hl(177, 42, 101, 'mist');
    for (let b = 0; b < 4; b += 1) fb.rect(178 + ((f * 6 + b * 25) % 98), 43, 3, 2, 'paper');
    sign(fb, 'SEATS ?', 236, 36, 'codexDk', 'paper');
  }
}

/** The room on the framebuffer, with the label, tag and hit layers in grid units. */
export function composeRoom(room: SceneRoom, view: SceneView): ComposedScene {
  const f = view.frame;
  const { night } = view;
  const effect = view.effect?.command ?? null;
  const slots = Math.ceil(Math.max(8, room.limit, room.desks.length) / DESK_COLUMNS) * DESK_COLUMNS;
  const rows = slots / DESK_COLUMNS;
  const height = BASE_HEIGHT + (rows - 2) * DESK_ROW;
  const fb = new FrameBuffer(320, height);
  const labels: SceneLabel[] = [];
  const deskLabels: SceneDeskLabel[] = [];
  const hits: SceneHit[] = [];
  const tags: SceneTag[] = [];
  const actor = view.effect === null ? null : bossActor(view.effect.command, view.effect.elapsedMs, f);

  const glowing = room.desks.flatMap((desk, index) => (desk.state === 'coding' || desk.state === 'ci_failed' ? [index] : []));
  wall(fb, room, night, f, height, glowing, labels, hits, effect === 'valve');

  door(fb, 281, 3, room.mergeWait, room.mergeWait === 'off' && effect === null, f);
  hits.push({ key: 'door', x: 279, y: 1, width: 36, height: 47 });

  deskBody(fb, 8, 62, 44);
  for (let paper = 0; paper < Math.min(room.tray, 3); paper += 1) {
    fb.box(14 + paper * 6, 60 - paper * 2, 14, 9, 'paper');
    fb.hl(16 + paper * 6, 62 - paper * 2, 8, 'mist');
  }
  labels.push({ x: 8, y: 81, text: room.text.tray, kind: 'plain' });
  hits.push({ key: 'tray', x: 6, y: 54, width: 48, height: 26 });

  stage(fb, room, view, labels, hits);

  cart(fb, 244, 63, room.cart);
  labels.push({ x: 244, y: 86, text: room.text.cart, kind: 'plain' });
  hits.push({ key: 'cart', x: 242, y: 52, width: 68, height: 33 });

  ambient(fb, room, night);

  fb.dashed(56, 102, 128, 32, 'warn', 0);
  fb.dashed(57, 103, 126, 30, 'warn', 0);
  labels.push({ x: 59, y: 105, text: room.text.queue, kind: 'plain' });
  // The zone hit comes first, so the entries it lists stay on top of it.
  const overflow = room.queue.length - QUEUE_X.length;
  if (overflow > 0) {
    labels.push({ x: 59, y: 122, text: `+${overflow}`, kind: 'plain' });
    hits.push({ key: 'queue', x: 56, y: 102, width: 128, height: 32 });
  }
  room.queue.slice(0, QUEUE_X.length).forEach((entry, index) => {
    const x = QUEUE_X[index]!;
    const frame = f + index;
    const rage = effect === 'rage';
    const carrot = effect === 'carrot';
    const pose: FrontPose | null = rage ? (frame % 2 !== 0 ? 'panicA' : 'panicB') : carrot ? (frame % 4 < 2 ? 'cheerA' : 'cheerB') : frame % 12 >= 8 ? (frame % 2 !== 0 ? 'waveA' : 'waveB') : null;
    queuer(fb, x, 106, entry.agent, String(entry.pr), frame, rage ? (frame % 2 !== 0 ? 1 : -1) : 0, rage ? 0 : carrot ? (frame % 4 < 2 ? -3 : 0) : (frame % 2 !== 0 ? -1 : 0), queueOutfit(index), pose);
    hits.push({ key: entry.key, x: x - 2, y: 96, width: 20, height: 35 });
  });

  for (let index = 0; index < slots; index += 1) {
    const desk = room.desks[index];
    const x = DESK_X[index % DESK_COLUMNS]!;
    const y = DESK_TOP + Math.floor(index / DESK_COLUMNS) * DESK_ROW;
    if (desk === undefined) {
      const roped = index >= room.limit;
      deskCell(fb, x, y, { kind: roped ? 'roped' : 'empty', screen: 'off' }, f + index);
      deskLabels.push({ x: x + 12, y: y + 44, number: room.text.seat(index), text: roped ? room.text.roped : room.text.free, tone: 'subtle', dim: roped });
      continue;
    }
    const cell = seatedCell(desk.state, desk.agent, deskOutfit(index), index, f, effect);
    deskCell(fb, x, y, cell, f + index);
    if (effect === 'rage' && cell.kind === 'worker') {
      for (let puff = 0; puff < 2; puff += 1) {
        const py = y + 30 - ((f + puff * 3) % 5) * 2;
        const px = puff !== 0 ? x + 50 : x + 27;
        fb.frame(px - 1, py - 1, 5, 4, 'cloud');
        fb.rect(px, py, 3, 2, 'paper');
      }
    }
    deskLabels.push({ x: x + 12, y: y + 44, number: desk.number, text: desk.label, tone: STATE_TONE[desk.state], dim: false });
    hits.push({ key: desk.key, x: x + 12, y, width: 58, height: 44 });
    const rule = effect === 'mine' ? room.mines.get(desk.key) : undefined;
    if (rule !== undefined && (actor!.mineSeen === null || actor!.mineSeen <= x + 40)) {
      const color: PxColor = f % 2 !== 0 ? 'warn' : 'warnDk';
      fb.frame(x + 8, y - 1, 66, 46, color);
      fb.frame(x + 9, y, 64, 44, color);
      tags.push({ x: x + 9, y: y + 1, text: room.text.mine(rule), tone: 'mine' });
    }
  }

  if (actor !== null && effect !== null) {
    fb.shade(actor.x + 2, actor.y + 20, 13, 2, SHADE_DARK);
    fb.sprite(BOSS[actor.sprite][actor.frame % 2]!, actor.x + actor.dx, actor.y + actor.dy, BOSS_PALETTE);
    const say = room.text.say(effect);
    if (actor.acting && say !== '') tags.push({ x: actor.x + 14, y: actor.y - 6, text: say, tone: 'speech' });
    effects(fb, effect, actor, f, height);
  }
  return { width: 320, height, paths: fb.paths(), labels, deskLabels, hits, tags };
}

export interface SceneMiniRoom {
  readonly orchestrator: SceneAgent | null;
  readonly advisor: SceneAgent | null;
  readonly plan: boolean;
  readonly needsYou: boolean;
  readonly desks: readonly { readonly agent: SceneAgent; readonly state: DeskState }[];
  /** The worker limit that sets the roped desks; null when no summary sent one. */
  readonly limit: number | null;
  /** The queue count; the summary names no agent, so each figure is an unknown agent. */
  readonly queue: number;
  /** The accepted members of the current batch. */
  readonly cart: number;
  readonly idle: boolean;
}

const MINI_WIDTH = 112;
const MINI_HEIGHT = 72;
const MINI_DESK_X = [2, 30, 58, 86] as const;
const MINI_DESK_Y = [42, 57] as const;
const MINI_DESKS = MINI_DESK_X.length * MINI_DESK_Y.length;
const MINI_QUEUE = 4;
const MINI_SOCKETS = 6;
const MINI_SCREEN: Partial<Readonly<Record<DeskState, PxColor>>> = { coding: 'screen', ci_failed: 'danger' };
const MINI_LAMP: Partial<Readonly<Record<DeskState, PxColor>>> = { ci_pending: 'screen', ci_failed: 'danger' };
const MINI_DIM: PxMap = { floorA: 'floorSh', floorB: 'floorSh', wall: 'wallSh', wood: 'woodDk', deskTop: 'deskFr', deskFr: 'wood', mist: 'slate', cloud: 'mist', paper: 'cloud', slate: 'ink2' };

function miniLead(fb: FrameBuffer, agent: SceneAgent | null, x: number, f: number): void {
  if (agent !== null) fb.sprite(miniAgent(agent.kind, 'front'), x, 13 + (f % 6 < 3 ? -1 : 0), agentPalette(agent.kind, 'plain'));
  fb.box(x - 2, 20, 11, 4, 'deskTop');
}

function miniDesk(fb: FrameBuffer, desk: SceneMiniRoom['desks'][number] | undefined, index: number, limit: number | null, f: number): void {
  const x = MINI_DESK_X[index % MINI_DESK_X.length]!;
  const y = MINI_DESK_Y[index < MINI_DESK_X.length ? 0 : 1]!;
  const state = desk?.state;
  const coding = state === 'coding';
  const failed = state === 'ci_failed';
  const away = state === 'acceptance_queue';
  const roped = desk === undefined && limit !== null && index >= limit;
  const lamp = state === undefined ? undefined : MINI_LAMP[state];
  if (lamp !== undefined) {
    fb.box(x + 1, y + 1, 4, 8, 'ink2');
    fb.px(x + 2, y + 3, !failed || f % 2 !== 0 ? lamp : 'ink');
  }
  shadow(fb, x + 5, y + 6, 20, 6);
  fb.box(x + 10, y, 9, 7, 'ink2');
  fb.rect(x + 11, y + 1, 7, 4, (state === undefined ? undefined : MINI_SCREEN[state]) ?? 'ink');
  if (coding) fb.hl(x + 12, y + 2, 2 + (f + index) % 4, 'paper');
  fb.box(x + 5, y + 6, 20, 4, 'deskTop');
  fb.box(x + 5, y + 9, 20, 3, 'deskFr');
  if (desk !== undefined && !away) {
    const dx = failed ? ((f + index) % 2 !== 0 ? 1 : -1) : 0;
    fb.sprite(miniAgent(desk.agent.kind, 'back'), x + 11 + dx, y + 8 + (coding && (f + index) % 2 !== 0 ? -1 : 0), agentPalette(desk.agent.kind, 'plain'));
    if (state === 'no_claim_status') fb.text('Z', x + 20, y - 1 + ((f >> 1) % 2), 'warnDk');
  } else if (!roped) fb.box(x + 11, y + 11, 7, 3, 'slate');
  if (away) fb.box(x + 19, y + 4, 4, 3, 'paper');
  if (roped) {
    fb.rect(x + 9, y, 11, 8, 'cloud'); fb.frame(x + 9, y, 11, 8, 'mist');
    fb.rect(x + 4, y + 6, 22, 4, 'cloud'); fb.frame(x + 4, y + 6, 22, 4, 'mist');
    fb.vl(x + 3, y + 9, 5, 'ink2'); fb.vl(x + 26, y + 9, 5, 'ink2');
    fb.hl(x + 4, y + 11, 22, 'dangerDk');
  }
}

/** One repository as a mini room on a 112x72 grid, after the overview page of the S0 mockup. */
export function composeMiniRoom(room: SceneMiniRoom, { frame: f, night }: Pick<SceneView, 'frame' | 'night'>): readonly ScenePath[] {
  const fb = new FrameBuffer(MINI_WIDTH, MINI_HEIGHT);
  fb.rect(0, 0, MINI_WIDTH, 12, 'wall');
  fb.hl(0, 0, MINI_WIDTH, 'wallSh');
  fb.rect(0, 12, MINI_WIDTH, 3, 'wood');
  fb.hl(0, 14, MINI_WIDTH, 'woodDk');
  for (let row = 0; row * 4 + 15 < MINI_HEIGHT; row += 1) {
    const y = 15 + row * 4;
    fb.rect(0, y, MINI_WIDTH, 4, row % 2 !== 0 ? 'floorB' : 'floorA');
    fb.hl(0, y, MINI_WIDTH, 'floorSh');
    for (let x = (row * 11) % 24; x < MINI_WIDTH; x += 24) fb.vl(x, y, 4, 'floorSh');
  }
  if (night) fb.glow(104, 50, 10, SHADE_LIGHT);
  fb.box(5, 2, 14, 9, 'sky', 'woodDk');
  fb.vl(11, 3, 7, 'wood');
  fb.hl(6, 6, 12, 'wood');
  if (night) fb.px(15, 4, 'paper'); else fb.px(7, 9, 'paper');
  if (room.plan) { fb.box(42, 1, 28, 10, 'paper'); fb.hl(45, 4, 14, 'ink'); fb.hl(45, 7, 19, 'slate'); }
  if (room.needsYou) { fb.frame(94, 0, 16, 15, 'accent'); fb.box(86, 1, 5, 7, 'accent'); fb.vl(88, 2, 3, 'ink'); fb.px(88, 6, 'ink'); }
  fb.box(96, 1, 12, 14, 'wood');
  fb.box(98, 3, 8, 3, 'ink2', 'ink2');
  fb.px(105, 9, 'warn');
  shadow(fb, 32, 16, 48, 12);
  fb.box(32, 16, 48, 10, 'mist');
  fb.box(32, 25, 48, 3, 'wood');
  miniLead(fb, room.orchestrator, 42, f);
  miniLead(fb, room.advisor, 63, f + 3);
  fb.dashed(20, 29, 44, 12, 'warn', 0);
  for (let index = 0; index < Math.min(room.queue, MINI_QUEUE); index += 1) fb.sprite(miniAgent('unknown', 'front'), 52 - index * 10, 31 + ((f + index) % 2 !== 0 ? -1 : 0), agentPalette('unknown', 'plain'));
  fb.box(78, 31, 30, 8, 'cloud');
  for (let socket = 0; socket < MINI_SOCKETS; socket += 1) {
    if (socket < room.cart) fb.box(80 + socket * 4, 33, 4, 4, 'ok');
    else fb.px(81 + socket * 4, 34, 'slate');
  }
  fb.px(81, 39, 'ink'); fb.px(104, 39, 'ink');
  fb.box(102, 40, 7, 4, night ? 'warn' : 'paper');
  fb.vl(105, 44, 6, 'ink');
  for (let index = 0; index < MINI_DESKS; index += 1) miniDesk(fb, room.desks[index], index, room.limit, f);
  if (room.idle) {
    fb.shade(0, 0, MINI_WIDTH, MINI_HEIGHT, MINI_DIM);
    fb.box(102, 40, 7, 4, 'warn');
  }
  return fb.paths();
}

import type { PointerPosition, PrizeType, Segment } from '../types.ts';

/** Weighted random pick. Returns the segment index. */
export function pickSegment(segments: Segment[], rand: () => number = Math.random): number {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total <= 0) return Math.floor(rand() * segments.length);
  let r = rand() * total;
  for (let i = 0; i < segments.length; i++) {
    r -= Math.max(0, segments[i].weight);
    if (r < 0) return i;
  }
  return segments.length - 1;
}

/** Where the pointer sits, as degrees clockwise from 12 o'clock. */
export function pointerAngle(position: PointerPosition): number {
  return position === 'right' ? 90 : position === 'bottom' ? 180 : 0;
}

/**
 * Rotation (degrees, clockwise) the wheel must end at so that segment `index` sits under the
 * pointer. Always moves forward from `current` by at least `minTurns` full turns.
 * A random offset inside the slice keeps it from always stopping dead-centre.
 */
export function targetRotation(
  current: number,
  index: number,
  count: number,
  minTurns = 6,
  pointerDeg = 0,
  rand: () => number = Math.random,
): number {
  const slice = 360 / count;
  const jitter = (rand() - 0.5) * slice * 0.7;
  const landingAngle = index * slice + slice / 2 + jitter; // angle on the wheel, clockwise from top
  const desired = (((pointerDeg - landingAngle) % 360) + 360) % 360; // rotation (mod 360) that puts it under the pointer
  const base = current - (((current % 360) + 360) % 360);
  let next = base + minTurns * 360 + desired;
  if (next - current < minTurns * 360) next += 360;
  return next;
}

/** Black or white, whichever reads better on `hex`. */
export function readableText(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#1d1d1d' : '#ffffff';
}

/** Palette names are shown in the admin. */
export const PALETTES: Record<string, string[]> = {
  Сонгодог: ['#e63946', '#1d3557', '#f4a261', '#2a9d8f', '#8338ec', '#457b9d', '#ffbe0b', '#264653'],
  Чихэр: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06d6a0', '#ef476f', '#118ab2'],
  Пастел: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'],
  Далай: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#023e8a', '#0096c7', '#48cae4', '#ade8f4'],
  Алтан: ['#1b1b1f', '#f5c542', '#2b2d42', '#e9c46a', '#3d405b', '#f4d35e', '#22223b', '#ffd166'],
  Ой: ['#2d6a4f', '#95d5b2', '#1b4332', '#b7e4c7', '#40916c', '#d8f3dc', '#081c15', '#74c69d'],
};

export function isWin(type: PrizeType): boolean {
  return type !== 'none';
}

/** 5000 → "5,000₮" (or "$5,000" when the currency goes first). */
export function formatMoney(value: number, currency: string, position: 'before' | 'after' = 'after'): string {
  const n = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return position === 'before' ? `${currency}${n}` : `${n}${currency}`;
}

/** Fits into "Та {prize} хожлоо" ("You won {prize}"). */
export function describePrize(
  seg: Pick<Segment, 'type' | 'value' | 'label'>,
  currency: string,
  position: 'before' | 'after' = 'after',
): string {
  switch (seg.type) {
    case 'percent':
      return `${seg.value}%-ийн хямдрал`;
    case 'fixed':
      return `${formatMoney(seg.value, currency, position)}-ийн хямдрал`;
    case 'free_shipping':
      return 'үнэгүй хүргэлт';
    case 'cash':
      return `${formatMoney(seg.value, currency, position)}-ийн мөнгөн шагнал`;
    default:
      return seg.label;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos

export function generateCode(prefix: string, length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return prefix ? `${prefix.toUpperCase()}-${body}` : body;
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function probabilities(segments: Segment[]): number[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  return segments.map((s) => (total > 0 ? Math.max(0, s.weight) / total : 1 / segments.length));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Mongolian style: 2026.11.20 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 2026.11.20 14:05 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


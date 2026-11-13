/**
 * Rules shared by the browser and the server. The browser uses them for instant feedback;
 * the server enforces them. Runtime imports use explicit .ts extensions so Node can run this file directly.
 */
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import type { Config, Design, PrizeType, PublicConfig, Segment, Settings, SpinInput } from '../types.ts';

/**
 * Mongolian numbers are 8 digits (mobile starts with 5–9). Accepts "9911 2233", "9911-2233",
 * "+976 99112233" or "97699112233" and returns "99112233", or null if it isn't a valid number.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 11 && digits.startsWith('976')) digits = digits.slice(3);
  return /^[5-9]\d{7}$/.test(digits) ? digits : null;
}

/** "99112233" → "9911-2233" for display. */
export function formatPhone(phone: string): string {
  return /^\d{8}$/.test(phone) ? `${phone.slice(0, 4)}-${phone.slice(4)}` : phone;
}

export function validateInput(input: SpinInput, settings: Settings, gdprChecked: boolean): string | null {
  if (settings.nameField === 'required' && !input.name.trim()) return 'Нэрээ оруулна уу.';
  if (input.name.length > 100) return 'Нэр хэт урт байна.';
  if (!input.phone.trim()) return 'Утасны дугаараа оруулна уу.';
  if (!normalizePhone(input.phone)) return 'Утасны дугаар 8 оронтой байх ёстой (жишээ нь 9911-2233).';
  if (settings.gdprEnabled && !gdprChecked) return 'Үргэлжлүүлэхийн тулд нөхцөлийг зөвшөөрнө үү.';
  return null;
}

/** Start of the current "spin day" when daily reset is on, e.g. today 00:00 (or yesterday if not reached yet). */
export function lastResetTime(resetTime: string, now = Date.now()): number {
  const [h, m] = resetTime.split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * Why this visitor can't spin right now, or null if they can.
 * `phoneSpins` are the timestamps (ms) of this number's earlier spins; `ipSpinsToday` counts spins from their IP in the last 24h.
 */
export function eligibilityError(phoneSpins: number[], ipSpinsToday: number, settings: Settings, now = Date.now()): string | null {
  const { spinsPerPhone, spinsPerIpPerDay, cooldownHours, resetSpinsDaily, resetTime } = settings;

  // Spin-count limit first: if they can never spin again, a "come back in X hours" message would mislead.
  const counted = resetSpinsDaily ? phoneSpins.filter((t) => t >= lastResetTime(resetTime, now)) : phoneSpins;
  if (spinsPerPhone > 0 && counted.length >= spinsPerPhone) {
    if (resetSpinsDaily) return 'Өнөөдрийн эргүүлэх эрхээ ашигласан байна. Маргааш дахин ирээрэй!';
    return spinsPerPhone === 1
      ? 'Энэ дугаараар аль хэдийн эргүүлсэн байна.'
      : `Энэ дугаар ${spinsPerPhone} удаа эргүүлэх эрхээ бүгдийг ашигласан байна.`;
  }

  if (cooldownHours > 0 && phoneSpins.length) {
    const waitMs = Math.max(...phoneSpins) + cooldownHours * 3_600_000 - now;
    if (waitMs > 0) {
      const totalMin = Math.ceil(waitMs / 60_000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      // Genitive ending goes on the last word: "24 цагийн", "2 цаг 30 минутын", "45 минутын".
      const wait = m ? `${h ? `${h} цаг ` : ''}${m} минутын` : `${h} цагийн`;
      return `Та ${wait} дараа дахин эргүүлэх боломжтой.`;
    }
  }

  if (spinsPerIpPerDay > 0 && ipSpinsToday >= spinsPerIpPerDay) {
    return 'Энэ төхөөрөмжөөс өнөөдөр хэт олон удаа эргүүлсэн байна. Маргааш дахин оролдоно уу.';
  }
  return null;
}

// ---------- config cleaning (anything saved through the admin API goes through this) ----------

const ENUMS: Record<string, readonly string[]> = {
  nameField: ['off', 'optional', 'required'],
  currencyPosition: ['before', 'after'],
  wheelStyle: ['full', 'half'],
  bgEffect: ['none', 'snow', 'stars', 'bubbles', 'hearts'],
  winEffect: ['none', 'confetti', 'fireworks', 'stars'],
  pointerPosition: ['top', 'right', 'bottom', 'center'],
};
const PRIZE_TYPES: readonly PrizeType[] = ['percent', 'fixed', 'free_shipping', 'cash', 'none'];
const HEX = /^#[0-9a-f]{6}$/i;
export const MAX_SLICES = 20;

/** Keeps only known keys whose value has the same type as the default (and a valid enum value). */
function cleanObject<T extends object>(defaults: T, raw: unknown): T {
  const out = { ...defaults };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const def = defaults[key];
    const val = src[key];
    if (typeof val !== typeof def) continue;
    if (typeof val === 'number' && !Number.isFinite(val)) continue;
    if (typeof val === 'string') {
      if (ENUMS[key] && !ENUMS[key].includes(val)) continue;
      if (typeof def === 'string' && HEX.test(def) && !HEX.test(val)) continue; // color fields
      out[key] = val.slice(0, key === 'customCss' ? 20_000 : 2_000) as T[typeof key];
      continue;
    }
    out[key] = val as T[typeof key];
  }
  return out;
}

function cleanSegments(raw: unknown): Segment[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_SLICES) return null;
  const seen = new Set<string>();
  const segs: Segment[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null;
    const s = r as Record<string, unknown>;
    let id = typeof s.id === 'string' && s.id ? s.id.slice(0, 64) : `s${segs.length + 1}`;
    if (seen.has(id)) id = `${id}-${segs.length}`;
    seen.add(id);
    const type = PRIZE_TYPES.includes(s.type as PrizeType) ? (s.type as PrizeType) : 'none';
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    segs.push({
      id,
      label: (typeof s.label === 'string' && s.label.trim() ? s.label.trim() : 'Шагнал').slice(0, 30),
      type,
      value: Math.max(0, type === 'percent' ? Math.min(100, num(s.value)) : num(s.value)),
      color: typeof s.color === 'string' && HEX.test(s.color) ? s.color : '#888888',
      textColor: typeof s.textColor === 'string' && HEX.test(s.textColor) ? s.textColor : '#ffffff',
      weight: Math.max(0, num(s.weight)),
    });
  }
  return segs;
}

/** Turns untrusted JSON into a valid Config, falling back to defaults field by field. */
export function sanitizeConfig(raw: unknown): Config {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    settings: cleanObject<Settings>(DEFAULT_CONFIG.settings, src.settings),
    design: cleanObject<Design>(DEFAULT_CONFIG.design, src.design),
    segments: cleanSegments(src.segments) ?? DEFAULT_CONFIG.segments,
  };
}

/** Strips the odds before sending the wheel to visitors. */
export function toPublicConfig(config: Config): PublicConfig {
  return { ...config, segments: config.segments.map(({ weight: _w, ...rest }) => rest) };
}

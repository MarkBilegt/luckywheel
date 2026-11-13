/**
 * Talks to the lucky wheel server (see /server). Prizes are picked and stored on the server;
 * the browser only shows the wheel and the admin screens.
 */
import type {
  Config,
  Contact,
  CouponStatus,
  PrizeType,
  PublicConfig,
  SpinInput,
  SpinRecord,
  SpinResult,
} from '../types';
import { formatPhone, normalizePhone, toPublicConfig } from './rules';
import { formatDate, formatDateTime, pickSegment } from './wheel';

export { validateInput } from './rules';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/login') {
      window.dispatchEvent(new Event('lw:unauthorized'));
    }
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'Алдаа гарлаа. Дахин оролдоно уу.');
  }
  return data as T;
}

// ---------- public ----------

export const fetchWheel = () => request<PublicConfig>('GET', '/api/wheel');

export const spin = (input: SpinInput, consent: boolean) =>
  request<SpinResult>('POST', '/api/spin', { ...input, consent });

/** Admin "test" spin against unsaved settings. Runs locally and is never stored. */
export async function previewSpin(config: Config, input: SpinInput): Promise<SpinResult> {
  const segmentIndex = pickSegment(config.segments);
  const seg = config.segments[segmentIndex];
  const won = seg.type !== 'none';
  const now = Date.now();
  return {
    segments: toPublicConfig(config).segments,
    segmentIndex,
    record: {
      id: 'preview',
      name: input.name.trim(),
      phone: normalizePhone(input.phone) ?? input.phone.trim(),
      segmentId: seg.id,
      label: seg.label,
      type: seg.type,
      value: seg.value,
      code: won ? 'PREVIEW-CODE' : null,
      expiresAt: won ? new Date(now + config.settings.couponValidDays * 86_400_000).toISOString() : null,
      at: new Date(now).toISOString(),
      redeemedAt: null,
    },
  };
}

// ---------- admin ----------

export interface Session {
  authenticated: boolean;
}

export const getSession = () => request<Session>('GET', '/api/admin/session');
export const login = (password: string) => request<Session>('POST', '/api/admin/login', { password });
export const logout = () => request<Session>('POST', '/api/admin/logout');

export const getConfig = () => request<Config>('GET', '/api/admin/config');
export const saveConfig = (config: Config) => request<Config>('PUT', '/api/admin/config', config);
export const resetConfig = () => request<Config>('POST', '/api/admin/config/reset');

export const getSpins = () => request<SpinRecord[]>('GET', '/api/admin/spins');
export const clearSpins = () => request<{ ok: true }>('DELETE', '/api/admin/spins');

export const getContacts = () => request<Contact[]>('GET', '/api/admin/contacts');
export const saveContact = (phone: string, contacted: boolean, note: string) =>
  request<Contact>('PUT', `/api/admin/contacts/${encodeURIComponent(phone)}`, { contacted, note });

export interface CouponLookup {
  status: CouponStatus;
  record: SpinRecord | null;
}
export const findCoupon = (code: string) =>
  request<CouponLookup>('GET', `/api/admin/coupons/${encodeURIComponent(code.trim().toUpperCase())}`);
export const redeemCoupon = (code: string) =>
  request<CouponLookup>('POST', `/api/admin/coupons/${encodeURIComponent(code.trim().toUpperCase())}/redeem`);

// ---------- subscribers & export (computed from the spin list) ----------

export interface Subscriber {
  phone: string;
  name: string;
  firstSeen: string;
  lastSpin: string;
  spins: number;
  lastLabel: string;
  lastCode: string | null;
}

export function subscribersFrom(spins: SpinRecord[]): Subscriber[] {
  const map = new Map<string, Subscriber>();
  // Oldest first so "last" fields end up as the newest values.
  for (const r of [...spins].sort((a, b) => a.at.localeCompare(b.at))) {
    const s = map.get(r.phone);
    if (!s) {
      map.set(r.phone, {
        phone: r.phone, name: r.name, firstSeen: r.at, lastSpin: r.at,
        spins: 1, lastLabel: r.label, lastCode: r.code,
      });
    } else {
      s.spins++;
      s.lastSpin = r.at;
      s.lastLabel = r.label;
      s.lastCode = r.code;
      s.name = r.name || s.name;
    }
  }
  return [...map.values()].sort((a, b) => b.lastSpin.localeCompare(a.lastSpin));
}

/** Inclusive local-date range filter. `from`/`to` are "YYYY-MM-DD" or empty. */
export function inRange(iso: string, from: string, to: string): boolean {
  const t = Date.parse(iso);
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

const CSV_HEADERS: Record<string, string> = {
  at: 'Огноо', name: 'Нэр', phone: 'Утас', label: 'Шагнал', type: 'Төрөл', value: 'Утга',
  code: 'Код', expiresAt: 'Дуусах хугацаа', redeemedAt: 'Ашигласан', firstSeen: 'Бүртгүүлсэн',
  lastSpin: 'Сүүлд эргүүлсэн', spins: 'Эргүүлэлт', lastLabel: 'Сүүлийн үр дүн', lastCode: 'Сүүлийн код',
  contacted: 'Холбогдсон', note: 'Тэмдэглэл',
};

function toCSV<T>(rows: T[], cols: (keyof T)[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Leading =,+,-,@ would run as a formula in Excel; prefix with ' to neutralise.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = cols.map((c) => esc(CSV_HEADERS[String(c)] ?? String(c))).join(',');
  // The BOM makes Excel open the file as UTF-8, so Cyrillic shows correctly.
  return '﻿' + [header, ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export const PRIZE_TYPE_LABELS: Record<PrizeType, string> = {
  percent: '% хямдрал',
  fixed: 'Тогтмол дүнгийн хямдрал',
  free_shipping: 'Үнэгүй хүргэлт',
  cash: 'Мөнгөн шагнал',
  none: 'Хожоогүй',
};

export function subscribersToCSV(subs: Subscriber[], contacts: Map<string, Contact>): string {
  const rows = subs.map((s) => ({
    ...s,
    phone: formatPhone(s.phone),
    firstSeen: formatDateTime(s.firstSeen),
    lastSpin: formatDateTime(s.lastSpin),
    contacted: contacts.get(s.phone)?.contacted ? 'Тийм' : 'Үгүй',
    note: contacts.get(s.phone)?.note ?? '',
  }));
  return toCSV(rows, ['name', 'phone', 'firstSeen', 'lastSpin', 'spins', 'lastLabel', 'lastCode', 'contacted', 'note']);
}

export function spinsToCSV(spins: SpinRecord[]): string {
  const rows = spins.map((s) => ({
    ...s,
    phone: formatPhone(s.phone),
    at: formatDateTime(s.at),
    type: PRIZE_TYPE_LABELS[s.type],
    expiresAt: s.expiresAt ? formatDate(s.expiresAt) : '',
    redeemedAt: s.redeemedAt ? formatDateTime(s.redeemedAt) : '',
  }));
  return toCSV(rows, ['at', 'name', 'phone', 'label', 'type', 'value', 'code', 'expiresAt', 'redeemedAt']);
}

export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type PrizeType = 'percent' | 'fixed' | 'free_shipping' | 'cash' | 'none';
export type FieldMode = 'off' | 'optional' | 'required';
export type PointerPosition = 'top' | 'right' | 'bottom' | 'center';
export type BgEffect = 'none' | 'snow' | 'stars' | 'bubbles' | 'hearts';
export type WinEffect = 'none' | 'confetti' | 'fireworks' | 'stars';

export interface Segment {
  id: string;
  label: string;
  type: PrizeType;
  /** Percent off, fixed amount off, or cash amount. Ignored for free_shipping / none. */
  value: number;
  color: string;
  textColor: string;
  /** Relative weight. Probability = weight / sum(weights). 0 = never lands. */
  weight: number;
}

export interface Settings {
  enabled: boolean;
  title: string;
  description: string;
  buttonText: string;
  winTitle: string;
  winMessage: string;
  loseTitle: string;
  loseMessage: string;
  currency: string;
  /** 'after' → 5,000₮, 'before' → $5 */
  currencyPosition: 'before' | 'after';
  couponPrefix: string;
  couponValidDays: number;

  // --- rules ---
  spinsPerPhone: number;
  /** Max spins from one IP address per day (stops people cycling made-up numbers). 0 = off. */
  spinsPerIpPerDay: number;
  /** Hours a visitor must wait between spins. 0 = no wait. */
  cooldownHours: number;
  /** Reset every phone number's spin count each day at resetTime. */
  resetSpinsDaily: boolean;
  /** "HH:MM", local time. */
  resetTime: string;
  spinDurationSec: number;

  // --- form ---
  /** The phone number is always required; the name can be required, optional or hidden. */
  nameField: FieldMode;
  gdprEnabled: boolean;
  /** Use {terms} where the link should go. */
  gdprMessage: string;
  gdprLinkText: string;
  gdprLinkUrl: string;
}

export interface Design {
  /** "half" shows only the right half of the wheel on wide screens, with the pointer on the right. */
  wheelStyle: 'full' | 'half';
  wheelSize: number;
  bgColor: string;
  bgImageUrl: string;
  bgEffect: BgEffect;
  winEffect: WinEffect;
  textColor: string;
  titleColor: string;
  buttonColor: string;
  buttonTextColor: string;
  borderColor: string;
  dotColor: string;
  pointerColor: string;
  pointerPosition: PointerPosition;
  centerColor: string;
  centerImageUrl: string;
  /** Slice label size, % of automatic size. */
  labelScale: number;
  fontFamily: string;
  customCss: string;
}

export interface Config {
  settings: Settings;
  design: Design;
  segments: Segment[];
}

export interface SpinRecord {
  id: string;
  name: string;
  /** Normalised 8-digit Mongolian number, e.g. "99112233". Identifies the visitor. */
  phone: string;
  segmentId: string;
  label: string;
  type: PrizeType;
  value: number;
  code: string | null;
  expiresAt: string | null;
  at: string;
  /** When staff marked the code as used. */
  redeemedAt: string | null;
}

export interface SpinInput {
  name: string;
  phone: string;
}

/** Admin's call-back notes for one phone number. */
export interface Contact {
  phone: string;
  contacted: boolean;
  note: string;
  updatedAt: string | null;
}

/** What visitors may see: no odds. */
export type PublicSegment = Omit<Segment, 'weight'>;
export interface PublicConfig {
  settings: Settings;
  design: Design;
  segments: PublicSegment[];
}

export interface SpinResult {
  /** The wheel as it was when the prize was picked; the client animates to segmentIndex on it. */
  segments: PublicSegment[];
  segmentIndex: number;
  record: SpinRecord;
}

export type CouponStatus = 'valid' | 'redeemed' | 'expired' | 'not_found';

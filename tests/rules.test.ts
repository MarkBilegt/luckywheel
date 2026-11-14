// Run with: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults.ts';
import {
  eligibilityError,
  formatPhone,
  lastResetTime,
  nextSpinSlot,
  normalizePhone,
  sanitizeConfig,
  toPublicConfig,
  validateInput,
} from '../src/lib/rules.ts';
import type { Settings } from '../src/types.ts';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_CONFIG.settings, ...patch });
const HOUR = 3_600_000;

describe('phone numbers', () => {
  test('accepts Mongolian formats and normalises to 8 digits', () => {
    for (const raw of ['99112233', '9911 2233', '9911-2233', '+976 9911 2233', '97699112233', '(9911) 2233']) {
      assert.equal(normalizePhone(raw), '99112233', raw);
    }
  });
  test('rejects wrong lengths, letters and numbers not starting with 5-9', () => {
    for (const raw of ['', '1234', '991122334', '11223344', '4411 2233', 'abcd1234', '+1 99112233']) {
      assert.equal(normalizePhone(raw), null, raw);
    }
  });
  test('formats for display', () => {
    assert.equal(formatPhone('99112233'), '9911-2233');
  });
});

describe('form validation', () => {
  const ok = { name: 'Бат', phone: '99112233' };
  test('valid input passes', () => assert.equal(validateInput(ok, settings(), true), null));
  test('name required by default', () => assert.match(validateInput({ ...ok, name: ' ' }, settings(), true)!, /Нэр/));
  test('name optional when set', () => assert.equal(validateInput({ ...ok, name: '' }, settings({ nameField: 'optional' }), true), null));
  test('bad phone', () => assert.match(validateInput({ ...ok, phone: '123' }, settings(), true)!, /8 оронтой/));
  test('consent required when enabled', () => assert.match(validateInput(ok, settings(), false)!, /нөхцөл/));
  test('consent not needed when disabled', () => assert.equal(validateInput(ok, settings({ gdprEnabled: false }), false), null));
});

describe('daily reset uses Mongolian time (UTC+8)', () => {
  test('23:30 in Ulaanbaatar → the spin day started at 00:00 that day', () => {
    const now = Date.parse('2026-11-13T15:30:00Z'); // 23:30 UB
    assert.equal(new Date(lastResetTime('00:00', now)).toISOString(), '2026-11-12T16:00:00.000Z'); // 13th 00:00 UB
  });
  test('00:30 in Ulaanbaatar → a new spin day has started', () => {
    const now = Date.parse('2026-11-13T16:30:00Z'); // 00:30 on the 14th UB
    assert.equal(new Date(lastResetTime('00:00', now)).toISOString(), '2026-11-13T16:00:00.000Z');
  });
  test('custom reset time 09:30', () => {
    const now = Date.parse('2026-11-14T00:00:00Z'); // 08:00 UB, before 09:30 → yesterday 09:30
    assert.equal(new Date(lastResetTime('09:30', now)).toISOString(), '2026-11-13T01:30:00.000Z');
  });
});

describe('who can spin', () => {
  const now = Date.parse('2026-11-14T04:00:00Z'); // 12:00 UB
  test('first spin is allowed', () => assert.equal(eligibilityError([], 0, settings(), now), null));
  test('one spin per number (default)', () => {
    assert.match(eligibilityError([now - 48 * HOUR], 0, settings(), now)!, /аль хэдийн/);
  });
  test('wait time message uses correct Mongolian endings', () => {
    const s = settings({ spinsPerPhone: 5, cooldownHours: 24 });
    assert.match(eligibilityError([now - 1000], 0, s, now)!, /24 цагийн дараа/);
    assert.match(eligibilityError([now - 21.5 * HOUR], 0, s, now)!, /2 цаг 30 минутын дараа/);
    assert.match(eligibilityError([now - 23.25 * HOUR], 0, s, now)!, /45 минутын дараа/);
    assert.equal(eligibilityError([now - 25 * HOUR], 0, s, now), null);
  });
  test('daily reset: 2 spins today, then blocked until tomorrow', () => {
    const s = settings({ spinsPerPhone: 2, cooldownHours: 0, resetSpinsDaily: true });
    const yesterday = now - 20 * HOUR;
    assert.equal(eligibilityError([yesterday, yesterday], 0, s, now), null);
    assert.equal(eligibilityError([now - HOUR], 0, s, now), null);
    assert.match(eligibilityError([now - 2 * HOUR, now - HOUR], 0, s, now)!, /Өнөөдрийн/);
  });
  test('per-device (IP) daily limit', () => {
    assert.match(eligibilityError([], 10, settings(), now)!, /төхөөрөмж/);
    assert.equal(eligibilityError([], 10, settings({ spinsPerIpPerDay: 0 }), now), null);
  });
});

describe('spin slots (stop double-clicks winning twice)', () => {
  const now = Date.parse('2026-11-14T04:00:00Z');
  test('same history → same slot, so the database rejects the second insert', () => {
    assert.equal(nextSpinSlot([], settings(), now), 'all#0');
    assert.equal(nextSpinSlot([now - HOUR], settings({ spinsPerPhone: 3 }), now), 'all#1');
  });
  test('daily slots are keyed by the day', () => {
    const slot = nextSpinSlot([], settings({ resetSpinsDaily: true }), now);
    assert.equal(slot, `${Date.parse('2026-11-13T16:00:00Z')}#0`);
  });
  test('unlimited spins get unique slots', () => {
    const s = settings({ spinsPerPhone: 0 });
    assert.notEqual(nextSpinSlot([], s, now), nextSpinSlot([], s, now));
  });
});

describe('config cleaning (anything the admin saves)', () => {
  test('junk falls back to defaults, field by field', () => {
    const c = sanitizeConfig({
      settings: { title: 123, nameField: 'evil', spinsPerPhone: 'lots', currency: '$' },
      design: { buttonColor: 'red; background:url(x)', pointerPosition: 'sideways' },
    });
    assert.equal(c.settings.title, DEFAULT_CONFIG.settings.title);
    assert.equal(c.settings.nameField, DEFAULT_CONFIG.settings.nameField);
    assert.equal(c.settings.spinsPerPhone, DEFAULT_CONFIG.settings.spinsPerPhone);
    assert.equal(c.settings.currency, '$');
    assert.equal(c.design.buttonColor, DEFAULT_CONFIG.design.buttonColor);
    assert.equal(c.design.pointerPosition, DEFAULT_CONFIG.design.pointerPosition);
  });
  test('slices are repaired: bad type, colour, negative weight, >100%, duplicate ids', () => {
    const c = sanitizeConfig({
      segments: [
        { id: 'a', label: '', type: 'hack', value: 999, color: 'nope', weight: -5 },
        { id: 'a', label: 'X'.repeat(80), type: 'percent', value: 150, color: '#00ff00', weight: 3 },
      ],
    });
    assert.equal(c.segments[0].type, 'none');
    assert.equal(c.segments[0].weight, 0);
    assert.equal(c.segments[0].color, '#888888');
    assert.equal(c.segments[1].value, 100);
    assert.equal(c.segments[1].label.length, 30);
    assert.notEqual(c.segments[0].id, c.segments[1].id);
  });
  test('more than 20 or fewer than 2 slices → defaults', () => {
    const one = DEFAULT_CONFIG.segments[0];
    assert.deepEqual(sanitizeConfig({ segments: [one] }).segments, DEFAULT_CONFIG.segments);
    assert.deepEqual(sanitizeConfig({ segments: Array.from({ length: 21 }, (_, i) => ({ ...one, id: `x${i}` })) }).segments, DEFAULT_CONFIG.segments);
  });
  test('the public wheel never includes the odds', () => {
    assert.ok(toPublicConfig(DEFAULT_CONFIG).segments.every((s) => !('weight' in s)));
  });
});

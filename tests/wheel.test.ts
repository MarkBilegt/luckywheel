// Run with: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  describePrize,
  formatMoney,
  pickSegment,
  pointerAngle,
  probabilities,
  SPIN_EASING,
  targetRotation,
  tickTimes,
} from '../src/lib/wheel.ts';
import type { PointerPosition, Segment } from '../src/types.ts';

/** Deterministic pseudo-random numbers so the tests always behave the same. */
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

const seg = (weight: number, id = String(weight)): Segment => ({
  id, label: id, type: 'percent', value: 10, color: '#000000', textColor: '#ffffff', weight,
});

describe('prize odds', () => {
  test('picks follow the weights; weight 0 never wins', () => {
    const segments = [seg(20, 'a'), seg(0, 'b'), seg(60, 'c'), seg(20, 'd')];
    const rand = seeded();
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 100_000; i++) counts[pickSegment(segments, rand)]++;
    assert.equal(counts[1], 0);
    assert.ok(Math.abs(counts[0] / 1000 - 20) < 1, `a ≈ 20% (got ${counts[0] / 1000}%)`);
    assert.ok(Math.abs(counts[2] / 1000 - 60) < 1, `c ≈ 60% (got ${counts[2] / 1000}%)`);
  });
  test('probabilities add up to 1', () => {
    const p = probabilities([seg(1), seg(3)]);
    assert.deepEqual(p, [0.25, 0.75]);
  });
});

describe('the wheel stops on the prize the server picked', () => {
  for (const pointer of ['top', 'right', 'bottom', 'center'] as PointerPosition[]) {
    test(`pointer ${pointer}`, () => {
      const rand = seeded(7);
      const P = pointerAngle(pointer);
      let rotation = 0;
      for (let k = 0; k < 2000; k++) {
        const n = 2 + (k % 19);
        const index = Math.floor(rand() * n);
        const next = targetRotation(rotation, index, n, 5, P, rand);
        assert.ok(next - rotation >= 5 * 360, 'always spins at least 5 full turns');
        const underPointer = Math.floor(((((P - next) % 360) + 360) % 360) / (360 / n));
        assert.equal(underPointer, index);
        rotation = next;
      }
    });
  }
});

describe('tick sound timing', () => {
  /** Where the animation is at time t, using the same cubic-bezier the browser uses. */
  function angleAt(from: number, to: number, durationSec: number, t: number): number {
    const [x1, y1, x2, y2] = SPIN_EASING;
    const b = (p1: number, p2: number, s: number) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (b(x1, x2, mid) < t / durationSec) lo = mid; else hi = mid;
    }
    return from + (to - from) * b(y1, y2, (lo + hi) / 2);
  }

  for (const [slices, pointer] of [[8, 'top'], [12, 'right'], [20, 'bottom'], [3, 'center']] as const) {
    test(`${slices} slices, pointer ${pointer}: every tick is exactly on a divider, none missed`, () => {
      const P = pointerAngle(pointer);
      const from = 37, to = from + 7 * 360 + 123, duration = 6, slice = 360 / slices;
      const times = tickTimes(from, to, slices, P, duration, 0);
      const crossings = Math.floor((to - from + ((((from - P) % slice) + slice) % slice)) / slice);
      assert.equal(times.length, crossings);
      for (const t of times) {
        const under = ((((P - angleAt(from, to, duration, t)) % 360) + 360) % 360) % slice;
        assert.ok(Math.min(under, slice - under) < 0.01, `tick at ${t.toFixed(3)}s is ${under.toFixed(3)}° off`);
      }
    });
  }

  test('ticks start fast, slow down, and finish within the spin', () => {
    const t = tickTimes(0, 360 * 7 + 100, 8, 0, 6);
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    assert.ok(gaps[0] < 0.05 && gaps.at(-1)! > 0.5);
    assert.ok(t.at(-1)! <= 6);
  });
});

describe('Mongolian money and prize text', () => {
  test('tögrög after the amount', () => assert.equal(formatMoney(5000, '₮'), '5,000₮'));
  test('symbol before when set', () => assert.equal(formatMoney(5, '$', 'before'), '$5'));
  test('prize descriptions fit "Та {prize} хожлоо"', () => {
    assert.equal(describePrize({ type: 'percent', value: 10, label: '' }, '₮'), '10%-ийн хямдрал');
    assert.equal(describePrize({ type: 'fixed', value: 5000, label: '' }, '₮'), '5,000₮-ийн хямдрал');
    assert.equal(describePrize({ type: 'cash', value: 20000, label: '' }, '₮'), '20,000₮-ийн мөнгөн шагнал');
    assert.equal(describePrize({ type: 'free_shipping', value: 0, label: '' }, '₮'), 'үнэгүй хүргэлт');
  });
});

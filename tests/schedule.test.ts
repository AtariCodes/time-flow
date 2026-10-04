import { describe, expect, it } from 'vitest';
import {
  countConflicts,
  findSlot,
  freeGaps,
  layoutLanes,
  occupiedMinutes,
  segmentsFor,
  statsForRange,
} from '../src/lib/schedule';
import { createInitialState, type Block } from '../src/lib/model';

const b = (id: string, start: number, duration: number, extra: Partial<Block> = {}): Block => ({
  id,
  categoryId: 'c_deep',
  start,
  duration,
  ...extra,
});

describe('segments', () => {
  it('clips blocks crossing midnight and shows the spill on the next day', () => {
    const sleep = b('s', 23 * 60, 8 * 60);
    const today = segmentsFor('2026-10-05', [sleep], []);
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ start: 1380, end: 1440, spill: false });

    const tomorrow = segmentsFor('2026-10-06', [], [sleep]);
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0]).toMatchObject({ start: 0, end: 420, spill: true, ownerDate: '2026-10-05' });
  });
});

describe('occupancy', () => {
  it('never counts overlaps twice', () => {
    const segs = [
      { start: 0, end: 120 },
      { start: 60, end: 180 },
      { start: 300, end: 360 },
    ];
    expect(occupiedMinutes(segs)).toBe(240);
    expect(countConflicts(segs)).toBe(1);
  });

  it('caps a fully overlapping day at 24 h', () => {
    const segs = [
      { start: 0, end: 1440 },
      { start: 0, end: 1440 },
    ];
    expect(occupiedMinutes(segs)).toBe(1440);
  });

  it('finds free gaps', () => {
    expect(freeGaps([{ start: 60, end: 120 }, { start: 100, end: 200 }], 0, 300)).toEqual([
      { start: 0, end: 60 },
      { start: 200, end: 300 },
    ]);
  });
});

describe('findSlot', () => {
  it('uses the first gap that fits after `from`', () => {
    const busy = [{ start: 0, end: 480 }, { start: 540, end: 720 }];
    expect(findSlot(busy, 60, 0)).toEqual({ start: 480, duration: 60 });
    expect(findSlot(busy, 90, 0)).toEqual({ start: 720, duration: 90 });
    expect(findSlot(busy, 60, 800)).toEqual({ start: 800, duration: 60 });
  });

  it('shrinks to the largest gap when nothing fits, and returns null on a full day', () => {
    const busy = [{ start: 0, end: 1400 }];
    expect(findSlot(busy, 120)).toEqual({ start: 1400, duration: 40 });
    expect(findSlot([{ start: 0, end: 1440 }], 30)).toBeNull();
  });
});

describe('layoutLanes', () => {
  it('puts overlapping items side by side and keeps separate clusters independent', () => {
    const lanes = layoutLanes([
      { key: 'a', start: 0, end: 100 },
      { key: 'b', start: 50, end: 150 },
      { key: 'c', start: 120, end: 200 },
      { key: 'd', start: 300, end: 400 },
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});

describe('statsForRange', () => {
  it('sums planned and done time per category, including spill-over', () => {
    const state = createInitialState();
    state.days['2026-10-05'] = {
      note: '',
      blocks: [b('s', 23 * 60, 8 * 60, { categoryId: 'c_sleep', done: true }), b('w', 9 * 60, 120)],
    };
    const day1 = statsForRange(state, '2026-10-05', 1);
    expect(day1.occupied).toBe(60 + 120);
    const day2 = statsForRange(state, '2026-10-06', 1);
    expect(day2.occupied).toBe(420);
    const both = statsForRange(state, '2026-10-05', 2);
    const sleep = both.byCategory.find((c) => c.category.id === 'c_sleep');
    expect(sleep).toMatchObject({ planned: 480, done: 480 });
    expect(both.done).toBe(480);
  });
});

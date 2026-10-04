import { addDays, DAY_MINUTES, rangeDays, type DateKey } from './time';
import { blockEnd, type AppState, type Block, type Category } from './model';

/** Úsek bloku zobrazený v konkrétním dni (blok přes půlnoc má dva úseky ve dvou dnech). */
export interface Segment {
  /** Unikátní klíč úseku. */
  key: string;
  block: Block;
  /** Den, kterému blok patří (u přetečení z předchozího dne je to předchozí den). */
  ownerDate: DateKey;
  /** Úsek je pokračováním bloku z předchozího dne. */
  spill: boolean;
  /** Začátek a konec v rámci zobrazovaného dne, 0–1440. */
  start: number;
  end: number;
}

/** Úseky dne: vlastní bloky (oříznuté na půlnoc) + přetečení bloků z předchozího dne. */
export function segmentsFor(date: DateKey, own: Block[], previous: Block[]): Segment[] {
  const result: Segment[] = [];
  const prevDate = addDays(date, -1);
  for (const block of previous) {
    const end = blockEnd(block);
    if (end > DAY_MINUTES) {
      result.push({
        key: `${prevDate}:${block.id}:spill`,
        block,
        ownerDate: prevDate,
        spill: true,
        start: 0,
        end: Math.min(end - DAY_MINUTES, DAY_MINUTES),
      });
    }
  }
  for (const block of own) {
    result.push({
      key: `${date}:${block.id}`,
      block,
      ownerDate: date,
      spill: false,
      start: block.start,
      end: Math.min(blockEnd(block), DAY_MINUTES),
    });
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function segmentsForDay(state: AppState, date: DateKey): Segment[] {
  return segmentsFor(date, state.days[date]?.blocks ?? [], state.days[addDays(date, -1)]?.blocks ?? []);
}

export interface Interval {
  start: number;
  end: number;
}

/** Sjednocení intervalů (seřazené, nepřekrývající se). */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ start: cur.start, end: cur.end });
  }
  return merged;
}

/** Skutečně obsazený čas (překryvy se nepočítají dvakrát), max. 1440. */
export function occupiedMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Volné úseky dne v rozsahu [from, to]. */
export function freeGaps(intervals: Interval[], from = 0, to = DAY_MINUTES, minLength = 1): Interval[] {
  const gaps: Interval[] = [];
  let cursor = from;
  for (const busy of mergeIntervals(intervals)) {
    if (busy.end <= from) continue;
    if (busy.start >= to) break;
    if (busy.start > cursor) gaps.push({ start: cursor, end: Math.min(busy.start, to) });
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor < to) gaps.push({ start: cursor, end: to });
  return gaps.filter((g) => g.end - g.start >= minLength);
}

/** Dvojice úseků, které se překrývají. */
export function countConflicts(segments: Interval[]): number {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  let conflicts = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      if (sorted[j].end > sorted[j].start) conflicts++;
    }
  }
  return conflicts;
}

export interface LaneInfo {
  lane: number;
  lanes: number;
}

/**
 * Rozložení překrývajících se úseků do pruhů vedle sebe (jako v kalendářích).
 * Každý shluk navzájem se překrývajících úseků dostane vlastní počet pruhů.
 */
export function layoutLanes<T extends Interval & { key: string }>(items: T[]): Map<string, LaneInfo> {
  const result = new Map<string, LaneInfo>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) result.set(c.key, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ key: item.key, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

/**
 * Najde první volné místo dané délky od `from`. Když se nikam nevejde,
 * vrátí začátek největší mezery (blok se pak zkrátí), případně null.
 */
export function findSlot(
  intervals: Interval[],
  duration: number,
  from = 0,
): { start: number; duration: number } | null {
  const gaps = freeGaps(intervals, 0, DAY_MINUTES);
  const fit = gaps.find((g) => Math.max(g.start, from) + duration <= g.end);
  if (fit) return { start: Math.max(fit.start, from), duration };
  const anyFit = gaps.find((g) => g.end - g.start >= duration);
  if (anyFit) return { start: anyFit.start, duration };
  const largest = [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  if (!largest) return null;
  return { start: largest.start, duration: largest.end - largest.start };
}

export interface CategoryStat {
  category: Category;
  planned: number;
  done: number;
}

export interface RangeStats {
  /** Obsazený čas (sjednocení, bez dvojího počítání překryvů). */
  occupied: number;
  /** Celkový čas v rozsahu. */
  total: number;
  /** Splněno (bloky označené jako hotové). */
  done: number;
  conflicts: number;
  byCategory: CategoryStat[];
}

/** Statistiky za `count` dní od `start`. Blok přes půlnoc se započítá do obou dní poměrně. */
export function statsForRange(state: AppState, start: DateKey, count: number): RangeStats {
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const acc = new Map<string, CategoryStat>();
  let occupied = 0;
  let done = 0;
  let conflicts = 0;

  for (const date of rangeDays(start, count)) {
    const segments = segmentsForDay(state, date);
    occupied += occupiedMinutes(segments);
    conflicts += countConflicts(segments);
    for (const seg of segments) {
      const category = byId.get(seg.block.categoryId);
      if (!category) continue;
      const len = seg.end - seg.start;
      const entry = acc.get(category.id) ?? { category, planned: 0, done: 0 };
      entry.planned += len;
      if (seg.block.done) {
        entry.done += len;
        done += len;
      }
      acc.set(category.id, entry);
    }
  }

  return {
    occupied,
    total: count * DAY_MINUTES,
    done,
    conflicts,
    byCategory: [...acc.values()].sort((a, b) => b.planned - a.planned),
  };
}

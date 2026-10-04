import { appState, editor, nowMinute, selection, today } from '../state/store';
import { blockLabel } from '../state/actions';
import { layoutLanes, occupiedMinutes, segmentsForDay } from '../lib/schedule';
import { DAY_MINUTES, formatClock, formatDuration, type DateKey } from '../lib/time';

const SIZE = 320;
const C = SIZE / 2;
const OUTER = 150;
const INNER = 92;

function polar(radius: number, minute: number): [number, number] {
  const angle = (minute / DAY_MINUTES) * 2 * Math.PI - Math.PI / 2;
  return [C + radius * Math.cos(angle), C + radius * Math.sin(angle)];
}

function arcPath(start: number, end: number, r1: number, r2: number): string {
  const span = Math.min(end - start, DAY_MINUTES - 0.01);
  const e = start + span;
  const large = span > DAY_MINUTES / 2 ? 1 : 0;
  const [x1, y1] = polar(r2, start);
  const [x2, y2] = polar(r2, e);
  const [x3, y3] = polar(r1, e);
  const [x4, y4] = polar(r1, start);
  return `M${x1} ${y1} A${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z`;
}

/** 24h ciferník — celý den na jeden pohled. Překrývající se bloky jsou v soustředných pruzích. */
export function ClockView({ date }: { date: DateKey }) {
  const s = appState.value!;
  const segments = segmentsForDay(s, date);
  const lanes = layoutLanes(segments);
  const categories = new Map(s.categories.map((c) => [c.id, c]));
  const sel = selection.value;
  const isToday = date === today.value;
  const occupied = occupiedMinutes(segments);
  const current = isToday
    ? segments.find((seg) => seg.start <= nowMinute.value && nowMinute.value < seg.end)
    : undefined;

  return (
    <div class="flex justify-center py-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} class="h-auto w-full max-w-[380px]" role="img" aria-label="Den jako 24hodinový ciferník">
        <circle cx={C} cy={C} r={(OUTER + INNER) / 2} fill="none" stroke-width={OUTER - INNER} class="stroke-slate-100 dark:stroke-slate-800" />
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = polar(OUTER + 2, h * 60);
          const [x2, y2] = polar(OUTER + (h % 6 === 0 ? 9 : 5), h * 60);
          const [tx, ty] = polar(INNER - 12, h * 60);
          return (
            <g key={h}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke-width={h % 6 === 0 ? 2 : 1} class="stroke-slate-300 dark:stroke-slate-600" />
              {h % 3 === 0 && (
                <text x={tx} y={ty} text-anchor="middle" dominant-baseline="central" class="fill-slate-400 text-[10px] font-semibold">
                  {h}
                </text>
              )}
            </g>
          );
        })}
        {segments.map((seg) => {
          const lane = lanes.get(seg.key) ?? { lane: 0, lanes: 1 };
          const band = (OUTER - INNER) / lane.lanes;
          const r1 = INNER + band * lane.lane + 1;
          const r2 = r1 + band - 2;
          const color = categories.get(seg.block.categoryId)?.color ?? '#64748b';
          const selected = sel?.id === seg.block.id && sel.date === seg.ownerDate;
          const label = blockLabel(seg.block, s.categories);
          return (
            <path
              key={seg.key}
              d={arcPath(seg.start, seg.end, r1, r2)}
              fill={color}
              opacity={seg.spill ? 0.7 : 1}
              class={`cursor-pointer transition-opacity hover:opacity-80 ${selected ? 'stroke-indigo-500 dark:stroke-white' : 'stroke-white dark:stroke-slate-900'}`}
              stroke-width={selected ? 3 : 1}
              onClick={() => (selection.value = { date: seg.ownerDate, id: seg.block.id })}
              onDblClick={() => (editor.value = { kind: 'edit', date: seg.ownerDate, id: seg.block.id })}
            >
              <title>
                {label} {formatClock(seg.block.start)}–{formatClock(seg.block.start + seg.block.duration)}
              </title>
            </path>
          );
        })}
        {isToday && (() => {
          const [x1, y1] = polar(INNER - 4, nowMinute.value);
          const [x2, y2] = polar(OUTER + 6, nowMinute.value);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke-width={2.5} stroke-linecap="round" class="stroke-rose-500" />;
        })()}
        <text x={C} y={C - 14} text-anchor="middle" class="fill-slate-900 text-[22px] font-bold dark:fill-white">
          {isToday ? formatClock(Math.floor(nowMinute.value)) : formatDuration(occupied)}
        </text>
        <text x={C} y={C + 8} text-anchor="middle" class="fill-slate-500 text-[11px] dark:fill-slate-400">
          {isToday ? (current ? blockLabel(current.block, s.categories) : 'volno') : 'naplánováno'}
        </text>
        <text x={C} y={C + 26} text-anchor="middle" class="fill-slate-400 text-[10px]">
          volno {formatDuration(DAY_MINUTES - occupied)}
        </text>
      </svg>
    </div>
  );
}

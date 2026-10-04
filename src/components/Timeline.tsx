import { useLayoutEffect, useEffect, useRef, useState } from 'preact/hooks';
import {
  appState,
  dragPreview,
  editor,
  nowMinute,
  orientation,
  selection,
  today,
  zoomHours,
} from '../state/store';
import { addBlock, blockLabel, deleteBlock, duplicateBlock, toggleDone, updateBlock } from '../state/actions';
import { layoutLanes, segmentsFor, type Segment } from '../lib/schedule';
import { readableTextColor } from '../lib/color';
import { addDays, clamp, DAY_MINUTES, formatClock, formatDurationShort, snap, type DateKey } from '../lib/time';
import type { Block } from '../lib/model';
import { Icon } from './Icon';

/** Typ dat přenášených při tažení kategorie ze zásoby na osu. */
export const CATEGORY_MIME = 'application/x-timeflow-category';

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  pointerId: number;
  mode: DragMode;
  block: Block;
  originX: number;
  originY: number;
  /** Rozdíl (v minutách) mezi místem uchopení a začátkem bloku. */
  grabOffset: number;
  active: boolean;
}

const HORIZONTAL_HEIGHT = 184;
const VERTICAL_GUTTER = 48;

export function Timeline({ date }: { date: DateKey }) {
  const s = appState.value!;
  const horizontal = orientation.value === 'horizontal';
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [viewport, setViewport] = useState(0);

  // Velikost viditelné oblasti → měřítko (px na minutu) podle zvoleného zoomu.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewport(horizontal ? el.clientWidth : el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [horizontal]);

  const hours = zoomHours.value;
  const ppm = Math.max(viewport - (horizontal ? 24 : 16), 240) / (hours * 60);
  const trackSize = DAY_MINUTES * ppm;

  // Při změně dne posuneme osu na „teď“ (dnes) nebo na první blok.
  const isToday = date === today.value;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewport === 0) return;
    const own = s.days[date]?.blocks ?? [];
    const target = isToday ? nowMinute.value - hours * 20 : own.length ? Math.min(...own.map((b) => b.start)) - 30 : 7 * 60;
    const pos = Math.max(0, target * ppm);
    if (horizontal) el.scrollLeft = pos;
    else el.scrollTop = pos;
    // Záměrně jen při změně dne, orientace nebo zoomu — ne při každé úpravě bloku.
  }, [date, horizontal, hours, viewport > 0]);

  const preview = dragPreview.value;
  const settings = s.settings;
  const own = (s.days[date]?.blocks ?? []).map((b) =>
    preview && preview.date === date && preview.id === b.id ? { ...b, start: preview.start, duration: preview.duration } : b,
  );
  const previous = s.days[addDays(date, -1)]?.blocks ?? [];
  const segments = segmentsFor(date, own, previous);
  const lanes = layoutLanes(segments);
  const categories = new Map(s.categories.map((c) => [c.id, c]));
  const sel = selection.value;

  const minuteAt = (clientX: number, clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return (horizontal ? clientX - rect.left : clientY - rect.top) / ppm;
  };

  const step = (e?: { altKey: boolean }) => (e?.altKey ? 1 : settings.snap);

  // ---------------------------------------------------------------- tažení

  const onPointerDown = (e: PointerEvent, seg: Segment, mode: DragMode) => {
    if (e.button !== 0) return;
    const wasSelected = sel?.id === seg.block.id && sel.date === seg.ownerDate;
    selection.value = { date: seg.ownerDate, id: seg.block.id };
    if (mode !== 'move') e.stopPropagation();
    // Přetečení z předchozího dne jen vybíráme (upravuje se v editoru).
    if (seg.spill) return;
    // Na dotyku se blok nejdřív vybere ťuknutím, teprve pak jde táhnout (jinak by nešlo posouvat osu).
    if (e.pointerType !== 'mouse' && !wasSelected) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const block = s.days[date]?.blocks.find((b) => b.id === seg.block.id);
    if (!block) return;
    dragRef.current = {
      pointerId: e.pointerId,
      mode,
      block,
      originX: e.clientX,
      originY: e.clientY,
      grabOffset: minuteAt(e.clientX, e.clientY) - block.start,
      active: false,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.originX, e.clientY - drag.originY) < 4) return;
      drag.active = true;
    }
    e.preventDefault();
    const st = step(e);
    const minStep = Math.max(st, 5);
    const m = minuteAt(e.clientX, e.clientY);
    const { block } = drag;
    let start = block.start;
    let duration = block.duration;
    if (drag.mode === 'move') {
      start = clamp(snap(m - drag.grabOffset, st), 0, DAY_MINUTES - st);
    } else if (drag.mode === 'end') {
      const end = snap(m, st);
      duration = clamp(end - block.start, minStep, DAY_MINUTES);
    } else {
      const end = block.start + block.duration;
      start = clamp(snap(m, st), Math.max(0, end - DAY_MINUTES), end - minStep);
      duration = end - start;
    }
    dragPreview.value = { date, id: block.id, start, duration };
    autoScroll(e);
  };

  const finishDrag = (e: PointerEvent, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const p = dragPreview.value;
    dragPreview.value = null;
    if (!cancelled && drag.active && p && (p.start !== drag.block.start || p.duration !== drag.block.duration)) {
      updateBlock(date, drag.block.id, { start: p.start, duration: p.duration });
    }
  };

  const autoScroll = (e: PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 40;
    if (horizontal) {
      if (e.clientX < rect.left + edge) el.scrollLeft -= 12;
      else if (e.clientX > rect.right - edge) el.scrollLeft += 12;
    } else {
      if (e.clientY < rect.top + edge) el.scrollTop -= 12;
      else if (e.clientY > rect.bottom - edge) el.scrollTop += 12;
    }
  };

  // ------------------------------------------------------- klávesnice na bloku

  const onBlockKeyDown = (e: KeyboardEvent, seg: Segment) => {
    const { block, ownerDate } = seg;
    const st = step(e);
    const earlier = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const later = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if ((earlier || later) && !seg.spill) {
      e.preventDefault();
      e.stopPropagation();
      const delta = earlier ? -st : st;
      if (e.shiftKey) {
        updateBlock(ownerDate, block.id, { duration: clamp(block.duration + delta, Math.max(st, 5), DAY_MINUTES) }, `kbd:${block.id}`);
      } else {
        updateBlock(ownerDate, block.id, { start: clamp(block.start + delta, 0, DAY_MINUTES - 1) }, `kbd:${block.id}`);
      }
      return;
    }
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        editor.value = { kind: 'edit', date: ownerDate, id: block.id };
        break;
      case ' ':
        e.preventDefault();
        toggleDone(ownerDate, block.id);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        e.stopPropagation();
        deleteBlock(ownerDate, block.id);
        break;
      case 'd':
      case 'D':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          duplicateBlock(ownerDate, block.id);
        }
        break;
    }
  };

  // ------------------------------------------------ prázdné místo, drop

  const onTrackClick = (e: MouseEvent) => {
    if (e.target !== trackRef.current) return;
    if (selection.value) {
      selection.value = null;
      return;
    }
    const start = clamp(Math.floor(minuteAt(e.clientX, e.clientY) / settings.snap) * settings.snap, 0, DAY_MINUTES - 1);
    editor.value = { kind: 'new', date, start };
  };

  const onDrop = (e: DragEvent) => {
    const categoryId = e.dataTransfer?.getData(CATEGORY_MIME);
    if (!categoryId) return;
    e.preventDefault();
    const category = categories.get(categoryId);
    if (!category) return;
    const start = clamp(snap(minuteAt(e.clientX, e.clientY), settings.snap), 0, DAY_MINUTES - 1);
    addBlock(date, { categoryId, start, duration: category.defaultDuration });
  };

  // --------------------------------------------------------------- mřížka

  const hourPx = 60 * ppm;
  const labelEvery = hourPx >= 44 ? 1 : hourPx >= 22 ? 2 : 3;
  const showHalf = hourPx >= 70;
  const gridLines = [];
  for (let h = 0; h <= 24; h++) {
    const pos = h * hourPx;
    const style = horizontal ? { left: `${pos}px` } : { top: `${pos}px` };
    gridLines.push(
      <div
        key={`h${h}`}
        data-grid="1"
        class={`pointer-events-none absolute ${horizontal ? 'top-0 bottom-0 border-l' : 'left-0 right-0 border-t'} ${
          h % 6 === 0 ? 'border-slate-300 dark:border-slate-700' : 'border-slate-200/80 dark:border-slate-800'
        }`}
        style={style}
      />,
    );
    if (showHalf && h < 24) {
      const half = pos + hourPx / 2;
      gridLines.push(
        <div
          key={`m${h}`}
          class={`pointer-events-none absolute border-dashed ${horizontal ? 'top-6 bottom-0 border-l' : 'left-0 right-0 border-t'} border-slate-200/60 dark:border-slate-800/60`}
          style={horizontal ? { left: `${half}px` } : { top: `${half}px` }}
        />,
      );
    }
  }
  const labels = [];
  for (let h = 0; h <= 24; h += labelEvery) {
    const pos = h * hourPx;
    labels.push(
      <span
        key={h}
        class={`pointer-events-none absolute text-[11px] font-semibold tabular-nums text-slate-400 select-none ${
          horizontal ? 'top-1 -translate-x-1/2' : '-translate-y-1/2 right-2'
        }`}
        style={horizontal ? { left: `${clamp(pos, 14, trackSize - 14)}px` } : { top: `${clamp(pos, 8, trackSize - 8)}px` }}
      >
        {String(h).padStart(2, '0')}:00
      </span>,
    );
  }

  // ---------------------------------------------------------------- render

  const crossPad = horizontal ? 28 : 0; // místo pro popisky hodin nahoře

  return (
    <div
      ref={scrollRef}
      class={`relative w-full rounded-xl border border-slate-100 bg-slate-50/60 select-none dark:border-slate-800 dark:bg-slate-950/40 ${
        horizontal ? 'overflow-x-auto overflow-y-hidden' : 'h-[68vh] min-h-[420px] overflow-y-auto overflow-x-hidden'
      }`}
    >
      <div
        class={horizontal ? 'relative' : 'relative flex'}
        style={horizontal ? { width: `${trackSize + 24}px`, padding: '0 12px' } : { height: `${trackSize + 16}px`, padding: '8px 0' }}
      >
        {!horizontal && (
          <div class="relative shrink-0" style={{ width: `${VERTICAL_GUTTER}px`, height: `${trackSize}px` }}>
            {labels}
          </div>
        )}
        <div
          ref={trackRef}
          class="relative flex-1"
          style={horizontal ? { width: `${trackSize}px`, height: `${HORIZONTAL_HEIGHT}px` } : { height: `${trackSize}px` }}
          onClick={onTrackClick}
          onDragOver={(e) => {
            if (e.dataTransfer?.types.includes(CATEGORY_MIME)) e.preventDefault();
          }}
          onDrop={onDrop}
          aria-label="Časová osa dne — kliknutím do prázdného místa přidáte blok"
        >
          {gridLines}
          {horizontal && labels}

          {segments.map((seg) => {
            const lane = lanes.get(seg.key) ?? { lane: 0, lanes: 1 };
            const category = categories.get(seg.block.categoryId);
            const color = category?.color ?? '#64748b';
            const text = readableTextColor(color);
            const size = (seg.end - seg.start) * ppm;
            const selected = sel?.id === seg.block.id && sel.date === seg.ownerDate;
            const dragging = preview?.id === seg.block.id && !seg.spill;
            const label = blockLabel(seg.block, s.categories);
            const fullEnd = seg.block.start + seg.block.duration;
            const continues = !seg.spill && fullEnd > DAY_MINUTES;
            const startLabel = formatClock(seg.block.start);
            const endLabel = formatClock(fullEnd);
            const crossFrac = 1 / lane.lanes;
            const pos = horizontal
              ? {
                  left: `${seg.start * ppm}px`,
                  width: `${Math.max(size, 6)}px`,
                  top: `calc(${crossPad}px + (100% - ${crossPad + 8}px) * ${lane.lane * crossFrac})`,
                  height: `calc((100% - ${crossPad + 8}px) * ${crossFrac} - 4px)`,
                }
              : {
                  top: `${seg.start * ppm}px`,
                  height: `${Math.max(size, 6)}px`,
                  left: `calc(4px + (100% - 12px) * ${lane.lane * crossFrac})`,
                  width: `calc((100% - 12px) * ${crossFrac} - 4px)`,
                };
            const compact = horizontal ? size < 70 : size < 34;
            const tiny = horizontal ? size < 28 : size < 18;

            return (
              <div
                key={seg.key}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${label}, ${startLabel}–${endLabel}${seg.block.done ? ', splněno' : ''}${
                  seg.spill ? ', pokračování z předchozího dne' : ''
                }`}
                title={`${label}\n${startLabel}–${endLabel} (${formatDurationShort(seg.block.duration)})${
                  seg.block.note ? `\n${seg.block.note}` : ''
                }`}
                class={`group absolute overflow-hidden rounded-lg border text-left shadow-xs transition-shadow focus-visible:outline-offset-1 ${
                  selected ? 'z-20 ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : 'z-10 hover:shadow-md'
                } ${dragging ? 'z-30 opacity-90 shadow-lg' : ''} ${seg.spill ? 'border-dashed' : 'border-black/10'}`}
                style={{
                  ...pos,
                  backgroundColor: color,
                  color: text,
                  cursor: seg.spill ? 'pointer' : dragging ? 'grabbing' : 'grab',
                  touchAction: selected && !seg.spill ? 'none' : 'auto',
                  opacity: seg.spill ? 0.75 : undefined,
                  borderColor: seg.spill ? text : undefined,
                }}
                onPointerDown={(e) => onPointerDown(e, seg, 'move')}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => finishDrag(e, false)}
                onPointerCancel={(e) => finishDrag(e, true)}
                onDblClick={(e) => {
                  e.stopPropagation();
                  editor.value = { kind: 'edit', date: seg.ownerDate, id: seg.block.id };
                }}
                onKeyDown={(e) => onBlockKeyDown(e, seg)}
                onFocus={() => (selection.value = { date: seg.ownerDate, id: seg.block.id })}
              >
                {!tiny && (
                  <div class={`pointer-events-none flex h-full flex-col justify-between ${compact ? 'p-1' : 'px-2 py-1.5'}`}>
                    <div class="flex min-w-0 items-start gap-1">
                      {seg.block.done && <Icon name="check" class="mt-px h-3.5 w-3.5 shrink-0" />}
                      <span class={`truncate font-semibold ${compact ? 'text-[10px]' : 'text-xs'} ${seg.block.done ? 'line-through decoration-2 opacity-80' : ''}`}>
                        {label}
                      </span>
                    </div>
                    {!compact && (
                      <div class="flex items-center justify-between gap-1 text-[10px] tabular-nums opacity-90">
                        <span class="truncate">
                          {seg.spill && '↩ '}
                          {startLabel}–{endLabel}
                          {continues && ' →'}
                        </span>
                        <span class="shrink-0 rounded bg-black/15 px-1">{formatDurationShort(seg.block.duration)}</span>
                      </div>
                    )}
                  </div>
                )}
                {!seg.spill && (
                  <>
                    <div
                      class={`absolute opacity-0 transition-opacity group-hover:opacity-100 ${selected ? 'opacity-100' : ''} ${
                        horizontal ? 'top-0 bottom-0 left-0 w-2.5 cursor-ew-resize' : 'left-0 right-0 top-0 h-2.5 cursor-ns-resize'
                      } flex items-center justify-center`}
                      onPointerDown={(e) => onPointerDown(e, seg, 'start')}
                      onPointerMove={onPointerMove}
                      onPointerUp={(e) => finishDrag(e, false)}
                      onPointerCancel={(e) => finishDrag(e, true)}
                      aria-hidden="true"
                    >
                      <div class={`rounded-full bg-current opacity-60 ${horizontal ? 'h-4 w-0.5' : 'h-0.5 w-4'}`} />
                    </div>
                    {!continues && (
                      <div
                        class={`absolute opacity-0 transition-opacity group-hover:opacity-100 ${selected ? 'opacity-100' : ''} ${
                          horizontal ? 'top-0 bottom-0 right-0 w-2.5 cursor-ew-resize' : 'left-0 right-0 bottom-0 h-2.5 cursor-ns-resize'
                        } flex items-center justify-center`}
                        onPointerDown={(e) => onPointerDown(e, seg, 'end')}
                        onPointerMove={onPointerMove}
                        onPointerUp={(e) => finishDrag(e, false)}
                        onPointerCancel={(e) => finishDrag(e, true)}
                        aria-hidden="true"
                      >
                        <div class={`rounded-full bg-current opacity-60 ${horizontal ? 'h-4 w-0.5' : 'h-0.5 w-4'}`} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {isToday && (
            <div
              class={`pointer-events-none absolute z-40 bg-rose-500 ${horizontal ? 'top-6 bottom-0 w-0.5' : 'left-0 right-0 h-0.5'}`}
              style={horizontal ? { left: `${nowMinute.value * ppm}px` } : { top: `${nowMinute.value * ppm}px` }}
            >
              <span
                class={`absolute rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white shadow-xs ${
                  horizontal ? '-bottom-0.5 -translate-x-1/2' : '-left-1 -translate-y-1/2'
                }`}
              >
                {formatClock(Math.floor(nowMinute.value))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { commit, lastCategoryId, selection, state, toast, toastWithUndo } from './store';
import { newId, type AppState, type Block, type Category, type DayTemplate, type Settings } from '../lib/model';
import { findSlot, segmentsForDay } from '../lib/schedule';
import { DAY_MINUTES, clamp, weekdayIndex, type DateKey } from '../lib/time';

function dayOf(draft: AppState, date: DateKey) {
  return (draft.days[date] ??= { blocks: [], note: '' });
}

export function categoryById(id: string): Category | undefined {
  return state().categories.find((c) => c.id === id);
}

export function blockLabel(block: Block, categories: Category[] = state().categories): string {
  if (block.title?.trim()) return block.title.trim();
  return categories.find((c) => c.id === block.categoryId)?.name ?? 'Bez kategorie';
}

/** Normalizuje rozsah bloku: start 0–1439, délka 1–1440. */
export function normalizeRange(start: number, duration: number): { start: number; duration: number } {
  const s = clamp(Math.round(start), 0, DAY_MINUTES - 1);
  return { start: s, duration: clamp(Math.round(duration), 1, DAY_MINUTES) };
}

export function addBlock(date: DateKey, data: Omit<Block, 'id'>): string {
  const id = newId('b');
  const range = normalizeRange(data.start, data.duration);
  commit((d) => {
    dayOf(d, date).blocks.push({ ...data, ...range, id });
  });
  selection.value = { date, id };
  lastCategoryId.value = data.categoryId;
  return id;
}

/** Přidá blok kategorie do prvního volného místa (od `from`), místo aby ho položil přes jiný. */
export function addCategoryToFreeSlot(date: DateKey, categoryId: string, from = 0): void {
  const category = categoryById(categoryId);
  if (!category) return;
  const segments = segmentsForDay(state(), date);
  const slot = findSlot(segments, category.defaultDuration, from);
  if (!slot) {
    toast('Den je už celý zaplněný.', { tone: 'error' });
    return;
  }
  addBlock(date, { categoryId, start: slot.start, duration: slot.duration });
  if (slot.duration < category.defaultDuration) toast(`Blok byl zkrácen na volné místo.`);
}

export function updateBlock(date: DateKey, id: string, patch: Partial<Omit<Block, 'id'>>, coalesce?: string): void {
  commit(
    (d) => {
      const block = d.days[date]?.blocks.find((b) => b.id === id);
      if (!block) return;
      Object.assign(block, patch);
      Object.assign(block, normalizeRange(block.start, block.duration));
      if (block.title !== undefined && block.title.trim() === '') delete block.title;
      if (block.note !== undefined && block.note.trim() === '') delete block.note;
    },
    { coalesce },
  );
}

export function deleteBlock(date: DateKey, id: string): void {
  const block = state().days[date]?.blocks.find((b) => b.id === id);
  if (!block) return;
  commit((d) => {
    const day = d.days[date];
    if (day) day.blocks = day.blocks.filter((b) => b.id !== id);
  });
  if (selection.value?.id === id) selection.value = null;
  toastWithUndo(`Blok „${blockLabel(block)}“ smazán.`);
}

export function duplicateBlock(date: DateKey, id: string): void {
  const s = state();
  const block = s.days[date]?.blocks.find((b) => b.id === id);
  if (!block) return;
  const slot = findSlot(segmentsForDay(s, date), block.duration, block.start + block.duration);
  if (!slot) {
    toast('Pro kopii už není volné místo.', { tone: 'error' });
    return;
  }
  const { id: _omit, ...rest } = block;
  void _omit;
  addBlock(date, { ...rest, done: false, start: slot.start, duration: slot.duration });
}

export function toggleDone(date: DateKey, id: string): void {
  const block = state().days[date]?.blocks.find((b) => b.id === id);
  if (block) updateBlock(date, id, { done: !block.done });
}

export function setNote(date: DateKey, note: string): void {
  commit((d) => (dayOf(d, date).note = note), { coalesce: `note:${date}` });
}

export function clearDay(date: DateKey): void {
  const day = state().days[date];
  if (!day || day.blocks.length === 0) {
    toast('Den je už prázdný.');
    return;
  }
  commit((d) => (dayOf(d, date).blocks = []));
  selection.value = null;
  toastWithUndo('Bloky dne byly smazány.');
}

export function applyTemplate(date: DateKey, templateId: string, mode: 'replace' | 'merge' = 'replace'): void {
  const template = state().templates.find((t) => t.id === templateId);
  if (!template) return;
  commit((d) => {
    const day = dayOf(d, date);
    const blocks = template.blocks.map((b) => ({ ...b, id: newId('b') }));
    day.blocks = mode === 'replace' ? blocks : [...day.blocks, ...blocks];
  });
  selection.value = null;
  toastWithUndo(`Použita šablona „${template.name}“.`);
}

export function saveDayAsTemplate(date: DateKey, name: string, weekdays: number[]): void {
  const blocks = state().days[date]?.blocks ?? [];
  commit((d) => {
    d.templates.push({
      id: newId('dt'),
      name: name.trim(),
      weekdays: [...new Set(weekdays)].sort(),
      blocks: blocks.map(({ id: _id, done: _done, ...rest }) => rest),
    });
  });
  toast(`Šablona „${name.trim()}“ uložena.`, { tone: 'success' });
}

export function updateTemplate(id: string, patch: Partial<Pick<DayTemplate, 'name' | 'weekdays'>>): void {
  commit((d) => {
    const t = d.templates.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

export function deleteTemplate(id: string): void {
  const t = state().templates.find((x) => x.id === id);
  if (!t) return;
  commit((d) => (d.templates = d.templates.filter((x) => x.id !== id)));
  toastWithUndo(`Šablona „${t.name}“ smazána.`);
}

/** Šablony, které se pro daný den v týdnu nabízejí jako první. */
export function templatesForDate(date: DateKey): DayTemplate[] {
  const wd = weekdayIndex(date);
  return state().templates.filter((t) => t.weekdays.includes(wd));
}

export function saveCategory(category: Omit<Category, 'id'> & { id?: string }): string {
  const id = category.id ?? newId('c');
  commit((d) => {
    const existing = d.categories.find((c) => c.id === id);
    const value: Category = {
      id,
      name: category.name.trim(),
      color: category.color,
      defaultDuration: clamp(Math.round(category.defaultDuration), 1, DAY_MINUTES),
      ...(category.weeklyGoal ? { weeklyGoal: Math.round(category.weeklyGoal) } : {}),
    };
    if (existing) {
      Object.keys(existing).forEach((k) => delete (existing as unknown as Record<string, unknown>)[k]);
      Object.assign(existing, value);
    } else d.categories.push(value);
  });
  return id;
}

export function categoryUsage(id: string): number {
  const s = state();
  let count = 0;
  for (const day of Object.values(s.days)) count += day.blocks.filter((b) => b.categoryId === id).length;
  for (const t of s.templates) count += t.blocks.filter((b) => b.categoryId === id).length;
  return count;
}

/** Používaná kategorie se jen archivuje (bloky na ni dál odkazují), nepoužívaná se smaže. */
export function removeCategory(id: string): void {
  const cat = categoryById(id);
  if (!cat) return;
  const used = categoryUsage(id);
  commit((d) => {
    if (used > 0) {
      const c = d.categories.find((x) => x.id === id);
      if (c) c.archived = true;
    } else d.categories = d.categories.filter((x) => x.id !== id);
  });
  toastWithUndo(used > 0 ? `Kategorie „${cat.name}“ archivována (používá ji ${used} bloků).` : `Kategorie „${cat.name}“ smazána.`);
}

export function restoreCategory(id: string): void {
  commit((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) delete c.archived;
  });
}

export function updateSettings(patch: Partial<Settings>): void {
  commit((d) => Object.assign(d.settings, patch));
}

/** Zkopíruje bloky z jiného dne (bez stavu „splněno“). */
export function copyDay(from: DateKey, to: DateKey): void {
  const blocks = state().days[from]?.blocks ?? [];
  if (blocks.length === 0) return;
  commit((d) => {
    dayOf(d, to).blocks = blocks.map((b) => ({ ...b, id: newId('b'), done: false }));
  });
  selection.value = null;
  toastWithUndo('Bloky byly zkopírovány.');
}

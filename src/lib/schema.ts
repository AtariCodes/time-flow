import { z } from 'zod';
import { isHexColor } from './color';
import { DAY_MINUTES, isDateKey } from './time';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  newId,
  type AppState,
  type Block,
  type Category,
  type Day,
  type DayTemplate,
} from './model';

const MAX_NAME = 120;
const MAX_NOTE = 20_000;

const hex = z.string().refine(isHexColor, 'Neplatná barva');
const dateKey = z.string().refine(isDateKey, 'Neplatné datum');
const minuteOfDay = z.number().int().min(0).max(DAY_MINUTES - 1);
const duration = z.number().int().min(1).max(DAY_MINUTES);
const id = z.string().min(1).max(100);

const categorySchema = z.object({
  id,
  name: z.string().min(1).max(MAX_NAME),
  color: hex,
  defaultDuration: duration,
  weeklyGoal: z.number().int().min(0).max(7 * DAY_MINUTES).optional(),
  archived: z.boolean().optional(),
});

const blockSchema = z.object({
  id,
  categoryId: id,
  start: minuteOfDay,
  duration,
  title: z.string().max(MAX_NAME).optional(),
  note: z.string().max(MAX_NOTE).optional(),
  done: z.boolean().optional(),
});

const daySchema = z.object({
  blocks: z.array(blockSchema).max(500),
  note: z.string().max(MAX_NOTE),
});

const templateSchema = z.object({
  id,
  name: z.string().min(1).max(MAX_NAME),
  blocks: z.array(blockSchema.omit({ id: true, done: true })).max(500),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
});

const settingsSchema = z.object({
  snap: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  orientation: z.enum(['auto', 'horizontal', 'vertical']),
  notify: z.boolean(),
  notifyLead: z.number().int().min(0).max(120),
});

export const stateSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  categories: z.array(categorySchema).max(500),
  days: z.record(dateKey, daySchema),
  templates: z.array(templateSchema).max(200),
  settings: settingsSchema.partial().optional(),
});

// ---- Formáty původní aplikace (TimeFlow v2) ----

const legacyBlockSchema = z.object({
  name: z.string().max(MAX_NAME),
  startTime: z.number(),
  duration: z.number(),
  color: z.string(),
});

const legacyTemplateSchema = z.object({
  name: z.string().max(MAX_NAME),
  duration: z.number(),
  color: z.string(),
});

const legacyDayTemplateSchema = z.object({
  name: z.string().max(MAX_NAME),
  blocks: z.array(legacyBlockSchema),
});

const legacyExportSchema = z.object({
  days: z.record(z.string(), z.array(legacyBlockSchema)),
  notes: z.record(z.string(), z.string()).optional(),
  templates: z.array(legacyTemplateSchema).optional(),
  dayTemplates: z.array(legacyDayTemplateSchema).optional(),
});

const legacySingleDaySchema = z.object({
  date: z.string(),
  scheduledBlocks: z.array(legacyBlockSchema),
  note: z.string().optional(),
  templates: z.array(legacyTemplateSchema).optional(),
  dayTemplates: z.array(legacyDayTemplateSchema).optional(),
});

export type LegacyExport = z.infer<typeof legacyExportSchema>;

/** Doplní chybějící kategorie a odstraní prázdné dny — stav je pak vždy konzistentní. */
export function normalizeState(input: z.infer<typeof stateSchema>): AppState {
  const categories: Category[] = input.categories.map((c) => ({ ...c }));
  const known = new Set(categories.map((c) => c.id));
  const ensureCategory = (categoryId: string) => {
    if (known.has(categoryId)) return;
    known.add(categoryId);
    categories.push({ id: categoryId, name: 'Neznámá kategorie', color: '#64748b', defaultDuration: 60, archived: true });
  };

  const days: Record<string, Day> = {};
  for (const [date, day] of Object.entries(input.days)) {
    const seen = new Set<string>();
    const blocks = day.blocks
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
      .map((b) => ({ ...b }));
    blocks.forEach((b) => ensureCategory(b.categoryId));
    if (blocks.length > 0 || day.note.trim() !== '') days[date] = { blocks, note: day.note };
  }
  const templates: DayTemplate[] = input.templates.map((t) => ({
    ...t,
    weekdays: [...new Set(t.weekdays)].sort(),
    blocks: t.blocks.map((b) => ({ ...b })),
  }));
  templates.forEach((t) => t.blocks.forEach((b) => ensureCategory(b.categoryId)));

  return {
    version: SCHEMA_VERSION,
    categories,
    days,
    templates,
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
  };
}

function toMinuteOfDay(value: number): number {
  return Math.min(DAY_MINUTES - 1, Math.max(0, Math.round(value)));
}

function toDuration(value: number): number {
  return Math.min(DAY_MINUTES, Math.max(1, Math.round(value)));
}

function safeColor(value: string): string {
  return isHexColor(value) ? value.toLowerCase() : '#64748b';
}

/**
 * Převede data z TimeFlow v2 do nového modelu. Bloky se přiřadí ke kategoriím podle názvu
 * (bez ohledu na velikost písmen); existující kategorie se použijí, chybějící se vytvoří.
 */
export function convertLegacy(data: LegacyExport, existing: Category[] = []): AppState {
  const categories: Category[] = existing.map((c) => ({ ...c }));
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));

  const categoryFor = (name: string, color: string, defaultDuration = 60): Category => {
    const label = name.trim() || 'Bez názvu';
    const key = label.toLowerCase();
    let cat = byName.get(key);
    if (!cat) {
      cat = { id: newId('c'), name: label.slice(0, MAX_NAME), color: safeColor(color), defaultDuration: toDuration(defaultDuration) };
      categories.push(cat);
      byName.set(key, cat);
    }
    return cat;
  };

  for (const t of data.templates ?? []) categoryFor(t.name, t.color, t.duration);

  const convertBlock = (b: z.infer<typeof legacyBlockSchema>): Omit<Block, 'id'> => {
    const cat = categoryFor(b.name, b.color);
    return { categoryId: cat.id, start: toMinuteOfDay(b.startTime), duration: toDuration(b.duration) };
  };

  const days: Record<string, Day> = {};
  const dates = new Set([...Object.keys(data.days), ...Object.keys(data.notes ?? {})]);
  for (const date of dates) {
    if (!isDateKey(date)) continue;
    const blocks = (data.days[date] ?? []).map((b) => ({ id: newId('b'), ...convertBlock(b) }));
    const note = (data.notes?.[date] ?? '').slice(0, MAX_NOTE);
    if (blocks.length > 0 || note.trim() !== '') days[date] = { blocks, note };
  }

  const templates: DayTemplate[] = (data.dayTemplates ?? []).map((dt) => ({
    id: newId('dt'),
    name: dt.name.trim().slice(0, MAX_NAME) || 'Šablona',
    weekdays: [],
    blocks: dt.blocks.map(convertBlock),
  }));

  return { version: SCHEMA_VERSION, categories, days, templates, settings: { ...DEFAULT_SETTINGS } };
}

export type ImportKind = 'v3' | 'v2' | 'v1';

export interface ParsedImport {
  kind: ImportKind;
  state: AppState;
}

export class ImportError extends Error {}

/** Rozpozná a zvaliduje soubor zálohy. Nikdy nevrací nezvalidovaná data. */
export function parseImport(text: string, existing: Category[]): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('Soubor není platný JSON.');
  }

  // Soubor, který se hlásí k verzi 3, posuzujeme jen podle schématu verze 3 —
  // poškozená záloha nesmí „projít“ jako prázdná záloha staršího formátu.
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === SCHEMA_VERSION) {
    const v3 = stateSchema.safeParse(raw);
    if (v3.success) return { kind: 'v3', state: normalizeState(v3.data) };
    const issue = v3.error.issues[0];
    throw new ImportError(`Záloha obsahuje neplatná data (${issue.path.join('.')}: ${issue.message}).`);
  }

  const v2 = legacyExportSchema.safeParse(raw);
  if (v2.success) return { kind: 'v2', state: convertLegacy(v2.data, existing) };

  const v1 = legacySingleDaySchema.safeParse(raw);
  if (v1.success) {
    const { date, scheduledBlocks, note, templates, dayTemplates } = v1.data;
    return {
      kind: 'v1',
      state: convertLegacy(
        { days: { [date]: scheduledBlocks }, notes: note ? { [date]: note } : {}, templates, dayTemplates },
        existing,
      ),
    };
  }

  throw new ImportError('Neznámý formát zálohy.');
}

export interface ImportSummary {
  daysInFile: number;
  daysOverwritten: number;
  newCategories: number;
  templates: number;
}

export function summarizeImport(current: AppState, incoming: AppState): ImportSummary {
  const currentCats = new Set(current.categories.map((c) => c.id));
  const incomingDays = Object.keys(incoming.days);
  return {
    daysInFile: incomingDays.length,
    daysOverwritten: incomingDays.filter((d) => current.days[d]).length,
    newCategories: incoming.categories.filter((c) => !currentCats.has(c.id)).length,
    templates: incoming.templates.length,
  };
}

/** Sloučení: dny ze zálohy přepíší stejné dny, kategorie a šablony se sjednotí podle id. */
export function mergeStates(current: AppState, incoming: AppState): AppState {
  const categories = new Map(current.categories.map((c) => [c.id, c]));
  for (const c of incoming.categories) categories.set(c.id, c);
  const templates = new Map(current.templates.map((t) => [t.id, t]));
  for (const t of incoming.templates) templates.set(t.id, t);
  return {
    version: SCHEMA_VERSION,
    categories: [...categories.values()],
    days: { ...current.days, ...incoming.days },
    templates: [...templates.values()],
    settings: current.settings,
  };
}

/** Načte uložený stav (např. z IndexedDB). Při poškozených datech vrátí null. */
export function parseStoredState(raw: unknown): AppState | null {
  const parsed = stateSchema.safeParse(raw);
  return parsed.success ? normalizeState(parsed.data) : null;
}

/** Načte data původní aplikace z localStorage (klíče timeflow_*), pokud tam nějaká jsou. */
export function readLegacyLocalStorage(storage: Storage): LegacyExport | null {
  const days: Record<string, unknown> = {};
  const notes: Record<string, string> = {};
  let found = false;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    if (key.startsWith('timeflow_day_')) {
      found = true;
      try {
        days[key.slice('timeflow_day_'.length)] = JSON.parse(storage.getItem(key) ?? '[]');
      } catch {
        /* poškozený den přeskočíme */
      }
    } else if (key.startsWith('timeflow_note_')) {
      found = true;
      notes[key.slice('timeflow_note_'.length)] = storage.getItem(key) ?? '';
    }
  }
  const readJson = (key: string) => {
    try {
      const v = storage.getItem(key);
      return v ? JSON.parse(v) : undefined;
    } catch {
      return undefined;
    }
  };
  const templates = readJson('timeflow_templates');
  const dayTemplates = readJson('timeflow_day_templates');
  if (!found && !templates && !dayTemplates) return null;

  // Jednotlivé dny validujeme zvlášť, aby jeden poškozený den nezahodil všechno.
  const validDays: Record<string, z.infer<typeof legacyBlockSchema>[]> = {};
  for (const [date, blocks] of Object.entries(days)) {
    const parsed = z.array(legacyBlockSchema).safeParse(blocks);
    if (parsed.success) validDays[date] = parsed.data;
  }
  const parsedTemplates = z.array(legacyTemplateSchema).safeParse(templates);
  const parsedDayTemplates = z.array(legacyDayTemplateSchema).safeParse(dayTemplates);
  return {
    days: validDays,
    notes,
    templates: parsedTemplates.success ? parsedTemplates.data : undefined,
    dayTemplates: parsedDayTemplates.success ? parsedDayTemplates.data : undefined,
  };
}

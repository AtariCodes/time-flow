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
//
// Původní aplikace data nijak nekontrolovala, takže zálohy mohou obsahovat i neplatné
// hodnoty (např. prázdnou délku bloku). Starý formát proto čteme benevolentně:
// co jde opravit, opravíme; neplatné bloky přeskočíme a jejich počet ohlásíme.

export interface LegacyBlock {
  name: string;
  startTime: number;
  duration: number;
  color: string;
}

export interface LegacyTemplate {
  name: string;
  duration: number;
  color: string;
}

export interface LegacyExport {
  days: Record<string, LegacyBlock[]>;
  notes?: Record<string, string>;
  templates?: LegacyTemplate[];
  dayTemplates?: { name: string; blocks: LegacyBlock[] }[];
  /** Počet přeskočených (neopravitelných) položek. */
  skipped?: number;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

class LegacyReader {
  skipped = 0;

  block(v: unknown): LegacyBlock | null {
    if (!isObj(v)) return this.skip();
    const startTime = toNum(v.startTime) ?? 0;
    const duration = toNum(v.duration);
    if (duration === null || duration <= 0) return this.skip();
    return { name: toStr(v.name, 'Bez názvu').slice(0, MAX_NAME), startTime, duration, color: toStr(v.color) };
  }

  blocks(v: unknown): LegacyBlock[] {
    if (v === null || v === undefined) return [];
    if (!Array.isArray(v)) {
      this.skipped++;
      return [];
    }
    return v.map((b) => this.block(b)).filter((b): b is LegacyBlock => b !== null);
  }

  templates(v: unknown): LegacyTemplate[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out: LegacyTemplate[] = [];
    for (const t of v) {
      if (!isObj(t) || !toStr(t.name).trim()) {
        this.skipped++;
        continue;
      }
      out.push({ name: toStr(t.name).slice(0, MAX_NAME), duration: toNum(t.duration) ?? 60, color: toStr(t.color) });
    }
    return out;
  }

  dayTemplates(v: unknown): LegacyExport['dayTemplates'] {
    if (!Array.isArray(v)) return undefined;
    const out: NonNullable<LegacyExport['dayTemplates']> = [];
    for (const t of v) {
      if (!isObj(t)) {
        this.skipped++;
        continue;
      }
      out.push({ name: toStr(t.name, 'Šablona').slice(0, MAX_NAME), blocks: this.blocks(t.blocks) });
    }
    return out;
  }

  notes(v: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!isObj(v)) return out;
    for (const [date, note] of Object.entries(v)) {
      const text = toStr(note);
      if (text) out[date] = text.slice(0, MAX_NOTE);
    }
    return out;
  }

  private skip(): null {
    this.skipped++;
    return null;
  }
}

/** Rozpozná export původní aplikace (formát 2.0 i starší zálohu jednoho dne). */
export function readLegacyExport(raw: unknown): { kind: 'v2' | 'v1'; data: LegacyExport } | null {
  if (!isObj(raw)) return null;
  const r = new LegacyReader();
  if (isObj(raw.days)) {
    const days: Record<string, LegacyBlock[]> = {};
    for (const [date, blocks] of Object.entries(raw.days)) days[date] = r.blocks(blocks);
    const data: LegacyExport = {
      days,
      notes: r.notes(raw.notes),
      templates: r.templates(raw.templates),
      dayTemplates: r.dayTemplates(raw.dayTemplates),
    };
    return { kind: 'v2', data: { ...data, skipped: r.skipped } };
  }
  if (typeof raw.date === 'string' && Array.isArray(raw.scheduledBlocks)) {
    const note = toStr(raw.note);
    const data: LegacyExport = {
      days: { [raw.date]: r.blocks(raw.scheduledBlocks) },
      notes: note ? { [raw.date]: note.slice(0, MAX_NOTE) } : {},
      templates: r.templates(raw.templates),
      dayTemplates: r.dayTemplates(raw.dayTemplates),
    };
    return { kind: 'v1', data: { ...data, skipped: r.skipped } };
  }
  return null;
}

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

  const convertBlock = (b: LegacyBlock): Omit<Block, 'id'> => {
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
  /** Kolik poškozených položek se při převodu přeskočilo (jen u starého formátu). */
  skipped: number;
}

export class ImportError extends Error {}

/** Rozpozná a zvaliduje soubor zálohy. Nikdy nevrací nezvalidovaná data. */
export function parseImport(text: string, existing: Category[]): ParsedImport {
  let raw: unknown;
  try {
    // Některé editory na začátek souboru přidávají neviditelný znak BOM.
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new ImportError('Soubor není platný JSON.');
  }

  // Soubor, který se hlásí k verzi 3, posuzujeme jen podle schématu verze 3 —
  // poškozená záloha nesmí „projít“ jako prázdná záloha staršího formátu.
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === SCHEMA_VERSION) {
    const v3 = stateSchema.safeParse(raw);
    if (v3.success) return { kind: 'v3', state: normalizeState(v3.data), skipped: 0 };
    const issue = v3.error.issues[0];
    throw new ImportError(`Záloha obsahuje neplatná data (${issue.path.join('.')}: ${issue.message}).`);
  }

  const legacy = readLegacyExport(raw);
  if (legacy) {
    const state = convertLegacy(legacy.data, existing);
    return { kind: legacy.kind, state, skipped: legacy.data.skipped ?? 0 };
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
  const notes: Record<string, unknown> = {};
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

  // Bloky čteme benevolentně, aby jeden poškozený den nezahodil všechno.
  return readLegacyExport({ days, notes, templates, dayTemplates })?.data ?? null;
}

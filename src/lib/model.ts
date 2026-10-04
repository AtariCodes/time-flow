import type { DateKey } from './time';

export const SCHEMA_VERSION = 3;

export interface Category {
  id: string;
  name: string;
  /** Barva ve tvaru #rrggbb. */
  color: string;
  /** Výchozí délka nového bloku v minutách. */
  defaultDuration: number;
  /** Týdenní cíl v minutách (volitelný). */
  weeklyGoal?: number;
  /** Archivovaná kategorie se nenabízí v zásobě, ale bloky na ni dál odkazují. */
  archived?: boolean;
}

export interface Block {
  id: string;
  categoryId: string;
  /** Začátek v minutách od půlnoci dne, 0–1439. */
  start: number;
  /** Délka v minutách, 1–1440. Konec může přesáhnout půlnoc (start + duration > 1440). */
  duration: number;
  /** Vlastní název; když chybí, použije se název kategorie. */
  title?: string;
  note?: string;
  /** Skutečně splněno (plán vs. realita). */
  done?: boolean;
}

export interface Day {
  blocks: Block[];
  note: string;
}

export type TemplateBlock = Omit<Block, 'id' | 'done'>;

export interface DayTemplate {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  /** Dny v týdnu (0 = pondělí … 6 = neděle), pro které se šablona nabízí. */
  weekdays: number[];
}

export type SnapStep = 1 | 5 | 10 | 15 | 30;
export type Orientation = 'auto' | 'horizontal' | 'vertical';

export interface Settings {
  snap: SnapStep;
  orientation: Orientation;
  /** Upozornění na začátek bloku (jen když je aplikace otevřená). */
  notify: boolean;
  /** Kolik minut předem upozornit. */
  notifyLead: number;
}

export interface AppState {
  version: typeof SCHEMA_VERSION;
  categories: Category[];
  days: Record<DateKey, Day>;
  templates: DayTemplate[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  snap: 15,
  orientation: 'auto',
  notify: false,
  notifyLead: 5,
};

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

export function createInitialState(): AppState {
  const categories: Category[] = [
    { id: 'c_deep', name: 'Hluboká práce', color: '#4f46e5', defaultDuration: 120, weeklyGoal: 15 * 60 },
    { id: 'c_admin', name: 'E-maily & admin', color: '#0ea5e9', defaultDuration: 45 },
    { id: 'c_meet', name: 'Schůzky', color: '#f59e0b', defaultDuration: 60 },
    { id: 'c_food', name: 'Jídlo & odpočinek', color: '#10b981', defaultDuration: 60 },
    { id: 'c_sport', name: 'Sport / pohyb', color: '#f43f5e', defaultDuration: 60, weeklyGoal: 4 * 60 },
    { id: 'c_sleep', name: 'Spánek', color: '#6366f1', defaultDuration: 480 },
  ];
  const templates: DayTemplate[] = [
    {
      id: 'dt_workday',
      name: 'Pracovní den',
      weekdays: [0, 1, 2, 3, 4],
      blocks: [
        { categoryId: 'c_sleep', start: 23 * 60, duration: 7 * 60 },
        { categoryId: 'c_deep', start: 9 * 60, duration: 180 },
        { categoryId: 'c_food', start: 12 * 60, duration: 60 },
        { categoryId: 'c_admin', start: 13 * 60, duration: 60 },
        { categoryId: 'c_meet', start: 14 * 60, duration: 60 },
        { categoryId: 'c_sport', start: 18 * 60, duration: 60 },
      ],
    },
  ];
  return {
    version: SCHEMA_VERSION,
    categories,
    days: {},
    templates,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function emptyDay(): Day {
  return { blocks: [], note: '' };
}

export function isDayEmpty(day: Day | undefined): boolean {
  return !day || (day.blocks.length === 0 && day.note.trim() === '');
}

export function blockEnd(block: Pick<Block, 'start' | 'duration'>): number {
  return block.start + block.duration;
}

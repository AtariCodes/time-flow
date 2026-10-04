import { computed, effect, signal } from '@preact/signals';
import { History } from './history';
import { loadState, readTheme, saveState, writeTheme, type Theme } from '../lib/storage';
import { minutesOfDay, toDateKey, type DateKey } from '../lib/time';
import { type AppState } from '../lib/model';

// ---------------------------------------------------------------------------
// Datový stav + historie
// ---------------------------------------------------------------------------

/** null = ještě se načítá. */
export const appState = signal<AppState | null>(null);
const history = new History<AppState>();
const historyTick = signal(0);
export const canUndo = computed(() => (historyTick.value, history.canUndo));
export const canRedo = computed(() => (historyTick.value, history.canRedo));

/** Stav po načtení — komponenty pod <App> se vykreslují až když je k dispozici. */
export function state(): AppState {
  const s = appState.value;
  if (!s) throw new Error('Stav ještě není načten');
  return s;
}

export interface CommitOptions {
  /** Sloučí rychle po sobě jdoucí změny se stejným klíčem do jednoho kroku historie. */
  coalesce?: string;
}

/** Jediný způsob, jak měnit data: změna se provede na kopii, uloží se do historie a perzistuje. */
export function commit(mutate: (draft: AppState) => void, options: CommitOptions = {}): void {
  const current = state();
  const draft = structuredClone(current);
  mutate(draft);
  for (const [date, day] of Object.entries(draft.days)) {
    if (day.blocks.length === 0 && day.note.trim() === '') delete draft.days[date];
  }
  history.record(current, options.coalesce);
  historyTick.value++;
  appState.value = draft;
}

export function undo(): boolean {
  const s = appState.value;
  if (!s) return false;
  const prev = history.undo(s);
  if (!prev) return false;
  historyTick.value++;
  appState.value = prev;
  selection.value = null;
  return true;
}

export function redo(): boolean {
  const s = appState.value;
  if (!s) return false;
  const next = history.redo(s);
  if (!next) return false;
  historyTick.value++;
  appState.value = next;
  selection.value = null;
  return true;
}

// ---------------------------------------------------------------------------
// Čas — „dnes“ se přepočítává, takže aplikace otevřená přes půlnoc funguje správně
// ---------------------------------------------------------------------------

export const now = signal(new Date());
export const today = computed<DateKey>(() => toDateKey(now.value));
export const nowMinute = computed(() => minutesOfDay(now.value));

// ---------------------------------------------------------------------------
// Stav rozhraní
// ---------------------------------------------------------------------------

export type View = 'day' | 'week';
export type DayMode = 'timeline' | 'clock';

export const selectedDate = signal<DateKey>(toDateKey(new Date()));
export const view = signal<View>('day');
export const dayMode = signal<DayMode>('timeline');
/** Kolik hodin je vidět na šířku/výšku osy najednou. */
export const zoomHours = signal<24 | 12 | 6 | 3>(
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 12 : 24,
);

/** Naposledy použitá kategorie — výchozí volba v editoru nového bloku. */
export const lastCategoryId = signal<string | null>(null);

export interface SelectionRef {
  /** Den, kterému blok patří. */
  date: DateKey;
  id: string;
}
export const selection = signal<SelectionRef | null>(null);

export type EditorTarget =
  | { kind: 'edit'; date: DateKey; id: string }
  | { kind: 'new'; date: DateKey; start: number; duration?: number; categoryId?: string };
export const editor = signal<EditorTarget | null>(null);

export type DialogName = 'import' | 'settings' | 'help' | 'save-template' | 'categories' | null;
export const dialog = signal<DialogName>(null);

/** Náhled při tažení — data se zapíší až po puštění (jeden krok v historii). */
export interface DragPreview {
  date: DateKey;
  id: string;
  start: number;
  duration: number;
}
export const dragPreview = signal<DragPreview | null>(null);

export const theme = signal<Theme>(readTheme());

export const isNarrow = signal(typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false);

export const orientation = computed<'horizontal' | 'vertical'>(() => {
  const setting = appState.value?.settings.orientation ?? 'auto';
  if (setting === 'auto') return isNarrow.value ? 'vertical' : 'horizontal';
  return setting;
});

// ---------------------------------------------------------------------------
// Oznámení (toasty)
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}
export const toasts = signal<Toast[]>([]);
let toastId = 0;

export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}): void {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-3), { id, message, tone: options.tone ?? 'info', action: options.action }];
  setTimeout(() => dismissToast(id), options.action ? 6000 : 3500);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** Toast s tlačítkem „Vrátit“ — náhrada za potvrzovací dialogy u destruktivních akcí. */
export function toastWithUndo(message: string): void {
  toast(message, { action: { label: 'Vrátit', run: () => undo() } });
}

// ---------------------------------------------------------------------------
// Start, ukládání, synchronizace mezi okny
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: AppState | null = null;
let suppressSave = false;
let channel: BroadcastChannel | null = null;

async function flushSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const s = pendingSave;
  pendingSave = null;
  if (!s) return;
  try {
    await saveState(s);
    channel?.postMessage({ type: 'saved' });
  } catch (err) {
    console.error(err);
    toast('Uložení se nezdařilo. Exportujte prosím zálohu.', { tone: 'error' });
  }
}

export async function boot(): Promise<void> {
  const { state: loaded, source } = await loadState();
  appState.value = loaded;
  if (source === 'migrated') toast('Data z předchozí verze TimeFlow byla převedena.', { tone: 'success' });
  if (source === 'recovered') toast('Uložená data byla poškozená, byla odložena a aplikace začíná načisto.', { tone: 'error' });

  // Načtený stav není třeba hned znovu ukládat (kromě migrace / nového stavu).
  let skipFirst = source === 'stored';
  effect(() => {
    const s = appState.value;
    if (skipFirst) {
      skipFirst = false;
      return;
    }
    if (!s || suppressSave) return;
    pendingSave = s;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), 300);
  });

  const flush = () => void flushSave();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('timeflow');
    channel.onmessage = async (e) => {
      if (e.data?.type !== 'saved') return;
      const { state: fresh } = await loadState();
      suppressSave = true;
      appState.value = fresh;
      suppressSave = false;
      history.clear();
      historyTick.value++;
      selection.value = null;
    };
  }

  setInterval(() => {
    const prevToday = today.value;
    now.value = new Date();
    // Pokud uživatel sledoval „dnešek“ a přešla půlnoc, posuneme se na nový den.
    if (today.value !== prevToday && selectedDate.value === prevToday) selectedDate.value = today.value;
  }, 20_000);

  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', (e) => (isNarrow.value = e.matches));

  effect(() => applyTheme(theme.value));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(theme.value));
}

export function setTheme(next: Theme): void {
  theme.value = next;
  writeTheme(next);
}

function applyTheme(t: Theme): void {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/** Pro testy / „smazat vše“. */
export function replaceState(next: AppState, keepHistory = true): void {
  if (keepHistory && appState.value) {
    history.record(appState.value);
    historyTick.value++;
  }
  appState.value = next;
  selection.value = null;
}

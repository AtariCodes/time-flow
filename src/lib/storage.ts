import { createStore, get, set, type UseStore } from 'idb-keyval';
import { convertLegacy, parseStoredState, readLegacyLocalStorage } from './schema';
import { createInitialState, type AppState } from './model';

const STATE_KEY = 'state';

let store: UseStore | null = null;
function db(): UseStore {
  store ??= createStore('timeflow', 'kv');
  return store;
}

export interface LoadResult {
  state: AppState;
  /** Odkud stav pochází — kvůli informaci pro uživatele. */
  source: 'stored' | 'migrated' | 'fresh' | 'recovered';
}

/**
 * Načte stav z IndexedDB. Při prvním spuštění převezme data původní verze
 * z localStorage (klíče timeflow_*), jinak založí výchozí kategorie a šablonu.
 */
export async function loadState(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await get(STATE_KEY, db());
  } catch {
    raw = undefined;
  }
  if (raw !== undefined) {
    const parsed = parseStoredState(raw);
    if (parsed) return { state: parsed, source: 'stored' };
    // Poškozená data neztrácíme — odložíme je stranou a začneme načisto.
    await set(`corrupted-${Date.now()}`, raw, db()).catch(() => {});
    return { state: createInitialState(), source: 'recovered' };
  }

  const legacy = typeof localStorage !== 'undefined' ? safeReadLegacy() : null;
  if (legacy) {
    const state = convertLegacy(legacy);
    if (state.categories.length === 0) state.categories = createInitialState().categories;
    return { state, source: 'migrated' };
  }
  return { state: createInitialState(), source: 'fresh' };
}

function safeReadLegacy() {
  try {
    return readLegacyLocalStorage(localStorage);
  } catch {
    return null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  await set(STATE_KEY, state, db());
}

// ---- Preference uložené mimo hlavní stav (potřebujeme je synchronně před vykreslením) ----

export type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'timeflow3_theme';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function writeTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* soukromý režim apod. */
  }
}

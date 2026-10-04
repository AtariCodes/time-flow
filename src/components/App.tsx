import { useEffect } from 'preact/hooks';
import {
  appState,
  dialog,
  editor,
  now,
  redo,
  selectedDate,
  selection,
  today,
  undo,
  view,
} from '../state/store';
import { blockLabel, deleteBlock } from '../state/actions';
import { addDays, formatClock, minutesOfDay } from '../lib/time';
import { Header } from './Header';
import { Calendar } from './Calendar';
import { CategoryBank } from './CategoryBank';
import { Templates } from './Templates';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { BlockEditorHost } from './BlockEditor';
import { DialogHost } from './Dialogs';
import { Toasts } from './Toasts';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const modalOpen = !!dialog.value || !!editor.value;

      if (mod && !isTyping(e.target) && !modalOpen) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
        }
        return;
      }
      if (isTyping(e.target) || modalOpen || e.altKey || mod) return;

      switch (e.key) {
        case 'Escape':
          selection.value = null;
          (document.activeElement as HTMLElement | null)?.blur?.();
          break;
        case 'Delete':
        case 'Backspace': {
          const sel = selection.value;
          if (sel) {
            e.preventDefault();
            deleteBlock(sel.date, sel.id);
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
          if (selection.value) break;
          e.preventDefault();
          selectedDate.value = addDays(selectedDate.value, (e.key === 'ArrowLeft' ? -1 : 1) * (view.value === 'week' ? 7 : 1));
          break;
        case 't':
        case 'T':
          selectedDate.value = today.value;
          break;
        case 'n':
        case 'N': {
          e.preventDefault();
          const s = appState.value!;
          const step = s.settings.snap;
          const start = selectedDate.value === today.value ? Math.min(1439, Math.ceil(minutesOfDay(new Date()) / step) * step) : 9 * 60;
          view.value = 'day';
          editor.value = { kind: 'new', date: selectedDate.value, start };
          break;
        }
        case 'd':
        case 'D':
          view.value = 'day';
          break;
        case 'w':
        case 'W':
          view.value = 'week';
          break;
        case '?':
          dialog.value = 'help';
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const notified = new Set<string>();

/** Upozornění na blížící se bloky — kontroluje se při každém tiku hodin. */
function useNotifications() {
  const s = appState.value;
  const tick = now.value;
  useEffect(() => {
    if (!s || !s.settings.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const date = today.value;
    const minute = minutesOfDay(tick);
    for (const block of s.days[date]?.blocks ?? []) {
      const until = block.start - minute;
      const key = `${date}:${block.id}:${block.start}`;
      if (until >= -1 && until <= s.settings.notifyLead && !notified.has(key)) {
        notified.add(key);
        const title = `${blockLabel(block, s.categories)} v ${formatClock(block.start)}`;
        const body = until > 1 ? `Začíná za ${Math.round(until)} min.` : 'Začíná teď.';
        void showNotification(title, body);
      }
    }
  }, [tick, s]);
}

async function showNotification(title: string, body: string) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, { body, icon: './icon.svg', tag: title });
    else new Notification(title, { body, icon: './icon.svg' });
  } catch {
    /* některé prohlížeče (např. iOS mimo PWA) upozornění nepodporují */
  }
}

export function App() {
  useShortcuts();
  useNotifications();
  if (!appState.value) return null;

  return (
    <div class="flex min-h-screen flex-col">
      <Header />
      <main class="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 xl:flex-row">
        <aside class="order-2 flex w-full shrink-0 flex-col gap-6 xl:order-1 xl:w-80" aria-label="Postranní panel">
          <Calendar />
          <CategoryBank />
          <Templates />
        </aside>
        <div class="order-1 min-w-0 flex-1 xl:order-2">{view.value === 'day' ? <DayView /> : <WeekView />}</div>
      </main>
      <footer class="px-6 pb-6 text-center text-[11px] text-slate-400">
        Data jsou uložena pouze ve vašem prohlížeči · <kbd>?</kbd> zobrazí klávesové zkratky
      </footer>
      <BlockEditorHost />
      <DialogHost />
      <Toasts />
    </div>
  );
}

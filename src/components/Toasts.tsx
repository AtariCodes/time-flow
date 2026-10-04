import { dismissToast, toasts } from '../state/store';
import { Icon } from './Icon';

export function Toasts() {
  return (
    <div
      class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      aria-live="polite"
      role="status"
    >
      {toasts.value.map((t) => (
        <div
          key={t.id}
          class={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
            t.tone === 'error'
              ? 'border-rose-800 bg-rose-950 text-rose-50'
              : 'border-slate-700 bg-slate-900 text-white'
          }`}
        >
          {t.tone === 'success' && <Icon name="check" class="h-4 w-4 shrink-0 text-emerald-400" />}
          {t.tone === 'error' && <Icon name="alert" class="h-4 w-4 shrink-0 text-rose-300" />}
          <span class="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="rounded-md bg-white/10 px-2 py-1 font-semibold text-indigo-200 hover:bg-white/20"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" class="text-white/60 hover:text-white" onClick={() => dismissToast(t.id)} aria-label="Zavřít">
            <Icon name="x" class="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

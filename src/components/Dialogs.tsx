import { useState } from 'preact/hooks';
import { appState, dialog, replaceState, setTheme, theme, toast, toastWithUndo } from '../state/store';
import { updateSettings } from '../state/actions';
import { ImportError, mergeStates, parseImport, summarizeImport, type ParsedImport } from '../lib/schema';
import { createInitialState, type SnapStep } from '../lib/model';
import { exportState } from '../lib/backup';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { SaveTemplateDialog } from './Templates';
import { CategoriesDialog } from './Categories';

export function DialogHost() {
  switch (dialog.value) {
    case 'import':
      return <ImportDialog />;
    case 'settings':
      return <SettingsDialog />;
    case 'help':
      return <HelpDialog />;
    case 'save-template':
      return <SaveTemplateDialog />;
    case 'categories':
      return <CategoriesDialog />;
    default:
      return null;
  }
}

const close = () => (dialog.value = null);

function ImportDialog() {
  const s = appState.value!;
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setParsed(null);
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Soubor je příliš velký (max. 20 MB).');
      return;
    }
    try {
      setParsed(parseImport(await file.text(), s.categories));
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Soubor se nepodařilo načíst.');
    }
  };

  const summary = parsed ? summarizeImport(s, parsed.state) : null;

  const apply = (mode: 'merge' | 'replace') => {
    if (!parsed) return;
    const next = mode === 'merge' ? mergeStates(s, parsed.state) : { ...parsed.state, settings: parsed.kind === 'v3' ? parsed.state.settings : s.settings };
    replaceState(next);
    close();
    toastWithUndo(mode === 'merge' ? 'Záloha byla sloučena s vašimi daty.' : 'Data byla nahrazena zálohou.');
  };

  return (
    <Modal title="Import zálohy" onClose={close} size="md">
      <div class="space-y-4 text-sm">
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Podporuje zálohy této verze i export z původního TimeFlow (formát 2.0 i starší zálohu jednoho dne). Soubor se před importem
          zkontroluje — nic se nezmění, dokud import nepotvrdíte.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          class="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-700"
          onChange={(e) => onFile(e.currentTarget.files?.[0])}
        />
        {error && (
          <p class="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <Icon name="alert" class="h-3.5 w-3.5" /> {error}
          </p>
        )}
        {parsed && summary && (
          <div class="space-y-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
            <div class="font-semibold">
              {parsed.kind === 'v3' ? 'Záloha TimeFlow 3' : parsed.kind === 'v2' ? 'Záloha původního TimeFlow' : 'Záloha jednoho dne (původní TimeFlow)'}
            </div>
            <ul class="list-inside list-disc space-y-0.5 text-slate-600 dark:text-slate-300">
              <li>Dní se záznamy: {summary.daysInFile}</li>
              <li>
                Z toho přepíše vaše existující dny: <strong>{summary.daysOverwritten}</strong>
              </li>
              <li>Nových kategorií: {summary.newCategories}</li>
              <li>Šablon dnů: {summary.templates}</li>
            </ul>
            <div class="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" class="btn" onClick={() => apply('replace')}>
                Nahradit všechna data
              </button>
              <button type="button" class="btn-primary" onClick={() => apply('merge')}>
                Sloučit
              </button>
            </div>
            <p class="text-[11px] text-slate-400">Obojí jde vrátit tlačítkem Zpět (Ctrl+Z).</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SettingsDialog() {
  const s = appState.value!;
  const settings = s.settings;
  const [confirmReset, setConfirmReset] = useState(false);

  const toggleNotify = async (on: boolean) => {
    if (on) {
      if (!('Notification' in window)) {
        toast('Tento prohlížeč upozornění nepodporuje.', { tone: 'error' });
        return;
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Upozornění nejsou povolena v prohlížeči.', { tone: 'error' });
        return;
      }
    }
    updateSettings({ notify: on });
  };

  return (
    <Modal title="Nastavení" onClose={close} size="md">
      <div class="space-y-5 text-sm">
        <fieldset>
          <legend class="label">Přichytávání při tažení</legend>
          <div class="segmented" role="group">
            {([1, 5, 10, 15, 30] as SnapStep[]).map((v) => (
              <button type="button" key={v} aria-pressed={settings.snap === v} onClick={() => updateSettings({ snap: v })}>
                {v} min
              </button>
            ))}
          </div>
          <p class="mt-1 text-[11px] text-slate-400">Při tažení podržte Alt pro posun po 1 minutě.</p>
        </fieldset>

        <fieldset>
          <legend class="label">Orientace časové osy</legend>
          <div class="segmented" role="group">
            {(
              [
                ['auto', 'Automaticky'],
                ['horizontal', 'Vodorovně'],
                ['vertical', 'Svisle'],
              ] as const
            ).map(([v, label]) => (
              <button type="button" key={v} aria-pressed={settings.orientation === v} onClick={() => updateSettings({ orientation: v })}>
                {label}
              </button>
            ))}
          </div>
          <p class="mt-1 text-[11px] text-slate-400">Automaticky = svisle na telefonu, vodorovně na počítači.</p>
        </fieldset>

        <fieldset>
          <legend class="label">Vzhled</legend>
          <div class="segmented" role="group">
            {(
              [
                ['system', 'Podle systému'],
                ['light', 'Světlý'],
                ['dark', 'Tmavý'],
              ] as const
            ).map(([v, label]) => (
              <button type="button" key={v} aria-pressed={theme.value === v} onClick={() => setTheme(v)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="label">Upozornění</legend>
          <label class="flex items-center gap-2">
            <input type="checkbox" class="h-4 w-4 accent-indigo-600" checked={settings.notify} onChange={(e) => void toggleNotify(e.currentTarget.checked)} />
            Upozornit na začátek bloku
          </label>
          {settings.notify && (
            <label class="flex items-center gap-2 text-xs">
              <input
                type="number"
                class="input w-20 py-1"
                min={0}
                max={120}
                value={settings.notifyLead}
                onChange={(e) => updateSettings({ notifyLead: Math.max(0, Math.min(120, Number(e.currentTarget.value) || 0)) })}
              />
              minut předem
            </label>
          )}
          <p class="text-[11px] text-slate-400">Funguje, dokud je TimeFlow otevřený (i na pozadí v kartě nebo jako nainstalovaná aplikace).</p>
        </fieldset>

        <fieldset class="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <legend class="label">Data</legend>
          <p class="text-[11px] text-slate-400">Vše je uložené jen v tomto prohlížeči (IndexedDB). Pravidelně si dělejte zálohu.</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn" onClick={() => exportState(s)}>
              <Icon name="download" class="h-3.5 w-3.5" /> Exportovat zálohu
            </button>
            <button type="button" class="btn" onClick={() => (dialog.value = 'import')}>
              <Icon name="upload" class="h-3.5 w-3.5" /> Importovat
            </button>
            {confirmReset ? (
              <button
                type="button"
                class="btn-danger border border-rose-300 dark:border-rose-800"
                onClick={() => {
                  replaceState(createInitialState());
                  close();
                  toastWithUndo('Všechna data byla smazána.');
                }}
              >
                Opravdu smazat vše?
              </button>
            ) : (
              <button type="button" class="btn-danger" onClick={() => setConfirmReset(true)}>
                <Icon name="trash" class="h-3.5 w-3.5" /> Smazat všechna data
              </button>
            )}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ + Z', 'Zpět'],
  ['Ctrl/⌘ + Shift + Z, Ctrl + Y', 'Znovu'],
  ['← / →', 'Předchozí / další den'],
  ['T', 'Dnes'],
  ['N', 'Nový blok'],
  ['D / W', 'Denní / týdenní pohled'],
  ['?', 'Tato nápověda'],
  ['Tab', 'Přechod mezi bloky'],
  ['Šipky (na bloku)', 'Posun bloku o krok přichytávání'],
  ['Shift + šipky', 'Změna délky bloku'],
  ['Alt + šipky / tažení', 'Jemný krok 1 minuta'],
  ['Enter', 'Upravit blok'],
  ['Mezerník', 'Označit jako splněné'],
  ['Delete', 'Smazat blok (lze vrátit)'],
  ['Ctrl/⌘ + D', 'Duplikovat blok'],
  ['Esc', 'Zrušit výběr / zavřít dialog'],
];

function HelpDialog() {
  return (
    <Modal title="Ovládání a klávesové zkratky" onClose={close} size="md">
      <div class="space-y-4 text-sm">
        <ul class="list-inside list-disc space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <li>Klikněte do prázdného místa na ose → nový blok v daném čase.</li>
          <li>Blok táhněte myší, za okraje měníte začátek a konec. Dvojklik otevře editor.</li>
          <li>Na dotykovém displeji blok nejdřív ťukněte (vybere se), potom ho táhněte.</li>
          <li>Blok může přesáhnout půlnoc — pokračování se zobrazí v dalším dni.</li>
          <li>Kategorii ze zásoby přetáhněte na osu, nebo na ni klikněte (vloží se do prvního volného místa).</li>
        </ul>
        <table class="w-full text-xs">
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key} class="border-t border-slate-100 dark:border-slate-800">
                <td class="py-1.5 pr-3">
                  <kbd class="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800">{key}</kbd>
                </td>
                <td class="py-1.5 text-slate-600 dark:text-slate-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

# TimeFlow

Plánovač dne na 24hodinové časové ose. Běží celý v prohlížeči, data neopouštějí vaše zařízení.

## Funkce

- **Časová osa dne** – vodorovná na počítači, svislá na telefonu; přiblížení 24 / 12 / 6 / 3 h.
- **Tažení myší i dotykem** – posun bloku, změna začátku i konce, přichytávání (1–30 min, Alt = 1 min).
- **Bloky přes půlnoc** – např. spánek 23:00–07:00; pokračování se zobrazí v dalším dni.
- **Překryvy** – bloky se zobrazí vedle sebe a statistiky je nepočítají dvakrát (využití nikdy nepřesáhne 100 %).
- **Volná místa** – seznam mezer v plánu, kliknutím je vyplníte.
- **Kategorie** s barvou, výchozí délkou a týdenním cílem; text bloku má vždy čitelný kontrast.
- **Plán vs. realita** – bloky lze označit jako splněné.
- **Šablony dnů** s opakováním (např. „Pracovní den“ pro Po–Pá). Prázdný den nabídne vhodnou šablonu nebo kopii včerejška či stejného dne minulý týden.
- **Ciferník** – celý den jako 24h kruh.
- **Týdenní pohled** a statistiky za den / týden / měsíc včetně plnění cílů.
- **Zpět / Znovu** (Ctrl+Z / Ctrl+Shift+Z) pro všechny změny, místo potvrzovacích dialogů.
- **Ovládání klávesnicí** – zkratky zobrazí klávesa `?`.
- **Záloha** – export a import JSON s kontrolou dat a náhledem změn (sloučit / nahradit).
  Import umí i zálohy původní verze TimeFlow.
- **PWA** – lze nainstalovat jako aplikaci, funguje offline, umí upozornit na začátek bloku.
- Světlý / tmavý režim (i podle systému) bez probliknutí.

## Vývoj

```bash
npm install
npm run dev          # vývojový server
npm test             # unit testy (vitest)
npm run typecheck    # kontrola typů
npm run build        # produkční build do dist/
npm run build:single # jediný soubor dist-single/index.html, který jde otevřít přímo z disku
```

Stack: [Preact](https://preactjs.com/) + [signals](https://preactjs.com/guide/v10/signals/), TypeScript, Vite,
Tailwind CSS v4, [zod](https://zod.dev/) (validace importu), IndexedDB přes [idb-keyval](https://github.com/jakearchibald/idb-keyval).

### Struktura

| Cesta | Obsah |
| --- | --- |
| `src/lib/time.ts` | práce s časem a daty |
| `src/lib/model.ts` | datový model (kategorie, bloky, dny, šablony, nastavení) |
| `src/lib/schedule.ts` | čistá logika plánu: úseky přes půlnoc, překryvy, pruhy, volná místa, statistiky |
| `src/lib/schema.ts` | validace, import, migrace z původní verze |
| `src/lib/storage.ts` | ukládání do IndexedDB |
| `src/state/` | stav aplikace (signals), historie zpět/znovu, akce |
| `src/components/` | rozhraní |
| `tests/` | unit testy |
| `legacy/TimeFlow-v2.html` | původní jednosouborová verze (pro srovnání) |

### Data

Stav je jeden verzovaný objekt (`version: 3`) v IndexedDB. Při prvním spuštění na stejné adrese, kde běžela
původní verze, se její data z `localStorage` (klíče `timeflow_*`) automaticky převedou; původní klíče se nemažou.
Pokud běžela jinde, stačí v původní verzi udělat „Export (Vše)“ a soubor naimportovat.

Změny se ukládají průběžně; otevřete-li aplikaci ve více záložkách, změna v jedné se projeví v ostatních.

### Nasazení

`.github/workflows/pages.yml` nasadí aplikaci na GitHub Pages po každém push do `main`
(v nastavení repozitáře je potřeba jednou zvolit **Settings → Pages → Source: GitHub Actions**).

## Omezení

- Den má vždy 24 h – při přechodu na letní / zimní čas se hodina navíc / chybějící hodina neřeší zvlášť.
- Upozornění fungují jen když je aplikace otevřená (v kartě nebo jako nainstalovaná PWA).
- Synchronizace mezi zařízeními není – přenos přes export / import.

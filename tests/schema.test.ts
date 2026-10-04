import { describe, expect, it } from 'vitest';
import { ImportError, mergeStates, parseImport, readLegacyLocalStorage, summarizeImport } from '../src/lib/schema';
import { createInitialState } from '../src/lib/model';

const legacyExport = {
  version: '2.0',
  exportDate: '2026-09-30',
  days: {
    '2026-09-29': [
      { id: 'b1', name: 'Spánek', startTime: 0, duration: 480, color: '#6366f1' },
      { id: 'b2', name: 'Kytara', startTime: 1200, duration: 45, color: '#ff00aa' },
    ],
    'not-a-date': [],
  },
  notes: { '2026-09-29': 'Ahoj <img src=x onerror=alert(1)>' },
  templates: [{ id: 't1', name: 'Hluboká práce', duration: 120, color: '#4f46e5' }],
  dayTemplates: [{ id: 'dt1', name: 'Den', blocks: [{ id: 'x', name: 'Spánek', startTime: 0, duration: 480, color: '#6366f1' }] }],
};

describe('parseImport', () => {
  it('converts the TimeFlow v2 export and reuses categories by name', () => {
    const current = createInitialState();
    const { kind, state } = parseImport(JSON.stringify(legacyExport), current.categories);
    expect(kind).toBe('v2');
    const day = state.days['2026-09-29'];
    expect(day.blocks).toHaveLength(2);
    // "Spánek" již existuje → použije se stávající kategorie
    expect(day.blocks[0].categoryId).toBe('c_sleep');
    // "Kytara" je nová kategorie
    const guitar = state.categories.find((c) => c.name === 'Kytara');
    expect(guitar?.color).toBe('#ff00aa');
    expect(state.days['not-a-date']).toBeUndefined();
    // Poznámka zůstává jako text — escapování řeší vykreslování (Preact), ne import.
    expect(day.note).toContain('<img');
    expect(state.templates[0].blocks[0].categoryId).toBe('c_sleep');
  });

  it('imports a legacy export with broken blocks instead of rejecting the whole file', () => {
    const longName = 'x'.repeat(300);
    const messy = {
      version: '2.0',
      days: {
        '2026-09-01': [
          { id: 'ok', name: 'Práce', startTime: 540, duration: 60, color: '#4f46e5' },
          { id: 'nan', name: 'Rozbitý', startTime: 600, duration: null, color: '#4f46e5' },
          { id: 'str', name: longName, startTime: '720', duration: '30', color: 'blue' },
          null,
        ],
        '2026-09-02': 'nonsense',
      },
      notes: { '2026-09-01': 'ok', '2026-09-03': null },
      templates: [{ name: 'Práce', duration: null, color: '#4f46e5' }, { foo: 1 }],
      dayTemplates: [{ name: 'Den', blocks: [{ name: 'Práce', startTime: 0, duration: 60, color: '#4f46e5' }] }],
    };
    const { kind, state, skipped } = parseImport('\uFEFF' + JSON.stringify(messy), []);
    expect(kind).toBe('v2');
    expect(skipped).toBe(4); // blok s null, null blok, den jako text, šablona bez názvu
    const blocks = state.days['2026-09-01'].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ start: 720, duration: 30 });
    const cat = state.categories.find((c) => c.id === blocks[1].categoryId)!;
    expect(cat.name).toHaveLength(120);
    expect(cat.color).toBe('#64748b');
    expect(state.days['2026-09-03']).toBeUndefined();
    expect(state.templates[0].blocks).toHaveLength(1);
  });

  it('converts the legacy single-day format', () => {
    const { kind, state } = parseImport(
      JSON.stringify({ date: '2026-09-01', scheduledBlocks: [{ name: 'A', startTime: 60, duration: 30, color: '#000000' }] }),
      [],
    );
    expect(kind).toBe('v1');
    expect(state.days['2026-09-01'].blocks[0]).toMatchObject({ start: 60, duration: 30 });
  });

  it('round-trips the v3 format', () => {
    const s = createInitialState();
    s.days['2026-10-01'] = { note: 'x', blocks: [{ id: 'b', categoryId: 'c_deep', start: 600, duration: 60, done: true }] };
    const { kind, state } = parseImport(JSON.stringify(s), []);
    expect(kind).toBe('v3');
    expect(state).toEqual(s);
  });

  it('rejects malicious or broken data', () => {
    const s = createInitialState() as unknown as Record<string, unknown>;
    (s.categories as { color: string }[])[0].color = 'red;background:url(//evil)';
    expect(() => parseImport(JSON.stringify(s), [])).toThrow(ImportError);
    expect(() => parseImport('{nope', [])).toThrow(ImportError);
    expect(() => parseImport('{"foo":1}', [])).toThrow('Neznámý formát');
    // Poškozená v3 záloha se nesmí tvářit jako (prázdná) stará záloha.
    expect(() =>
      parseImport('{"version":3,"categories":[{"id":"a","name":"x","color":"red;","defaultDuration":5}],"days":{},"templates":[]}', []),
    ).toThrow('neplatná data');
  });

  it('adds placeholder categories for unknown references', () => {
    const s = createInitialState();
    s.days['2026-10-01'] = { note: '', blocks: [{ id: 'b', categoryId: 'ghost', start: 0, duration: 10 }] };
    const { state } = parseImport(JSON.stringify(s), []);
    expect(state.categories.find((c) => c.id === 'ghost')?.archived).toBe(true);
  });
});

describe('merge & summary', () => {
  it('overwrites only the days present in the backup', () => {
    const current = createInitialState();
    current.days['2026-10-01'] = { note: 'keep', blocks: [] };
    current.days['2026-10-02'] = { note: 'old', blocks: [] };
    const incoming = createInitialState();
    incoming.days['2026-10-02'] = { note: 'new', blocks: [] };
    incoming.days['2026-10-03'] = { note: 'added', blocks: [] };
    expect(summarizeImport(current, incoming)).toMatchObject({ daysInFile: 2, daysOverwritten: 1 });
    const merged = mergeStates(current, incoming);
    expect(merged.days['2026-10-01'].note).toBe('keep');
    expect(merged.days['2026-10-02'].note).toBe('new');
    expect(merged.days['2026-10-03'].note).toBe('added');
  });
});

describe('readLegacyLocalStorage', () => {
  it('reads keys of the previous version and skips corrupted days', () => {
    const data: Record<string, string> = {
      timeflow_day_2026: 'garbage{',
      'timeflow_day_2026-09-01': JSON.stringify([{ name: 'A', startTime: 0, duration: 60, color: '#123456' }]),
      'timeflow_note_2026-09-01': 'note',
      timeflow_templates: JSON.stringify([{ name: 'A', duration: 60, color: '#123456' }]),
      other: 'x',
    };
    const storage = {
      get length() {
        return Object.keys(data).length;
      },
      key: (i: number) => Object.keys(data)[i] ?? null,
      getItem: (k: string) => data[k] ?? null,
    } as unknown as Storage;
    const legacy = readLegacyLocalStorage(storage);
    expect(Object.keys(legacy!.days)).toEqual(['2026-09-01']);
    expect(legacy!.notes!['2026-09-01']).toBe('note');
    expect(legacy!.templates).toHaveLength(1);
  });
});

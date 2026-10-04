import { describe, expect, it } from 'vitest';
import { History } from '../src/state/history';

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History<number>();
    h.record(1);
    h.record(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
  });

  it('coalesces rapid edits with the same key', () => {
    const h = new History<string>();
    h.record('a', 'note', 0);
    h.record('ab', 'note', 500);
    h.record('abc', 'note', 900);
    expect(h.undo('abcd')).toBe('a');
    expect(h.canUndo).toBe(false);
  });

  it('clears redo stack on new change', () => {
    const h = new History<number>();
    h.record(1);
    h.undo(2);
    h.record(1);
    expect(h.canRedo).toBe(false);
  });
});

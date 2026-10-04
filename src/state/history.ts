/** Jednoduchá historie stavů pro undo/redo. Stavy jsou neměnné snímky. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastTag: string | null = null;
  private lastTime = 0;

  constructor(private readonly limit = 200) {}

  /**
   * Zaznamená předchozí stav. Změny se stejným `coalesce` klíčem do 1,5 s
   * (např. psaní poznámky) se sloučí do jednoho kroku.
   */
  record(previous: T, coalesce?: string, now = Date.now()): void {
    const merge = coalesce !== undefined && coalesce === this.lastTag && now - this.lastTime < 1500;
    if (!merge) {
      this.past.push(previous);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.lastTag = coalesce ?? null;
    this.lastTime = now;
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastTag = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastTag = null;
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastTag = null;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

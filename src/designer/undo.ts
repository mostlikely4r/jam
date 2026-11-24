/**
 * The stack behind Ctrl-Z in the designer: snapshots of what the pages edit, oldest first, with
 * the one on screen somewhere inside it. Undo steps back through them, redo forward, and a new
 * snapshot after an undo drops the side that was undone. Kept away from the DOM so it tests on
 * its own.
 */
export class UndoStack {
  private readonly states: string[];
  /** Where the state on screen sits: 0 is the oldest kept. */
  private at = 0;

  /** `limit` is how many snapshots are kept at most, the one on screen included. */
  constructor(
    private readonly limit: number,
    first: string,
  ) {
    this.states = [first];
  }

  /** Records the state as it is now: the one on top again changes nothing, a new one drops the redo side. */
  record(state: string): void {
    if (this.states[this.at] === state) return;
    this.states.length = this.at + 1;
    this.states.push(state);
    if (this.states.length > this.limit) this.states.splice(0, this.states.length - this.limit);
    this.at = this.states.length - 1;
  }

  /** The state before this one, which is now the one on screen, or null at the start. */
  undo(): string | null {
    if (this.at === 0) return null;
    this.at--;
    return this.states[this.at];
  }

  /** The state after this one, which is now the one on screen, or null at the end. */
  redo(): string | null {
    if (this.at >= this.states.length - 1) return null;
    this.at++;
    return this.states[this.at];
  }

  /** How many steps back there are. */
  get back(): number {
    return this.at;
  }

  /** How many steps forward there are. */
  get forward(): number {
    return this.states.length - 1 - this.at;
  }
}

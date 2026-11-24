import { describe, expect, it } from "vitest";
import { UndoStack } from "./undo";

describe("the undo stack", () => {
  it("steps back through what was recorded and forward again", () => {
    const stack = new UndoStack(100, "a");
    stack.record("b");
    stack.record("c");
    expect(stack.back).toBe(2);
    expect(stack.undo()).toBe("b");
    expect(stack.undo()).toBe("a");
    expect(stack.undo()).toBe(null);
    expect(stack.redo()).toBe("b");
    expect(stack.redo()).toBe("c");
    expect(stack.redo()).toBe(null);
  });

  it("a new change after an undo drops what was undone", () => {
    const stack = new UndoStack(100, "a");
    stack.record("b");
    stack.record("c");
    stack.undo();
    stack.undo();
    expect(stack.forward).toBe(2);
    stack.record("d");
    expect(stack.forward).toBe(0);
    expect(stack.undo()).toBe("a");
    expect(stack.redo()).toBe("d");
  });

  it("recording the state on top again changes nothing", () => {
    const stack = new UndoStack(100, "a");
    stack.record("b");
    stack.record("b");
    expect(stack.back).toBe(1);
    expect(stack.undo()).toBe("a");
  });

  it("keeps at most its limit, dropping the oldest first", () => {
    const stack = new UndoStack(3, "a");
    stack.record("b");
    stack.record("c");
    stack.record("d");
    // "a" fell off the back, so the oldest kept is "b".
    expect(stack.back).toBe(2);
    expect(stack.undo()).toBe("c");
    expect(stack.undo()).toBe("b");
    expect(stack.undo()).toBe(null);
  });

  it("a change made after an undo still keeps to the limit", () => {
    const stack = new UndoStack(2, "a");
    stack.record("b");
    stack.record("c");
    // Full at two, so "a" fell off: undoing lands on "b".
    expect(stack.undo()).toBe("b");
    stack.record("d");
    expect(stack.back).toBe(1);
    expect(stack.undo()).toBe("b");
    expect(stack.redo()).toBe("d");
  });
});

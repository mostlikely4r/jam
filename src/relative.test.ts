import { describe, expect, it } from "vitest";
import { relativeLine, relativeVelocity, willCollide, type Motion } from "./relative";

/** A moving thing at x, y with velocity vx, vy, and a radius. */
function moving(x: number, y: number, vx: number, vy: number, radius = 4): Motion {
  return { x, y, vx, vy, radius };
}

describe("relative lines", () => {
  it("measures a target against each reference", () => {
    const target = moving(10, 20, 12, -3);
    const ship = moving(0, 0, 5, 2);
    expect(relativeVelocity(target, ship)).toEqual({ vx: 7, vy: -5 });
    const chair = moving(30, 40, -4, 9);
    expect(relativeVelocity(target, chair)).toEqual({ vx: 16, vy: -12 });
  });

  it("draws the line from the target along its relative velocity", () => {
    const target = moving(100, 50, 8, -6);
    const reference = moving(0, 0, 3, -2);
    expect(relativeLine(target, reference, 2)).toEqual({ from: { x: 100, y: 50 }, to: { x: 110, y: 42 } });
  });

  it("draws nothing for the target against itself: the inversion case draws the ship instead", () => {
    const target = moving(100, 50, 8, -6);
    expect(relativeLine(target, target, 2)).toBeNull();
  });

  it("matches a moving target with the reference exactly", () => {
    const target = moving(100, 50, 8, -6);
    expect(relativeLine(target, moving(0, 0, 8, -6), 2)).toEqual({ from: { x: 100, y: 50 }, to: { x: 100, y: 50 } });
  });

  it("sees a head-on course collide", () => {
    const rock = moving(0, 0, 20, 0, 5);
    const ship = moving(100, 0, -20, 0, 4);
    expect(willCollide(rock, ship, 10)).toBe(true);
  });

  it("sees a near miss not collide", () => {
    const rock = moving(0, 0, 20, 0, 5);
    const ship = moving(100, 40, -20, 0, 4);
    expect(willCollide(rock, ship, 10)).toBe(false);
  });

  it("sees a course pulling apart not collide", () => {
    const rock = moving(0, 0, -20, 0, 5);
    const ship = moving(100, 0, 20, 0, 4);
    expect(willCollide(rock, ship, 10)).toBe(false);
  });

  it("sees a course that meets only after the seconds looked ahead", () => {
    const rock = moving(0, 0, 1, 0, 5);
    const ship = moving(100, 0, -1, 0, 4);
    // They meet in 50 seconds; the test only looks 10 ahead.
    expect(willCollide(rock, ship, 10)).toBe(false);
    expect(willCollide(rock, ship, 60)).toBe(true);
  });

  it("sees something already touching as colliding", () => {
    expect(willCollide(moving(0, 0, 0, 0, 5), moving(8, 0, 0, 0, 4), 0.1)).toBe(true);
  });
});

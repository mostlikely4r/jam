/**
 * Relative motion: how one thing moves against another, for the Relative lines program.
 * Plain maths, no world: the renderer hands it the spots it has and draws what comes back.
 */
export interface Motion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How close counts as touching, for the will-collide test. */
  radius: number;
}

/** How fast `target` moves compared with `reference`. Both are in the same frame. */
export function relativeVelocity(target: Motion, reference: Motion): { vx: number; vy: number } {
  return { vx: target.vx - reference.vx, vy: target.vy - reference.vy };
}

/**
 * The line a target draws against a reference: from its middle along its relative velocity for
 * `seconds`, so a long line means fast and no line means matched. Null when the target is the
 * reference itself, which draws nothing: the inversion case draws the ship instead.
 */
export function relativeLine(
  target: Motion,
  reference: Motion,
  seconds: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (target === reference) return null;
  const { vx, vy } = relativeVelocity(target, reference);
  return { from: { x: target.x, y: target.y }, to: { x: target.x + vx * seconds, y: target.y + vy * seconds } };
}

/**
 * When two things on straight paths come closest, in seconds from now (never before now), and
 * how close they are then. Only honest while nothing turns, thrusts or bounces.
 */
export function closestApproach(target: Motion, reference: Motion, seconds: number): { at: number; distance: number } {
  const { vx, vy } = relativeVelocity(target, reference);
  const dx = target.x - reference.x;
  const dy = target.y - reference.y;
  const speed2 = vx * vx + vy * vy;
  const at = speed2 > 0 ? Math.max(0, Math.min(seconds, -(dx * vx + dy * vy) / speed2)) : 0;
  return { at, distance: Math.hypot(dx + vx * at, dy + vy * at) };
}

/**
 * Whether two things on straight paths come within their radii added together, at some point
 * in the next `seconds`. Only honest while nothing turns, thrusts or bounces.
 */
export function willCollide(target: Motion, reference: Motion, seconds: number): boolean {
  return closestApproach(target, reference, seconds).distance <= target.radius + reference.radius;
}

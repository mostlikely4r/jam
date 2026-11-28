/**
 * Who an entity belongs to, and whose money it uses (`docs/station-frames-plan.md`, step 3).
 *
 * Every entity has an owner: another entity, by id, or at the top of the chain an agent. An agent
 * is whoever decides (the player or a faction); it has no body and no account of its own, it is
 * only where the chain stops. An entity's account is its own or its owner's, so money can flow
 * through the owner: a station's deposit sells for the station's credits. In this build the owner
 * is read for money only.
 */

/** Whoever decides, at the top of an owner chain. */
export const AGENTS = ["player", "stations", "pirates"] as const;
export type Agent = (typeof AGENTS)[number];

export function isAgent(owner: string): owner is Agent {
  return (AGENTS as readonly string[]).includes(owner);
}

/** Money an entity holds. */
export interface Account {
  credits: number;
}

/** Something that has an owner and an account: its own, or `"owner"` for its owner's. */
export interface Owned {
  id: string;
  /** Another entity's id, or an agent. */
  owner: string;
  account: Account | "owner";
}

/**
 * The first entity whose owner chain comes back to itself, or null when every chain ends at an
 * agent or at an entity that isn't in the list. Nothing may end up owning itself.
 */
export function ownerLoop(entities: Iterable<Owned>): string | null {
  const byId = new Map<string, Owned>();
  for (const entity of entities) byId.set(entity.id, entity);
  for (const start of byId.values()) {
    const seen = new Set<string>();
    let at: Owned | undefined = start;
    while (at) {
      if (seen.has(at.id)) return start.id;
      seen.add(at.id);
      at = isAgent(at.owner) ? undefined : byId.get(at.owner);
    }
  }
  return null;
}

/**
 * The account an entity's money goes through: its own, or the first own account up its owner
 * chain. Null if the chain reaches an agent, or an owner not in the list, without one.
 */
export function accountOf(entity: Owned, byId: (id: string) => Owned | null): Account | null {
  const seen = new Set<string>();
  let at: Owned | null = entity;
  while (at && !seen.has(at.id)) {
    if (at.account !== "owner") return at.account;
    seen.add(at.id);
    at = isAgent(at.owner) ? null : byId(at.owner);
  }
  return null;
}

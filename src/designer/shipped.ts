/**
 * The layout everyone plays: the designer's world file, built into the game. In dev, the
 * designer's own draft in the browser comes first, and this is where a fresh draft starts.
 */
import file from "./world.json";
import { parseWorld, seedWorld, type World } from "./world";

export function shippedWorld(): World {
  return parseWorld(JSON.stringify(file)) ?? seedWorld();
}

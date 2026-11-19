/**
 * Runs a layout recipe (see recipes.ts) and reports what it did; writes the result if asked.
 * Run with: npm run layout -- [recipe] [--ship | --save name]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { warmStart } from "../profile/start";
import { RECIPES } from "./recipes";
import { shippedWorld } from "./shipped";
import { seedWorld, stringifyWorld } from "./world";

const [name, flag, saveName] = process.argv.slice(2);
const recipe = name ? RECIPES[name] : undefined;
if (!recipe) {
  console.log("Recipes:");
  for (const [key, { about }] of Object.entries(RECIPES)) console.log(`  ${key}: ${about}`);
  process.exit(name ? 1 : 0);
}
const world = recipe.start === "shipped" ? shippedWorld() : seedWorld();
for (const line of recipe.apply(world)) console.log(line);
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
if (flag === "--ship") {
  writeFileSync(here("./world.json"), stringifyWorld(world));
  console.log("Wrote the shipped world: src/designer/world.json");
  // The start new games begin in is keyed to the layout: a new one needs a new start.
  for (const line of warmStart(60, 1, true)) console.log(line);
} else if (flag === "--save" && saveName) {
  mkdirSync(here("./layouts"), { recursive: true });
  writeFileSync(here(`./layouts/${saveName}.json`), stringifyWorld(world));
  console.log(`Wrote src/designer/layouts/${saveName}.json`);
}

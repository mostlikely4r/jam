/**
 * The system editors stay reachable from main.ts alone, so the game can later load them on
 * demand instead of shipping them, and so nothing in the game grows an accidental dependency
 * on the tooling. The no-player bot is the same: a dev tool that plays the game's own ship,
 * reachable only through the switch in main.ts, never a part of the game itself.
 *
 * Everything else that is not itself a designer or bot module may not import them.
 *
 * Run by `npm run build`, so a violation fails CI rather than waiting to be noticed.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
/** The editors and the bot, by the tail of whatever path a game module might import. */
const EDITORS = /(^|\/)(designer\/(hulls|designer|faces|roll)|bot\/(bot|log|plan))$/;
/** The one module allowed to reach them: the entry point that mounts them behind `?dev`. */
const ALLOWED = new Set(["main.ts"]);

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (path.endsWith(".ts")) files.push(path);
  }
}
await walk(ROOT);

const offenders = [];
for (const file of files) {
  const name = relative(ROOT, file).replaceAll("\\", "/");
  // A designer module may import its siblings; the rule is about the game reaching in.
  if (ALLOWED.has(name) || name.startsWith("designer/") || name.startsWith("bot/")) continue;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const imported = line.match(/^\s*(?:import|export)\b.*?\bfrom\s+"([^"]+)"/);
    const specifier = imported?.[1];
    if (!specifier) continue;
    if (EDITORS.test(specifier.replace(/\.ts$/, ""))) offenders.push(`${name}: ${line.trim()}`);
  }
}

if (offenders.length > 0) {
  console.error("The system editors and the bot may only be imported from src/main.ts:");
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

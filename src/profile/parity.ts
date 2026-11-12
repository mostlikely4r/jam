/**
 * The slow check that what's out of view behaves like what's in view: the same world played
 * with everything flown and with records, over several seeds and game hours, camera far
 * away, totals compared. Takes a while (the flown side is slow, that's why records exist),
 * so it isn't part of `npm test`. Run it from time to time, ideally on a copy of a commit
 * so work carries on meanwhile; each run adds an entry to the log, a backlog to look over.
 *
 * Run with: npm run parity -- [game minutes per seed] [seeds] [log file]
 * Defaults: 60 minutes, 8 seeds, docs/parity-log.md.
 */
import { spawn, execSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";

const minutes = Number(process.argv[2]) || 60;
const seeds = Number(process.argv[3]) || 8;
const log = process.argv[4] || "docs/parity-log.md";

/** Totals from flown and recorded runs that should come out about the same. */
const COMPARED = [
  "traffic wrecked",
  "pirate wrecked",
  "defender wrecked",
  "traffic left",
  "pirates left",
  "defenders left",
  "traffic hits taken",
  "pirate hits taken",
  "defender hits taken",
  "attacks begun by pirate",
  "attacks begun by defender",
  "traffic sold",
  "pirate credits",
  "pirate ore",
  "base ore",
];

type Totals = Record<string, number>;

function census(seed: number, mode: "flown" | "records"): Promise<Totals> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["vite-node", "src/profile/census.ts", String(minutes), String(seed), mode, "1", "--json"], { shell: true });
    let out = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("close", (code) => {
      const line = out.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`census seed ${seed} ${mode} failed (${code}): ${out.slice(-300)}`));
      }
    });
  });
}

/** Runs every job, a few at a time. */
async function pool<T>(jobs: (() => Promise<T>)[], width: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
  return results;
}

const sum = (runs: Totals[]): Totals => {
  const total: Totals = {};
  for (const run of runs) for (const [key, value] of Object.entries(run)) total[key] = (total[key] ?? 0) + value;
  return total;
};

/**
 * Whether two totals are far enough apart to look at. Counts of chance events wobble by
 * about their square root, so a difference has to beat that and be a sizeable share too.
 */
function verdict(flown: number, records: number): "ok" | "check" {
  const mean = (flown + records) / 2;
  const ratio = (records + 1) / (flown + 1);
  const big = Math.abs(records - flown) > 3 * Math.sqrt(mean) + 3;
  return big && (ratio < 2 / 3 || ratio > 3 / 2) ? "check" : "ok";
}

const started = Date.now();
const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
const jobs = seedList.flatMap((seed) => [() => census(seed, "flown"), () => census(seed, "records")]);
console.log(`Parity: ${seeds} seeds x ${minutes} game minutes, flown and as records, ${jobs.length} runs.`);
const results = await pool(jobs, Math.max(1, cpus().length - 2));
const flown = sum(results.filter((_, i) => i % 2 === 0));
const records = sum(results.filter((_, i) => i % 2 === 1));

const git = (command: string) => {
  try {
    return execSync(`git ${command}`, { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
};
const commit = `${git("rev-parse --short HEAD")}${git("status --porcelain") ? " (with uncommitted changes)" : ""}`;
const rows = COMPARED.map((key) => {
  const a = flown[key] ?? 0;
  const b = records[key] ?? 0;
  return { key, a, b, verdict: verdict(a, b) };
});
const checks = rows.filter((row) => row.verdict === "check");
const date = new Date().toISOString().slice(0, 16).replace("T", " ");
const entry = [
  `## ${date} — ${commit} — ${checks.length === 0 ? "all ok" : `${checks.length} to check`}`,
  "",
  `${seeds} seeds × ${minutes} game minutes, camera far away. Took ${Math.round((Date.now() - started) / 60000)} min; flown side ${Math.round(flown.seconds ?? 0)} s of work, records ${Math.round(records.seconds ?? 0)} s.`,
  "",
  "| Total | Flown | Records | |",
  "|---|---:|---:|---|",
  ...rows.map((row) => `| ${row.key} | ${row.a} | ${row.b} | ${row.verdict === "check" ? "**check**" : "ok"} |`),
  "",
  "Looked at: not yet.",
  "",
  "",
].join("\n");
if (!existsSync(log)) {
  writeFileSync(
    log,
    "# Parity log\n\nEach entry is one `npm run parity`: the same world played flown and as records, out of view. " +
      "A **check** is a difference bigger than chance would explain. Look at new entries from time to time, " +
      "and write under each what it turned out to be.\n\n",
  );
}
appendFileSync(log, entry);
console.log(entry);

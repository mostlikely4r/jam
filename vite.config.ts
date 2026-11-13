import { defineConfig, type Plugin } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

/** Where the system designer keeps its layout, which the built game ships with. */
const WORLD_FILE = fileURLToPath(new URL("./src/designer/world.json", import.meta.url));
/** Layouts made by recipes (npm run layout), for trying out. Never shipped. */
const LAYOUTS = fileURLToPath(new URL("./src/designer/layouts/", import.meta.url));

/** Lets the system designer read and write its world file while developing. Not in the built game. */
function worldFile(): Plugin {
  return {
    name: "world-file",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__layouts", async (_req, res) => {
        const names = await readdir(LAYOUTS).catch(() => [] as string[]);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5))));
      });
      // Runs the world with no player and writes the start new games begin in (src/start.json).
      server.middlewares.use("/__warm", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const minutes = Math.max(1, Math.min(600, Math.round(Number(new URL(req.url ?? "", "http://x").searchParams.get("minutes")) || 60)));
        const runner = fileURLToPath(new URL("./node_modules/vite-node/vite-node.mjs", import.meta.url));
        execFile(process.execPath, [runner, "src/profile/warm.ts", String(minutes), "1", "--ship"], { cwd: fileURLToPath(new URL(".", import.meta.url)), timeout: 30 * 60 * 1000 }, (error, stdout, stderr) => {
          res.statusCode = error ? 500 : 200;
          res.end(error ? String(stderr || error) : stdout);
        });
      });
      server.middlewares.use("/__world", async (req, res) => {
        try {
          if (req.method === "GET") {
            const layout = new URL(req.url ?? "", "http://x").searchParams.get("layout");
            const file = layout && /^[\w-]+$/.test(layout) ? `${LAYOUTS}${layout}.json` : WORLD_FILE;
            res.setHeader("Content-Type", "application/json");
            res.end(await readFile(file, "utf8"));
            return;
          }
          if (req.method === "POST") {
            let body = "";
            for await (const chunk of req) body += chunk;
            JSON.parse(body);
            await writeFile(WORLD_FILE, body);
            res.end("saved");
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (error) {
          res.statusCode = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
          res.end(String(error));
        }
      });
    },
  };
}

export default defineConfig({
  // Relative paths, so the built game works from any folder, such as a GitHub Pages project page.
  base: "./",
  plugins: [worldFile()],
  // Saving the layout from the designer shouldn't reload the game under it: the designer's
  // draft is already in play, and the next start or build picks the file up.
  server: { watch: { ignored: ["**/src/designer/world.json", "**/src/designer/layouts/**", "**/src/start.json"] } },
});

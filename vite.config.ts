import { defineConfig, type Plugin } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Where the system designer keeps its layout, which the built game ships with. */
const WORLD_FILE = fileURLToPath(new URL("./src/designer/world.json", import.meta.url));

/** Lets the system designer read and write its world file while developing. Not in the built game. */
function worldFile(): Plugin {
  return {
    name: "world-file",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__world", async (req, res) => {
        try {
          if (req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(await readFile(WORLD_FILE, "utf8"));
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
  server: { watch: { ignored: ["**/src/designer/world.json"] } },
});

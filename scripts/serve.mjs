// Tiny static file server for previewing dist/ locally.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "../lib/events.mjs";

const DIST = join(ROOT, "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".ics": "text/calendar; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`Serving dist/ on http://localhost:${port}`));

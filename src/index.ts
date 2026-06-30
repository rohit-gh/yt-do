import { Hono } from "hono";
import { mkdirSync } from "node:fs";
import { config } from "./config";
import { getDb } from "./db";
import { api } from "./routes/api";
import { pages } from "./routes/pages";
import { ensureYtDlpAvailable } from "./services/ytdlp";

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.videosDir, { recursive: true });
getDb();

const app = new Hono();

app.use("*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  console.log(`<-- ${method} ${path}`);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const isStreamChunk = path.includes("/stream") && c.res.status === 206;
  if (!isStreamChunk) {
    console.log(`--> ${method} ${path} ${c.res.status} ${ms}ms`);
  }
});

app.route("/api", api);
app.route("/", pages);

try {
  const ytdlpPath = await ensureYtDlpAvailable();
  const proc = Bun.spawn([ytdlpPath, "--version"], { stdout: "pipe", stderr: "pipe" });
  const version = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  console.log(`yt-dlp is available (${version || ytdlpPath})`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "yt-dlp setup failed — downloads will not work",
  );
}

console.log(`Server listening on http://0.0.0.0:${config.port}`);
console.log(`Public base URL: ${config.baseUrl}`);

export default {
  port: config.port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};

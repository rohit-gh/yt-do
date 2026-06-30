import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config";

export interface DownloadResult {
  title: string;
  filePath: string;
}

let resolvedYtDlpPath: string | null = null;
let cachedYoutubeArgs: string[] | null = null;

function ytDlpReleaseAsset(): string {
  switch (process.platform) {
    case "darwin":
      return "yt-dlp_macos";
    case "win32":
      return "yt-dlp.exe";
    default:
      return "yt-dlp_linux";
  }
}

async function binaryRuns(binary: string, args: string[] = ["--version"]): Promise<boolean> {
  try {
    const proc = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function whichBinary(name: string): Promise<string | null> {
  const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "pipe" });
  const path = (await new Response(proc.stdout).text()).trim();
  return (await proc.exited) === 0 && path ? path : null;
}

async function resolveJsRuntime(): Promise<string> {
  const configured = process.env.YT_DLP_JS_RUNTIME?.trim();
  if (configured) {
    if (configured.includes(":")) {
      const [name, path] = configured.split(":", 2);
      if (!(await binaryRuns(path))) {
        throw new Error(`YT_DLP_JS_RUNTIME binary not runnable: ${path}`);
      }
      return `${name}:${path}`;
    }
    const path = await whichBinary(configured === "nodejs" ? "nodejs" : configured);
    if (!path) {
      throw new Error(`YT_DLP_JS_RUNTIME command not found: ${configured}`);
    }
    const runtimeName = configured === "nodejs" ? "node" : configured;
    return `${runtimeName}:${path}`;
  }

  const candidates: [string, string][] = [
    ["bun", process.execPath],
    ["node", "/usr/bin/node"],
    ["node", "/usr/bin/nodejs"],
  ];

  for (const [name, path] of candidates) {
    if (await binaryRuns(path)) {
      return `${name}:${path}`;
    }
  }

  for (const cmd of ["bun", "node", "nodejs"]) {
    const path = await whichBinary(cmd);
    if (!path) continue;
    const runtimeName = cmd === "nodejs" ? "node" : cmd;
    if (await binaryRuns(path)) {
      return `${runtimeName}:${path}`;
    }
  }

  throw new Error(
    "No JS runtime found for yt-dlp. Install node or set YT_DLP_JS_RUNTIME (e.g. bun:/usr/local/bin/bun).",
  );
}

async function buildYoutubeArgs(): Promise<string[]> {
  if (cachedYoutubeArgs) return cachedYoutubeArgs;

  const jsRuntime = await resolveJsRuntime();
  const args = ["--js-runtimes", jsRuntime, "--remote-components", "ejs:github"];

  if (config.ytdlpCookiesFile) {
    if (!existsSync(config.ytdlpCookiesFile)) {
      console.warn(`[yt-dlp] Cookies file not found: ${config.ytdlpCookiesFile}`);
    } else {
      args.push("--cookies", config.ytdlpCookiesFile);
      console.log(`[yt-dlp] Using cookies file: ${config.ytdlpCookiesFile}`);
    }
  } else {
    console.warn(
      "[yt-dlp] No YT_DLP_COOKIES_FILE set — YouTube may block datacenter IPs. " +
        "Export browser cookies and set YT_DLP_COOKIES_FILE=/app/data/cookies/youtube.txt",
    );
  }

  console.log(`[yt-dlp] JS runtime: ${jsRuntime}`);
  cachedYoutubeArgs = args;
  return args;
}

async function ytDlpWorks(binary: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([binary, "--version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function downloadYtDlp(targetPath: string): Promise<void> {
  const asset = ytDlpReleaseAsset();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[yt-dlp] Downloading ${asset} from GitHub…`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp: HTTP ${response.status}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  await Bun.write(targetPath, await response.arrayBuffer());
  chmodSync(targetPath, 0o755);
}

export async function ensureYtDlpAvailable(): Promise<string> {
  if (resolvedYtDlpPath && (await ytDlpWorks(resolvedYtDlpPath))) {
    await buildYoutubeArgs();
    return resolvedYtDlpPath;
  }

  const candidates = [
    process.env.YT_DLP_PATH?.trim(),
    "yt-dlp",
    config.ytdlpPath,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await ytDlpWorks(candidate)) {
      resolvedYtDlpPath = candidate;
      await buildYoutubeArgs();
      return candidate;
    }
  }

  await downloadYtDlp(config.ytdlpPath);

  if (!(await ytDlpWorks(config.ytdlpPath))) {
    throw new Error("Downloaded yt-dlp binary failed version check");
  }

  resolvedYtDlpPath = config.ytdlpPath;
  console.log(`[yt-dlp] Installed to ${config.ytdlpPath}`);
  await buildYoutubeArgs();
  return config.ytdlpPath;
}

function ytDlpBinary(): string {
  if (!resolvedYtDlpPath) {
    throw new Error("yt-dlp is not initialized — call ensureYtDlpAvailable() first");
  }
  return resolvedYtDlpPath;
}

function youtubeArgs(): string[] {
  if (!cachedYoutubeArgs) {
    throw new Error("yt-dlp YouTube args not initialized — call ensureYtDlpAvailable() first");
  }
  return cachedYoutubeArgs;
}

export async function getVideoTitle(url: string): Promise<string> {
  const proc = Bun.spawn(
    [ytDlpBinary(), ...youtubeArgs(), "--print", "%(title)s", "--no-download", url],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "Failed to fetch video title from yt-dlp");
  }

  return stdout.trim() || "Untitled video";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_").slice(0, 120);
}

async function pipeStderrToLogs(
  stream: ReadableStream<Uint8Array>,
  prefix: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      buffer += chunk;

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.trim()) {
          console.log(`${prefix} ${line}`);
        }
      }
    }

    const remaining = buffer.replace(/\r$/, "").trim();
    if (remaining) {
      console.log(`${prefix} ${remaining}`);
    }
  } finally {
    reader.releaseLock();
  }

  return full;
}

export async function downloadVideo720p(
  url: string,
  videoId: string,
): Promise<DownloadResult> {
  mkdirSync(config.videosDir, { recursive: true });

  const title = await getVideoTitle(url);
  const safeTitle = sanitizeFilename(title);
  const outputTemplate = join(config.videosDir, `${videoId}_${safeTitle}.%(ext)s`);

  const logPrefix = `[yt-dlp:${videoId}]`;
  console.log(`${logPrefix} Starting download: ${url}`);

  const proc = Bun.spawn(
    [
      ytDlpBinary(),
      ...youtubeArgs(),
      "-f",
      "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate,
      "--no-playlist",
      "--newline",
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [stderr, , exitCode] = await Promise.all([
    pipeStderrToLogs(proc.stderr, logPrefix),
    new Response(proc.stdout).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "yt-dlp download failed");
  }

  const glob = new Bun.Glob(`${videoId}_${safeTitle}.*`);
  const matches: string[] = [];
  for await (const path of glob.scan({ cwd: config.videosDir, onlyFiles: true })) {
    matches.push(join(config.videosDir, path));
  }

  if (matches.length === 0) {
    const fallbackGlob = new Bun.Glob(`${videoId}_*.*`);
    for await (const path of fallbackGlob.scan({ cwd: config.videosDir, onlyFiles: true })) {
      matches.push(join(config.videosDir, path));
    }
  }

  if (matches.length === 0) {
    throw new Error("Download finished but output file was not found");
  }

  console.log(`${logPrefix} Finished: ${matches[0]}`);
  return { title, filePath: matches[0] };
}

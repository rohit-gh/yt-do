import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config";

export interface DownloadResult {
  title: string;
  filePath: string;
}

/** Required by yt-dlp 2025+ for YouTube JS challenge solving. */
const YT_DLP_YOUTUBE_ARGS = [
  "--js-runtimes",
  "node",
  "--remote-components",
  "ejs:github",
];

let resolvedYtDlpPath: string | null = null;

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
      return candidate;
    }
  }

  await downloadYtDlp(config.ytdlpPath);

  if (!(await ytDlpWorks(config.ytdlpPath))) {
    throw new Error("Downloaded yt-dlp binary failed version check");
  }

  resolvedYtDlpPath = config.ytdlpPath;
  console.log(`[yt-dlp] Installed to ${config.ytdlpPath}`);
  return config.ytdlpPath;
}

function ytDlpBinary(): string {
  if (!resolvedYtDlpPath) {
    throw new Error("yt-dlp is not initialized — call ensureYtDlpAvailable() first");
  }
  return resolvedYtDlpPath;
}

export async function getVideoTitle(url: string): Promise<string> {
  const proc = Bun.spawn(
    [ytDlpBinary(), ...YT_DLP_YOUTUBE_ARGS, "--print", "%(title)s", "--no-download", url],
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
      ...YT_DLP_YOUTUBE_ARGS,
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

import { join } from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dataDir = process.env.DATA_DIR?.trim() || join(import.meta.dir, "..", "data");
const videosDir = process.env.VIDEOS_DIR?.trim() || join(dataDir, "videos");
const dbPath = process.env.DB_PATH?.trim() || join(dataDir, "yt-do.db");
const ytdlpPath =
  process.env.YT_DLP_PATH?.trim() || join(dataDir, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const ytdlpCookiesFile = process.env.YT_DLP_COOKIES_FILE?.trim() || "";

export const config = {
  port: Number(process.env.PORT || 9988),
  baseUrl: requireEnv("BASE_URL").replace(/\/$/, ""),
  masterPassword: requireEnv("MASTER_PASSWORD"),
  sessionSecret: requireEnv("SESSION_SECRET"),
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  telegramChatId: requireEnv("TELEGRAM_CHAT_ID"),
  dataDir,
  videosDir,
  dbPath,
  ytdlpPath,
  ytdlpCookiesFile,
};

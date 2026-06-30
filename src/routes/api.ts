import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { config } from "../config";
import {
  getVideoById,
  insertVideo,
  listVideos,
  updateVideoDownloading,
  updateVideoReady,
  updateVideoFailed,
  verifyVideoPassword,
} from "../db";
import { downloadVideo720p } from "../services/ytdlp";
import { notifyVideoReady } from "../services/telegram";
import { createAccessToken, generateVideoPassword } from "../utils/password";
import { isValidYoutubeUrl } from "../utils/youtube";

const api = new Hono();

function accessCookieName(videoId: string): string {
  return `va_${videoId}`;
}

async function runDownloadJob(videoId: string, url: string): Promise<void> {
  console.log(`[download] Job queued: ${videoId}`);
  try {
    updateVideoDownloading(videoId);
    const result = await downloadVideo720p(url, videoId);
    updateVideoReady(videoId, {
      title: result.title,
      file_path: result.filePath,
    });

    const video = getVideoById(videoId);
    if (video?.password) {
      await notifyVideoReady({
        id: videoId,
        title: result.title,
        password: video.password,
      });
    }
    console.log(`[download] Job complete: ${videoId} — ${result.title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown download error";
    console.error(`[download] Job failed: ${videoId} — ${message}`);
    updateVideoFailed(videoId, message);
  }
}

api.post("/download", async (c) => {
  const body = await c.req.json<{ url?: string; masterPassword?: string }>();
  const url = body.url?.trim();
  const masterPassword = body.masterPassword ?? "";

  if (masterPassword !== config.masterPassword) {
    return c.json({ error: "Invalid master password" }, 401);
  }

  if (!url || !isValidYoutubeUrl(url)) {
    return c.json({ error: "A valid YouTube URL is required" }, 400);
  }

  const videoId = crypto.randomUUID();
  const password = generateVideoPassword();

  insertVideo({ id: videoId, password, youtube_url: url });

  void runDownloadJob(videoId, url);

  return c.json({
    id: videoId,
    status: "pending",
    watchUrl: `${config.baseUrl}/watch/${videoId}`,
    message: "Download started. You will receive a Telegram message when it is ready.",
  });
});

api.get("/videos", (c) => {
  const masterPassword = c.req.query("masterPassword");
  if (masterPassword !== config.masterPassword) {
    return c.json({ error: "Invalid master password" }, 401);
  }

  const videos = listVideos().map((video) => ({
    id: video.id,
    title: video.title,
    youtube_url: video.youtube_url,
    status: video.status,
    error_message: video.error_message,
    watchUrl: `${config.baseUrl}/watch/${video.id}`,
    created_at: video.created_at,
    completed_at: video.completed_at,
  }));

  return c.json({ videos });
});

api.get("/videos/:id", (c) => {
  const video = getVideoById(c.req.param("id"));
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }

  return c.json({
    id: video.id,
    title: video.title,
    status: video.status,
    error_message: video.error_message,
    created_at: video.created_at,
    completed_at: video.completed_at,
  });
});

api.post("/videos/:id/verify", async (c) => {
  const videoId = c.req.param("id");
  const body = await c.req.json<{ password?: string }>();
  const password = body.password?.trim() ?? "";

  const video = getVideoById(videoId);
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }

  if (video.status !== "ready") {
    return c.json({ error: "Video is not ready yet", status: video.status }, 409);
  }

  if (!verifyVideoPassword(videoId, password)) {
    return c.json({ error: "Invalid password" }, 401);
  }

  const token = createAccessToken(videoId, password, config.sessionSecret);
  setCookie(c, accessCookieName(videoId), token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: config.baseUrl.startsWith("https://"),
    path: `/`,
    maxAge: 60 * 60 * 24,
  });

  return c.json({
    ok: true,
    title: video.title,
    streamUrl: `/api/videos/${videoId}/stream`,
  });
});

api.get("/videos/:id/stream", async (c) => {
  const videoId = c.req.param("id");
  const video = getVideoById(videoId);

  if (!video || video.status !== "ready" || !video.file_path) {
    return c.json({ error: "Video not found" }, 404);
  }

  const cookie = getCookie(c, accessCookieName(videoId));
  const expected = createAccessToken(videoId, video.password, config.sessionSecret);

  if (!cookie || cookie !== expected) {
    return c.json({ error: "Unauthorized. Enter the video password first." }, 401);
  }

  const file = Bun.file(video.file_path);
  const exists = await file.exists();
  if (!exists) {
    return c.json({ error: "Video file missing on disk" }, 404);
  }

  const stat = await file.stat();
  const range = c.req.header("Range");
  const contentType = file.type || "video/mp4";

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
    if (!match) {
      return c.body(null, 416);
    }

    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      return c.body(null, 416);
    }

    const chunk = file.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
        "Content-Disposition": "inline",
      },
    });
  }

  return new Response(file, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Content-Disposition": "inline",
    },
  });
});

export { api };

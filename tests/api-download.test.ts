import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestEnv } from "./helpers/test-env";
import { mockDownloadServices } from "./helpers/mock-services";

const env = createTestEnv("api-download");
mockDownloadServices(env.dir);
const { api } = await import("../src/routes/api");

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.resetDatabase();
});

describe("POST /download", () => {
  test("rejects invalid master password", async () => {
    const response = await api.request("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=abc",
        masterPassword: "wrong",
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid master password" });
  });

  test("rejects invalid YouTube URL", async () => {
    const response = await api.request("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/video",
        masterPassword: env.masterPassword,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A valid YouTube URL is required" });
  });

  test("queues a download without waiting for yt-dlp", async () => {
    const response = await api.request("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=abc123",
        masterPassword: env.masterPassword,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("pending");
    expect(body.id).toBeString();
    expect(body.watchUrl).toContain(`/watch/${body.id}`);

    await Bun.sleep(50);
    const { getVideoById } = await import("../src/db");
    const video = getVideoById(body.id);
    expect(video?.youtube_url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(["pending", "downloading", "ready"]).toContain(video?.status);
  });
});

describe("GET /videos/:id", () => {
  test("returns 404 for unknown id", async () => {
    const response = await api.request("/videos/does-not-exist");
    expect(response.status).toBe(404);
  });

  test("returns public status without password", async () => {
    const { insertVideo, updateVideoReady } = await import("../src/db");
    insertVideo({
      id: "public-vid",
      password: "hidden-password",
      youtube_url: "https://youtu.be/x",
    });
    updateVideoReady("public-vid", {
      title: "Public title",
      file_path: join(env.dir, "videos", "public-vid.mp4"),
    });
    writeFileSync(join(env.dir, "videos", "public-vid.mp4"), "fake");

    const response = await api.request("/videos/public-vid");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.title).toBe("Public title");
    expect(body.status).toBe("ready");
    expect(body.password).toBeUndefined();
  });
});
